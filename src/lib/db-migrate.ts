/**
 * db-migrate.ts
 * Auto-migration: tambah kolom/tabel yang belum ada secara otomatis.
 * Dipanggil sekali saat server start via middleware.
 * AMAN: hanya ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.
 */

import pool from './db';

let migrationDone = false;

async function columnExists(conn: any, table: string, column: string): Promise<boolean> {
    const [rows]: any = await conn.query(
        `SELECT COUNT(*) as cnt 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return rows[0].cnt > 0;
}

async function tableExists(conn: any, table: string): Promise<boolean> {
    const [rows]: any = await conn.query(
        `SELECT COUNT(*) as cnt 
         FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
    );
    return rows[0].cnt > 0;
}

async function addColumnIfMissing(
    conn: any,
    table: string,
    column: string,
    definition: string,
    afterColumn?: string
) {
    const exists = await columnExists(conn, table, column);
    if (!exists) {
        const after = afterColumn ? `AFTER \`${afterColumn}\`` : '';
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition} ${after}`);
        console.log(`[DB-Migrate] ✅ Added column: ${table}.${column}`);
    }
}

export async function runMigrations() {
    if (migrationDone) return;
    migrationDone = true;

    let conn: any;
    try {
        conn = await pool.getConnection();
        console.log('[DB-Migrate] Running auto-migrations...');

        // ── scraped_work_orders ──────────────────────────────────────────────
        if (await tableExists(conn, 'scraped_work_orders')) {
            await addColumnIfMissing(conn, 'scraped_work_orders', 'ticket_type',      'VARCHAR(16) DEFAULT NULL',   'scraped_at');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'customer_type',    'VARCHAR(32) DEFAULT NULL',   'ticket_type');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'customer_segment', 'VARCHAR(128) DEFAULT NULL',  'assigned_by');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'contact_phone',    'VARCHAR(32) DEFAULT NULL',   'customer_segment');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'service_no',       'VARCHAR(64) DEFAULT NULL',   'contact_phone');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'witel',            'VARCHAR(64) DEFAULT NULL',   'service_no');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'workzone',         'VARCHAR(64) DEFAULT NULL',   'witel');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'expired_date',     'VARCHAR(64) DEFAULT NULL',   'workzone');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'booking_date',     'VARCHAR(64) DEFAULT NULL',   'expired_date');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'team',             'VARCHAR(128) DEFAULT NULL',  'booking_date');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'ttr_customer',     'VARCHAR(128) DEFAULT NULL',  'team');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'reported_by',      'VARCHAR(128) DEFAULT NULL',  'ttr_customer');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'device_name',      'VARCHAR(128) DEFAULT NULL',  'reported_by');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'rk_information',   'VARCHAR(128) DEFAULT NULL',  'device_name');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'last_update_by',   'VARCHAR(128) DEFAULT NULL',  'rk_information');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'processed_at',     'DATETIME DEFAULT NULL',      'last_update_by');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'processed_by',     'VARCHAR(128) DEFAULT NULL',  'processed_at');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'closed_at',        'DATETIME DEFAULT NULL',      'processed_by');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'closed_by',        'VARCHAR(128) DEFAULT NULL',  'closed_at');
            await addColumnIfMissing(conn, 'scraped_work_orders', 'notes_hd',         'TEXT DEFAULT NULL',          'closed_by');
        } else {
            await conn.query(`
                CREATE TABLE IF NOT EXISTS \`scraped_work_orders\` (
                    \`id\`              BIGINT(20) NOT NULL AUTO_INCREMENT,
                    \`order_id\`        VARCHAR(64) NOT NULL,
                    \`title\`           TEXT DEFAULT NULL,
                    \`summary\`         TEXT DEFAULT NULL,
                    \`reported_date\`   VARCHAR(64) DEFAULT NULL,
                    \`status\`          VARCHAR(32) DEFAULT 'OPEN',
                    \`source\`          VARCHAR(32) DEFAULT 'Scraper',
                    \`scraped_at\`      VARCHAR(64) DEFAULT NULL,
                    \`created_at\`      DATETIME DEFAULT CURRENT_TIMESTAMP,
                    \`updated_at\`      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    \`ticket_type\`     VARCHAR(16) DEFAULT NULL,
                    \`customer_type\`   VARCHAR(32) DEFAULT NULL,
                    \`assigned_to\`     LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(\`assigned_to\`)),
                    \`assigned_by\`     VARCHAR(128) DEFAULT NULL,
                    \`customer_segment\` VARCHAR(128) DEFAULT NULL,
                    \`contact_phone\`   VARCHAR(32) DEFAULT NULL,
                    \`service_no\`      VARCHAR(64) DEFAULT NULL,
                    \`witel\`           VARCHAR(64) DEFAULT NULL,
                    \`workzone\`        VARCHAR(64) DEFAULT NULL,
                    \`expired_date\`    VARCHAR(64) DEFAULT NULL,
                    \`booking_date\`    VARCHAR(64) DEFAULT NULL,
                    \`team\`            VARCHAR(128) DEFAULT NULL,
                    \`ttr_customer\`    VARCHAR(128) DEFAULT NULL,
                    \`reported_by\`     VARCHAR(128) DEFAULT NULL,
                    \`device_name\`     VARCHAR(128) DEFAULT NULL,
                    \`rk_information\`  VARCHAR(128) DEFAULT NULL,
                    \`last_update_by\`  VARCHAR(128) DEFAULT NULL,
                    \`processed_at\`    DATETIME DEFAULT NULL,
                    \`processed_by\`    VARCHAR(128) DEFAULT NULL,
                    \`closed_at\`       DATETIME DEFAULT NULL,
                    \`closed_by\`       VARCHAR(128) DEFAULT NULL,
                    \`notes_hd\`        TEXT DEFAULT NULL,
                    PRIMARY KEY (\`id\`),
                    UNIQUE KEY \`order_id\` (\`order_id\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
            `);
            console.log('[DB-Migrate] ✅ Created table: scraped_work_orders');
        }

        // ── tiket_simple ─────────────────────────────────────────────────────
        if (await tableExists(conn, 'tiket_simple')) {
            await addColumnIfMissing(conn, 'tiket_simple', 'nik_teknisi',         'VARCHAR(20) DEFAULT NULL',   'user_id');
            await addColumnIfMissing(conn, 'tiket_simple', 'nama',                'VARCHAR(100) DEFAULT NULL',  'nik_teknisi');
            await addColumnIfMissing(conn, 'tiket_simple', 'jenis',               'VARCHAR(100) DEFAULT NULL',  'nama');
            await addColumnIfMissing(conn, 'tiket_simple', 'no_inet',             'VARCHAR(100) DEFAULT NULL',  'jenis');
            await addColumnIfMissing(conn, 'tiket_simple', 'no_tiket',            'VARCHAR(100) DEFAULT NULL',  'no_inet');
            await addColumnIfMissing(conn, 'tiket_simple', 'rca',                 'VARCHAR(100) DEFAULT NULL',  'no_tiket');
            await addColumnIfMissing(conn, 'tiket_simple', 'odp',                 'VARCHAR(100) DEFAULT NULL',  'rca');
            await addColumnIfMissing(conn, 'tiket_simple', 'no_hp',               'VARCHAR(20) DEFAULT NULL',   'odp');
            await addColumnIfMissing(conn, 'tiket_simple', 'catatan',             'TEXT DEFAULT NULL',          'no_hp');
            await addColumnIfMissing(conn, 'tiket_simple', 'material_dropcore',   'INT(11) DEFAULT 0',          'catatan');
            await addColumnIfMissing(conn, 'tiket_simple', 'material_protection', 'INT(11) DEFAULT 0',          'material_dropcore');
            await addColumnIfMissing(conn, 'tiket_simple', 'material_ps14',       'INT(11) DEFAULT 0',          'material_protection');
            await addColumnIfMissing(conn, 'tiket_simple', 'material_ps18',       'INT(11) DEFAULT 0',          'material_ps14');
            await addColumnIfMissing(conn, 'tiket_simple', 'material_ps116',      'INT(11) DEFAULT 0',          'material_ps18');
            await addColumnIfMissing(conn, 'tiket_simple', 'material_odp_solid',  'INT(11) DEFAULT 0',          'material_ps116');
            await addColumnIfMissing(conn, 'tiket_simple', 'material_patchcore',  'INT(11) DEFAULT 0',          'material_odp_solid');
            await addColumnIfMissing(conn, 'tiket_simple', 'material_adaptor',    'INT(11) DEFAULT 0',          'material_patchcore');
            await addColumnIfMissing(conn, 'tiket_simple', 'material_sn_ont',     "VARCHAR(100) DEFAULT ''",    'material_adaptor');
            await addColumnIfMissing(conn, 'tiket_simple', 'material_sn_stb',     "VARCHAR(100) DEFAULT ''",    'material_sn_ont');
        }

        // ── assignment_history ───────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`assignment_history\` (
                \`id\`            INT(11) NOT NULL AUTO_INCREMENT,
                \`work_order_id\` BIGINT(20) NOT NULL,
                \`order_id\`      VARCHAR(64) NOT NULL,
                \`assigned_to\`   LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(\`assigned_to\`)),
                \`assigned_by\`   VARCHAR(128) NOT NULL,
                \`assigned_at\`   DATETIME DEFAULT CURRENT_TIMESTAMP,
                \`action_type\`   VARCHAR(32) DEFAULT 'ASSIGN',
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `);

        // ── naker ────────────────────────────────────────────────────────────
        if (await tableExists(conn, 'naker')) {
            await addColumnIfMissing(conn, 'naker', 'posisi',          'VARCHAR(100) DEFAULT NULL', 'nama');
            await addColumnIfMissing(conn, 'naker', 'sektor',          'VARCHAR(10) DEFAULT NULL',  'posisi');
            await addColumnIfMissing(conn, 'naker', 'service_area',    'VARCHAR(50) DEFAULT NULL',  'sektor');
            await addColumnIfMissing(conn, 'naker', 'id_bot_telegram', 'VARCHAR(50) DEFAULT NULL',  'service_area');
            await addColumnIfMissing(conn, 'naker', 'tag_telegram',    'VARCHAR(50) DEFAULT NULL',  'id_bot_telegram');
            await addColumnIfMissing(conn, 'naker', 'korlap_nik',      'VARCHAR(20) DEFAULT NULL',  'tag_telegram');
        }

        // ── service_area_group ───────────────────────────────────────────────
        if (await tableExists(conn, 'service_area_group')) {
            await addColumnIfMissing(conn, 'service_area_group', 'group_id',   'VARCHAR(50) DEFAULT NULL',  'service_area');
            await addColumnIfMissing(conn, 'service_area_group', 'group_name', 'VARCHAR(100) DEFAULT NULL', 'group_id');
            await addColumnIfMissing(conn, 'service_area_group', 'is_active',  'TINYINT(1) DEFAULT 1',      'group_name');
        }

        // ── service_area_personnel ───────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`service_area_personnel\` (
                \`id\`              INT(11) NOT NULL AUTO_INCREMENT,
                \`service_area_id\` INT(11) DEFAULT NULL,
                \`nik\`             VARCHAR(20) DEFAULT NULL,
                \`role\`            VARCHAR(50) DEFAULT NULL,
                \`created_at\`      DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `);

        // ── tiket_evidence ───────────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`tiket_evidence\` (
                \`id\`         INT(11) NOT NULL AUTO_INCREMENT,
                \`tiket_id\`   INT(11) DEFAULT NULL,
                \`foto_url\`   TEXT DEFAULT NULL,
                \`foto_path\`  TEXT DEFAULT NULL,
                \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `);

        // ── tiket_update_log ─────────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`tiket_update_log\` (
                \`id\`         INT(11) NOT NULL AUTO_INCREMENT,
                \`tiket_id\`   INT(11) DEFAULT NULL,
                \`user_id\`    VARCHAR(50) DEFAULT NULL,
                \`field_name\` VARCHAR(50) DEFAULT NULL,
                \`old_value\`  TEXT DEFAULT NULL,
                \`new_value\`  TEXT DEFAULT NULL,
                \`updated_at\` DATETIME DEFAULT NULL,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `);

        // ── odp_replacement ──────────────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`odp_replacement\` (
                \`id\`                   INT(11) NOT NULL AUTO_INCREMENT,
                \`user_id\`              VARCHAR(50) NOT NULL,
                \`nik_teknisi\`          VARCHAR(20) DEFAULT NULL,
                \`nama_teknisi\`         VARCHAR(100) DEFAULT NULL,
                \`tanggal\`              DATETIME NOT NULL,
                \`no_tiket\`             VARCHAR(100) NOT NULL,
                \`datek_odp\`            VARCHAR(200) NOT NULL,
                \`datek_odc\`            VARCHAR(200) NOT NULL,
                \`lokasi\`               TEXT NOT NULL,
                \`barcode_odp\`          VARCHAR(200) NOT NULL,
                \`ps_count\`             TINYINT(1) NOT NULL DEFAULT 1,
                \`barcode_ps1\`          VARCHAR(200) DEFAULT NULL,
                \`barcode_ps2\`          VARCHAR(200) DEFAULT NULL,
                \`material_odp_solid\`   INT(11) DEFAULT 0,
                \`material_clam_cooker\` INT(11) DEFAULT 0,
                \`material_uc\`          INT(11) DEFAULT 0,
                \`material_kabel_adss_5m\` INT(11) DEFAULT 0,
                \`odp_rise_count\`       INT(11) DEFAULT 0,
                \`catatan\`              TEXT DEFAULT NULL,
                \`status\`               VARCHAR(30) DEFAULT 'PENDING',
                \`qc1_by\`               VARCHAR(100) DEFAULT NULL,
                \`qc1_at\`               DATETIME DEFAULT NULL,
                \`qc1_notes\`            TEXT DEFAULT NULL,
                \`qc2_by\`               VARCHAR(100) DEFAULT NULL,
                \`qc2_at\`               DATETIME DEFAULT NULL,
                \`qc2_notes\`            TEXT DEFAULT NULL,
                \`returned_fields\`      JSON DEFAULT NULL,
                \`created_at\`           DATETIME DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\`           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `);

        // ── odp_replacement_evidence ─────────────────────────────────────────
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`odp_replacement_evidence\` (
                \`id\`         INT(11) NOT NULL AUTO_INCREMENT,
                \`odp_id\`     INT(11) NOT NULL,
                \`field_name\` VARCHAR(100) NOT NULL,
                \`file_url\`   TEXT NOT NULL,
                \`file_path\`  TEXT DEFAULT NULL,
                \`mime_type\`  VARCHAR(50) DEFAULT NULL,
                \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                KEY \`idx_odp_id\` (\`odp_id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `);

        // Check if tanggal is DATE, then alter to DATETIME
        const [tanggalCols]: any = await conn.query(
            `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'odp_replacement' AND COLUMN_NAME = 'tanggal'`
        );
        if (tanggalCols.length > 0 && tanggalCols[0].DATA_TYPE === 'date') {
            await conn.query("ALTER TABLE `odp_replacement` MODIFY COLUMN `tanggal` DATETIME NOT NULL");
            console.log('[DB-Migrate] ✅ Modified column: odp_replacement.tanggal to DATETIME');
        }

        // Add new materials
        await addColumnIfMissing(conn, 'odp_replacement', 'material_uc', 'INT(11) DEFAULT 0', 'material_clam_cooker');
        await addColumnIfMissing(conn, 'odp_replacement', 'material_kabel_adss_5m', 'INT(11) DEFAULT 0', 'material_uc');


        console.log('[DB-Migrate] ✅ All migrations complete.');
    } catch (err: any) {
        console.error('[DB-Migrate] ❌ Migration error:', err.message);
        migrationDone = false; // retry next request jika gagal
    } finally {
        if (conn) conn.release();
    }
}
