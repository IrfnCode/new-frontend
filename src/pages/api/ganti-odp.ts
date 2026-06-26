import type { APIRoute } from 'astro';
import { GantiOdpModel } from '../../lib/models/GantiOdpModel';
import { TechnicianModel } from '../../lib/models/TechnicianModel';
import axios from 'axios';

const BASE_URL = process.env.URL || 'https://morena.tabatam.com';

// ── Helper kirim notifikasi Telegram ke teknisi ───────────────────────────────
async function sendReturnNotification(record: any, returnFields: string[], notes: string, qcLevel: number, qcBy: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !record.user_id) return;

    const fieldLabels: Record<string, string> = {
        barcode_odp:        '📦 Barcode ODP',
        evident_barcode_odp:'📸 Evident Barcode ODP',
        evident_label_odp:  '🏷️ Evident Label ODP',
        evident_setelah_1:  '📸 Foto Setelah 1',
        evident_setelah_2:  '📸 Foto Setelah 2',
        barcode_ps18_1:     '📦 Barcode PS 1:8 #1',
        barcode_ps18_2:     '📦 Barcode PS 1:8 #2',
        foto_clam_1:        '📸 Foto Clam Cooker 1',
        foto_clam_2:        '📸 Foto Clam Cooker 2',
        foto_uc:            '📸 Foto UC',
        foto_kabel_adss_5m: '📸 Foto Kabel ADSS 5M',
        foto_odp_rise:      '📸 Foto ODP Rise',
        evident_sebelum_1:  '📸 Evident Sebelum 1',
        evident_sebelum_2:  '📸 Evident Sebelum 2',
        catatan:            '📝 Catatan',
    };

    const fieldList = returnFields.map(f => `  • ${fieldLabels[f] || f}`).join('\n');
    const sep = '━━━━━━━━━━━━━━━━';

    const msg = `⚠️ <b>GANTI ODP — RETURN QC${qcLevel}</b>\n${sep}\n`
        + `📋 <b>No Tiket:</b> <code>${record.no_tiket}</code>\n`
        + `📍 <b>ODP:</b> ${record.datek_odp}\n`
        + `${sep}\n`
        + `❌ <b>Data/Evident yang perlu diperbaiki:</b>\n${fieldList}\n`
        + `${sep}\n`
        + (notes ? `📝 <b>Catatan QC:</b>\n${notes}\n${sep}\n` : '')
        + `👤 <b>Di-return oleh:</b> ${qcBy}\n\n`
        + `<i>Silakan buka STATUS GANTI ODP di Bot Morena untuk memperbaiki.</i>`;

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: record.user_id,
        text: msg,
        parse_mode: 'HTML'
    }).catch(e => console.error('[GantiODP] Telegram error:', e.message));
}

// ── Helper kirim notifikasi Telegram ke teknisi untuk APPROVE ─────────────────
async function sendApproveNotification(record: any, qcLevel: number, qcBy: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !record.user_id) return;

    const sep = '━━━━━━━━━━━━━━━━';
    let statusMsg = '';
    if (qcLevel === 1) {
        statusMsg = `✅ Telah di-*APPROVE* oleh **QC 1** dan sedang menunggu pengecekan **QC 2**.`;
    } else {
        statusMsg = `✅ Telah di-*APPROVE* oleh **QC 2** (Selesai Sepenuhnya). Terima kasih!`;
    }

    const msg = `✅ <b>GANTI ODP — APPROVE QC${qcLevel}</b>\n${sep}\n`
        + `📋 <b>No Tiket:</b> <code>${record.no_tiket}</code>\n`
        + `📍 <b>ODP:</b> ${record.datek_odp}\n`
        + `${sep}\n`
        + `${statusMsg.replace(/\*\*/g, '<b>').replace(/\*/g, '<i>').replace(/<\/b>/g, '</b>').replace(/<\/i>/g, '</i>')}\n\n`
        + `👤 <b>Di-approve oleh:</b> ${qcBy}`;

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: record.user_id,
        text: msg,
        parse_mode: 'HTML'
    }).catch(e => console.error('[GantiODP] Telegram error (Approve):', e.message));
}

