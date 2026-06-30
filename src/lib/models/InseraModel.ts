import pool from '../db';
import { TicketModel } from './TicketModel';
import { TechnicianModel } from './TechnicianModel';

export class InseraModel {
    /**
     * Get all work orders directly from MySQL
     */
    static async getAll() {
        try {
            const [rows]: any = await pool.query("SELECT * FROM scraped_work_orders ORDER BY reported_date DESC, id DESC");
            console.log(`[InseraModel] Fetched ${rows?.length || 0} records from scraped_work_orders`);
            return rows;
        } catch (e) {
            console.error(`[InseraModel] Database Query Error:`, e.message);
            throw e;
        }
    }

    /**
     * Update full work order data directly in MySQL
     */
    static async update(id: string | number, data: any, updatedBy: string = 'System') {
        // 0. Permission Check
        const [existingWO]: any = await pool.query("SELECT assigned_by, last_update_by FROM scraped_work_orders WHERE id = ?", [id]);
        if (existingWO && existingWO[0]) {
            const lastHD = existingWO[0].last_update_by || existingWO[0].assigned_by;
            if (lastHD && lastHD !== updatedBy && updatedBy !== 'ADMIN' && updatedBy !== 'System') {
                throw new Error(`Permission Denied: Tiket ini terakhir diupdate oleh ${lastHD}. Hanya user tersebut yang dapat mengupdate tiket ini.`);
            }
        }

        const [result] = await pool.query(
            "UPDATE scraped_work_orders SET customer_type=?, summary=?, contact_phone=?, service_no=?, team=?, workzone=?, reported_date=?, booking_date=?, last_update_by=? WHERE id=?",
            [data.customer_type, data.summary, data.contact_phone, data.service_no, data.team, data.workzone, data.reported_date, data.booking_date, updatedBy, id]
        );
        return result;
    }

