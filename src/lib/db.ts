import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
    host: import.meta.env?.DB_HOST || process.env.DB_HOST || '127.0.0.1',
    port: parseInt(import.meta.env?.DB_PORT || process.env.DB_PORT || '3306'),
    user: import.meta.env?.DB_USER || process.env.DB_USER || 'root',
    password: import.meta.env?.DB_PASS || process.env.DB_PASS || '',
    database: import.meta.env?.DB_NAME || process.env.DB_NAME || 'db_tiket',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export default pool;
