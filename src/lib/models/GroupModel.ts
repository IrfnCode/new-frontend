import pool from '../db';

export class GroupModel {
    static async getAll() {
        const [rows] = await pool.query("SELECT * FROM service_area_group ORDER BY service_area ASC");
        return rows as any[];
    }

    static async getActive() {
        const [rows]: any = await pool.query("SELECT * FROM service_area_group WHERE is_active = 1 ORDER BY service_area ASC");
        return rows || [];
    }

    static async getByServiceArea(area: string) {
        const [rows]: any = await pool.query("SELECT * FROM service_area_group WHERE service_area = ? AND is_active = 1", [area]);
        return rows || [];
    }

    static async create(data: any) {
        const [result]: any = await pool.query(
            "INSERT INTO service_area_group (service_area, group_id, is_active) VALUES (?, ?, ?)",
            [data.service_area, data.group_id, data.is_active]
        );
        return result;
    }

    static async update(id: string | number, data: any) {
        const [result] = await pool.query(
            "UPDATE service_area_group SET service_area=?, group_id=?, is_active=? WHERE id=?",
            [data.service_area, data.group_id, data.is_active, id]
        );
        return result;
    }

    static async delete(id: string | number) {
        const [result] = await pool.query("DELETE FROM service_area_group WHERE id=?", [id]);
        return result;
    }
}
