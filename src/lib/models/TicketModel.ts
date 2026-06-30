import pool from '../db';

export class TicketModel {
    static async getAll(filters: { user_id?: string; search?: string; limit?: number; include_all?: boolean; date_from?: string; date_to?: string } = {}) {
        let query = "";
        const params: any[] = [];
        const maxLimit = Math.min(Math.max(Number(filters.limit || 50), 1), 1000);

        if (filters.user_id) {
            // Cari tiket milik user ini saja — by user_id ATAU by nik_teknisi yang sesuai
            // Subquery untuk dapat NIK dari Telegram ID
            query = `SELECT id, user_id, nik_teknisi, jenis, no_inet, no_tiket, rca, odp, no_hp, jam_open, jam_close, updated_at
                     FROM tiket_simple
                     WHERE user_id = ?
                     UNION
                     SELECT id, user_id, nik_teknisi, jenis, no_inet, no_tiket, rca, odp, no_hp, jam_open, jam_close, updated_at
                     FROM tiket_simple
                     WHERE nik_teknisi = (SELECT nik FROM naker WHERE id_bot_telegram = ? LIMIT 1)
                       AND user_id != ?
                       AND (user_id IS NULL OR user_id = '' OR user_id = '0')`;
            params.push(filters.user_id, filters.user_id, filters.user_id);
        } else if (filters.search) {
            query = `SELECT id, user_id, nama, jenis, no_inet, no_tiket, rca, odp, no_hp, jam_open, jam_close, updated_at
                     FROM tiket_simple
                     WHERE no_inet LIKE ? OR nama LIKE ? OR no_hp LIKE ? OR no_tiket LIKE ?`;
            const s = `%${filters.search}%`;
            params.push(s, s, s, s);
        } else if (filters.include_all) {
            // Admin listing dengan filter tanggal opsional
            const dateConditions: string[] = [];
            const dateParams: any[] = [];

            // Default: kalau tidak ada date filter, pakai 30 hari terakhir
            const effectiveDateFrom = filters.date_from || (() => {
                const d = new Date();
                d.setDate(d.getDate() - 30);
                return d.toISOString().split('T')[0];
            })();
            const effectiveDateTo = filters.date_to || new Date().toISOString().split('T')[0];

            // Filter by tanggal — closed by jam_close, open by jam_open
            dateConditions.push(`(
                (jam_close IS NOT NULL AND jam_close != '0000-00-00 00:00:00' AND DATE(NULLIF(NULLIF(jam_close, '0000-00-00 00:00:00'), '')) >= ? AND DATE(NULLIF(NULLIF(jam_close, '0000-00-00 00:00:00'), '')) <= ?)
                OR
                ((jam_close IS NULL OR jam_close = '0000-00-00 00:00:00') AND DATE(NULLIF(NULLIF(jam_open, '0000-00-00 00:00:00'), '')) >= ? AND DATE(NULLIF(NULLIF(jam_open, '0000-00-00 00:00:00'), '')) <= ?)
            )`);
            dateParams.push(effectiveDateFrom, effectiveDateTo, effectiveDateFrom, effectiveDateTo);

            // Skip tiket dengan data tidak valid (no_inet kosong/tidak valid)
            dateConditions.push(`(no_inet IS NOT NULL AND no_inet != '' AND no_inet != '-' AND no_inet != 'pda')`);

            const whereClause = `WHERE ${dateConditions.join(' AND ')}`;

            query = `SELECT t.id, t.user_id, t.nik_teknisi, t.nama, t.jenis, t.no_inet, t.no_tiket, t.rca, t.odp, t.no_hp,
                             t.jam_open, t.jam_close, t.updated_at,
                             n.service_area, n.sektor,
                             (CASE WHEN s.id IS NOT NULL THEN 'insera' ELSE 'manual' END) as _source,
                             s.assigned_by, s.assigned_to, s.customer_type
                      FROM tiket_simple t
                      LEFT JOIN naker n ON t.user_id = n.id_bot_telegram
                      LEFT JOIN scraped_work_orders s ON t.no_tiket = s.order_id
                      ${whereClause}`;
            params.push(...dateParams);
        } else {
            return [];
        }

        query += " ORDER BY id DESC LIMIT ?";
        params.push(maxLimit);
        const [rows] = await pool.query(query, params);
        return rows;
    }

