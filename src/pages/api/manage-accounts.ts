import type { APIRoute } from 'astro';
import { AdminModel } from '../../lib/models/AdminModel';

export const GET: APIRoute = async ({ cookies }) => {
    // Security: Only Admin can list/manage accounts
    const session = cookies.get('admin_session')?.value;
    const role = cookies.get('admin_role')?.value;

    if (session !== 'active' || role !== 'ADMIN') {
        return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), { status: 403 });
    }

    try {
        const data = await AdminModel.getAll();
        return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
    } catch (err: any) {
        return new Response(JSON.stringify({ status: 'error', message: err.message }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request, cookies }) => {
    const session = cookies.get('admin_session')?.value;
    const role = cookies.get('admin_role')?.value;

    if (session !== 'active' || role !== 'ADMIN') {
        return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), { status: 403 });
    }

    try {
        const fd = await request.formData();
        const action = fd.get('action')?.toString();
        const id = fd.get('id')?.toString();

        if (action === 'delete') {
            await AdminModel.delete(id!);
            return new Response(JSON.stringify({ status: 'success', msg: 'Account removed' }), { status: 200 });
        }

        const username = fd.get('username')?.toString();
        const password = fd.get('password')?.toString();
        const userRole = fd.get('role')?.toString();

        if (action === 'create') {
            await AdminModel.create({ username, password, role: userRole });
            return new Response(JSON.stringify({ status: 'success', msg: 'Account created' }), { status: 200 });
        }

        if (action === 'update') {
            await AdminModel.update(id!, { role: userRole, password });
            return new Response(JSON.stringify({ status: 'success', msg: 'Account updated' }), { status: 200 });
        }

        return new Response(JSON.stringify({ status: 'error', message: 'Invalid action' }), { status: 400 });
    } catch (err: any) {
        return new Response(JSON.stringify({ status: 'error', message: err.message }), { status: 500 });
    }
};
