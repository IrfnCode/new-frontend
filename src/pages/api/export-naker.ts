import type { APIRoute } from 'astro';
import pool from '../../lib/db';
import * as XLSX from 'xlsx';

export const GET: APIRoute = async ({ url }) => {
    try {
        const search = url.searchParams.get('search') || '';

        let query = `SELECT * FROM naker`;
        const params: string[] = [];

        if (search) {
            query += ` WHERE nik LIKE ? OR nama LIKE ? OR service_area LIKE ?`;
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        query += ` ORDER BY nama ASC`;
        const [rows]: any = await pool.query(query, params);

        // Map data for XLSX
        const data = rows.map((row: any) => ({
            'NIK': row.nik,
            'Nama': row.nama,
            'Posisi': row.posisi,
            'Sektor': row.sektor,
            'Service Area': row.service_area,
            'ID Bot Telegram': row.id_bot_telegram,
            'Tag Telegram': row.tag_telegram,
            'Korlap NIK': row.korlap_nik
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Technicians');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="data_karyawan_${new Date().getTime()}.xlsx"`
            }
        });

    } catch (error: any) {
        console.error('Export Naker Error:', error);
        return new Response('Export Failed', { status: 500 });
    }
};
