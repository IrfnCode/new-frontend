import type { APIRoute } from 'astro';
import pool from '../../lib/db';
import * as XLSX from 'xlsx';

export const GET: APIRoute = async ({ url }) => {
    try {
        const search = url.searchParams.get('search') || '';
        const areas = url.searchParams.get('areas') ? url.searchParams.get('areas')?.split(',') : [];
        const stos = url.searchParams.get('stos') ? url.searchParams.get('stos')?.split(',') : [];

        let query = `
      SELECT t.*, n.service_area, n.sektor, n.nik as nik_teknisi_from_naker 
      FROM tiket_simple t
      LEFT JOIN naker n ON t.user_id = n.id_bot_telegram
      WHERE 1=1
    `;

        const queryParams: any[] = [];
        if (search) {
            query += ` AND (t.no_inet LIKE ? OR t.nama LIKE ? OR t.no_hp LIKE ? OR t.no_tiket LIKE ?)`;
            const s = `%${search}%`;
            queryParams.push(s, s, s, s);
        }

        if (areas && areas.length > 0) {
            query += ` AND n.service_area IN (?)`;
            queryParams.push(areas);
        }

        if (stos && stos.length > 0) {
            query += ` AND n.sektor IN (?)`;
            queryParams.push(stos);
        }

        query += ` ORDER BY t.id DESC`;
        const [rows]: any = await pool.query(query, queryParams);

        // Map data for XLSX
        const data = rows.map((row: any) => ({
            'ID': row.id,
            'Jam Open': new Date(row.jam_open).toLocaleString('id-ID'),
            'Jam Close': new Date(row.jam_close).toLocaleString('id-ID'),
            'Teknisi': row.nama,
            'NIK': row.nik_teknisi || row.nik_teknisi_from_naker || '-',
            'Service Area': row.service_area || '-',
            'STO (Sektor)': row.sektor || '-',
            'No HP': row.no_hp,
            'No Tiket': row.no_tiket,
            'Jenis Tiket': row.jenis,
            'No INET': row.no_inet,
            'Perbaikan (RCA)': row.rca,
            'ODP': row.odp,
            'Catatan': row.catatan || '-',
            'Material Dropcore': row.material_dropcore || 0,
            'Material Protection': row.material_protection || 0,
            'Material PS 1:4': row.material_ps14 || 0,
            'Material PS 1:8': row.material_ps18 || 0,
            'Material PS 1:16': row.material_ps116 || 0,
            'Material ODP Solid': row.material_odp_solid || 0,
            'Material Patchcore': row.material_patchcore || 0,
            'Material Adaptor': row.material_adaptor || 0,
            'SN ONT': row.material_sn_ont || '',
            'SN STB': row.material_sn_stb || ''
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Tickets');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="data_tiket_${new Date().getTime()}.xlsx"`
            }
        });

    } catch (error: any) {
        console.error('Export Error:', error);
        return new Response('Export Failed', { status: 500 });
    }
};
