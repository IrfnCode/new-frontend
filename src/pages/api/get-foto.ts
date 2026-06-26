import type { APIRoute } from 'astro';
import pool from '../../lib/db';

export const GET: APIRoute = async ({ url }) => {
    try {
        const tiket_id = url.searchParams.get('tiket_id');

        if (!tiket_id) {
            return new Response(JSON.stringify({ status: "error", msg: "Tiket ID tidak ditemukan" }), { status: 200 });
        }

        const [rows]: any = await pool.query(
            "SELECT id, foto_url, foto_path, created_at FROM tiket_evidence WHERE tiket_id = ? ORDER BY created_at ASC",
            [tiket_id]
        );

        return new Response(JSON.stringify({
            status: "success",
            tiket_id,
            fotos: rows,
            total: rows.length
        }), { status: 200 });

    } catch (error: any) {
        console.error('Get Foto Error:', error);
        return new Response(JSON.stringify({ status: "error", msg: error.message }), { status: 500 });
    }
};
