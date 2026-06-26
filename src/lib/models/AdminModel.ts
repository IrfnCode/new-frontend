import pool from '../db';
import crypto from 'crypto';

export class AdminModel {
    static hashPassword(password: string) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    static async init() {
        // Buat tabel jika belum ada
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('ADMIN', 'MODERATOR', 'HELPDESK', 'KORLAP', 'HSA', 'MEMBER', 'HD KORLAP') DEFAULT 'HELPDESK',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Migrasi: tambah nilai ENUM baru jika kolom sudah ada dengan ENUM lama
        try {
            await pool.query(`
                ALTER TABLE admin_accounts 
                MODIFY COLUMN role ENUM('ADMIN', 'MODERATOR', 'HELPDESK', 'KORLAP', 'HSA', 'MEMBER', 'HD KORLAP') DEFAULT 'HELPDESK'
            `);
        } catch (e) {
            // Abaikan jika sudah up-to-date
        }
    }

    static async findByUsername(username: string) {
        const [rows]: any = await pool.query('SELECT * FROM admin_accounts WHERE username = ?', [username]);
        return rows[0];
    }

    static async getAll() {
        const [rows]: any = await pool.query('SELECT id, username, role, created_at FROM admin_accounts ORDER BY id ASC');
        return rows;
    }

    static async create(data: any) {
        const hashed = this.hashPassword(data.password);
        const [result]: any = await pool.query(
            'INSERT INTO admin_accounts (username, password, role) VALUES (?, ?, ?)',
            [data.username, hashed, data.role]
        );
        return result.insertId;
    }

    static async update(id: string | number, data: any) {
        let query = 'UPDATE admin_accounts SET role = ?';
        const params = [data.role];

        if (data.password) {
            query += ', password = ?';
            params.push(this.hashPassword(data.password));
        }

        query += ' WHERE id = ?';
        params.push(id);

        const [result]: any = await pool.query(query, params);
        return result;
    }

    static async delete(id: string | number) {
        const [result]: any = await pool.query('DELETE FROM admin_accounts WHERE id = ?', [id]);
        return result;
    }
}
