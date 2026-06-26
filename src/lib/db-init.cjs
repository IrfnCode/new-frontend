const mysql = require('mysql2/promise');
require('dotenv').config();

async function init() {
    console.log("Initializing assignment_history table...");
    const pool = mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'db_tiket',
    });

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS assignment_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                work_order_id BIGINT NOT NULL,
                order_id VARCHAR(64) NOT NULL,
                assigned_to JSON NOT NULL,
                assigned_by VARCHAR(128) NOT NULL,
                assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                action_type VARCHAR(32) DEFAULT 'ASSIGN'
            )
        `);
        console.log("Table assignment_history created or already exists.");
    } catch (err) {
        console.error("Error creating table:", err.message);
    } finally {
        await pool.end();
    }
}

init();