// ── GET — list / detail ───────────────────────────────────────────────────────
export const GET: APIRoute = async ({ url, cookies }) => {
    try {
        const id      = url.searchParams.get('id');
        const userId  = url.searchParams.get('user_id');
        const status  = url.searchParams.get('status') || '';
        const dateFrom = url.searchParams.get('date_from') || '';
        const dateTo   = url.searchParams.get('date_to')   || '';

        if (id) {
            const record = await GantiOdpModel.getById(id);
            if (!record) return new Response(JSON.stringify({ status: 'error', message: 'Tidak ditemukan' }), { status: 404 });
            // Parse returned_fields JSON
            if (record.returned_fields && typeof record.returned_fields === 'string') {
                try { record.returned_fields = JSON.parse(record.returned_fields); } catch (_) {}
            }
            return new Response(JSON.stringify({ status: 'success', data: record }), { status: 200 });
        }

        if (userId) {
            const data = await GantiOdpModel.getByUser(userId);
            return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
        }

        // Admin list
        const data = await GantiOdpModel.getAll({ status, date_from: dateFrom, date_to: dateTo });
        return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });

    } catch (err: any) {
        return new Response(JSON.stringify({ status: 'error', message: err.message }), { status: 500 });
    }
};

// ── POST — submit / qc action / update return ─────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
    try {
        const contentType = request.headers.get('content-type') || '';

        // ── JSON actions (QC approve/return, update return fields) ──
        if (contentType.includes('application/json')) {
            const body = await request.json();
            const { action, id, qc_level, notes, return_fields, by, fields } = body;

            if (action === 'qc_approve' || action === 'qc_return') {
                const qcAction = action === 'qc_approve' ? 'approve' : 'return';
                const level = parseInt(qc_level) as 1 | 2;
                const newStatus = await GantiOdpModel.qcAction(id, qcAction, level, by, notes, return_fields);

                // Kirim notifikasi ke teknisi
                const record = await GantiOdpModel.getById(id);
                if (record) {
                    if (qcAction === 'return' && return_fields?.length > 0) {
                        sendReturnNotification(record, return_fields, notes, level, by).catch(() => {});
                    } else if (qcAction === 'approve') {
                        sendApproveNotification(record, level, by).catch(() => {});
                    }
                }

                return new Response(JSON.stringify({ status: 'success', new_status: newStatus }), { status: 200 });
            }

            if (action === 'update_return') {
                await GantiOdpModel.updateReturnedFields(id, fields || {});
                return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
            }

            return new Response(JSON.stringify({ status: 'error', message: 'Invalid action' }), { status: 400 });
        }

        // ── FormData — submit baru atau update foto return ──
        const formData = await request.formData();
        const action = formData.get('action')?.toString() || 'submit';

        if (action === 'update_photo') {
            // Teknisi upload ulang foto yang di-return
            const odp_id = formData.get('odp_id')?.toString();
            const field_name = formData.get('field_name')?.toString();
            const file = formData.get('file') as File | null;

            if (!odp_id || !field_name || !file) {
                return new Response(JSON.stringify({ status: 'error', message: 'Data tidak lengkap' }), { status: 400 });
            }

            await GantiOdpModel.deletePhotosByField(odp_id, field_name);
            const saved = await GantiOdpModel.savePhoto(parseInt(odp_id), field_name, file, BASE_URL);
            return new Response(JSON.stringify({ status: 'success', photo: saved }), { status: 200 });
        }

        // ── Submit baru ──
        const user_id = formData.get('user_id')?.toString() || '';
        if (!user_id) return new Response(JSON.stringify({ status: 'error', message: 'user_id required' }), { status: 400 });

        // Lookup teknisi
        const tech = await TechnicianModel.getByBotId(user_id);

        let rawTanggal = formData.get('tanggal')?.toString() || '';
        if (rawTanggal && rawTanggal.includes('T')) {
            rawTanggal = rawTanggal.replace('T', ' ');
            if (rawTanggal.length === 16) rawTanggal += ':00';
        } else if (!rawTanggal) {
            const now = new Date();
            const wibMs = now.getTime() + (now.getTimezoneOffset() * 60000) + (7 * 3600000);
            const wib = new Date(wibMs);
            const pad = (n: number) => String(n).padStart(2, '0');
            rawTanggal = `${wib.getFullYear()}-${pad(wib.getMonth()+1)}-${pad(wib.getDate())} ${pad(wib.getHours())}:${pad(wib.getMinutes())}:${pad(wib.getSeconds())}`;
        }

        const recordData = {
            user_id,
            nik_teknisi:   tech?.nik  || '',
            nama_teknisi:  tech?.nama || formData.get('nama')?.toString() || '',
            tanggal:       rawTanggal,
            no_tiket:      formData.get('no_tiket')?.toString() || '',
            datek_odp:     formData.get('datek_odp')?.toString() || '',
            datek_odc:     formData.get('datek_odc')?.toString() || '',
            lokasi:        formData.get('lokasi')?.toString() || '',
            barcode_odp:   formData.get('barcode_odp')?.toString() || '',
            ps18_count:    parseInt(formData.get('ps18_count')?.toString() || '1'),
            barcode_ps18_1: formData.get('barcode_ps18_1')?.toString() || '',
            barcode_ps18_2: formData.get('barcode_ps18_2')?.toString() || null,
            material_odp_solid:   parseInt(formData.get('material_odp_solid')?.toString() || '0'),
            material_clam_cooker: parseInt(formData.get('material_clam_cooker')?.toString() || '0'),
            material_uc:          parseInt(formData.get('material_uc')?.toString() || '0'),
            material_kabel_adss_5m: parseInt(formData.get('material_kabel_adss_5m')?.toString() || '0'),
            odp_rise_count:       parseInt(formData.get('odp_rise_count')?.toString() || '0'),
            catatan: formData.get('catatan')?.toString() || null,
        };

        const odp_id = await GantiOdpModel.create(recordData);

        // Simpan semua foto
        const photoFields = [
            'evident_barcode_odp',
            'evident_label_odp',
            'evident_setelah_1', 'evident_setelah_2',
            'foto_clam_1', 'foto_clam_2',
            'foto_uc', 'foto_kabel_adss_5m',
            'foto_odp_rise',
            'evident_sebelum_1', 'evident_sebelum_2',
        ];

        // Add foto_ps18 fields based on ps18_count
        for (let i = 1; i <= recordData.ps18_count; i++) {
            photoFields.push(`foto_ps18_${i}`);
        }

        // Sesudah = 9 photos per PS 1:8
        const maxSesudah = recordData.ps18_count * 9;
        for (let i = 1; i <= maxSesudah; i++) {
            photoFields.push(`sesudah_${i}`);
        }

        for (const fieldName of photoFields) {
            const files = formData.getAll(fieldName) as File[];
            for (const file of files) {
                if (file && file.size > 0) {
                    await GantiOdpModel.savePhoto(odp_id, fieldName, file, BASE_URL);
                }
            }
        }

        return new Response(JSON.stringify({ status: 'success', id: odp_id }), { status: 200 });

    } catch (err: any) {
        console.error('[GantiODP API]', err);
        return new Response(JSON.stringify({ status: 'error', message: err.message }), { status: 500 });
    }
};

// ── DELETE — bulk hapus ──────────────────────────────────────────────────────
export const DELETE: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { ids } = body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return new Response(JSON.stringify({ status: 'error', message: 'Tidak ada ID yang dipilih' }), { status: 400 });
        }
        await GantiOdpModel.deleteMultiple(ids);
        return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
    } catch (e: any) {
        console.error('[GantiODP DELETE API]', e);
        return new Response(JSON.stringify({ status: 'error', message: e.message }), { status: 500 });
    }
};
