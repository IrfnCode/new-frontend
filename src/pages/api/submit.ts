import type { APIRoute } from 'astro';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TicketController } from '../../lib/controllers/TicketController';

export const POST: APIRoute = async ({ request }) => {
    try {
        const formData = await request.formData();

        // Extract evidence files before converting to plain object
        const evidenFiles = formData.getAll('eviden') as File[];

        // Build plain data object (exclude file fields)
        const data: Record<string, any> = {};
        for (const [key, value] of formData.entries()) {
            if (key !== 'eviden') {
                data[key] = value;
            }
        }

        // 1. Create the ticket
        const ticketId = await TicketController.submitTicket(data);

        // 2. If there are evidence files, save them and trigger notification
        if (evidenFiles && evidenFiles.length > 0) {
            try {
                const uploadDir = path.join(process.cwd(), 'public', 'uploads');
                await fs.mkdir(uploadDir, { recursive: true });

                const baseUrl = process.env.URL || 'https://staging.riuz.cloud';
                const uploadedMeta = [];

                for (const file of evidenFiles) {
                    if (!file || !file.name) continue;
                    const ext = path.extname(file.name) || '.jpg';
                    const uniqueName = `${Date.now()}_${ticketId}_${Math.random().toString(36).substring(7)}${ext}`;
                    const filePath = path.join(uploadDir, uniqueName);
                    await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
                    uploadedMeta.push({ url: `${baseUrl}/uploads/${uniqueName}`, path: `uploads/${uniqueName}` });
                }

                // Non-blocking: save evidence + send to group
                if (uploadedMeta.length > 0) {
                    TicketController.addEvidence(ticketId, uploadedMeta).catch(err => {
                        console.error('Evidence upload error:', err.message);
                    });
                }
            } catch (evidErr: any) {
                console.error('Evidence handling error (non-fatal):', evidErr.message);
                // Don't fail the whole submit just because of evidence
            }
        }

        return new Response(JSON.stringify({
            status: 'success',
            id: ticketId,
            msg: 'Tiket berhasil disimpan'
        }), { status: 200 });

    } catch (error: any) {
        console.error('Submit Error:', error);
        return new Response(JSON.stringify({ status: 'error', msg: error.message }), { status: 200 });
    }
};
