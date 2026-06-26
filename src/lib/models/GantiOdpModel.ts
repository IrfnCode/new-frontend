import pool from '../db';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';

export class GantiOdpModel {

    // ── Create ───────────────────────────────────────────────────────────────
    static async create(data: any) {
        const [result]: any = await pool.query(`
            INSERT INTO odp_replacement
            (user_id, nik_teknisi, nama_teknisi, tanggal, no_tiket,
             datek_odp, datek_odc, lokasi, barcode_odp,
             ps_count, barcode_ps1, barcode_ps2,
             material_odp_solid, material_clam_cooker, material_uc, material_kabel_adss_5m, odp_rise_count, catatan, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING')
        `, [
            data.user_id, data.nik_teknisi, data.nama_teknisi,
            data.tanggal, data.no_tiket,
            data.datek_odp, data.datek_odc, data.lokasi, data.barcode_odp,
            data.ps18_count || 1, data.barcode_ps18_1, data.barcode_ps18_2 || null,
            data.material_odp_solid || 0, data.material_clam_cooker || 0,
            data.material_uc || 0, data.material_kabel_adss_5m || 0,
            data.odp_rise_count || 0, data.catatan || null
        ]);
        return result.insertId;
    }

    // ── Save photo ───────────────────────────────────────────────────────────
    static async savePhoto(odp_id: number, field_name: string, file: File, baseUrl: string) {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'ganti-odp');
        await fs.mkdir(uploadDir, { recursive: true });

        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = '.jpg'; // Fallback ke jpg agar terbaca oleh server
        const uniqueName = `${Date.now()}_${odp_id}_${field_name}_${Math.random().toString(36).slice(2)}${ext}`;
        const filePath = path.join(uploadDir, uniqueName);
        
        // Compress image maintaining aspect ratio, max width 1024px, 70% quality jpeg
        await sharp(buffer)
            .rotate() // Membaca EXIF dan memutar foto secara otomatis sesuai orientasi aslinya
            .resize({ width: 1024, withoutEnlargement: true })
            .jpeg({ quality: 70, mozjpeg: true })
            .toFile(filePath);

        const url = `${baseUrl}/uploads/ganti-odp/${uniqueName}`;
        const relPath = `uploads/ganti-odp/${uniqueName}`;

        await pool.query(`
            INSERT INTO odp_replacement_evidence (odp_id, field_name, file_url, file_path, mime_type)
            VALUES (?,?,?,?,?)
        `, [odp_id, field_name, url, relPath, file.type || 'image/jpeg']);

