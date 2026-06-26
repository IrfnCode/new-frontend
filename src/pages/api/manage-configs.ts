import type { APIRoute } from 'astro';
import { ConfigModel } from '../../lib/models/ConfigModel';

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');

    try {
        let data;
        if (type === 'perbaikan') data = await ConfigModel.getAllPerbaikan();
        else if (type === 'jenis') data = await ConfigModel.getAllJenis();
        else if (type === 'groups') data = await ConfigModel.getAllGroups();
        else return new Response(JSON.stringify({ status: 'error', msg: 'Invalid type' }), { status: 400 });

        return new Response(JSON.stringify({ status: 'success', data }));
    } catch (err: any) {
        return new Response(JSON.stringify({ status: 'error', msg: err.message }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request }) => {
    const fd = await request.formData();
    const type = fd.get('type')?.toString();
    const action = fd.get('action')?.toString();
    const id = fd.get('id')?.toString();
    const name = fd.get('name')?.toString();

    try {
        let result;
        if (type === 'perbaikan') {
            if (action === 'add') result = await ConfigModel.createPerbaikan(name!);
            else if (action === 'edit') result = await ConfigModel.updatePerbaikan(id!, name!);
            else if (action === 'delete') result = await ConfigModel.deletePerbaikan(id!);
        } 
        else if (type === 'jenis') {
            if (action === 'add') result = await ConfigModel.createJenis(name!);
            else if (action === 'edit') result = await ConfigModel.updateJenis(id!, name!);
            else if (action === 'delete') result = await ConfigModel.deleteJenis(id!);
        }
        else if (type === 'groups') {
            const data = {
                id: fd.get('id'),
                service_area: fd.get('service_area'),
                group_id: fd.get('group_id'),
                is_active: fd.get('is_active') === '1' ? 1 : 0
            };
            result = await ConfigModel.manageGroup(action as any, data);
        }
        else {
            return new Response(JSON.stringify({ status: 'error', msg: 'Invalid type' }), { status: 400 });
        }

        return new Response(JSON.stringify({ status: 'success', result }));
    } catch (err: any) {
        return new Response(JSON.stringify({ status: 'error', msg: err.message }), { status: 500 });
    }
};
