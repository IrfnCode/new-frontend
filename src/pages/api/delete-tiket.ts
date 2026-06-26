import type { APIRoute } from 'astro';
import { TicketModel } from '../../lib/models/TicketModel';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const ids = body.ids || [];

        if (ids.length === 0) {
            return new Response(JSON.stringify({ status: 'error', message: 'Tidak ada data yang dipilih' }), { status: 200 });
        }

        await TicketModel.delete(ids);

        return new Response(JSON.stringify({
            status: 'success',
            message: `${ids.length} data berhasil dihapus`
        }), { status: 200 });

    } catch (error: any) {
        return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500 });
    }
};
