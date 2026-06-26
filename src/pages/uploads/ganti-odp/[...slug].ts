import type { APIRoute } from 'astro';
import fs from 'fs/promises';
import path from 'path';

export const GET: APIRoute = async ({ params }) => {
    const slug = params.slug;
    if (!slug) {
        return new Response('Not found', { status: 404 });
    }

    try {
        // Coba dari process.cwd() dulu
        let baseDir = process.cwd();
        
        // Jika PM2 dijalankan dari dalam folder dist/server, kita mundur ke root project
        if (baseDir.includes('dist') || baseDir.includes('server')) {
            baseDir = baseDir.split('dist')[0]; 
        }

        let filePath = path.join(baseDir, 'public', 'uploads', 'ganti-odp', slug);

        // Fallback jika tidak ketemu, gunakan __dirname (import.meta.url)
        try {
            await fs.access(filePath);
        } catch {
            const __dirname = new URL('.', import.meta.url).pathname;
            // Di production, file ini ada di dist/server/pages/uploads/ganti-odp/
            // Kita mundur 5 level ke folder project utama
            filePath = path.join(__dirname, '../../../../../public/uploads/ganti-odp', slug);
        }

        const data = await fs.readFile(filePath);
        
        let mime = 'image/jpeg';
        if (slug.endsWith('.png')) mime = 'image/png';
        else if (slug.endsWith('.webp')) mime = 'image/webp';
        else if (slug.endsWith('.gif')) mime = 'image/gif';

        return new Response(data, {
            status: 200,
            headers: {
                'Content-Type': mime,
                'Cache-Control': 'public, max-age=31536000',
            }
        });
    } catch (e: any) {
        return new Response('File not found in Astro: ' + e.message, { status: 404 });
    }
};
