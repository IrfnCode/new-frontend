import type { APIRoute } from 'astro';
import { InseraModel } from '../../lib/models/InseraModel';

export const GET: APIRoute = async ({ url }) => {
    try {
        const woId = url.searchParams.get('id');
        const assignedBy = url.searchParams.get('assigned_by');
        
        let history;
        if (woId) {
            history = await InseraModel.getAssignmentHistory(woId);
        } else {
            history = await InseraModel.getFullAssignmentHistory(assignedBy || undefined);
        }
        
        return new Response(JSON.stringify({ status: 'success', data: history }, (_, v) => typeof v === 'bigint' ? v.toString() : v), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500 });
    }
};
