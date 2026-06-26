import type { APIRoute } from 'astro';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TicketController } from '../../lib/controllers/TicketController';

export const POST: APIRoute = async ({ request }) => {
    try {
        const formData = await request.formData();
        const tiket_id = formData.get('tiket_id')?.toString();
        const files = formData.getAll('fotos') as File[];

        if (!tiket_id) return new Response(JSON.stringify({ status: 'error', msg: 'Tiket ID tidak ditemukan' }), { status: 400 });

        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        await fs.mkdir(uploadDir, { recursive: true });

        const baseUrl = process.env.URL || "https://staging.riuz.cloud";
        const uploadedMeta = [];

        for (const file of files) {
            const ext = path.extname(file.name);
            const uniqueName = `${Date.now()}_${tiket_id}_${Math.random().toString(36).substring(7)}${ext}`;
            const filePath = path.join(uploadDir, uniqueName);
            await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
            uploadedMeta.push({ url: `${baseUrl}/uploads/${uniqueName}`, path: `uploads/${uniqueName}` });
        }

        const uploaded = await TicketController.addEvidence(tiket_id, uploadedMeta);

        return new Response(JSON.stringify({ status: 'success', uploaded }), { status: 200 });

    } catch (error: any) {
        return new Response(JSON.stringify({ status: 'error', msg: error.message }), { status: 500 });
    }
};