        return { url, path: relPath };
    }

    // ── Get by ID ────────────────────────────────────────────────────────────
    static async getById(id: number | string) {
        const [rows]: any = await pool.query(
            'SELECT * FROM odp_replacement WHERE id = ? LIMIT 1', [id]
        );
        if (!rows[0]) return null;
        const record = rows[0];
        record.photos = await GantiOdpModel.getPhotos(id);
        return record;
    }

    // ── Get photos ───────────────────────────────────────────────────────────
    static async getPhotos(odp_id: number | string) {
        const [rows]: any = await pool.query(
            'SELECT * FROM odp_replacement_evidence WHERE odp_id = ? ORDER BY id ASC', [odp_id]
        );
        // Group by field_name
        const grouped: Record<string, any[]> = {};
        for (const r of rows) {
            if (!grouped[r.field_name]) grouped[r.field_name] = [];
            grouped[r.field_name].push(r);
        }
        return grouped;
    }

    // ── Get by user ──────────────────────────────────────────────────────────
    static async getByUser(user_id: string, limit = 50) {
        const [rows]: any = await pool.query(`
            SELECT * FROM odp_replacement
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `, [user_id, limit]);
        return rows;
    }

    // ── Get all (admin) ──────────────────────────────────────────────────────
    static async getAll(filters: { status?: string; date_from?: string; date_to?: string; limit?: number } = {}) {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.status) {
            conditions.push('status = ?');
            params.push(filters.status);
        }
        if (filters.date_from) {
            conditions.push('DATE(tanggal) >= ?');
            params.push(filters.date_from);
        }
        if (filters.date_to) {
            conditions.push('DATE(tanggal) <= ?');
            params.push(filters.date_to);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(filters.limit || 200);

        const [rows]: any = await pool.query(
            `SELECT * FROM odp_replacement ${where} ORDER BY created_at DESC LIMIT ?`,
            params
        );
        return rows;
    }

    // ── QC Action (approve / return) ─────────────────────────────────────────
    static async qcAction(id: number | string, action: 'approve' | 'return', qcLevel: 1 | 2, by: string, notes: string, returnFields?: string[]) {
        const [rows]: any = await pool.query('SELECT status FROM odp_replacement WHERE id = ? LIMIT 1', [id]);
        if (!rows[0]) throw new Error('Data tidak ditemukan');

        let newStatus: string;
        if (action === 'approve') {
            newStatus = qcLevel === 1 ? 'QC1_APPROVED' : 'DONE';
        } else {
            newStatus = qcLevel === 1 ? 'QC1_RETURNED' : 'QC2_RETURNED';
        }

        const qcField = qcLevel === 1 ? 'qc1' : 'qc2';
        await pool.query(`
            UPDATE odp_replacement
            SET status = ?,
                ${qcField}_by = ?,
                ${qcField}_at = NOW(),
                ${qcField}_notes = ?,
                returned_fields = ?
            WHERE id = ?
        `, [
            newStatus, by, notes || null,
            returnFields ? JSON.stringify(returnFields) : null,
            id
        ]);

        return newStatus;
    }

    // ── Update specific fields (teknisi perbaiki return) ─────────────────────
    static async updateReturnedFields(id: number | string, fields: Record<string, any>) {
        // Reset status ke PENDING setelah teknisi perbaiki
        await pool.query(
            'UPDATE odp_replacement SET status = ?, returned_fields = NULL, updated_at = NOW() WHERE id = ?',
            ['PENDING', id]
        );

        // Update field data yang diperbaiki
        const allowed = ['barcode_odp', 'barcode_ps18_1', 'barcode_ps18_2', 'catatan',
                         'material_odp_solid', 'material_clam_cooker', 'material_uc', 'material_kabel_adss_5m', 'odp_rise_count'];
        for (const [key, val] of Object.entries(fields)) {
            if (allowed.includes(key)) {
                await pool.query(`UPDATE odp_replacement SET \`${key}\` = ? WHERE id = ?`, [val, id]);
            }
        }
    }

    // ── Delete photo (untuk replace saat return) ─────────────────────────────
    static async deletePhotosByField(odp_id: number | string, field_name: string) {
        const [rows]: any = await pool.query(
            'SELECT file_path FROM odp_replacement_evidence WHERE odp_id = ? AND field_name = ?',
            [odp_id, field_name]
        );
        // Hapus file fisik
        for (const r of rows) {
            if (r.file_path) {
                const fullPath = path.join(process.cwd(), 'public', r.file_path);
                await fs.unlink(fullPath).catch(() => {});
            }
        }
        await pool.query(
            'DELETE FROM odp_replacement_evidence WHERE odp_id = ? AND field_name = ?',
            [odp_id, field_name]
        );
    }
    
    // ── Delete Multiple Records ───────────────────────────────────────────────
    static async deleteMultiple(ids: number[]) {
        if (!ids || ids.length === 0) return;
        
        // Ambil semua foto terkait
        const [photos]: any = await pool.query(
            'SELECT file_path FROM odp_replacement_evidence WHERE odp_id IN (?)',
            [ids]
        );
        
        // Hapus file fisik
        for (const p of photos) {
            if (p.file_path) {
                const fullPath = path.join(process.cwd(), 'public', p.file_path);
                await fs.unlink(fullPath).catch(() => {});
            }
        }
        
        // Hapus dari database (evidence biasanya ikut terhapus jika ada ON DELETE CASCADE, tapi kita pastikan hapus)
        await pool.query('DELETE FROM odp_replacement_evidence WHERE odp_id IN (?)', [ids]);
        await pool.query('DELETE FROM odp_replacement WHERE id IN (?)', [ids]);
    }
}
