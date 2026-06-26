import pool from './db';

async function init() {
    console.log("Initializing assignment_history table...");
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
        // No need to end pool if we're not exiting here, but this is a one-off
    }
}

init();
