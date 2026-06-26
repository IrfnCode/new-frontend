import type { APIRoute } from 'astro';
import pool from '../../lib/db';

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
        
        // Filter by Service Area
        if (serviceArea !== '') {
            query += ` AND n.service_area = ?`;
            queryParams.push(serviceArea);
        }
        
        // Filter by Bulan
        if (month !== '') {
            // Gunakan LIKE untuk meminimalisir isu tipe data atau format pada database
            query += ` AND t.jam_open LIKE ?`;
            queryParams.push(`${month}%`);
        }
        
        query += ` ORDER BY t.id DESC`;
        
        const [rows]: any = await pool.query(query, queryParams);
        
        return new Response(JSON.stringify({
            success: true,
            total: rows.length,
            data: rows
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });

    } catch (error: any) {
        console.error('Error fetching data:', error);
        return new Response(JSON.stringify({ 
            success: false, 
            message: 'Gagal mengambil data', 
            error: error.message 
        }), { 
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};
