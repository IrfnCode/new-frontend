import type { APIRoute } from 'astro';
import pool from '../../lib/db';

export const GET: APIRoute = async () => {
    try {
        const [rows]: any = await pool.query(
            "SELECT DISTINCT service_area FROM naker WHERE service_area IS NOT NULL AND service_area != '' ORDER BY service_area"
        );
        return new Response(JSON.stringify({ status: "success", data: rows }), { status: 200 });
    } catch (error: any) {
        console.error('Get Naker Areas Error:', error);
        return new Response(JSON.stringify({ status: "error", msg: error.message }), { status: 500 });
    }
};
