import type { APIRoute } from 'astro';
import { TicketController } from '../../lib/controllers/TicketController';

export const POST: APIRoute = async ({ request }) => {
    try {
        const formData = await request.formData();
        const data = Object.fromEntries(formData.entries());

        const ticketId = await TicketController.submitTicket(data);

        return new Response(JSON.stringify({
            status: "success",
            id: ticketId,
            msg: "Tiket berhasil disimpan"
        }), { status: 200 });

    } catch (error: any) {
        console.error('Submit Error:', error);
        return new Response(JSON.stringify({ status: 'error', msg: error.message }), { status: 200 });
    }
};
