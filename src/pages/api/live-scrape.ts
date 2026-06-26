import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const filters = body.filters || {};

        // Forward this to backend
        const backendUrl = import.meta.env.PUBLIC_BACKEND_URL || 'http://localhost:3001';
        
        const response = await fetch(`${backendUrl}/api/scrape/live`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(filters)
        });

        const data = await response.json();
        
        if (!response.ok) {
            return new Response(JSON.stringify({ status: 'error', message: data.error || 'Backend failed' }), { status: response.status });
        }

        return new Response(JSON.stringify({ status: 'success', data: data.tickets, timestamp: data.timestamp }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500 });
    }
};
