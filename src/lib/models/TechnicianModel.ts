import pool from '../db';

export class TechnicianModel {
    static async getAll() {
        const [rows] = await pool.query("SELECT * FROM naker ORDER BY nama ASC");
        return rows;
    }

    static async getByBotId(botId: string) {
        const [rows]: any = await pool.query("SELECT * FROM naker WHERE id_bot_telegram = ?", [botId]);
        return rows[0] || null;
    }

    static async getByNIK(nik: string) {
        const [rows]: any = await pool.query("SELECT * FROM naker WHERE nik = ?", [nik]);
        return rows[0] || null;
    }

    static async create(data: any) {
        const [result]: any = await pool.query(
            "INSERT INTO naker (nik, nama, posisi, sektor, service_area, id_bot_telegram, tag_telegram, korlap_nik) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [data.nik, data.nama, data.posisi, data.sektor, data.service_area, data.id_bot_telegram, data.tag_telegram, data.korlap_nik]
        );
        return result;
    }

    static async update(nik: string, data: any) {
        const [result] = await pool.query(
            "UPDATE naker SET nik=?, nama=?, posisi=?, sektor=?, service_area=?, id_bot_telegram=?, tag_telegram=?, korlap_nik=? WHERE nik=?",
            [data.nik, data.nama, data.posisi, data.sektor, data.service_area, data.id_bot_telegram, data.tag_telegram, data.korlap_nik, nik]
        );
        return result;
    }

    static async delete(niks: string[]) {
        const [result] = await pool.query("DELETE FROM naker WHERE nik IN (?)", [niks]);
        return result;
    }
}
