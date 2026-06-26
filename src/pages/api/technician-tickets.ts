import type { APIRoute } from 'astro';
import pool from '../../lib/db';
import { TicketController } from '../../lib/controllers/TicketController';

// ── TTR (Time To Recover) Helper ─────────────────────────────────────────────
// TTR limit per tier (dalam jam)
const TTR_HOURS: Record<string, number> = {
    'HVC_DIAMOND':  3,
    'HVC_PLATINUM': 6,
    'HVC_GOLD':     12,
    'REGULER':      24,
};

// Tier yang menggunakan booking_date sebagai start time (jika ada)
const USE_BOOKING_DATE_TIERS = new Set(['REGULER', 'HVC_GOLD']);

// TTR hanya berlaku untuk Source = REGULER (bukan SQM/UNSPEC/INFRACARE)
function isRegulerSource(ticket: any): boolean {
    const src = (ticket.reported_by || ticket.reportedBy || '').toUpperCase();
    const isSQM       = src.includes('PROACTIVE') && src.includes('TICKET');
    const isUNSPEC    = (src.includes('PROACTIVE') && src.includes('OHI')) || src.startsWith('PROMAN-');
    const isINFRACARE = src.includes('INFRACARE');
    return !isSQM && !isUNSPEC && !isINFRACARE;
}

interface TTRInfo {
    tier: string;
    ttrHours: number;
    startDate: Date;
    expiredDate: Date;
    ticketAge: string;         // "3h 45m"
    remainingTime: string;     // "2h 15m" atau "1h 30m LEWAT"
    expiredDateStr: string;    // "30/04/2026 20:00"
    status: 'NEW' | 'NEAR_EXPIRED' | 'EXPIRED';
    statusLabel: string;       // "🟢 NEW" / "🟡 NEAR EXPIRED" / "🔴 EXPIRED"
}

function calcTTR(ticket: any): TTRInfo | null {
    // TTR hanya untuk source REGULER (bukan SQM/UNSPEC/INFRACARE)
    if (!isRegulerSource(ticket)) return null;

    // Tentukan tier
    const rawTier = (ticket.customer_type || ticket.tier || 'REGULER').toUpperCase().trim();
    const tier = Object.keys(TTR_HOURS).find(k => rawTier.includes(k)) || 'REGULER';
    const ttrHours = TTR_HOURS[tier];

    // Tentukan start date
    const reportedRaw = ticket.reported_date || ticket.jam_open;
    const bookingRaw  = ticket.booking_date;

    if (!reportedRaw) return null;

    let startDate: Date;
    if (USE_BOOKING_DATE_TIERS.has(tier) && bookingRaw) {
        const bookingDate = new Date(bookingRaw);
        const reportedDate = new Date(reportedRaw);
        // Gunakan booking_date hanya jika lebih lambat dari reported_date
        startDate = bookingDate > reportedDate ? bookingDate : reportedDate;
    } else {
        startDate = new Date(reportedRaw);
    }

    if (isNaN(startDate.getTime())) return null;

    const now = Date.now();
    const expiredDate = new Date(startDate.getTime() + ttrHours * 60 * 60 * 1000);

    // Hitung umur tiket dari reported_date (selalu dari reported)
    const ageMs = now - new Date(reportedRaw).getTime();
    const ageH  = Math.floor(ageMs / (1000 * 60 * 60));
    const ageM  = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
    const ticketAge = `${ageH}h ${ageM}m`;

    // Hitung sisa waktu TTR
    const remainMs = expiredDate.getTime() - now;
    const isExpired = remainMs <= 0;
    const absRemainH = Math.floor(Math.abs(remainMs) / (1000 * 60 * 60));
    const absRemainM = Math.floor((Math.abs(remainMs) % (1000 * 60 * 60)) / (1000 * 60));
    const remainingTime = isExpired
        ? `${absRemainH}h ${absRemainM}m LEWAT`
        : `${absRemainH}h ${absRemainM}m`;

    // Format expired date WIB
    const expiredDateStr = expiredDate.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(',', '');

    // Tentukan status
    let status: TTRInfo['status'];
    let statusLabel: string;
    if (isExpired) {
        status = 'EXPIRED';
        statusLabel = '🔴 EXPIRED';
    } else if (remainMs <= 2 * 60 * 60 * 1000) {
        // Sisa ≤ 2 jam = NEAR EXPIRED
        status = 'NEAR_EXPIRED';
        statusLabel = '🟡 NEAR EXPIRED';
    } else {
        status = 'NEW';
        statusLabel = '🟢 NEW';
    }

    return { tier, ttrHours, startDate, expiredDate, ticketAge, remainingTime, expiredDateStr, status, statusLabel };
}

