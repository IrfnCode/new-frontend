import { TicketModel } from '../models/TicketModel';
import { TechnicianModel } from '../models/TechnicianModel';
import { GroupModel } from '../models/GroupModel';
import axios from 'axios';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class TicketController {
    private static escapeHTML(str: string): string {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    // ── TTR Helper ────────────────────────────────────────────────────────────
    private static readonly TTR_HOURS: Record<string, number> = {
        'HVC_DIAMOND':  3,
        'HVC_PLATINUM': 6,
        'HVC_GOLD':     12,
        'REGULER':      24,
    };
    private static readonly USE_BOOKING_TIERS = new Set(['REGULER', 'HVC_GOLD']);

    private static isRegulerSource(ticket: any): boolean {
        const src = (ticket.reported_by || ticket.reportedBy || '').toUpperCase();
        const isSQM       = src.includes('PROACTIVE') && src.includes('TICKET');
        const isUNSPEC    = (src.includes('PROACTIVE') && src.includes('OHI')) || src.startsWith('PROMAN-');
        const isINFRACARE = src.includes('INFRACARE');
        return !isSQM && !isUNSPEC && !isINFRACARE;
    }

    private static calcTTR(ticket: any): string {
        // TTR hanya untuk source REGULER
        if (!this.isRegulerSource(ticket)) return '';

        const rawTier = (ticket.customer_type || ticket.customerType || 'REGULER').toUpperCase();
        const tier = Object.keys(this.TTR_HOURS).find(k => rawTier.includes(k)) || 'REGULER';
        const ttrHours = this.TTR_HOURS[tier];

        const reportedRaw = ticket.reported_date || ticket.reportedDate;
        const bookingRaw  = ticket.booking_date  || ticket.bookingDate;
        if (!reportedRaw) return '';

        let startDate: Date;
        if (this.USE_BOOKING_TIERS.has(tier) && bookingRaw) {
            const bd = new Date(bookingRaw), rd = new Date(reportedRaw);
            startDate = bd > rd ? bd : rd;
        } else {
            startDate = new Date(reportedRaw);
        }
        if (isNaN(startDate.getTime())) return '';

        const now       = Date.now();
        const expiredAt = new Date(startDate.getTime() + ttrHours * 3600 * 1000);
        const remainMs  = expiredAt.getTime() - now;
        const isExpired = remainMs <= 0;
        const isNear    = !isExpired && remainMs <= 2 * 3600 * 1000;

        const absH = Math.floor(Math.abs(remainMs) / 3600000);
        const absM = Math.floor((Math.abs(remainMs) % 3600000) / 60000);

        const expiredStr = expiredAt.toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit',
            year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(',', '');

        const bookingNote = this.USE_BOOKING_TIERS.has(tier) && bookingRaw && new Date(bookingRaw) > new Date(reportedRaw)
            ? ` (dihitung dari booking)` : '';

        let statusLabel: string;
        let remainText: string;
        if (isExpired) {
            statusLabel = '🔴 EXPIRED';
            remainText  = `${absH}h ${absM}m LEWAT`;
        } else if (isNear) {
            statusLabel = '🟡 NEAR EXPIRED';
            remainText  = `${absH}h ${absM}m lagi`;
        } else {
            statusLabel = '🟢 NEW';
            remainText  = `${absH}h ${absM}m lagi`;
        }

        return `⏳ <b>TTR (${tier} · ${ttrHours}h):</b>\n`
            + `   Expired: <b>${expiredStr}</b>${bookingNote}\n`
            + `   Sisa: <b>${remainText}</b>\n`
            + `   Status: <b>${statusLabel}</b>\n`;
    }
    // ─────────────────────────────────────────────────────────────────────────

    static async submitTicket(data: any, files?: File[]) {
        const tech = await TechnicianModel.getByBotId(data.user_id);
        if (!tech) throw new Error("Technician not found");

        const ticketData = {
            ...data,
            nik_teknisi: tech.nik,
            nama: tech.nama,
            service_area: tech.service_area,
            updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        };

        // ── Cek duplikat: tiket yang sama dari teknisi yang sama dalam 60 detik terakhir ──
        if (data.no_tiket && data.user_id) {
            const pool = (await import('../db')).default;

            // 1. Cek apakah INC ini sudah pernah di-close oleh teknisi MANAPUN
            const [closedRows]: any = await pool.query(
                `SELECT t.id, t.nama, t.nik_teknisi FROM tiket_simple t
                 WHERE t.no_tiket = ?
                 AND t.jam_close IS NOT NULL
                 AND t.jam_close != '0000-00-00 00:00:00'
                 LIMIT 1`,
                [data.no_tiket]
            );
            if (closedRows.length > 0) {
                const closedBy = closedRows[0].nama || closedRows[0].nik_teknisi || 'teknisi lain';
                throw new Error(`Tiket ${data.no_tiket} sudah di-close oleh ${closedBy}. Satu INC hanya bisa di-input satu kali.`);
            }

            // 2. Cek duplikat submit dari user yang sama dalam 60 detik terakhir
            const [dupRows]: any = await pool.query(
                `SELECT id FROM tiket_simple 
                 WHERE no_tiket = ? AND user_id = ?
                 AND updated_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
                 LIMIT 1`,
                [data.no_tiket, data.user_id]
            );
            if (dupRows.length > 0) {
                console.warn(`[submitTicket] Duplicate submission blocked: no_tiket=${data.no_tiket} user=${data.user_id}`);
                return dupRows[0].id;
            }
        }

        const ticketId = await TicketModel.create(ticketData);

        // ── SYNC: Jika tiket ini ada di INSERA, update statusnya ke CLOSED ──
        if (data.no_tiket) {
            try {
                const pool = (await import('../db')).default;
                const [inseraRows]: any = await pool.query(
                    "SELECT id, assigned_to FROM scraped_work_orders WHERE order_id = ? LIMIT 1",
                    [data.no_tiket]
                );

                if (inseraRows.length > 0) {
                    const insera = inseraRows[0];

                    // Update status INSERA ke CLOSED (tidak dihapus)
                    await pool.query(
                        "UPDATE scraped_work_orders SET status = 'CLOSED', processed_at = NOW(), processed_by = ?, closed_by = ?, closed_at = NOW() WHERE order_id = ?",
                        [tech.nik, tech.nik, data.no_tiket]
                    );

                    // Cleanup: hapus tiket_simple lain yang masih OPEN untuk tiket yang sama
                    // (tiket yang di-assign ke teknisi lain tapi belum di-close)
                    await pool.query(
                        `DELETE FROM tiket_simple 
                         WHERE no_tiket = ? 
                         AND nik_teknisi != ? 
                         AND (jam_close IS NULL OR jam_close = '' OR jam_close = '0000-00-00 00:00:00')`,
                        [data.no_tiket, tech.nik]
                    );

                    // Update assigned_to di INSERA: sisakan hanya teknisi ini
                    if (insera.assigned_to) {
                        try {
                            let assignedList = JSON.parse(insera.assigned_to);
                            if (Array.isArray(assignedList) && assignedList.length > 1) {
                                const filtered = assignedList.filter((t: any) => t.nik === tech.nik);
                                if (filtered.length > 0) {
                                    await pool.query(
                                        "UPDATE scraped_work_orders SET assigned_to = ? WHERE order_id = ?",
                                        [JSON.stringify(filtered), data.no_tiket]
                                    );
                                }
                            }
                        } catch (e) {
                            console.error("[submitTicket] Failed to update assigned_to:", e);
                        }
                    }

                    console.log(`[submitTicket] Synced INSERA ticket ${data.no_tiket} to CLOSED`);
                }
            } catch (syncErr: any) {
                console.error("[submitTicket] INSERA sync error:", syncErr.message);
                // Jangan gagalkan submit jika sync error
            }
        }

        // Save evidence files if provided
        const uploadedMeta: any[] = [];
        if (files && files.length > 0) {
            try {
                const uploadDir = path.join(process.cwd(), 'public', 'uploads');
                await fs.mkdir(uploadDir, { recursive: true });

                const baseUrl = process.env.URL || 'https://staging.riuz.cloud';

                for (const file of files) {
                    if (!file || !file.name) continue;
                    const ext = path.extname(file.name) || '.jpg';
                    const uniqueName = `${Date.now()}_${ticketId}_${Math.random().toString(36).substring(7)}${ext}`;
                    const filePath = path.join(uploadDir, uniqueName);
                    await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
                    const meta = { url: `${baseUrl}/uploads/${uniqueName}`, path: `uploads/${uniqueName}` };
                    uploadedMeta.push(meta);

                    // Save to database
                    await TicketModel.addEvidence(ticketId, meta.url, meta.path);
                }
            } catch (evidErr: any) {
                console.error("[submitTicket] Evidence handling error:", evidErr.message);
            }
        }

        // Non-blocking notification
        this.sendNewTicketNotifications(ticketId, ticketData, tech, uploadedMeta).catch(err => {
            console.error("Notification Error:", err.response?.data || err.message);
        });
        return ticketId;
    }

    static async updateTicket(id: string | number, data: any) {
        let actualId = id;
        const pool = (await import('../db')).default;

        // If the ticket comes from Insera, the provided ID belongs to scraped_work_orders.
        // We must map it to the synchronized ID in tiket_simple.
        if (data.source === 'insera') {
            const [rows]: any = await pool.query(
                "SELECT id, nik_teknisi, nama, jam_close FROM tiket_simple WHERE no_tiket = ? AND (user_id = ? OR nik_teknisi = (SELECT nik FROM naker WHERE id_bot_telegram = ? LIMIT 1)) LIMIT 1",
                [data.no_tiket, data.user_id || '', data.user_id || '']
            );

            // Cek apakah INC sudah di-close oleh teknisi LAIN
            const [closedByOther]: any = await pool.query(
                `SELECT t.nama, t.nik_teknisi FROM tiket_simple t
                 WHERE t.no_tiket = ?
                 AND t.jam_close IS NOT NULL AND t.jam_close != '0000-00-00 00:00:00'
                 AND t.user_id != ?
                 LIMIT 1`,
                [data.no_tiket, data.user_id || '']
            );
            if (closedByOther.length > 0) {
                const closedBy = closedByOther[0].nama || closedByOther[0].nik_teknisi;
                throw new Error(`Tiket ${data.no_tiket} sudah di-close oleh ${closedBy}. Tidak bisa diupdate.`);
            }

            if (rows && rows.length > 0) {
                actualId = rows[0].id;
                
                // If it's a closed ticket, reflect it back to Insera DB
                if (data.jam_close) {
                    await pool.query(
                        "UPDATE scraped_work_orders SET status = 'CLOSED', closed_at = NOW(), closed_by = ? WHERE order_id = ?",
                        [data.nik_teknisi || data.user_id || 'teknisi', data.no_tiket]
                    ).catch((e: any) => console.error("Update Insera Status Error:", e));
                }

                // ── CLEANUP: Remove this ticket from other technicians ──
                // When one technician updates/closes a ticket, remove it from other assigned technicians
                if (data.user_id || data.nik_teknisi) {
                    try {
                        // Get the current technician's NIK
                        const updatingNik = data.nik_teknisi;
                        const updatingUserId = data.user_id;
                        
                        // Delete tiket_simple entries for OTHER technicians with the same no_tiket
                        if (updatingNik) {
                            await pool.query(
                                "DELETE FROM tiket_simple WHERE no_tiket = ? AND nik_teknisi != ? AND (jam_close IS NULL OR jam_close = '' OR jam_close = '0000-00-00 00:00:00')",
                                [data.no_tiket, updatingNik]
                            );
                        } else if (updatingUserId) {
                            await pool.query(
                                "DELETE FROM tiket_simple WHERE no_tiket = ? AND user_id != ? AND (jam_close IS NULL OR jam_close = '' OR jam_close = '0000-00-00 00:00:00')",
                                [data.no_tiket, updatingUserId]
                            );
                        }

                        // Update assigned_to in scraped_work_orders to only contain the updating technician
                        const [inseraRows]: any = await pool.query("SELECT assigned_to FROM scraped_work_orders WHERE order_id = ?", [data.no_tiket]);
                        if (inseraRows.length > 0 && inseraRows[0].assigned_to) {
                            try {
                                let assignedList = JSON.parse(inseraRows[0].assigned_to);
                                if (Array.isArray(assignedList) && assignedList.length > 1) {
                                    // Filter to only keep the updating technician
                                    const filteredList = assignedList.filter((t: any) => 
                                        (updatingNik && t.nik === updatingNik) || 
                                        (updatingUserId && t.user_id === updatingUserId)
                                    );
                                    if (filteredList.length > 0) {
                                        await pool.query(
                                            "UPDATE scraped_work_orders SET assigned_to = ? WHERE order_id = ?",
                                            [JSON.stringify(filteredList), data.no_tiket]
                                        );
                                        console.log(`[TicketController] Cleaned up assigned_to for ${data.no_tiket}, kept ${filteredList.length} technician(s)`);
                                    }
                                }
                            } catch (parseErr) {
                                console.error("[TicketController] Failed to parse/update assigned_to:", parseErr);
                            }
                        }
                    } catch (cleanupErr) {
                        console.error("[TicketController] Cleanup error:", cleanupErr);
                    }
                }
            } else {
                throw new Error("Data sinkronisasi tiket Insera (tiket_simple) belum terbentuk.");
            }
        }

        await TicketModel.update(actualId, data);
        if (data?.user_id) {
            TicketModel.logUpdateActor(actualId, String(data.user_id)).catch(err =>
                console.error("Update Log Error:", err.message),
            );
        }
        // Fire-and-forget: return API response ASAP; notifications continue in background.
        (async () => {
            const ticket = await TicketModel.getById(actualId);
            if (!ticket) return;
            const tech = await TechnicianModel.getByBotId(ticket.user_id);
            if (!tech) return;
            await this.sendUpdateTicketNotifications(ticket, tech);
        })().catch(err => console.error("Update Notification Error:", err.response?.data || err.message));
        return true;
    }

    static async returnTicket(id: string | number, actorName: string = 'System') {
        const ticket = await TicketModel.getById(id);
        if (!ticket) throw new Error("Ticket not found");

        const updateData = {
            ...ticket,
            jam_close: null,
            rca: `RETURNED BY HD (${actorName})`,
            updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        };

        await TicketModel.update(id, updateData);
        await TicketModel.logUpdateActor(id, actorName).catch(e => console.error("Return Log Error:", e.message));

        // Fire-and-forget notification
        (async () => {
            const tech = await TechnicianModel.getByBotId(ticket.user_id);
            if (!tech) return;
            
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const msg = `⚠️ <b>TICKET RETURNED</b>\n\n`
                + `🎫 <b>Tiket #${ticket.id}</b>\n`
                + `Tiket dikembalikan ke status OPEN oleh HD <b>${this.escapeHTML(actorName)}</b>.\n`
                + `Silakan cek kembali di menu Active Ticket.\n\n`
                + `No Tiket: ${this.escapeHTML(ticket.no_tiket)}\nINET: ${this.escapeHTML(ticket.no_inet)}`;
            
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: tech.id_bot_telegram, text: msg, parse_mode: 'HTML' }).catch(() => {});

            if (tech.service_area) {
                const groups = await GroupModel.getByServiceArea(tech.service_area);
                for (const g of groups) {
                     await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: g.group_id, text: msg, parse_mode: 'HTML' }).catch(() => {});
                }
            }
        })().catch(e => console.error("Return Notification Error:", e));

        return true;
    }

    static async addEvidence(ticketId: string | number, files: any[]) {
        const ticket = await TicketModel.getById(ticketId);
        if (!ticket) throw new Error("Ticket not found");

        const tech = await TechnicianModel.getByBotId(ticket.user_id);

        const uploaded = [];
        for (const f of files) {
            await TicketModel.addEvidence(ticketId, f.url, f.path);
            uploaded.push(f);
        }

        // Non-blocking notification
        this.sendEvidenceNotifications(ticket, uploaded, tech).catch(err => console.error("Evidence Notification Error:", err.response?.data || err.message));
        return uploaded;
    }

    private static async sendNewTicketNotifications(ticketId: number, ticket: any, tech: any, files?: any[]) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const formatDate = (d: any) => new Date(d).toLocaleString('id-ID', { hour12: false }).replace(',', '');

        // 1. Personal
        let personalMsg = `✅ <b>Morena Report - Close Order</b>\n`
            + `📃 <b>TIKET #${ticketId}</b>\n\n`
            + `📌 <b>Ringkasan:</b>\n`
            + `   Jenis : ${this.escapeHTML(ticket.jenis)}\n   No Tiket : ${this.escapeHTML(ticket.no_tiket)}\n   No INET : ${this.escapeHTML(ticket.no_inet)}\n   ODP : ${this.escapeHTML(ticket.odp)}\n\n`
            + `📢 Info lengkap telah dikirim ke Group ${this.escapeHTML(tech.service_area || '')}.\n`;

        console.log(`[BOT] Sending personal notification to: ${tech.id_bot_telegram}`);
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: tech.id_bot_telegram, text: personalMsg, parse_mode: 'HTML' }).catch(() => {});

        // 2. Group
        if (tech.service_area) {
            const groups = await GroupModel.getByServiceArea(tech.service_area);
            for (const g of groups) {
                let groupMsg = `✅ <b>Morena Report - Close Order</b>\n`
                    + `📃 <b>TIKET #${ticketId}</b>\n`
                    + `<b>Service Area: ${this.escapeHTML(tech.service_area)}</b>\n\n`
                    + `Jenis Tiket : ${this.escapeHTML(ticket.jenis)}\nNo Tiket : ${this.escapeHTML(ticket.no_tiket)}\nNo INET : ${this.escapeHTML(ticket.no_inet)}\nODP : ${this.escapeHTML(ticket.odp)}\nNo HP : ${this.escapeHTML(ticket.no_hp)}\nPerbaikan : ${this.escapeHTML(ticket.rca)}\nTeknisi : ${this.escapeHTML(ticket.nama)}\n`;

                if (ticket.catatan) groupMsg += `\n<b>📝 Catatan :</b>\n${this.escapeHTML(ticket.catatan)}\n`;

                groupMsg += `\n<b>⏱️ Waktu :</b>\n  Open : ${formatDate(ticket.jam_open)}\n  Close : ${formatDate(ticket.jam_close)}\n`;

                const materials = [
                    { label: 'Dropcore', val: ticket.material_dropcore },
                    { label: 'Protection', val: ticket.material_protection },
                    { label: 'PS 1:4', val: ticket.material_ps14 },
                    { label: 'PS 1:8', val: ticket.material_ps18 },
                    { label: 'PS 1:16', val: ticket.material_ps116 },
                    { label: 'ODP Solid', val: ticket.material_odp_solid },
                    { label: 'Patchcore', val: ticket.material_patchcore },
                    { label: 'Adaptor', val: ticket.material_adaptor },
                    { label: 'SN ONT', val: ticket.material_sn_ont, isText: true },
                    { label: 'SN STB', val: ticket.material_sn_stb, isText: true }
                ].filter(m => m.isText ? !!m.val : (parseInt(m.val) > 0));

                if (materials.length > 0) {
                    groupMsg += `\n<b>📦 Material :</b>\n` + materials.map(m => `  - ${m.label}: ${m.val}`).join('\n') + `\n`;
                }
                groupMsg += `\n${this.escapeHTML(tech.tag_telegram || '')}`;

                console.log(`[BOT] Sending group notification to: ${g.group_id}`);
                if (files && files.length > 0) {
                    await this.sendReportWithPhotos(token!, g.group_id, groupMsg, files);
                } else {
                    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: g.group_id, text: groupMsg, parse_mode: 'HTML' }).catch(() => {});
                }
            }
        }
    }

    private static async sendUpdateTicketNotifications(ticket: any, tech: any) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const formatDate = (d: any) => new Date(d).toLocaleString('id-ID', { hour12: false }).replace(',', '');

        // Determine if this is a "Close" event or just an "Update"
        const isClosed = ticket.jam_close && ticket.jam_close !== '0000-00-00 00:00:00';
        const titleIcon = isClosed ? "✅" : "🔄";
        const titleLabel = isClosed ? "TIKET CLOSED" : "TICKET UPDATE";

        // 1. Personal
        let personalMsg = `${titleIcon} <b>Morena Report - ${titleLabel}</b>\n`
            + `📃 <b>TIKET #${ticket.id}</b>\n\n`
            + `📌 <b>Ringkasan:</b>\n`
            + `   Jenis : ${this.escapeHTML(ticket.jenis)}\n   No Tiket : ${this.escapeHTML(ticket.no_tiket)}\n   No INET : ${this.escapeHTML(ticket.no_inet)}\n   ODP : ${this.escapeHTML(ticket.odp)}\n\n`
            + `📢 Info lengkap telah dikirim ke Group ${this.escapeHTML(tech.service_area || '')}.\n`;

        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: tech.id_bot_telegram, text: personalMsg, parse_mode: 'HTML' }).catch(() => {});

        // 2. Group
        if (tech.service_area) {
            const groups = await GroupModel.getByServiceArea(tech.service_area);
            for (const g of groups) {
                let groupMsg = `${titleIcon} <b>Morena Report - ${titleLabel}</b>\n`
                    + `📃 <b>TIKET #${ticket.id}</b>\n`
                    + `<b>Service Area: ${this.escapeHTML(tech.service_area)}</b>\n\n`
                    + `Jenis Tiket : ${this.escapeHTML(ticket.jenis)}\nNo Tiket : ${this.escapeHTML(ticket.no_tiket)}\nNo INET : ${this.escapeHTML(ticket.no_inet)}\nODP : ${this.escapeHTML(ticket.odp)}\nNo HP : ${this.escapeHTML(ticket.no_hp)}\nPerbaikan : ${this.escapeHTML(ticket.rca)}\nTeknisi : ${this.escapeHTML(ticket.nama)}\n`;

                if (ticket.catatan) groupMsg += `\n<b>📝 Catatan :</b>\n${this.escapeHTML(ticket.catatan)}\n`;

                groupMsg += `\n<b>⏱️ Waktu :</b>\n  Open : ${formatDate(ticket.jam_open)}\n  Close : ${formatDate(ticket.jam_close)}\n`;

                const materials = [
                    { label: 'Dropcore', val: ticket.material_dropcore },
                    { label: 'Protection', val: ticket.material_protection },
                    { label: 'PS 1:4', val: ticket.material_ps14 },
                    { label: 'PS 1:8', val: ticket.material_ps18 },
                    { label: 'PS 1:16', val: ticket.material_ps116 },
                    { label: 'ODP Solid', val: ticket.material_odp_solid },
                    { label: 'Patchcore', val: ticket.material_patchcore },
                    { label: 'Adaptor', val: ticket.material_adaptor },
                    { label: 'SN ONT', val: ticket.material_sn_ont, isText: true },
                    { label: 'SN STB', val: ticket.material_sn_stb, isText: true }
                ].filter(m => m.isText ? !!m.val : (parseInt(m.val) > 0));

                if (materials.length > 0) {
                    groupMsg += `\n<b>📦 Material :</b>\n` + materials.map(m => `  - ${m.label}: ${m.val}`).join('\n') + `\n`;
                }
                
                if (isClosed) {
                    groupMsg += `\nStatus: <b>CLOSED</b> 🏁`;
                }

                await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: g.group_id, text: groupMsg, parse_mode: 'HTML' }).catch(err => console.error("Group Notify Error:", err.message));
            }
        }
    }

    private static async sendEvidenceNotifications(ticket: any, fotos: any[], tech: any) {
        const token = process.env.TELEGRAM_BOT_TOKEN;

        const caption = `📸 <b>EVIDEN - TIKET #${ticket.id}</b>\n`
            + `🎫 <b>No Tiket:</b> ${this.escapeHTML(ticket.no_tiket)}\n`
            + `📡 <b>No INET:</b> ${this.escapeHTML(ticket.no_inet)}\n`
            + `👤 <b>Teknisi:</b> ${this.escapeHTML(ticket.nama)}\n`
            + `📸 <b>Jumlah Foto:</b> ${fotos.length}`;

        // Personal
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: ticket.user_id, text: caption, parse_mode: 'HTML' }).catch(() => {});
        await this.sendMediaGroup(token!, ticket.user_id, fotos).catch(() => {});

        // Group
        if (tech?.service_area) {
            const groups = await GroupModel.getByServiceArea(tech.service_area);
            for (const g of groups) {
                await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: g.group_id, text: caption, parse_mode: 'HTML' }).catch(() => {});
                await this.sendMediaGroup(token!, g.group_id, fotos).catch(() => {});
            }
        }
    }

    /** Kembalikan emoji sesuai tier customer */
    private static getTierEmoji(tier: string): string {
        const t = (tier || '').toUpperCase();
        if (t.includes('DIAMOND')) return '💎';
        if (t.includes('PLATINUM')) return '🏅';
        if (t.includes('GOLD')) return '🥇';
        return '🎖️';
    }

    /** Kembalikan label Tipe Tiket dari reported_by */
    private static getTipeLabel(reportedBy: string): string {
        const src = (reportedBy || '').toUpperCase();
        if (src.includes('PROACTIVE') && src.includes('TICKET')) return 'SQM';
        if ((src.includes('PROACTIVE') && src.includes('OHI')) || src.startsWith('PROMAN-')) return 'UNSPEC';
        if (src.includes('INFRACARE')) return 'INFRACARE';
        return 'REGULER';
    }

    static async sendInseraTicketAlert(ticketId: string, ticket: any, assignedTo: any[], actorName: string, isReassign: boolean = false) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const areaName = ticket.service_area;
        if (!areaName) return;

        // Ambil tag telegram teknisi dari DB
        let enrichedAssigned = assignedTo;
        try {
            const enriched = await Promise.all(
                assignedTo.map(async (t) => {
                    const dbTech = await TechnicianModel.getByNIK(t.nik);
                    return { ...t, tag_telegram: dbTech?.tag_telegram || t.tag_telegram || "" };
                })
            );
            enrichedAssigned = enriched;
        } catch (e) { /* gunakan data yang ada */ }

        const sep = "━━━━━━━━━━━━━━━━";

        const noInet    = ticket.service_no || "-";
        const tier      = ticket.customer_type || "REGULER";
        const tierEmoji = this.getTierEmoji(tier);
        const cp        = ticket.contact_phone || "-";
        const odp       = ticket.device_name || "-";
        const odc       = ticket.rk_information || "-";
        const workzone  = ticket.workzone || "-";
        const ttrBlock  = this.calcTTR(ticket);
        const tipeLabel = this.getTipeLabel(ticket.reported_by || ticket.reportedBy || '');

        // Hitung umur tiket
        const calcAge = (reported: string) => {
            if (!reported || reported === "-") return "-";
            try {
                const diffMs = Date.now() - new Date(reported).getTime();
                if (diffMs < 0) return "-";
                const h = Math.floor(diffMs / (1000 * 60 * 60));
                const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                return `${h}h ${m}m`;
            } catch { return "-"; }
        };
        const ticketAge = calcAge(ticket.reported_date || ticket.reportedDate);

        const assignedToLines = enrichedAssigned
            .map((t, i) => {
                const tag = t.tag_telegram ? `@${t.tag_telegram.replace("@", "")}` : "";
                return `${i + 1}. ${this.escapeHTML(t.nama)}${tag ? tag : ""}`;
            })
            .join("\n");

        const tagMentions = enrichedAssigned
            .map(t => t.tag_telegram ? `@${t.tag_telegram.replace("@", "")}` : "")
            .filter(Boolean)
            .join(" ");

        const msg = `🔔 <b>MORENA TICKET ALERT</b> 🔔\n${sep}\n`
            + `📋 <b>INC ID:</b> <code>${this.escapeHTML(ticket.order_id)}</code>\n`
            + `📞 <b>No Internet:</b> <code>${this.escapeHTML(noInet)}</code>\n`
            + `⚙️ <b>Status:</b> ${isReassign ? 'RE-ASSIGNED' : 'ASSIGNED'}\n`
            + `🏆 <b>Tier:</b> ${tierEmoji} ${this.escapeHTML(tier)}\n`
            + `🎫 <b>Tipe Tiket:</b> <b>${this.escapeHTML(tipeLabel)}</b>\n`
            + `📱 <b>CP:</b> <code>${this.escapeHTML(cp)}</code>\n`
            + `📍 <b>Workzone:</b> ${this.escapeHTML(workzone)}\n`
            + `📡 <b>ODP:</b> <code>${this.escapeHTML(odp)}</code>\n`
            + `🏢 <b>ODC:</b> <code>${this.escapeHTML(odc)}</code>\n`
            + `⏱️ <b>Umur Tiket:</b> ${ticketAge}\n`
            + (ttrBlock ? ttrBlock : '')
            + `${sep}\n`
            + `📝 <b>Summary:</b>\n${this.escapeHTML(ticket.summary || "-")}\n`
            + `${sep}\n`
            + `👤 <b>ASSIGNED BY:</b> ${this.escapeHTML(actorName)}\n`
            + `👥 <b>ASSIGNED TO:</b>\n${assignedToLines}\n`
            + `${sep}\n`
            + `<i>Teknisi Yang Di Assign Tiket ini Dapat Mengupdate/Close Tiketnya melalui MY TICKET pada Bot Morena Terimakasih ^^</i>\n`
            + (tagMentions ? `\n${tagMentions}` : "");

        const groups = await GroupModel.getByServiceArea(areaName);
        for (const g of groups) {
            console.log(`[BOT] Sending Insera alert to: ${g.group_id}`);
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: g.group_id, text: msg, parse_mode: 'HTML' });
        }
    }

    private static async sendMediaGroup(token: string, chat_id: string, fotos: any[]) {
        try {
            const formData = new FormData();
            const media = [];

            for (let i = 0; i < fotos.length; i++) {
                const f = fotos[i];
                const absPath = path.join(process.cwd(), 'public', f.path);
                const fileBuffer = await fs.readFile(absPath);
                const fieldName = `photo_${i}`;

                media.push({
                    type: 'photo',
                    media: `attach://${fieldName}`
                });

                const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
                formData.append(fieldName, blob, path.basename(f.path));
            }

            formData.append('chat_id', chat_id);
            formData.append('media', JSON.stringify(media));

            await axios.post(`https://api.telegram.org/bot${token}/sendMediaGroup`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
        } catch (err: any) {
            console.error("[sendMediaGroup] Direct upload failed, falling back to URL-based send:", err.message);
            // Fallback: URL-based media group (original code)
            const media = fotos.map(f => ({ type: 'photo', media: f.url }));
            await axios.post(`https://api.telegram.org/bot${token}/sendMediaGroup`, { chat_id, media: JSON.stringify(media) }).catch(() => {});
        }
    }

    private static async sendReportWithPhotos(token: string, chat_id: string, text: string, files: any[]) {
        try {
            const formData = new FormData();
            formData.append('chat_id', chat_id);

            if (files.length === 1) {
                const f = files[0];
                const absPath = path.join(process.cwd(), 'public', f.path);
                const fileBuffer = await fs.readFile(absPath);
                const blob = new Blob([fileBuffer], { type: 'image/jpeg' });

                formData.append('photo', blob, path.basename(f.path));
                formData.append('caption', text);
                formData.append('parse_mode', 'HTML');

                await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });
            } else {
                const media = [];
                for (let i = 0; i < files.length; i++) {
                    const f = files[i];
                    const absPath = path.join(process.cwd(), 'public', f.path);
                    const fileBuffer = await fs.readFile(absPath);
                    const fieldName = `photo_${i}`;

                    media.push({
                        type: 'photo',
                        media: `attach://${fieldName}`,
                        caption: i === 0 ? text : undefined,
                        parse_mode: i === 0 ? 'HTML' : undefined
                    });

                    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
                    formData.append(fieldName, blob, path.basename(f.path));
                }

                formData.append('media', JSON.stringify(media));

                await axios.post(`https://api.telegram.org/bot${token}/sendMediaGroup`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });
            }
        } catch (err: any) {
            console.error("[sendReportWithPhotos] Direct upload failed, falling back to text + URL media:", err.message);
            // Fallback: send text report first
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id,
                text,
                parse_mode: 'HTML'
            }).catch(() => {});
            // Then send media group via URL fallback
            const media = files.map(f => ({ type: 'photo', media: f.url }));
            await axios.post(`https://api.telegram.org/bot${token}/sendMediaGroup`, { chat_id, media: JSON.stringify(media) }).catch(() => {});
        }
    }

    /**
     * Kirim satu pesan Telegram berisi banyak tiket sekaligus (bulk assign)
     * Format: header → tiket 1 → tiket 2 → ... → footer (assigned by/to)
     */
    static async sendBulkInseraTicketAlert(
        tickets: any[],
        assignedTo: any[],
        actorName: string,
        serviceArea?: string
    ) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) throw new Error("Telegram bot token not configured");
        if (!tickets || tickets.length === 0) return;

        // Tentukan service area dari tiket pertama jika tidak disediakan
        const areaName = serviceArea || tickets[0]?.service_area;
        if (!areaName) {
            console.warn("[BulkAlert] No service area found, skipping Telegram send");
            return;
        }

        // Ambil tag telegram teknisi dari DB
        let enrichedAssigned = assignedTo;
        try {
            const enriched = await Promise.all(
                assignedTo.map(async (t) => {
                    const dbTech = await TechnicianModel.getByNIK(t.nik);
                    return { ...t, tag_telegram: dbTech?.tag_telegram || t.tag_telegram || "" };
                })
            );
            enrichedAssigned = enriched;
        } catch (e) {
            // Gunakan data yang ada jika gagal ambil dari DB
        }

        const sep = "━━━━━━━━━━━━━━━━";

        // Helper hitung umur tiket
        const calcAge = (reported: string) => {
            if (!reported || reported === "-") return "-";
            try {
                const diffMs = Date.now() - new Date(reported).getTime();
                if (diffMs < 0) return "-";
                const h = Math.floor(diffMs / (1000 * 60 * 60));
                const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                return `${h}h ${m}m`;
            } catch { return "-"; }
        };

        // Bangun blok tiket
        let ticketBlocks = "";
        for (const [idx, ticket] of tickets.entries()) {
            const tier      = ticket.customer_type || ticket.customerType || "REGULER";
            const tierEmoji = this.getTierEmoji(tier);
            const noInet    = ticket.service_no || ticket.serviceNo || "-";
            const cp        = ticket.contact_phone || ticket.contactPhone || "-";
            const odp       = ticket.device_name || ticket.deviceName || "-";
            const odc       = ticket.rk_information || ticket.rkInformation || "-";
            const workzone  = ticket.workzone || "-";
            const orderId   = ticket.order_id || ticket.orderId || "-";
            const summary   = (ticket.summary || "-").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const ticketAge = calcAge(ticket.reported_date || ticket.reportedDate);
            const ttrBlock  = this.calcTTR(ticket);
            const tipeLabel = this.getTipeLabel(ticket.reported_by || ticket.reportedBy || '');

            ticketBlocks += `${idx + 1}. 📋 <b>INC ID:</b> <code>${this.escapeHTML(orderId)}</code>  \n`
                + `📞 <b>No Internet:</b> <code>${this.escapeHTML(noInet)}</code>\n`
                + `⚙️ <b>Status:</b> ASSIGNED\n`
                + `🏆 <b>Tier:</b> ${tierEmoji} ${this.escapeHTML(tier)}\n`
                + `🎫 <b>Tipe Tiket:</b> <b>${this.escapeHTML(tipeLabel)}</b>\n`
                + `📱 <b>CP:</b> <code>${this.escapeHTML(cp)}</code>\n`
                + `📍 <b>Workzone:</b> ${this.escapeHTML(workzone)}\n`
                + `📡 <b>ODP:</b> <code>${this.escapeHTML(odp)}</code>\n`
                + `🏢 <b>ODC:</b> <code>${this.escapeHTML(odc)}</code>\n`
                + `⏱️ <b>Umur Tiket:</b> ${ticketAge}\n`
                + (ttrBlock ? ttrBlock : '')
                + `${sep}\n`
                + `📝 <b>Summary:</b>\n${summary}  \n`
                + `${sep}\n`;
        }

        // Footer assigned by/to
        const assignedToLines = enrichedAssigned
            .map((t, i) => {
                const tag = t.tag_telegram ? `@${t.tag_telegram.replace("@", "")}` : "";
                return `${i + 1}. ${this.escapeHTML(t.nama)}${tag ? tag : ""}`;
            })
            .join("\n");

        const tagMentions = enrichedAssigned
            .map(t => t.tag_telegram ? `@${t.tag_telegram.replace("@", "")}` : "")
            .filter(Boolean)
            .join(" ");

        const msg = `🔔 <b>MORENA TICKET ALERT</b> 🔔\n${sep}\n`
            + ticketBlocks
            + `👤 <b>ASSIGNED BY:</b> ${this.escapeHTML(actorName)}\n`
            + `👥 <b>ASSIGNED TO:</b>\n${assignedToLines}\n`
            + `${sep}\n`
            + `<i>Teknisi Yang Di Assign Tiket ini Dapat Mengupdate/Close Tiketnya melalui MY TICKET pada Bot Morena Terimakasih ^^</i>\n`
            + (tagMentions ? `\n${tagMentions}` : "");

        const groups = await GroupModel.getByServiceArea(areaName);
        for (const g of groups) {
            console.log(`[BulkAlert] Sending ${tickets.length} tickets to group: ${g.group_id}`);
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: g.group_id,
                text: msg,
                parse_mode: 'HTML'
            }).catch((err: any) => console.error("[BulkAlert] Send error:", err.response?.data || err.message));
        }
    }
}
