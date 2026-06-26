import type { APIRoute } from 'astro';
import { AnnouncementController } from '../../lib/controllers/AnnouncementController';
import { GroupModel } from '../../lib/models/GroupModel';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const POST: APIRoute = async ({ request }) => {
    try {
        const formData = await request.formData();
        const message = formData.get('message') as string;
        const groupIds = formData.getAll('groupIds') as string[];
        const image = formData.get('image') as File | null;

        if (!message || groupIds.length === 0) {
            return new Response(JSON.stringify({ status: 'error', msg: 'Message and groups are required' }), { status: 400 });
        }

        // Fetch group names for the controller's result mapping
        const allGroups = await GroupModel.getActive();
        const selectedGroupConfigs = allGroups
            .filter((g: any) => groupIds.includes(g.group_id))
            .map((g: any) => ({ id: g.group_id, name: g.service_area }));

        let imageInfo = null;
        if (image && image.size > 0) {
            const tempDir = os.tmpdir();
            const tempPath = path.join(tempDir, `announcement_${Date.now()}_${image.name}`);
            const buffer = Buffer.from(await image.arrayBuffer());
            await fs.writeFile(tempPath, buffer);
            imageInfo = { path: tempPath, name: image.name };
        }

        const results = await AnnouncementController.broadcast(selectedGroupConfigs, message, imageInfo);

        // Cleanup temp file
        if (imageInfo) {
            await fs.unlink(imageInfo.path).catch(() => { });
        }

        return new Response(JSON.stringify({ status: 'success', data: results }));
    } catch (error: any) {
        console.error("Announcement API Error:", error);
        return new Response(JSON.stringify({ status: 'error', msg: error.message }), { status: 500 });
    }
};