    /**
     * Update assignment information directly in MySQL and sync to tiket_simple
     */
    static async updateAssignment(id: string | number, assignedTo: any[], assignedBy: string) {
        const assignedToStr = typeof assignedTo === 'string' ? assignedTo : JSON.stringify(assignedTo);
        
        // 0. Permission Check — skip jika tiket sudah tidak ada di scraped_work_orders (sudah di-assign sebelumnya)
        const [existingWO]: any = await pool.query("SELECT assigned_by, last_update_by FROM scraped_work_orders WHERE id = ?", [id]);
        if (existingWO && existingWO[0]) {
            const lastHD = existingWO[0].last_update_by || existingWO[0].assigned_by;
            if (lastHD && lastHD !== assignedBy && assignedBy !== 'ADMIN') {
                throw new Error(`Permission Denied: Tiket ini terakhir diupdate oleh ${lastHD}. Hanya user tersebut yang dapat mengupdate tiket ini.`);
            }
        }

        // 1. Update Insera Table (jika masih ada — mungkin sudah dihapus di assign sebelumnya)
        const [result] = await pool.query(
            "UPDATE scraped_work_orders SET assigned_to = ?, assigned_by = ?, last_update_by = ?, status = 'ASSIGNED' WHERE id = ?",
            [assignedToStr, assignedBy, assignedBy, id]
        );
        
        // 1.1 Log to History
        try {
            const [woInfo]: any = await pool.query("SELECT order_id FROM scraped_work_orders WHERE id = ?", [id]);
            const orderId = woInfo[0]?.order_id || 'UNKNOWN';
            
            await pool.query(
                "INSERT INTO assignment_history (work_order_id, order_id, assigned_to, assigned_by, action_type) VALUES (?, ?, ?, ?, ?)",
                [id, orderId, assignedToStr, assignedBy, 'ASSIGN']
            );
        } catch (hErr) {
            console.error("[InseraModel] History Log failed:", hErr.message);
        }

        // 2. Sync to tiket_simple for each technician
        try {
            const [woRows]: any = await pool.query("SELECT * FROM scraped_work_orders WHERE id = ?", [id]);
            const wo = woRows[0];
            if (wo) {
                // Remove unfinished previous assignments before attaching new ones
                await pool.query(
                    "DELETE FROM tiket_simple WHERE no_tiket = ? AND (jam_close IS NULL OR jam_close = '0000-00-00 00:00:00')",
                    [wo.order_id]
                );

                // Ambil CP dan noInet dari kolom DB langsung (lebih reliable dari parsing summary)
                // Fallback ke parsing summary hanya kalau kolom kosong
                let cp     = wo.contact_phone || '';
                let noInet = wo.service_no    || '';

                // Fallback: parse dari summary kalau kolom DB kosong
                // Format REGULER: "62813... _ 11166... _ TBC _ ..."
                if (!cp || !noInet) {
                    const parts = (wo.summary || "").split(" _ ");
                    // Cek apakah parts[0] adalah nomor HP (diawali 62 atau 08)
                    const part0IsPhone = /^(62|08)\d{8,13}$/.test((parts[0] || '').trim());
                    // Cek apakah parts[1] adalah nomor internet (diawali 11)
                    const part1IsInet  = /^11\d{9,12}$/.test((parts[1] || '').trim());

                    if (!cp && part0IsPhone)     cp     = parts[0].trim();
                    if (!noInet && part1IsInet)  noInet = parts[1].trim();
                }

                // Final fallback dari summary untuk format SQM: "[SQM] 111604107805 [+6281...]"
                if (!noInet) {
                    const inetMatch = (wo.summary || '').match(/\b(11\d{9,12})\b/);
                    if (inetMatch) noInet = inetMatch[1];
                }
                if (!cp) {
                    const cpMatch = (wo.summary || '').match(/\b(62\d{8,13}|08\d{8,12})\b/);
                    if (cpMatch) cp = cpMatch[1];
                }

                // Helper: normalize reported_date ke format MySQL datetime
                const normalizeDate = (d: string | null): string => {
                    if (!d || d === '-') return new Date().toISOString().slice(0, 19).replace('T', ' ');
                    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 19).replace('T', ' ');
                    // Format "29-04-2026 18.44" → "2026-04-29 18:44:00"
                    const m = d.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2})[.:](\d{2})/);
                    if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:00`;
                    try {
                        const parsed = new Date(d);
                        if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 19).replace('T', ' ');
                    } catch { /* ignore */ }
                    return new Date().toISOString().slice(0, 19).replace('T', ' ');
                };

                // Fetch semua teknisi sekaligus (1 query) — hindari N+1
                const niks = assignedTo.map((t: any) => t.nik).filter(Boolean);
                let techMap: Record<string, any> = {};
                if (niks.length > 0) {
                    const [techRows]: any = await pool.query(
                        `SELECT nik, nama, id_bot_telegram FROM naker WHERE nik IN (${niks.map(() => '?').join(',')})`,
                        niks
                    );
                    techMap = Object.fromEntries(techRows.map((r: any) => [r.nik, r]));
                }

                for (const tech of assignedTo) {
                    const fullTech = techMap[tech.nik] || null;
                    const nikTech  = fullTech?.nik  || tech.nik  || '';
                    const namaTech = fullTech?.nama  || tech.nama || '';
                    const botId    = fullTech?.id_bot_telegram || '';

                    if (!nikTech) continue;

                    console.log(`[InseraModel] Syncing to tiket_simple: NIK=${nikTech}, botId=${botId || '(kosong)'}, order_id=${wo.order_id}`);

                    const ticketData = {
                        nik_teknisi: nikTech,
                        user_id:     botId,
                        nama:        namaTech,
                        jenis:       wo.ticket_type || "REGULER",
                        no_inet:     noInet,
                        no_tiket:    wo.order_id,
                        rca:         "ASSIGNED BY HD",
                        odp:         wo.device_name || wo.workzone || "-",
                        no_hp:       cp,
                        jam_open:    normalizeDate(wo.reported_date),
                        jam_close:   null,
                        updated_at:  new Date().toISOString().slice(0, 19).replace('T', ' '),
                        catatan:     wo.summary
                    };

                    // Upsert: kalau sudah ada update, kalau belum insert
                    const [existing]: any = await pool.query(
                        "SELECT id FROM tiket_simple WHERE no_tiket = ? AND nik_teknisi = ?",
                        [wo.order_id, nikTech]
                    );

                    if (existing.length > 0) {
                        // Re-assign: update data, reset jam_close = null (masih open)
                        await pool.query(
                            `UPDATE tiket_simple SET user_id=?, nama=?, jenis=?, no_inet=?, odp=?, no_hp=?,
                             jam_open=?, jam_close=NULL, updated_at=?, catatan=?, rca=?, no_tiket=?
                             WHERE no_tiket=? AND nik_teknisi=?`,
                            [botId, namaTech, ticketData.jenis, noInet, ticketData.odp, cp,
                             ticketData.jam_open, ticketData.updated_at, wo.summary, "ASSIGNED BY HD",
                             wo.order_id, wo.order_id, nikTech]
                        );
                    } else {
                        await TicketModel.create(ticketData);
                        // Kalau botId kosong, update user_id setelah insert menggunakan nik_teknisi
                        if (!botId) {
                            await pool.query(
                                `UPDATE tiket_simple SET user_id = (
                                    SELECT id_bot_telegram FROM naker WHERE nik = ? LIMIT 1
                                ) WHERE no_tiket = ? AND nik_teknisi = ? AND (user_id IS NULL OR user_id = '')`,
                                [nikTech, wo.order_id, nikTech]
                            );
                        }
                    }
                }

                // 3. Hapus dari scraped_work_orders setelah berhasil sync ke tiket_simple
                // TIDAK dihapus di sini — tiket tetap ada di insera sampai teknisi update
                // Hapus hanya dilakukan saat teknisi close/update tiket
                console.log(`[InseraModel] Tiket ${wo.order_id} berhasil di-sync ke tiket_simple (status: ASSIGNED).`);
            }
        } catch (err) {
            console.error("[InseraModel] Sync to tiket_simple failed:", err.message);
        }

        return result;
    }

    /**
     * Delete a single work order
     */
    static async delete(id: string | number) {
        const [result] = await pool.query("DELETE FROM scraped_work_orders WHERE id = ?", [id]);
        return result;
    }

    /**
     * Delete all work orders
     */
    static async deleteAll() {
        const [result] = await pool.query("DELETE FROM scraped_work_orders");
        return result;
    }

    /**
     * Get database diagnostics (direct count)
     */
    static async getDiagnostics() {
        try {
            const [rows]: any = await pool.query("SELECT COUNT(*) as total FROM scraped_work_orders");
            return {
                table: 'scraped_work_orders',
                total: rows[0]?.total || 0,
                status: 'Connected'
            };
        } catch (e: any) {
            return {
                table: 'scraped_work_orders',
                total: 0,
                status: 'Error: ' + (e?.message || String(e))
            };
        }
    }

    /**
     * Get unique HD users and their total assignment counts
     */
    static async getHDStatistics() {
        try {
            const [rows]: any = await pool.query(`
                SELECT assigned_by as name, COUNT(*) as total_assignments 
                FROM assignment_history 
                WHERE DATE(CONVERT_TZ(assigned_at, '+00:00', '+07:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
                GROUP BY assigned_by 
                ORDER BY total_assignments DESC
            `);
            return rows;
        } catch (e) {
            console.error("[InseraModel] getHDStatistics failed:", e.message);
            return [];
        }
    }

    /**
     * Get assignment history for a specific ticket
     */
    static async getAssignmentHistory(workOrderId: string | number) {
        try {
            const [rows]: any = await pool.query(`
                SELECT * FROM assignment_history 
                WHERE work_order_id = ? 
                ORDER BY assigned_at DESC
            `, [workOrderId]);
            return rows;
        } catch (e) {
            console.error("[InseraModel] getAssignmentHistory failed:", e.message);
            return [];
        }
    }

    /**
     * Get full joined assignment history logs 
     */
    static async getFullAssignmentHistory(assignedBy?: string) {
        try {
            let q = `
                SELECT 
                    ah.id as history_id, 
                    ah.order_id, 
                    ah.assigned_to, 
                    ah.assigned_by, 
                    ah.assigned_at, 
                    ah.action_type,
                    swo.workzone, 
                    swo.summary, 
                    swo.title,
                    swo.customer_type, 
                    swo.reported_date
                FROM assignment_history ah
                LEFT JOIN scraped_work_orders swo ON ah.order_id = swo.order_id
            `;
            const params: any[] = [];
            
            if (assignedBy) {
                q += ` WHERE ah.assigned_by = ?`;
                params.push(assignedBy);
            }
            
            q += ` ORDER BY ah.assigned_at DESC LIMIT 1000`; // Limit to avoid massive payloads
            
            const [rows]: any = await pool.query(q, params);
            return rows;
        } catch (e) {
            console.error("[InseraModel] getFullAssignmentHistory failed:", e.message);
            return [];
        }
    }

    /**
     * Get INSERA tickets assigned to a specific technician by their Telegram user ID.
     * Looks up the technician's NIK from the `naker` table using `id_bot_telegram`,
     * then filters `scraped_work_orders` where `assigned_to` JSON contains that NIK.
     */
    static async getAssignedToUser(telegramUserId: string) {
        try {
            // 1. Find the technician's NIK from Telegram user ID
            const tech = await TechnicianModel.getByBotId(telegramUserId);
            if (!tech || !tech.nik) {
                console.log(`[InseraModel] No technician found for Telegram ID: ${telegramUserId}`);
                return [];
            }

            // 2. Find scraped_work_orders where assigned_to JSON contains the NIK
            //    and status is not CLOSED/RESOLVED
            const [rows]: any = await pool.query(`
                SELECT * FROM scraped_work_orders 
                WHERE assigned_to IS NOT NULL 
                AND assigned_to LIKE ?
                AND status NOT IN ('CLOSED', 'RESOLVED', 'CANCELLED')
                ORDER BY id DESC
            `, [`%${tech.nik}%`]);

            console.log(`[InseraModel] Found ${rows.length} assigned INSERA tickets for NIK ${tech.nik} (Telegram: ${telegramUserId})`);
            return rows;
        } catch (e) {
            console.error("[InseraModel] getAssignedToUser failed:", e.message);
            return [];
        }
    }

    /**
     * Get all closed tickets (for HSA/Korlap view)
     * Includes closed_by information from tiket_simple
     */
    static async getClosedTickets(includeClosedBy: boolean = false, dateFrom?: string, dateTo?: string) {
        try {
            const conditions: string[] = ["status IN ('CLOSED', 'RESOLVED', 'CANCELLED')"];
            const params: any[] = [];

            if (dateFrom) {
                conditions.push("DATE(COALESCE(closed_at, processed_at, updated_at)) >= ?");
                params.push(dateFrom);
            }
            if (dateTo) {
                conditions.push("DATE(COALESCE(closed_at, processed_at, updated_at)) <= ?");
                params.push(dateTo);
            }

            params.push(500);
            const where = conditions.join(' AND ');

            const [rows]: any = await pool.query(
                `SELECT * FROM scraped_work_orders WHERE ${where} ORDER BY closed_at DESC, reported_date DESC LIMIT ?`,
                params
            );
            console.log(`[InseraModel] Found ${rows.length} closed tickets`);
            return rows;
        } catch (e: any) {
            console.error("[InseraModel] getClosedTickets failed:", e.message);
            return [];
        }
    }

    /**
     * Cleanup closed tickets from scraped_work_orders
     * Remove tickets that have been closed by technician or from INSERA
     */
    static async cleanupClosedTickets() {
        try {
            // User requested: "yang closed jangan di cleanup biar aja"
            // So we bypass the cleanup logic.
            console.log(`[InseraModel] cleanupClosedTickets skipped by user request.`);
            return 0;
        } catch (e: any) {
            console.error("[InseraModel] cleanupClosedTickets failed:", e.message);
            return 0;
        }
    }

    /**
     * Get all open tickets that are NOT closed (for regular view)
     */
    static async getAllOpen(dateFrom?: string, dateTo?: string) {
        try {
            // Include CLOSED tickets per user request
            const conditions: string[] = ["1=1"];
            const params: any[] = [];

            if (dateFrom) {
                conditions.push("DATE(reported_date) >= ?");
                params.push(dateFrom);
            }
            if (dateTo) {
                conditions.push("DATE(reported_date) <= ?");
                params.push(dateTo);
            }

            const where = conditions.join(' AND ');
            params.push(2000);

            const [rows]: any = await pool.query(
                `SELECT * FROM scraped_work_orders WHERE ${where} ORDER BY reported_date DESC, id DESC LIMIT ?`,
                params
            );
            console.log(`[InseraModel] Fetched ${rows.length} open records from scraped_work_orders`);
            return rows;
        } catch (e: any) {
            console.error(`[InseraModel] getAllOpen Error:`, e.message);
            throw e;
        }
    }

    /**
     * Get tickets with reminder notes (notes_hd not empty)
     * Used for reminder/notes view
     */
    static async getTicketsWithReminders() {
        try {
            const [rows]: any = await pool.query(`
                SELECT s.*, t.jam_close, t.nama as closed_by_nama
                FROM scraped_work_orders s
                LEFT JOIN tiket_simple t ON s.order_id = t.no_tiket
                WHERE s.notes_hd IS NOT NULL
                AND s.notes_hd != ''
                AND s.status NOT IN ('CLOSED', 'RESOLVED', 'CANCELLED')
                AND t.jam_close IS NULL
                ORDER BY s.reported_date DESC
            `);
            console.log(`[InseraModel] Found ${rows.length} tickets with reminders`);
            return rows;
        } catch (e) {
            console.error("[InseraModel] getTicketsWithReminders failed:", e.message);
            return [];
        }
    }

    /**
     * Get ticket by order_id
     */
    static async getByOrderId(orderId: string) {
        try {
            const [rows]: any = await pool.query(
                "SELECT * FROM scraped_work_orders WHERE order_id = ?",
                [orderId]
            );
            return rows[0] || null;
        } catch (e) {
            console.error("[InseraModel] getByOrderId failed:", e.message);
            return null;
        }
    }

    /**
     * Mark ticket as processed (closed by technician via mini app)
     * This prevents the ticket from being re-imported during scraping
     */
    static async markAsProcessed(orderId: string, processedBy: string) {
        try {
            await pool.query(
                `UPDATE scraped_work_orders 
                 SET processed_at = NOW(), processed_by = ?, status = 'CLOSED'
                 WHERE order_id = ?`,
                [processedBy, orderId]
            );
            console.log(`[InseraModel] Ticket ${orderId} marked as processed by ${processedBy}`);
            return true;
        } catch (e) {
            console.error("[InseraModel] markAsProcessed failed:", e.message);
            return false;
        }
    }

    /**
     * Get today's closed tickets for Korlap/HSA view from tiket_simple (Data Tiket)
     * This ensures closed tickets are still visible after being deleted from scraped_work_orders
     */
    static async getTodaysClosedTickets() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const [rows]: any = await pool.query(`
                SELECT 
                    t.no_tiket          AS order_id,
                    t.no_inet           AS service_no,
                    t.no_hp             AS contact_phone,
                    t.odp               AS workzone,
                    t.catatan           AS summary,
                    t.jenis             AS ticket_type,
                    t.jam_open          AS reported_date,
                    t.jam_close         AS closed_at,
                    t.nama              AS closed_by,
                    t.nik_teknisi       AS assigned_to_nik,
                    t.user_id,
                    'CLOSED'            AS status,
                    COALESCE(s.device_name,     '-') AS device_name,
                    COALESCE(s.rk_information,  '-') AS rk_information,
                    COALESCE(s.customer_type,   t.jenis) AS customer_type,
                    COALESCE(s.customer_segment, '') AS customer_segment,
                    COALESCE(s.workzone, t.odp) AS workzone_full,
                    COALESCE(s.summary, t.catatan) AS summary_full,
                    COALESCE(s.reported_by, '') AS reported_by,
                    COALESCE(s.assigned_by, '') AS assigned_by
                FROM tiket_simple t
                LEFT JOIN scraped_work_orders s ON t.no_tiket = s.order_id
                WHERE t.jam_close IS NOT NULL
                  AND t.jam_close != '0000-00-00 00:00:00'
                  AND DATE(NULLIF(NULLIF(t.jam_close, '0000-00-00 00:00:00'), '')) = ?
                ORDER BY t.jam_close DESC
            `, [today]);
            console.log(`[InseraModel] Fetched ${rows.length} today's closed tickets from tiket_simple`);
            return rows.map((row: any) => ({
                ...row,
                workzone: row.workzone_full || row.workzone,
                summary:  row.summary_full  || row.summary,
                assigned_to: row.assigned_to_nik ? JSON.stringify([{
                    nik:  row.assigned_to_nik,
                    nama: row.closed_by
                }]) : null
            }));
        } catch (e: any) {
            console.error("[InseraModel] getTodaysClosedTickets failed:", e.message);
            return [];
        }
    }

