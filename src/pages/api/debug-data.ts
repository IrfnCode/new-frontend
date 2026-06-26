import type { APIRoute } from 'astro';
import pool from '../../lib/db';

export const GET: APIRoute = async () => {
    try {
        const [rows]: any = await pool.query(`
            SELECT t.id, t.nik_teknisi, t.user_id, t.jam_close, n.service_area
            FROM tiket_simple t
            LEFT JOIN naker n ON (t.nik_teknisi = n.nik OR t.user_id = n.id_bot_telegram)
            ORDER BY t.id DESC LIMIT 10
        `);
        
        const [distinctAreas]: any = await pool.query(`SELECT DISTINCT service_area FROM naker`);
        
        return new Response(JSON.stringify({ 
            last_10_tickets: rows,
            distinct_areas_in_naker: distinctAreas.map((a: any) => a.service_area)
        }, null, 2), { 
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
