import type { APIRoute } from 'astro';
import { TicketModel } from '../../lib/models/TicketModel';
import { InseraModel } from '../../lib/models/InseraModel';
import pool from '../../lib/db';

export const GET: APIRoute = async ({ url }) => {
    try {
        const id = url.searchParams.get('id');
        const source = url.searchParams.get('source');
        if (!id) return new Response(JSON.stringify({ status: "error", msg: "ID tidak ditemukan" }), { status: 200 });

        let tiket: any;
        if (source === 'insera') {
            const [rows]: any = await pool.query("SELECT * FROM scraped_work_orders WHERE id = ?", [id]);
            const wo = rows[0];
            if (wo) {
                // Map Insera WO to tiket_simple format for the UI
                const parts = (wo.summary || "").split(" _ ");
                const cp = parts[0] || wo.contact_phone || "-";
                const noInet = parts[1] || wo.service_no || "-";

                tiket = {
                    id: wo.id,
                    no_tiket: wo.order_id,
                    no_inet: noInet,
                    jenis: wo.ticket_type || "REGULER",
                    rca: "", // Should not be pre-filled with assignment text
                    source_assignment: "ASSIGNED BY HD",
                    odp: wo.device_name || wo.workzone || "-",
                    odc: wo.rk_information || "-",
                    no_hp: cp,
                    jam_open: wo.reported_date,
                    catatan: wo.summary,
                    user_id: "", // Will be bypassed for Insera source update
                    _source: 'insera'
                };
            }
        } else {
            tiket = await TicketModel.getById(id);
            if (tiket) {
                tiket.evidence = await TicketModel.getEvidence(id);
            }
        }

        if (tiket) {
            return new Response(JSON.stringify({ status: "success", data: tiket }), { status: 200 });
        }
        return new Response(JSON.stringify({ status: "error", msg: "Tiket tidak ditemukan" }), { status: 200 });
    } catch (err: any) {
        return new Response(JSON.stringify({ status: "error", msg: err.message }), { status: 500 });
    }
};