    /**
     * Get assigned tickets for KORLAP/HSA view from tiket_simple (Data Tiket)
     * These are tickets that have been assigned but not yet closed
     */
    static async getAssignedTicketsFromTiketSimple() {
        try {
            // Join tiket_simple dengan scraped_work_orders untuk dapat data lengkap
            const [rows]: any = await pool.query(`
                SELECT 
                    t.no_tiket          AS order_id,
                    t.no_inet           AS service_no,
                    t.no_hp             AS contact_phone,
                    t.odp               AS workzone,
                    t.catatan           AS summary,
                    t.jenis             AS ticket_type,
                    t.jam_open          AS reported_date,
                    t.nama              AS assigned_to_name,
                    t.nik_teknisi       AS assigned_to_nik,
                    t.user_id,
                    'ASSIGNED'          AS status,
                    -- Data dari scraped_work_orders jika ada
                    COALESCE(s.device_name,    '-') AS device_name,
                    COALESCE(s.rk_information, '-') AS rk_information,
                    COALESCE(s.customer_type,  t.jenis) AS customer_type,
                    COALESCE(s.customer_segment, '') AS customer_segment,
                    COALESCE(s.workzone, t.odp) AS workzone_full,
                    COALESCE(s.summary, t.catatan) AS summary_full,
                    COALESCE(s.reported_by, '') AS reported_by,
                    COALESCE(s.assigned_by, '') AS assigned_by,
                    COALESCE(s.ttr_customer, '') AS ttr_customer,
                    COALESCE(s.expired_date, '') AS expired_date,
                    COALESCE(s.booking_date, '') AS booking_date
                FROM tiket_simple t
                LEFT JOIN scraped_work_orders s ON t.no_tiket = s.order_id
                WHERE t.jam_close IS NULL
                  OR t.jam_close = '0000-00-00 00:00:00'
                ORDER BY t.jam_open DESC
            `);
            console.log(`[InseraModel] Fetched ${rows.length} assigned tickets from tiket_simple`);
            return rows.map((row: any) => ({
                ...row,
                // Gunakan data lengkap dari scraped_work_orders jika tersedia
                workzone:  row.workzone_full  || row.workzone,
                summary:   row.summary_full   || row.summary,
                assigned_to: row.assigned_to_nik ? JSON.stringify([{
                    nik:  row.assigned_to_nik,
                    nama: row.assigned_to_name
                }]) : null
            }));
        } catch (e: any) {
            console.error("[InseraModel] getAssignedTicketsFromTiketSimple failed:", e.message);
            return [];
        }
    }

    /**
     * Get processed order IDs to exclude from scraping
     */
    static async getProcessedOrderIds() {
        try {
            const [rows]: any = await pool.query(
                "SELECT order_id FROM scraped_work_orders WHERE processed_at IS NOT NULL"
            );
            return new Set(rows.map((r: any) => r.order_id));
        } catch (e) {
            console.error("[InseraModel] getProcessedOrderIds failed:", e.message);
            return new Set();
        }
    }
}
