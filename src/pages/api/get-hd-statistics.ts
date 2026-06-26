import type { APIRoute } from 'astro';
import { InseraModel } from '../../lib/models/InseraModel';

export const GET: APIRoute = async () => {
    try {
        const stats = await InseraModel.getHDStatistics();
        return new Response(JSON.stringify({ status: 'success', data: stats }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500 });
    }
};
