import mysql from 'mysql2/promise';

async function checkTables() {
    const conn = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: '',
        database: 'db_staging'
    });
    try {
        const [rows] = await conn.query('DESCRIBE tiket_simple');
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTables();
