import type { APIRoute } from 'astro';
import pool from '../../lib/db';

export const GET: APIRoute = async ({ url }) => {
    try {
        const id = url.searchParams.get('id');

        if (!id) {
            // Return ALL groups if no ID is specified
            const [rows]: any = await pool.query(
                "SELECT id, service_area, group_id, is_active FROM service_area_group ORDER BY service_area"
            );
            return new Response(JSON.stringify({ status: "success", data: rows }), { status: 200 });
        }

        const [rows]: any = await pool.query(
            "SELECT id, service_area, group_id, is_active FROM service_area_group WHERE id = ?",
            [id]
        );

        if (rows.length > 0) {
            return new Response(JSON.stringify({ status: "success", data: rows[0] }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ status: "error", msg: "Data tidak ditemukan" }), { status: 200 });
        }


    } catch (error: any) {
        console.error('Get Service Area Group Error:', error);
        return new Response(JSON.stringify({ status: "error", msg: error.message }), { status: 500 });
    }
};
