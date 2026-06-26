import type { APIRoute } from 'astro';
import { TicketModel } from '../../lib/models/TicketModel';

export const POST: APIRoute = async ({ request, cookies }) => {
    try {
        let user_id = "";
        let include_all = false;
        let active_only = false;
        let limit = 50;
        let date_from = "";
        let date_to = "";
        const isWebLoggedIn =
            cookies.get('admin_session')?.value === 'active' &&
            (!!cookies.get('admin_role')?.value || !!cookies.get('admin_user')?.value);
        const contentType = request.headers.get("content-type");

        if (contentType?.includes("application/json")) {
            // Baca body SEKALI saja — jangan clone request
            const body = await request.json();
            user_id    = body.user_id?.toString() || "";
            include_all = body.include_all === true || body.include_all === "1";
            active_only = body.active_only === true;
            limit = Math.min(Math.max(Number(body.limit || 50), 1), 1000);
            date_from = body.date_from || "";
            date_to   = body.date_to   || "";
        } else {
            const formData = await request.formData();
            user_id     = formData.get('user_id')?.toString() || "";
            include_all = formData.get('include_all')?.toString() === "1";
            active_only = formData.get('active_only')?.toString() === "1";
            limit = Math.min(Math.max(Number(formData.get('limit')?.toString() || 50), 1), 1000);
            date_from = formData.get('date_from')?.toString() || "";
            date_to   = formData.get('date_to')?.toString()   || "";
        }

        const allowIncludeAll = include_all && isWebLoggedIn;
        let data: any[] = [];

        if (user_id) {
            const useActiveOnly = active_only || request.headers.get("x-active-only") === "true";
            if (useActiveOnly) {
                data = await TicketModel.getAssignedActiveTickets(user_id);
            } else {
                data = await TicketModel.getAll({ user_id, limit });
            }
        } else {
            const filters: any = allowIncludeAll
                ? { include_all: true, limit, date_from, date_to }
                : {};
            data = await TicketModel.getAll(filters);
        }

        return new Response(JSON.stringify({ status: "success", data }), { status: 200 });
    } catch (err: any) {
        console.error(`[ERROR] /api/get-tiket-user:`, err);
        return new Response(JSON.stringify({ status: "error", msg: err.message }), { status: 500 });
    }
};
