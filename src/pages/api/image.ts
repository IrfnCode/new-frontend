import type { APIRoute } from 'astro';
import fs from 'fs/promises';
import path from 'path';

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const imagePath = url.searchParams.get('path'); // e.g. "ganti-odp/123.jpg"
    
    if (!imagePath) {
        return new Response('No path provided', { status: 400 });
    }

    try {
        let baseDir = process.cwd();
        if (baseDir.includes('dist') || baseDir.includes('server')) {
            baseDir = baseDir.split('dist')[0]; 
        }

        let filePath = path.join(baseDir, 'public', 'uploads', imagePath);

        try {
            await fs.access(filePath);
        } catch {
            const { fileURLToPath } = await import('url');
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            filePath = path.join(__dirname, '../../../../../public/uploads', imagePath);
        }

        const data = await fs.readFile(filePath);
        
        let mime = 'image/jpeg';
        if (imagePath.endsWith('.png')) mime = 'image/png';
        else if (imagePath.endsWith('.webp')) mime = 'image/webp';

        return new Response(data, {
            status: 200,
            headers: {
                'Content-Type': mime,
                'Cache-Control': 'public, max-age=31536000',
            }
        });
    } catch (e: any) {
        return new Response('Image not found in Astro: ' + e.message, { status: 404 });
    }
};