    static async getById(id: string | number) {
        const [rows]: any = await pool.query("SELECT * FROM tiket_simple WHERE id = ?", [id]);
        return rows[0] || null;
    }

    static async create(data: any) {
        const [result]: any = await pool.query(
            `INSERT INTO tiket_simple 
            (nik_teknisi, jam_open, jam_close, updated_at, user_id, nama, jenis, no_inet, no_tiket, rca, odp, no_hp, catatan, 
            material_dropcore, material_protection, material_ps14, material_ps18, material_ps116, material_odp_solid, 
            material_patchcore, material_adaptor, material_sn_ont, material_sn_stb) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.nik_teknisi, data.jam_open, data.jam_close, data.updated_at, data.user_id, data.nama, data.jenis,
                data.no_inet, data.no_tiket, data.rca, data.odp, data.no_hp, data.catatan,
                data.material_dropcore || 0, data.material_protection || 0, data.material_ps14 || 0,
                data.material_ps18 || 0, data.material_ps116 || 0, data.material_odp_solid || 0,
                data.material_patchcore || 0, data.material_adaptor || 0, data.material_sn_ont || '', data.material_sn_stb || ''
            ]
        );
        return result.insertId;
    }

    static async update(id: string | number, data: any) {
        return await pool.query(
            `UPDATE tiket_simple SET 
            jenis=?, no_inet=?, no_tiket=?, rca=?, odp=?, no_hp=?, catatan=?, jam_close=?,
            material_dropcore=?, material_protection=?, material_ps14=?, material_ps18=?, material_ps116=?, 
            material_odp_solid=?, material_patchcore=?, material_adaptor=?, material_sn_ont=?, material_sn_stb=?
            WHERE id=?`,
            [
                data.jenis, data.no_inet, data.no_tiket, data.rca, data.odp, data.no_hp, data.catatan, 
                data.jam_close || null,
                data.material_dropcore || 0, data.material_protection || 0, data.material_ps14 || 0,
                data.material_ps18 || 0, data.material_ps116 || 0, data.material_odp_solid || 0,
                data.material_patchcore || 0, data.material_adaptor || 0, data.material_sn_ont || '', data.material_sn_stb || '',
                id
            ]
        );
    }

    static async delete(ids: string[] | number[]) {
        const [result] = await pool.query("DELETE FROM tiket_simple WHERE id IN (?)", [ids]);
        return result;
    }

    static async getEvidence(ticketId: string | number) {
        const [rows] = await pool.query("SELECT * FROM tiket_evidence WHERE tiket_id = ?", [ticketId]);
        return rows;
    }

    static async addEvidence(ticketId: string | number, url: string, path: string) {
        const [result] = await pool.query(
            "INSERT INTO tiket_evidence (tiket_id, foto_url, foto_path) VALUES (?, ?, ?)",
            [ticketId, url, path]
        );
        return result;
    }

    static async logUpdateActor(ticketId: string | number, userId: string) {
        if (!userId) return;
        await pool.query(
            `INSERT INTO tiket_update_log (tiket_id, user_id, field_name, old_value, new_value, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [ticketId, userId, "__updated_by__", null, userId]
        );
    }

    /**
     * Get unclosed tickets for a specific technician
     */
    static async getAssignedActiveTickets(userId: string) {
        const [rows]: any = await pool.query(
            `SELECT * FROM tiket_simple 
             WHERE user_id = ?
               AND (jam_close IS NULL OR jam_close = '' OR jam_close = '0000-00-00 00:00:00')
             UNION
             SELECT * FROM tiket_simple
             WHERE nik_teknisi = (SELECT nik FROM naker WHERE id_bot_telegram = ? LIMIT 1)
               AND user_id != ?
               AND (user_id IS NULL OR user_id = '' OR user_id = '0')
               AND (jam_close IS NULL OR jam_close = '' OR jam_close = '0000-00-00 00:00:00')
             ORDER BY id DESC`,
            [userId, userId, userId]
        );
        return rows;
    }
}
