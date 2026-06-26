import type { APIRoute } from 'astro';
import { AdminController } from '../../lib/controllers/AdminController';

export const POST: APIRoute = async ({ request }) => {
    try {
        const formData = await request.formData();
        const action = formData.get('action')?.toString() || '';
        const data = Object.fromEntries(formData.entries());

        await AdminController.manageGroup(action, data);
        return new Response(JSON.stringify({ status: "success", msg: "Data berhasil diperbarui" }), { status: 200 });
    } catch (err: any) {
        return new Response(JSON.stringify({ status: "error", msg: err.message }), { status: 500 });
    }
};
