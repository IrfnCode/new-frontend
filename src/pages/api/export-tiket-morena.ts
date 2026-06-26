import type { APIRoute } from 'astro';
import pool from '../../lib/db';
import * as XLSX from 'xlsx';

export const GET: APIRoute = async ({ url }) => {
    try {
        const serviceArea = url.searchParams.get('service_area') || '';
        const month = url.searchParams.get('month') || '';
        
        let query = `
            SELECT t.*, n.service_area, n.sektor, n.nik as nik_teknisi_from_naker 
            FROM tiket_simple t
            LEFT JOIN naker n ON t.user_id = n.id_bot_telegram
            WHERE 1=1
        `;
        
        const queryParams: any[] = [];
        
        if (serviceArea !== '') {
            query += ` AND n.service_area = ?`;
            queryParams.push(serviceArea);
        }
        
        if (month !== '') {
            query += ` AND t.jam_open LIKE ?`;
            queryParams.push(`${month}%`);
        }
        
        query += ` ORDER BY t.id DESC`;
        
        const [rows]: any = await pool.query(query, queryParams);
        
        function formatDate(d: any) {
            if (!d) return '-';
            if (d === '0000-00-00 00:00:00') return '-';
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return '-';
            return dt.toLocaleString('id-ID');
        }

        // Map data for XLSX
        const data = rows.map((row: any) => ({
            'No Tiket': row.no_tiket || '-',
            'No INET': row.no_inet || '-',
            'Service Area': row.service_area || '-',
            'Sektor': row.sektor || '-',
            'Teknisi': row.nama || '-',
            'NIK': row.nik_teknisi || row.nik_teknisi_from_naker || '-',
            'Jam Open': formatDate(row.jam_open),
            'Jam Close': formatDate(row.jam_close),
            'Jenis Tiket': row.jenis || '-',
            'Perbaikan (RCA)': row.rca || '-',
            'ODP': row.odp || '-',
            'No HP': row.no_hp || '-',
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
        XLSX.utils.book_append_sheet(wb, ws, 'Tickets Morena');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        const fileName = `Data_Morena_${serviceArea || 'ALL'}_${month || 'ALL'}.xlsx`;

        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`
            }
        });

    } catch (error: any) {
        console.error('Export Error:', error);
        return new Response('Export Failed: ' + error.message, { status: 500 });
    }
};
