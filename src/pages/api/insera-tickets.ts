import type { APIRoute } from 'astro';
import { InseraModel } from '../../lib/models/InseraModel';

/**
 * Handle GET requests to fetch work orders
 */
export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const assignedBy = url.searchParams.get('assigned_by');
        const id = url.searchParams.get('id');
        const view = url.searchParams.get('view') || 'open';
        const dateFrom = url.searchParams.get('date_from') || '';
        const dateTo   = url.searchParams.get('date_to')   || '';

        if (id) {
            const data = await InseraModel.getByOrderId(id) || await InseraModel.getAll().then(rows => rows.find((r: any) => r.id == id));
            return new Response(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v), { status: 200 });
        }

        let data: any;
        if (view === 'closed') {
            data = await InseraModel.getClosedTickets(true, dateFrom, dateTo);
        } else if (view === 'korlap' || view === 'hsa') {
            // Get assigned tickets from tiket_simple (Data Tiket) for KORLAP/HSA view
            const assignedTickets = await InseraModel.getAssignedTicketsFromTiketSimple();
            const closedTickets = await InseraModel.getTodaysClosedTickets();
            // Merge and remove duplicates
            data = [...assignedTickets, ...closedTickets];
            const seen = new Set();
            data = data.filter(t => {
                const id = t.order_id || t.no_tiket;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
        } else if (view === 'reminders') {
            // Get tickets with reminder notes (notes_hd not empty)
            data = await InseraModel.getTicketsWithReminders();
        } else {
            // Default: get only open tickets dengan filter tanggal opsional
            data = await InseraModel.getAllOpen(dateFrom || undefined, dateTo || undefined);
        }

        if (assignedBy) {
            data = data.filter((wo: any) => wo.assigned_by === assignedBy);
        }

        return new Response(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500 });
    }
};

/**
 * Handle POST requests (e.g., Update, Assign, or Delete)
 */
