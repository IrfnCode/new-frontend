import pool from '../db';

export class ReportModel {
  static async getClosedTicketsReport(startDate: string, endDate: string) {
    // Query utama mengambil tiket closed dengan join naker
    const query = `
      SELECT 
        t.id, t.nik_teknisi, t.jenis, t.odp, t.no_tiket, t.no_inet,
        t.jam_open, t.jam_close, t.rca, t.catatan,
        COALESCE(n.nama, t.nama) AS nama_teknisi,
        n.service_area,
        n.posisi,
        HOUR(t.jam_close) AS jam_close_hour
      FROM tiket_simple t
      LEFT JOIN naker n ON t.nik_teknisi = n.nik
      WHERE DATE(t.jam_close) BETWEEN ? AND ?
    `;
    const [rows] = await pool.query(query, [startDate, endDate]);
    return rows;
  }
}