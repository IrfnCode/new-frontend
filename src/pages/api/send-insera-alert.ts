import type { APIRoute } from 'astro';
import { TicketController } from '../../lib/controllers/TicketController';
import { getServiceAreaByWorkzone } from '../../lib/utils/area-mapping';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { ticket, assignedTo, actorName, isReassign } = body;

        if (!ticket || !assignedTo) {
            return new Response(JSON.stringify({ status: "error", msg: "Data tidak lengkap" }), { status: 400 });
        }

        // Tentukan Service Area jika belum ada di objek ticket
        if (!ticket.service_area && ticket.workzone) {
            ticket.service_area = getServiceAreaByWorkzone(ticket.workzone);
        }

        await TicketController.sendInseraTicketAlert(
            ticket.id, 
            ticket, 
            assignedTo, 
            actorName, 
            isReassign || false
        );

        return new Response(JSON.stringify({ status: "success", msg: "Notifikasi dikirim" }), { status: 200 });
    } catch (err: any) {
        return new Response(JSON.stringify({ status: "error", msg: err.message }), { status: 500 });
    }
};