export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { action, id } = body;

        // If user_id is provided without action, return tickets assigned to this user
        if (body.user_id && !action) {
            const data = await InseraModel.getAssignedToUser(body.user_id);
            return new Response(JSON.stringify({ status: 'success', data }, (_, v) => typeof v === 'bigint' ? v.toString() : v), { 
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (action === 'update') {
            const updatedBy = body.actorName || body.updatedBy || 'System';
            await InseraModel.update(id, body.data, updatedBy);
            return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
        }

        if (action === 'assign') {
            const { assignedTo, assignedBy } = body;
            await InseraModel.updateAssignment(id, assignedTo, assignedBy);

            // Kirim notifikasi Telegram TANPA await — tidak blokir response
            (async () => {
                try {
                    const { TicketController } = await import('../../lib/controllers/TicketController');
                    const { getServiceAreaByWorkzone } = await import('../../lib/utils/area-mapping');

                    // Ambil 1 tiket by id langsung — bukan getAll()
                    const ticket = await InseraModel.getByOrderId
                        ? null // akan pakai query langsung di bawah
                        : null;

                    const [rows]: any = await (await import('../../lib/db')).default.query(
                        'SELECT * FROM scraped_work_orders WHERE id = ? LIMIT 1', [id]
                    );
                    const t = rows[0];
                    if (t) {
                        const serviceArea = t.service_area ||
                            (t.workzone ? getServiceAreaByWorkzone(t.workzone) : null);
                        if (serviceArea) {
                            t.service_area = serviceArea;
                            await TicketController.sendInseraTicketAlert(
                                String(id), t, assignedTo, `HD - ${assignedBy}`
                            );
                        }
                    }
                } catch (notifyErr: any) {
                    console.error("[Assign] Telegram notification error:", notifyErr.message);
                }
            })();

            // Response langsung tanpa tunggu Telegram
            return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
        }

        if (action === 'bulk_assign_send') {
            const { ids, assignedTo, assignedBy, tickets } = body;
            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return new Response(JSON.stringify({ status: 'error', message: 'Tidak ada tiket yang dipilih' }), { status: 400 });
            }
            if (!assignedTo || assignedTo.length === 0) {
                return new Response(JSON.stringify({ status: 'error', message: 'Pilih minimal 1 teknisi' }), { status: 400 });
            }

            // 1. Assign semua tiket
            const errors: string[] = [];
            for (const ticketId of ids) {
                try {
                    await InseraModel.updateAssignment(ticketId, assignedTo, assignedBy);
                } catch (err: any) {
                    errors.push(`ID ${ticketId}: ${err.message}`);
                }
            }

            // 2. Kirim Telegram TANPA await — tidak blokir response
            (async () => {
                try {
                    const { TicketController } = await import('../../lib/controllers/TicketController');
                    const { getServiceAreaByWorkzone } = await import('../../lib/utils/area-mapping');
                    const pool = (await import('../../lib/db')).default;

                    // Ambil data tiket by ids langsung — bukan getAll()
                    const placeholders = ids.map(() => '?').join(',');
                    const [dbRows]: any = await pool.query(
                        `SELECT * FROM scraped_work_orders WHERE id IN (${placeholders})`,
                        ids
                    );
                    const allTickets = ids.map((ticketId: any) =>
                        dbRows.find((r: any) => r.id == ticketId)
                    ).filter(Boolean);

                    const firstTicket = allTickets[0] || (tickets || [])[0];
                    const serviceArea = firstTicket?.service_area ||
                        (firstTicket?.workzone ? getServiceAreaByWorkzone(firstTicket.workzone) : null);

                    await TicketController.sendBulkInseraTicketAlert(
                        allTickets, assignedTo, `HD - ${assignedBy}`, serviceArea
                    );
                } catch (notifyErr: any) {
                    console.error("[Bulk Assign] Telegram notification error:", notifyErr.message);
                }
            })();

            if (errors.length > 0) {
                return new Response(JSON.stringify({ 
                    status: 'partial', 
                    message: `${ids.length - errors.length} tiket berhasil, ${errors.length} gagal`,
                    errors 
                }), { status: 200 });
            }

            return new Response(JSON.stringify({ 
                status: 'success', 
                message: `${ids.length} tiket berhasil di-assign dan notifikasi dikirim` 
            }), { status: 200 });
        }

        if (action === 'delete') {
            await InseraModel.delete(id);
            return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
        }

        if (action === 'delete_all') {
            await InseraModel.deleteAll();
            return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
        }

        if (action === 'cleanup_closed') {
            const deletedCount = await InseraModel.cleanupClosedTickets();
            return new Response(JSON.stringify({ status: 'success', deletedCount }), { status: 200 });
        }

        if (action === 'get_closed_tickets') {
            const data = await InseraModel.getClosedTickets();
            return new Response(JSON.stringify({ status: 'success', data }, (_, v) => typeof v === 'bigint' ? v.toString() : v), { status: 200 });
        }

        if (action === 'check_duplicate') {
            const { orderId } = body;
            if (!orderId) {
                return new Response(JSON.stringify({ status: 'error', message: 'Missing orderId' }), { status: 400 });
            }
            
            // Check if ticket exists
            const existing = await InseraModel.getByOrderId(orderId);
            if (existing) {
                // Get last update info
                const lastUpdateBy = existing.last_update_by || existing.assigned_by || existing.closed_by || 'Unknown';
                const status = existing.status || 'OPEN';
                const isClosed = ['CLOSED', 'RESOLVED', 'CANCELLED'].includes(status.toUpperCase());
                
                return new Response(JSON.stringify({ 
                    status: 'exists', 
                    exists: true,
                    isClosed,
                    message: `Tiket ${orderId} sudah ${isClosed ? 'di-CLOSE' : 'ada'} oleh @${lastUpdateBy}`,
                    data: {
                        id: existing.id,
                        orderId: existing.order_id,
                        status,
                        lastUpdateBy,
                        summary: existing.summary,
                        assignedTo: existing.assigned_to
                    }
                }), { status: 200 });
            }
            
            return new Response(JSON.stringify({ status: 'not_found', exists: false }), { status: 200 });
        }

        if (action === 'mark_processed') {
            const { orderId, processedBy } = body;
            if (!orderId || !processedBy) {
                return new Response(JSON.stringify({ status: 'error', message: 'Missing orderId or processedBy' }), { status: 400 });
            }
            
            await InseraModel.markAsProcessed(orderId, processedBy);
            return new Response(JSON.stringify({ status: 'success', message: 'Ticket marked as processed' }), { status: 200 });
        }

        if (action === 'return_ticket') {
            const { id, notes, assignedTo, actorName } = body;
            if (!id || !notes) {
                return new Response(JSON.stringify({ status: 'error', message: 'Missing required fields' }), { status: 400 });
            }

            // Update tiket status ke OPEN dan simpan notes
            await InseraModel.update(id, { status: 'OPEN', notes_hd: notes }, actorName || 'System');

            // Kirim notifikasi ke Telegram (grup dan private chat teknisi)
            try {
                // Ambil data tiket untuk notifikasi
                const tickets = await InseraModel.getAll();
                const ticket = tickets.find((t: any) => t.id == id);
                if (ticket) {
                    // Format pesan return
                    const returnMessage = `⚠️ <b>TICKET RETURNED</b>\n\n` +
                        `🎫 Tiket #${ticket.order_id || ticket.orderId}\n` +
                        `Tiket dikembalikan ke status OPEN oleh ${actorName || 'Admin'}.\n\n` +
                        `<b>No Tiket:</b> ${ticket.order_id || ticket.orderId}\n` +
                        `<b>Summary:</b> ${ticket.summary || '-'}\n` +
                        `<b>Workzone:</b> ${ticket.workzone || '-'}\n\n` +
                        `<b>Catatan:</b> ${notes}\n\n` +
                        `Silakan cek kembali di menu Active Ticket.`;

                    console.log("[Return Ticket] Notification message prepared:", returnMessage);
                    // TODO: Implementasi pengiriman ke grup Telegram
                    // TODO: Kirim private chat ke setiap teknisi di assignedTo
                }
            } catch (notifyErr) {
                console.error("[Return Ticket] Notification error:", notifyErr);
            }

            return new Response(JSON.stringify({ status: 'success', message: 'Ticket returned successfully' }), { status: 200 });
        }

        return new Response(JSON.stringify({ status: 'error', message: 'Invalid action' }), { status: 400 });
    } catch (error: any) {
        return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500 });
    }
};

