import type { APIRoute } from 'astro';
import pool from '../../lib/db';

export const GET: APIRoute = async ({ url }) => {
    try {
        const nik = url.searchParams.get('nik');

        if (!nik) {
            return new Response(JSON.stringify({ status: "error", msg: "NIK tidak ditemukan" }), { status: 200 });
        }

        const [rows]: any = await pool.query("SELECT * FROM naker WHERE nik = ?", [nik]);

        if (rows.length > 0) {
            return new Response(JSON.stringify({ status: "success", data: rows[0] }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ status: "error", msg: "Data tidak ditemukan" }), { status: 200 });
        }

    } catch (error: any) {
        console.error('Get Naker By NIK Error:', error);
        return new Response(JSON.stringify({ status: "error", msg: error.message }), { status: 500 });
    }
};
