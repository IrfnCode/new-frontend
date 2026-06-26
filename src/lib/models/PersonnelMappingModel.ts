import pool from '../db';

export class PersonnelMappingModel {
    static async getAll() {
        const [rows] = await pool.query(`
            SELECT sap.*, n.nama 
            FROM service_area_personnel sap
            JOIN naker n ON sap.nik = n.nik
        `);
        return rows as any[];
    }

    static async getByServiceArea(saId: number | string) {
        const [rows] = await pool.query(`
            SELECT sap.*, n.nama 
            FROM service_area_personnel sap
            JOIN naker n ON sap.nik = n.nik
            WHERE sap.service_area_id = ?
        `, [saId]);
        return rows as any[];
    }

    static async getByNIK(nik: string) {
        const [rows] = await pool.query(`
            SELECT sap.*, sag.service_area 
            FROM service_area_personnel sap
            JOIN service_area_group sag ON sap.service_area_id = sag.id
            WHERE sap.nik = ?
        `, [nik]);
        return rows as any[];
    }

    static async add(saId: number | string, nik: string, role: 'KORLAP' | 'HSA') {
        const [result] = await pool.query(
            "INSERT IGNORE INTO service_area_personnel (service_area_id, nik, role) VALUES (?, ?, ?)",
            [saId, nik, role]
        );
        return result;
    }

    static async remove(mappingId: number | string) {
        const [result] = await pool.query("DELETE FROM service_area_personnel WHERE id = ?", [mappingId]);
        return result;
    }

    static async removeByPersonnel(saId: number | string, nik: string, role: string) {
        const [result] = await pool.query(
            "DELETE FROM service_area_personnel WHERE service_area_id = ? AND nik = ? AND role = ?",
            [saId, nik, role]
        );
        return result;
    }
}
