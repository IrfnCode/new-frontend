import type { APIRoute } from 'astro';
import pool from '../../lib/db';

export const GET: APIRoute = async () => {
    try {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // 1. Stat Cards
        const [coHariIni]: any = await pool.query("SELECT COUNT(*) as total FROM tiket_simple WHERE DATE(NULLIF(NULLIF(jam_close, '0000-00-00 00:00:00'), '')) = ?", [todayStr]);
        const [totalTeknisi]: any = await pool.query("SELECT COUNT(DISTINCT nama) as total FROM tiket_simple WHERE nama IS NOT NULL");
        const [totalArea]: any = await pool.query("SELECT COUNT(DISTINCT service_area) as total FROM naker WHERE service_area IS NOT NULL AND service_area != ''");
        const [activeNow]: any = await pool.query("SELECT COUNT(DISTINCT user_id) as total FROM tiket_simple WHERE jam_close >= DATE_SUB(NOW(), INTERVAL 24 HOUR)");
        const [totalForce]: any = await pool.query("SELECT COUNT(*) as total FROM naker");

        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const [coBulanIni]: any = await pool.query("SELECT COUNT(*) as total FROM tiket_simple WHERE jam_close >= ?", [firstDayOfMonth]);

        // 2. 7-Day Chart Data
        const harianLabels = [];
        const harianCounts = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dStr = d.toISOString().split('T')[0];
            const lab = d.getDate() + "/" + (d.getMonth() + 1);

            const [rows]: any = await pool.query("SELECT COUNT(*) as total FROM tiket_simple WHERE DATE(NULLIF(NULLIF(jam_close, '0000-00-00 00:00:00'), '')) = ?", [dStr]);
            harianLabels.push(lab);
            harianCounts.push(rows[0].total);
        }

        // 3. RCA, Jenis, & Tech Lists
        const [rcaRows]: any = await pool.query(`
            SELECT rca, COUNT(*) as count 
            FROM tiket_simple 
            WHERE rca IS NOT NULL AND rca != '' 
            GROUP BY rca 
            ORDER BY count DESC 
            LIMIT 10
        `);

        const [jenisRows]: any = await pool.query(`
            SELECT jenis, COUNT(*) as count 
            FROM tiket_simple 
            WHERE jenis IS NOT NULL AND jenis != '' 
            GROUP BY jenis 
            ORDER BY count DESC 
            LIMIT 10
        `);

        const [techRows]: any = await pool.query(`
            SELECT nama, COUNT(*) as count 
            FROM tiket_simple 
            WHERE nama IS NOT NULL AND nama != '' 
            GROUP BY nama 
            ORDER BY count DESC 
            LIMIT 10
        `);

        return new Response(JSON.stringify({
            status: 'success',
            stats: {
                co_hari_ini: coHariIni[0].total,
                total_teknisi: totalTeknisi[0].total,
                total_area: totalArea[0].total,
                co_bulan_ini: coBulanIni[0].total,
                active_now: activeNow[0].total,
                total_force: totalForce[0].total
            },
            harian: {
                labels: harianLabels,
                counts: harianCounts
            },
            rca: rcaRows.map((r: any) => ({ label: r.rca, count: r.count })),
            jenis: jenisRows.map((r: any) => ({ label: r.jenis, count: r.count })),
            teknisi: techRows.map((r: any) => ({ label: r.nama, count: r.count }))
        }), { status: 200 });

    } catch (error: any) {
        console.error('Chart Data Error:', error);
        return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500 });
    }
};
