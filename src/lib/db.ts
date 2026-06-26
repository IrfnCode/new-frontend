import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || import.meta.env?.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || import.meta.env?.DB_PORT || '3306'),
    user: process.env.DB_USER || import.meta.env?.DB_USER || 'root',
    password: process.env.DB_PASS || import.meta.env?.DB_PASS || '',
    database: process.env.DB_NAME || import.meta.env?.DB_NAME || 'db_tiket',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export default pool;
