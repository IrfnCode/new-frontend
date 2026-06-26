import type { APIRoute } from 'astro';
import { TicketController } from '../../lib/controllers/TicketController';

export const POST: APIRoute = async ({ request }) => {
    try {
        const formData = await request.formData();
        const data = Object.fromEntries(formData.entries());
        console.log("[DEBUG] Update Tiket Data:", data);
        const id = data.tiket_id as string;

        await TicketController.updateTicket(id, data);

        return new Response(JSON.stringify({ status: "success", msg: "Tiket berhasil diupdate" }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ status: "error", msg: error.message }), { status: 200 });
    }
};