function formatTTRBlock(ttr: TTRInfo | null): string {
    if (!ttr) return '';
    const bookingNote = USE_BOOKING_DATE_TIERS.has(ttr.tier)
        ? ` <i>(dihitung dari ${ttr.startDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }).replace(',','')})</i>`
        : '';
    return `\n⏳ <b>TTR Info:</b>\n` +
        `   Tier: <b>${ttr.tier}</b> (TTR ${ttr.ttrHours}h)\n` +
        `   Umur Tiket: <b>${ttr.ticketAge}</b>\n` +
        `   Expired: <b>${ttr.expiredDateStr}</b>${bookingNote}\n` +
        `   Sisa: <b>${ttr.remainingTime}</b>\n` +
        `   Status: <b>${ttr.statusLabel}</b>\n`;
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * API for technician tickets management
 * Actions: reopen, change_status
 */
export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { action, id, noTiket, source, notes, newStatus, actorName } = body;

        if (action === 'reopen') {
            return await handleReopen(id, noTiket, source, notes, actorName);
        }

        if (action === 'change_status') {
            return await handleChangeStatus(id, noTiket, source, newStatus, notes, actorName);
        }

        if (action === 'send_reminder') {
            return await handleSendReminder(id, noTiket, source, actorName);
        }

        return new Response(JSON.stringify({ status: 'error', message: 'Invalid action' }), { status: 400 });
    } catch (error: any) {
        console.error("[TechnicianTickets API] Error:", error);
        return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500 });
    }
};

