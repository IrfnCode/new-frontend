import type { APIRoute } from 'astro';
import pool from '../../lib/db';

/**
 * API untuk mengecek apakah nomor tiket ada di INSERA (scraped_work_orders)
 * Query param: no_tiket
 * Response: { exists: boolean, ticket?: object }
 */
export const GET: APIRoute = async ({ url }) => {
    try {
        const noTiket = url.searchParams.get('no_tiket');
        
        if (!noTiket) {
            return new Response(JSON.stringify({ 
                exists: false, 
                message: 'No tiket parameter required' 
            }), { status: 400 });
        }

        // Cek di tabel scraped_work_orders
        const [rows]: any = await pool.query(
            "SELECT order_id, status, service_no, customer_type FROM scraped_work_orders WHERE order_id = ? LIMIT 1",
            [noTiket]
        );

        if (rows && rows.length > 0) {
            return new Response(JSON.stringify({ 
                exists: true,
                ticket: {
                    order_id: rows[0].order_id,
                    status: rows[0].status,
                    service_no: rows[0].service_no,
                    customer_type: rows[0].customer_type
                }
            }), { status: 200 });
        }

        return new Response(JSON.stringify({ exists: false }), { status: 200 });

    } catch (error: any) {
        console.error('[check-insera-ticket] Error:', error);
        return new Response(JSON.stringify({ 
            exists: false, 
            error: error.message 
        }), { status: 500 });
    }
};
