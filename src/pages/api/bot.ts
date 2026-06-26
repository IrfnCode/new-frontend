import type { APIRoute } from 'astro';
import { BotController } from '../../lib/controllers/BotController';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        await BotController.handleUpdate(body);
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

export const GET: APIRoute = async () => {
    return new Response("Bot is running", { status: 200 });
}
