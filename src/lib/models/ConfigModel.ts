import pool from '../db';

export class ConfigModel {
    // --- Jenis Perbaikan (RCA) ---
    static async getAllPerbaikan() {
        const [rows] = await pool.query("SELECT * FROM tiket_perbaikan ORDER BY jenis_perbaikan ASC");
        return rows as any[];
    }

    static async createPerbaikan(jenis: string) {
        const [result]: any = await pool.query("INSERT INTO tiket_perbaikan (jenis_perbaikan) VALUES (?)", [jenis]);
        return result;
    }

    static async updatePerbaikan(id: number | string, jenis: string) {
        const [result]: any = await pool.query("UPDATE tiket_perbaikan SET jenis_perbaikan = ? WHERE id = ?", [jenis, id]);
        return result;
    }

    static async deletePerbaikan(id: number | string) {
        const [result]: any = await pool.query("DELETE FROM tiket_perbaikan WHERE id = ?", [id]);
        return result;
    }

    // --- Jenis Order ---
    static async getAllJenis() {
        const [rows] = await pool.query("SELECT * FROM tiket_jenis ORDER BY nama_jenis ASC");
        return rows as any[];
    }

    static async createJenis(nama: string) {
        const [result]: any = await pool.query("INSERT INTO tiket_jenis (nama_jenis) VALUES (?)", [nama]);
        return result;
    }

    static async updateJenis(id: number | string, nama: string) {
        const [result]: any = await pool.query("UPDATE tiket_jenis SET nama_jenis = ? WHERE id = ?", [nama, id]);
        return result;
    }

    static async deleteJenis(id: number | string) {
        const [result]: any = await pool.query("DELETE FROM tiket_jenis WHERE id = ?", [id]);
        return result;
    }

    // --- Service Area Groups (Reusing logic for unified config) ---
    static async getAllGroups() {
        const [rows] = await pool.query("SELECT * FROM service_area_group ORDER BY service_area ASC");
        return rows as any[];
    }

    static async manageGroup(action: 'add' | 'edit' | 'delete', data: any) {
        if (action === 'add') {
            const [res]: any = await pool.query(
                "INSERT INTO service_area_group (service_area, group_id, is_active) VALUES (?, ?, ?)",
                [data.service_area, data.group_id, data.is_active]
            );
            return res;
        } else if (action === 'edit') {
            const [res]: any = await pool.query(
                "UPDATE service_area_group SET service_area=?, group_id=?, is_active=? WHERE id=?",
                [data.service_area, data.group_id, data.is_active, data.id]
            );
            return res;
        } else if (action === 'delete') {
            const [res]: any = await pool.query("DELETE FROM service_area_group WHERE id=?", [data.id]);
            return res;
        }
    }
}
