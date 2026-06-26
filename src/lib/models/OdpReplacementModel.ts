import pool from '../db';

export class OdpReplacementModel {

    // ── Create ───────────────────────────────────────────────────────────────
    static async create(data: any) {
        const [result]: any = await pool.query(
            `INSERT INTO odp_replacement
             (user_id, nik_teknisi, nama_teknisi, tanggal, no_tiket, datek_odp, datek_odc,
              lokasi, barcode_odp, ps_count, barcode_ps1, barcode_ps2,
              material_odp_solid, material_clam_cooker, odp_rise_count, catatan, status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING')`,
            [
                data.user_id, data.nik_teknisi, data.nama_teknisi,
                data.tanggal, data.no_tiket, data.datek_odp, data.datek_odc,
                data.lokasi, data.barcode_odp,
                data.ps_count || 1, data.barcode_ps1 || null, data.barcode_ps2 || null,
                data.material_odp_solid || 0, data.material_clam_cooker || 0,
                data.odp_rise_count || 0, data.catatan || null
            ]
        );
        return result.insertId;
    }

    // ── Add Evidence ─────────────────────────────────────────────────────────
    static async addEvidence(odpId: number, fieldName: string, fileUrl: string, filePath: string, mimeType: string) {
        const [result]: any = await pool.query(
            `INSERT INTO odp_replacement_evidence (odp_id, field_name, file_url, file_path, mime_type)
             VALUES (?,?,?,?,?)`,
            [odpId, fieldName, fileUrl, filePath || null, mimeType || null]
        );
        return result.insertId;
    }

    // ── Update Evidence (untuk return — replace field tertentu) ──────────────
    static async updateEvidence(odpId: number, fieldName: string, fileUrl: string, filePath: string, mimeType: string) {
        // Hapus yang lama, insert baru
        await pool.query(
            `DELETE FROM odp_replacement_evidence WHERE odp_id = ? AND field_name = ?`,
            [odpId, fieldName]
        );
        return this.addEvidence(odpId, fieldName, fileUrl, filePath, mimeType);
    }

    // ── Get Evidence ─────────────────────────────────────────────────────────
    static async getEvidence(odpId: number) {
        const [rows]: any = await pool.query(
            `SELECT * FROM odp_replacement_evidence WHERE odp_id = ? ORDER BY id ASC`,
            [odpId]
        );
        return rows;
    }

    // ── Get by ID ────────────────────────────────────────────────────────────
    static async getById(id: number) {
        const [rows]: any = await pool.query(
            `SELECT * FROM odp_replacement WHERE id = ?`, [id]
        );
        if (!rows[0]) return null;
        const record = rows[0];
        record.evidence = await this.getEvidence(id);
        return record;
    }

    // ── Get by User ──────────────────────────────────────────────────────────
    static async getByUser(userId: string, limit = 50) {
        const [rows]: any = await pool.query(
            `SELECT o.*, 
                GROUP_CONCAT(e.field_name ORDER BY e.id SEPARATOR ',') as evidence_fields
             FROM odp_replacement o
             LEFT JOIN odp_replacement_evidence e ON e.odp_id = o.id
             WHERE o.user_id = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC LIMIT ?`,
            [userId, limit]
        );
        return rows;
    }

    // ── Get All (admin) ──────────────────────────────────────────────────────
    static async getAll(filters: { status?: string; date_from?: string; date_to?: string; limit?: number } = {}) {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.status) {
            conditions.push('o.status = ?');
            params.push(filters.status);
        }
        if (filters.date_from) {
            conditions.push('DATE(o.tanggal) >= ?');
            params.push(filters.date_from);
        }
        if (filters.date_to) {
            conditions.push('DATE(o.tanggal) <= ?');
            params.push(filters.date_to);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(filters.limit || 200);

        const [rows]: any = await pool.query(
            `SELECT o.*,
                GROUP_CONCAT(e.field_name ORDER BY e.id SEPARATOR ',') as evidence_fields
             FROM odp_replacement o
             LEFT JOIN odp_replacement_evidence e ON e.odp_id = o.id
             ${where}
             GROUP BY o.id
             ORDER BY o.created_at DESC LIMIT ?`,
            params
        );
        return rows;
    }

    // ── QC Action (approve / return) ─────────────────────────────────────────
    static async qcAction(id: number, qcLevel: 1 | 2, action: 'approve' | 'return', by: string, notes: string, returnedFields?: string[]) {
        let newStatus: string;
        if (action === 'approve') {
            newStatus = qcLevel === 1 ? 'QC1_APPROVED' : 'DONE';
        } else {
            newStatus = qcLevel === 1 ? 'QC1_RETURNED' : 'QC2_RETURNED';
        }

        const qcCol = qcLevel === 1 ? 'qc1' : 'qc2';
        const returnedFieldsJson = returnedFields && returnedFields.length > 0
            ? JSON.stringify(returnedFields)
            : null;

        await pool.query(
            `UPDATE odp_replacement 
             SET status = ?, ${qcCol}_by = ?, ${qcCol}_at = NOW(), ${qcCol}_notes = ?,
                 returned_fields = ?, updated_at = NOW()
             WHERE id = ?`,
            [newStatus, by, notes || null, returnedFieldsJson, id]
        );
        return newStatus;
    }

    // ── Update partial fields (teknisi perbaiki return) ──────────────────────
    static async updateReturnedFields(id: number, data: any) {
        const allowed = [
            'barcode_odp', 'barcode_ps1', 'barcode_ps2',
            'material_odp_solid', 'material_clam_cooker', 'odp_rise_count', 'catatan'
        ];
        const sets: string[] = [];
        const params: any[] = [];

        for (const key of allowed) {
            if (data[key] !== undefined) {
                sets.push(`${key} = ?`);
                params.push(data[key]);
            }
        }

        if (sets.length === 0) return;

        // Reset status ke PENDING setelah teknisi perbaiki
        sets.push('status = ?', 'returned_fields = NULL', 'updated_at = NOW()');
        params.push('PENDING');
        params.push(id);

        await pool.query(
            `UPDATE odp_replacement SET ${sets.join(', ')} WHERE id = ?`,
            params
        );
    }
}