async function handleReopen(id: string, noTiket: string, source: string, notes: string, actorName: string) {
    if (!notes) {
        return new Response(JSON.stringify({ status: 'error', message: 'Catatan wajib diisi' }), { status: 400 });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        let ticketData: any = null;
        let technicianInfo: any = null;

        if (source === 'manual') {
            // Update tiket_simple - set jam_close to NULL
            const [ticketRows]: any = await conn.query(
                "SELECT t.*, n.id_bot_telegram, n.nama, n.tag_telegram, n.service_area FROM tiket_simple t LEFT JOIN naker n ON t.user_id = n.id_bot_telegram WHERE t.id = ?",
                [id]
            );
            
            if (ticketRows.length === 0) {
                throw new Error("Tiket tidak ditemukan");
            }
            
            ticketData = ticketRows[0];
            technicianInfo = {
                id_bot_telegram: ticketData.id_bot_telegram,
                nama: ticketData.nama,
                tag_telegram: ticketData.tag_telegram,
                service_area: ticketData.service_area
            };

            // Update ticket - clear jam_close and add notes
            const updatedCatatan = ticketData.catatan 
                ? `${ticketData.catatan}\n\n[REOPEN by ${actorName}]: ${notes}`
                : `[REOPEN by ${actorName}]: ${notes}`;
            
            await conn.query(
                "UPDATE tiket_simple SET jam_close = NULL, catatan = ? WHERE id = ?",
                [updatedCatatan, id]
            );

        } else {
            // Insera ticket - update status to OPEN
            const [ticketRows]: any = await conn.query(
                `SELECT s.*, n.id_bot_telegram, n.nama, n.tag_telegram, n.service_area 
                 FROM scraped_work_orders s
                 LEFT JOIN naker n ON JSON_CONTAINS(s.assigned_to, JSON_OBJECT('nik', n.nik))
                 WHERE s.id = ? OR s.order_id = ?
                 LIMIT 1`,
                [id, noTiket]
            );

            if (ticketRows.length === 0) {
                throw new Error("Tiket Insera tidak ditemukan");
            }

            ticketData = ticketRows[0];
            technicianInfo = {
                id_bot_telegram: ticketData.id_bot_telegram,
                nama: ticketData.nama,
                tag_telegram: ticketData.tag_telegram,
                service_area: ticketData.service_area
            };

            // Update Insera status
            const updatedNotes = ticketData.notes_hd 
                ? `${ticketData.notes_hd}\n\n[REOPEN by ${actorName}]: ${notes}`
                : `[REOPEN by ${actorName}]: ${notes}`;
            
            await conn.query(
                "UPDATE scraped_work_orders SET status = 'OPEN', notes_hd = ? WHERE id = ?",
                [updatedNotes, ticketData.id]
            );

            // Also update tiket_simple if exists
            await conn.query(
                "UPDATE tiket_simple SET jam_close = NULL, catatan = ? WHERE no_tiket = ?",
                [updatedNotes, noTiket]
            );
        }

        await conn.commit();

        // Send Telegram notification
        try {
            await sendReopenNotification(ticketData, technicianInfo, notes, actorName);
        } catch (notifyErr: any) {
            console.error("[Reopen] Telegram notification error:", notifyErr.message);
            // Don't fail the request if notification fails
        }

        return new Response(JSON.stringify({ 
            status: 'success', 
            message: `Tiket ${noTiket} berhasil di-reopen` 
        }), { status: 200 });

    } catch (err: any) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function handleChangeStatus(id: string, noTiket: string, source: string, newStatus: string, notes: string, actorName: string) {
    const conn = await pool.getConnection();
    let ticketData: any = null;
    let technicianInfo: any = null;
    
    try {
        await conn.beginTransaction();

        if (source === 'manual') {
            const [ticketRows]: any = await conn.query(
                `SELECT t.*, n.id_bot_telegram, n.nama, n.tag_telegram, n.service_area 
                 FROM tiket_simple t 
                 LEFT JOIN naker n ON t.user_id = n.id_bot_telegram 
                 WHERE t.id = ?`,
                [id]
            );
            if (ticketRows.length === 0) {
                throw new Error("Tiket tidak ditemukan");
            }
            ticketData = ticketRows[0];
            technicianInfo = {
                id_bot_telegram: ticketData.id_bot_telegram,
                nama: ticketData.nama,
                tag_telegram: ticketData.tag_telegram,
                service_area: ticketData.service_area
            };

            if (newStatus === 'CLOSED') {
                // Set jam_close to now
                const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
                const updatedCatatan = notes 
                    ? (ticketData.catatan ? `${ticketData.catatan}\n\n[STATUS CHANGE by ${actorName}]: ${notes}` : `[STATUS CHANGE by ${actorName}]: ${notes}`)
                    : ticketData.catatan;
                
                await conn.query(
                    "UPDATE tiket_simple SET jam_close = ?, catatan = ? WHERE id = ?",
                    [now, updatedCatatan, id]
                );
            } else {
                // OPEN - clear jam_close
                const updatedCatatan = notes 
                    ? (ticketData.catatan ? `${ticketData.catatan}\n\n[STATUS CHANGE by ${actorName}]: ${notes}` : `[STATUS CHANGE by ${actorName}]: ${notes}`)
                    : ticketData.catatan;
                
                await conn.query(
                    "UPDATE tiket_simple SET jam_close = NULL, catatan = ? WHERE id = ?",
                    [updatedCatatan, id]
                );
            }

        } else {
            // Insera ticket
            const [ticketRows]: any = await conn.query(
                `SELECT s.*, n.id_bot_telegram, n.nama, n.tag_telegram, n.service_area 
                 FROM scraped_work_orders s
                 LEFT JOIN naker n ON JSON_CONTAINS(s.assigned_to, JSON_OBJECT('nik', n.nik))
                 WHERE s.id = ? OR s.order_id = ?
                 LIMIT 1`,
                [id, noTiket]
            );
            if (ticketRows.length === 0) {
                throw new Error("Tiket Insera tidak ditemukan");
            }
            ticketData = ticketRows[0];
            technicianInfo = {
                id_bot_telegram: ticketData.id_bot_telegram,
                nama: ticketData.nama,
                tag_telegram: ticketData.tag_telegram,
                service_area: ticketData.service_area
            };

            const updatedNotes = notes 
                ? (ticketData.notes_hd ? `${ticketData.notes_hd}\n\n[STATUS CHANGE by ${actorName}]: ${notes}` : `[STATUS CHANGE by ${actorName}]: ${notes}`)
                : ticketData.notes_hd;

            // Update status di scraped_work_orders
            await conn.query(
                "UPDATE scraped_work_orders SET status = ?, notes_hd = ?, closed_at = NOW(), closed_by = ? WHERE id = ?",
                [newStatus, updatedNotes || null, actorName, ticketData.id]
            );

            // Sync ke tiket_simple — upsert agar history tetap tersimpan
            if (newStatus === 'CLOSED') {
                const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

                // Cek apakah sudah ada di tiket_simple
                const [existingRows]: any = await conn.query(
                    "SELECT id FROM tiket_simple WHERE no_tiket = ? LIMIT 1",
                    [noTiket]
                );

                if (existingRows.length > 0) {
                    // Update yang sudah ada
                    await conn.query(
                        "UPDATE tiket_simple SET jam_close = ?, catatan = ? WHERE no_tiket = ?",
                        [now, updatedNotes || ticketData.summary || '', noTiket]
                    );
                } else {
                    // Belum ada — INSERT baru untuk history
                    // Ambil info teknisi dari assigned_to
                    let techNik = '', techName = '', techBotId = '';
                    try {
                        const assigned = ticketData.assigned_to
                            ? JSON.parse(ticketData.assigned_to)
                            : [];
                        if (assigned.length > 0) {
                            techNik  = assigned[0].nik  || '';
                            techName = assigned[0].nama || '';
                        }
                    } catch (_) {}

                    // Lookup bot_id dari naker
                    if (techNik) {
                        const [nakerRows]: any = await conn.query(
                            "SELECT id_bot_telegram FROM naker WHERE nik = ? LIMIT 1",
                            [techNik]
                        );
                        techBotId = nakerRows[0]?.id_bot_telegram || '';
                    }

                    // Parse CP dan noInet dari summary
                    const parts = (ticketData.summary || '').split(' _ ');
                    const cp     = parts[0] || ticketData.contact_phone || '';
                    const noInet = parts[1] || ticketData.service_no    || '';

                    await conn.query(
                        `INSERT INTO tiket_simple 
                         (nik_teknisi, user_id, nama, jenis, no_inet, no_tiket, rca, odp, no_hp,
                          jam_open, jam_close, updated_at, catatan,
                          material_dropcore, material_protection, material_ps14, material_ps18,
                          material_ps116, material_odp_solid, material_patchcore, material_adaptor,
                          material_sn_ont, material_sn_stb)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0,0,0,0,0,0,0,0,'','')`,
                        [
                            techNik, techBotId, techName,
                            ticketData.ticket_type || 'REGULER',
                            noInet, noTiket,
                            'CLOSED BY HD ADMIN',
                            ticketData.device_name || ticketData.workzone || '-',
                            cp,
                            ticketData.reported_date || now,
                            now, now,
                            updatedNotes || ticketData.summary || ''
                        ]
                    );
                    console.log(`[handleChangeStatus] Inserted tiket_simple history for ${noTiket}`);
                }
            } else {
                // OPEN — clear jam_close
                await conn.query(
                    "UPDATE tiket_simple SET jam_close = NULL, catatan = ? WHERE no_tiket = ?",
                    [updatedNotes || '', noTiket]
                );
            }
        }

        await conn.commit();

        // Send Telegram notification for status change
        try {
            await sendStatusChangeNotification(ticketData, technicianInfo, newStatus, notes, actorName);
        } catch (notifyErr: any) {
            console.error("[StatusChange] Telegram notification error:", notifyErr.message);
        }

        return new Response(JSON.stringify({ 
            status: 'success', 
            message: `Status tiket berhasil diubah ke ${newStatus}` 
        }), { status: 200 });

    } catch (err: any) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function handleSendReminder(id: string, noTiket: string, source: string, actorName: string) {
    const conn = await pool.getConnection();
    try {
        let ticketData: any = null;
        let technicianInfo: any = null;

        if (source === 'manual') {
            const [ticketRows]: any = await conn.query(
                `SELECT t.*, n.id_bot_telegram, n.nama, n.tag_telegram, n.service_area 
                 FROM tiket_simple t 
                 LEFT JOIN naker n ON t.user_id = n.id_bot_telegram 
                 WHERE t.id = ?`,
                [id]
            );
            
            if (ticketRows.length === 0) {
                throw new Error("Tiket tidak ditemukan");
            }
            
            ticketData = ticketRows[0];
            technicianInfo = {
                id_bot_telegram: ticketData.id_bot_telegram,
                nama: ticketData.nama,
                tag_telegram: ticketData.tag_telegram,
                service_area: ticketData.service_area
            };
        } else {
            const [ticketRows]: any = await conn.query(
                `SELECT s.*, n.id_bot_telegram, n.nama, n.tag_telegram, n.service_area 
                 FROM scraped_work_orders s
                 LEFT JOIN naker n ON JSON_CONTAINS(s.assigned_to, JSON_OBJECT('nik', n.nik))
                 WHERE s.id = ? OR s.order_id = ?
                 LIMIT 1`,
                [id, noTiket]
            );

            if (ticketRows.length === 0) {
                throw new Error("Tiket Insera tidak ditemukan");
            }

            ticketData = ticketRows[0];
            technicianInfo = {
                id_bot_telegram: ticketData.id_bot_telegram,
                nama: ticketData.nama,
                tag_telegram: ticketData.tag_telegram,
                service_area: ticketData.service_area
            };
        }

        // Send reminder notification
        await sendReminderNotification(ticketData, technicianInfo, actorName);

        return new Response(JSON.stringify({ 
            status: 'success', 
            message: `Reminder untuk tiket ${noTiket} telah dikirim` 
        }), { status: 200 });

    } finally {
        conn.release();
    }
}

async function sendReminderNotification(ticket: any, technician: any, actorName: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !technician) return;

    const ticketNo   = ticket.no_tiket || ticket.order_id || '-';
    const noInet     = ticket.no_inet  || ticket.service_no || '-';
    const techTag    = technician.tag_telegram || '';
    const serviceArea = technician.service_area;
    const summary    = (ticket.summary || ticket.catatan || '').substring(0, 100);

    // ── TTR ──
    const ttr = calcTTR(ticket);
    const ticketAge = ttr?.ticketAge ?? (() => {
        const d = ticket.jam_open || ticket.reported_date;
        if (!d) return '-';
        const ms = Date.now() - new Date(d).getTime();
        return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m`;
    })();

    // ── KORLAP/HSA tags ──
    let korlapHsaTags = '';
    if (serviceArea) {
        try {
            const [personnelRows]: any = await pool.query(`
                SELECT n.tag_telegram
                FROM service_area_personnel sap
                JOIN service_area_group sag ON sap.service_area_id = sag.id
                JOIN naker n ON sap.nik = n.nik
                WHERE sag.service_area = ? AND n.tag_telegram IS NOT NULL AND n.tag_telegram != ''
            `, [serviceArea]);
            if (personnelRows.length > 0) {
                korlapHsaTags = personnelRows
                    .map((p: any) => `@${p.tag_telegram.replace('@', '')}`)
                    .join(' ');
            }
        } catch (e: any) {
            console.error("[Reminder] Failed to fetch KORLAP/HSA tags:", e.message);
        }
    }

    const msg = `⏰ <b>REMINDER TIKET OPEN</b>\n\n` +
        `🎫 <b>No Tiket:</b> <code>${ticketNo}</code>\n` +
        `📞 <b>No INET:</b> <code>${noInet}</code>\n` +
        `⏱️ <b>Umur Tiket:</b> <b>${ticketAge}</b>\n` +
        `📍 <b>ODP:</b> ${ticket.odp || '-'}\n` +
        formatTTRBlock(ttr) +
        `\n📝 <b>Summary:</b>\n${summary}${summary.length >= 100 ? '...' : ''}\n\n` +
        `⚠️ <b>Tiket ini masih OPEN!</b> Mohon segera ditindaklanjuti.\n\n` +
        `👤 <b>Reminder by:</b> ${actorName}\n` +
        (techTag ? `@${techTag.replace('@', '')}` : '') +
        (korlapHsaTags ? ` ${korlapHsaTags}` : '');

    // Send to technician's private chat
    if (technician.id_bot_telegram) {
        try {
            const axios = (await import('axios')).default;
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: technician.id_bot_telegram,
                text: msg,
                parse_mode: 'HTML'
            });
        } catch (err: any) {
            console.error("[Reminder] Failed to send private notification:", err.message);
        }
    }

    // Send to group
    if (serviceArea) {
        try {
            const { GroupModel } = await import('../../lib/models/GroupModel');
            const groups = await GroupModel.getByServiceArea(serviceArea);
            const axios = (await import('axios')).default;
            for (const g of groups) {
                await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                    chat_id: g.group_id,
                    text: msg,
                    parse_mode: 'HTML'
                });
            }
        } catch (err: any) {
            console.error("[Reminder] Failed to send group notification:", err.message);
        }
    }
}

async function sendReopenNotification(ticket: any, technician: any, notes: string, actorName: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !technician) return;

    const ticketNo   = ticket.no_tiket || ticket.order_id || '-';
    const noInet     = ticket.no_inet  || ticket.service_no || '-';
    const techTag    = technician.tag_telegram || '';
    const serviceArea = technician.service_area;

    const ttr = calcTTR(ticket);

    const msg = `⚠️ <b>TIKET REOPEN</b>\n\n` +
        `🎫 <b>No Tiket:</b> <code>${ticketNo}</code>\n` +
        `📞 <b>No INET:</b> <code>${noInet}</code>\n` +
        formatTTRBlock(ttr) +
        `\nTiket telah dibuka kembali oleh <b>${actorName}</b>.\n\n` +
        `📝 <b>Catatan:</b>\n${notes}\n\n` +
        `Mohon untuk segera ditindaklanjuti.\n` +
        (techTag ? `@${techTag.replace('@', '')}` : '');

    if (technician.id_bot_telegram) {
        try {
            const axios = (await import('axios')).default;
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: technician.id_bot_telegram, text: msg, parse_mode: 'HTML'
            });
        } catch (err: any) {
            console.error("[Reopen] Failed to send private notification:", err.message);
        }
    }

    if (serviceArea) {
        try {
            const { GroupModel } = await import('../../lib/models/GroupModel');
            const groups = await GroupModel.getByServiceArea(serviceArea);
            const axios = (await import('axios')).default;
            for (const g of groups) {
                await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                    chat_id: g.group_id, text: msg, parse_mode: 'HTML'
                });
            }
        } catch (err: any) {
            console.error("[Reopen] Failed to send group notification:", err.message);
        }
    }
}

async function sendStatusChangeNotification(ticket: any, technician: any, newStatus: string, notes: string, actorName: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !technician) return;

    const ticketNo   = ticket.no_tiket || ticket.order_id || '-';
    const noInet     = ticket.no_inet  || ticket.service_no || '-';
    const techTag    = technician.tag_telegram || '';
    const serviceArea = technician.service_area;

    const ttr = calcTTR(ticket);
    const statusEmoji = newStatus === 'CLOSED' ? '✅' : '🔓';

    let msg = `${statusEmoji} <b>STATUS TIKET DIUBAH</b>\n\n` +
        `🎫 <b>No Tiket:</b> <code>${ticketNo}</code>\n` +
        `📞 <b>No INET:</b> <code>${noInet}</code>\n` +
        `📊 <b>Status Baru:</b> <b>${newStatus}</b>\n` +
        formatTTRBlock(ttr);

    if (notes) msg += `\n📝 <b>Catatan:</b>\n${notes}\n`;

    msg += `\n👤 <b>Diubah oleh:</b> ${actorName}\n` +
        (techTag ? `@${techTag.replace('@', '')}` : '');

    if (technician.id_bot_telegram) {
        try {
            const axios = (await import('axios')).default;
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: technician.id_bot_telegram, text: msg, parse_mode: 'HTML'
            });
        } catch (err: any) {
            console.error("[StatusChange] Failed to send private notification:", err.message);
        }
    }

    if (serviceArea) {
        try {
            const { GroupModel } = await import('../../lib/models/GroupModel');
            const groups = await GroupModel.getByServiceArea(serviceArea);
            const axios = (await import('axios')).default;
            for (const g of groups) {
                await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                    chat_id: g.group_id, text: msg, parse_mode: 'HTML'
                });
            }
        } catch (err: any) {
            console.error("[StatusChange] Failed to send group notification:", err.message);
        }
    }
}
