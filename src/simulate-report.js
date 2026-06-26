import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env manually
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length > 0) env[key.trim()] = rest.join('=').trim();
});

const allowedAreas = [
    'BATAM CENTER', 'BGES', 'LUBUK BAJA', 'SAGULUNG',
    'TANJUNG BALAI KARIMUN', 'TANJUNGPINANG'
];

async function simulate() {
    const config = {
        host: env.DB_HOST || '127.0.0.1',
        user: env.DB_USER || 'root',
        password: env.DB_PASS || env.DB_PASSWORD || '',
        database: env.DB_NAME || 'db_tiket'
    };

    const start_date = new Date().toISOString().split('T')[0];
    const end_date = start_date;

    try {
        const pool = await mysql.createPool(config);
        
        console.log(`Simulating for ${start_date} to ${end_date}`);

        const sql = `
            SELECT 
                t.id, t.nik_teknisi, t.user_id, t.jenis, t.odp, t.no_tiket, t.no_inet, 
                t.jam_open, t.jam_close, t.rca, t.catatan,
                COALESCE(n.nama, t.nama, 'Unknown') AS nama_teknisi,
                n.service_area, n.posisi
            FROM tiket_simple t
            LEFT JOIN naker n ON (t.nik_teknisi = n.nik OR t.user_id = n.id_bot_telegram)
            WHERE DATE(t.jam_close) BETWEEN ? AND ?
        `;
        const [rows] = await pool.query(sql, [start_date, end_date]);
        console.log("Found rows in SQL:", rows.length);

        const data = {};
        let skipped_no_area = 0;
        let matched_areas = {};

        for (const row of rows) {
            let area = (row.service_area || '').trim().toUpperCase();
            if (!area || !allowedAreas.includes(area)) {
                const foundArea = allowedAreas.find(a => area.includes(a));
                if (foundArea) {
                    area = foundArea;
                } else {
                    skipped_no_area++;
                    continue; 
                }
            }
            matched_areas[area] = (matched_areas[area] || 0) + 1;
            
            const nik = row.nik_teknisi;
            const nama = row.nama_teknisi || 'Unknown';
            const key = `${nik}|${nama}`;
            if (!data[area]) data[area] = {};
            if (!data[area][key]) data[area][key] = { counts: {} };
            const jenis = row.jenis || 'UNSPEC';
            data[area][key].counts[jenis] = (data[area][key].counts[jenis] || 0) + 1;
        }

        console.log("Matched Areas Count:", matched_areas);
        console.log("Skipped (No Area):", skipped_no_area);
        console.log("Response Keys:", Object.keys({ success: true, status: 'success', data }));
        console.log("Final Data Object Areas:", Object.keys(data));

        await pool.end();
    } catch (err) {
        console.error("ERROR:", err.message);
    }
}

simulate();
