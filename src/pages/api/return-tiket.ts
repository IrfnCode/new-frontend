import type { APIRoute } from 'astro';
import { TicketController } from '../../lib/controllers/TicketController';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { id, actorName } = body;

        if (!id) throw new Error("Ticket ID required");

        await TicketController.returnTicket(id, actorName || 'Admin');

        return new Response(JSON.stringify({ status: "success", msg: "Tiket berhasil di-return" }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ status: "error", msg: error.message }), { status: 200 });
    }
};
