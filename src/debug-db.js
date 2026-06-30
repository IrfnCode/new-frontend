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

async function debug() {
    const config = {
        host: env.DB_HOST || '127.0.0.1',
        user: env.DB_USER || 'root',
        password: env.DB_PASS || env.DB_PASSWORD || '',
        database: env.DB_NAME || 'db_tiket'
    };

    console.log("Using config:", config);
    
    try {
        const pool = await mysql.createPool(config);
        
        console.log("--- NAKER AREAS ---");
        const [areas] = await pool.query("SELECT DISTINCT service_area FROM naker");
        console.log(areas);

        console.log("--- RECENT TICKETS (Manual) ---");
        const [tickets] = await pool.query(`
            SELECT t.id, t.nik_teknisi, t.user_id, t.jam_close, n.service_area 
            FROM tiket_simple t 
            LEFT JOIN naker n ON (t.nik_teknisi = n.nik OR t.user_id = n.id_bot_telegram) 
            ORDER BY t.id DESC LIMIT 5
        `);
        console.log(tickets);

        console.log("--- TODAY'S TICKETS ---");
        const [today] = await pool.query("SELECT count(*) as count FROM tiket_simple WHERE DATE(NULLIF(NULLIF(jam_close, '0000-00-00 00:00:00'), '')) = CURDATE()");
        console.log("Total for today:", today[0].count);

        await pool.end();
    } catch (err) {
        console.error("ERROR:", err.message);
    }
}

debug();
