import type { APIRoute } from 'astro';
import { TicketController } from '../../lib/controllers/TicketController';

export const POST: APIRoute = async ({ request }) => {
    try {
        const formData = await request.formData();

        // Extract evidence files before converting to plain object
        const evidenFiles = formData.getAll('eviden') as File[];

        // Build plain data object (exclude file fields)
        const data: Record<string, any> = {};
        for (const [key, value] of formData.entries()) {
            if (key !== 'eviden') {
                data[key] = value;
            }
        }

        // 1. Create the ticket and process evidence files inside the controller (triggers unified notification)
        const ticketId = await TicketController.submitTicket(data, evidenFiles);

        return new Response(JSON.stringify({
            status: 'success',
            id: ticketId,
            msg: 'Tiket berhasil disimpan'
        }), { status: 200 });

    } catch (error: any) {
        console.error('Submit Error:', error);
        return new Response(JSON.stringify({ status: 'error', msg: error.message }), { status: 200 });
    }
};
