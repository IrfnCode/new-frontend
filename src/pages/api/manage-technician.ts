import type { APIRoute } from 'astro';
import { AdminController } from '../../lib/controllers/AdminController';

export const GET: APIRoute = async () => {
    try {
        const data = await AdminController.getTechnicians();
        return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ status: 'error', message: error.message, msg: error.message }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const formData = await request.formData();
        const action = formData.get('action')?.toString() || '';
        const data = Object.fromEntries(formData.entries());

        if (action === 'delete') {
            const ids = formData.get('ids')?.toString().split(',') || [];
            await AdminController.manageTechnician('delete', { ids });
        } else {
            await AdminController.manageTechnician(action, data);
        }

        return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ status: 'error', message: error.message, msg: error.message }), { status: 500 });
    }
};
