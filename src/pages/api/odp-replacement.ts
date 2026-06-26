import type { APIRoute } from 'astro';
import { OdpReplacementModel } from '../../lib/models/OdpReplacementModel';
import { TechnicianModel } from '../../lib/models/TechnicianModel';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'odp');

function ensureUploadDir() {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function saveImage(file: File, prefix: string): Promise<{ url: string; filePath: string }> {
    ensureUploadDir();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `${prefix}_${Date.now()}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    // Tulis file asli langsung tanpa sharp untuk menghindari native crash di Proxmox LXC
    await fs.promises.writeFile(filePath, buffer);

    return { url: `/uploads/odp/${filename}`, filePath };
}

// ── GET: list data ────────────────────────────────────────────────────────────
export const GET: APIRoute = async ({ url, cookies }) => {
    try {
        const userId  = url.searchParams.get('user_id');
        const id      = url.searchParams.get('id');
        const status  = url.searchParams.get('status') || '';
        const dateFrom = url.searchParams.get('date_from') || '';
        const dateTo   = url.searchParams.get('date_to')   || '';
        const isAdmin  = cookies.get('admin_session')?.value === 'active';

        if (id) {
            const record = await OdpReplacementModel.getById(Number(id));
            if (!record) return new Response(JSON.stringify({ status: 'error', message: 'Not found' }), { status: 404 });
            return new Response(JSON.stringify({ status: 'success', data: record }), { status: 200 });
        }

        if (userId && !isAdmin) {
            const data = await OdpReplacementModel.getByUser(userId);
            return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
        }

        // Admin: get all
        const data = await OdpReplacementModel.getAll({ status, date_from: dateFrom, date_to: dateTo });
        return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
    } catch (err: any) {
        return new Response(JSON.stringify({ status: 'error', message: err.message }), { status: 500 });
    }
};

// ── POST: submit / qc / update-return ────────────────────────────────────────
export const POST: APIRoute = async ({ request, cookies }) => {
    try {
        const contentType = request.headers.get('content-type') || '';
        const isAdmin = cookies.get('admin_session')?.value === 'active';
        const actorName = cookies.get('admin_user')?.value || 'Admin';

        // ── JSON actions (QC, update-return) ──────────────────────────────
        if (contentType.includes('application/json')) {
            const body = await request.json();
            const { action, id, qc_level, qc_action, notes, returned_fields, fields } = body;

            if (action === 'qc') {
                if (!isAdmin) return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), { status: 403 });
                const newStatus = await OdpReplacementModel.qcAction(
                    Number(id), qc_level as 1 | 2, qc_action, actorName, notes, returned_fields
                );

                // Kirim notifikasi ke teknisi jika return
                if (qc_action === 'return') {
                    (async () => {
                        try {
                            const record = await OdpReplacementModel.getById(Number(id));
                            if (!record) return;
                            const tech = await TechnicianModel.getByBotId(record.user_id);
                            const botId = tech?.id_bot_telegram || record.user_id;
                            const token = process.env.TELEGRAM_BOT_TOKEN;
                            if (!token || !botId) return;

                            const fieldLabels: Record<string, string> = {
                                barcode_odp: 'Barcode ODP',
                                foto_label_odp: 'Foto Label ODP',
                                foto_setelah_1: 'Foto Setelah 1 (dekat)',
                                foto_setelah_2: 'Foto Setelah 2 (jauh)',
                                barcode_ps1: 'Barcode PS 1',
                                barcode_ps2: 'Barcode PS 2',
                                foto_clam_cooker_1: 'Foto Clam Cooker 1',
                                foto_clam_cooker_2: 'Foto Clam Cooker 2',
                                foto_odp_rise: 'Foto ODP Rise',
                                foto_sebelum_1: 'Foto Sebelum 1',
                                foto_sebelum_2: 'Foto Sebelum 2',
                                material_odp_solid: 'Material ODP Solid',
                                material_clam_cooker: 'Material Clam Cooker',
                                odp_rise_count: 'Jumlah ODP Rise',
                            };

                            const returnedList = (returned_fields || [])
                                .map((f: string) => `• ${fieldLabels[f] || f}`)
                                .join('\n');

                            const qcLabel = qc_level === 1 ? 'QC 1 (TL)' : 'QC 2 (OSA)';
                            const baseUrl = process.env.BASE_URL || 'https://morena.tabatam.com';

                            const msg = `⚠️ <b>RETURN GANTI ODP</b>\n\n`
                                + `📋 No Tiket: <code>${record.no_tiket}</code>\n`
                                + `📍 ODP: ${record.datek_odp}\n`
                                + `👤 Di-return oleh: ${actorName} (${qcLabel})\n\n`
                                + `📝 <b>Catatan QC:</b>\n${notes || '-'}\n\n`
                                + `🔧 <b>Yang perlu diperbaiki:</b>\n${returnedList || '-'}\n\n`
                                + `Silakan buka STATUS GANTI ODP di bot untuk memperbaiki.`;

                            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                                chat_id: botId,
                                text: msg,
                                parse_mode: 'HTML'
                            });
                        } catch (e: any) {
                            console.error('[ODP Return Notify]', e.message);
                        }
                    })();
                }

                return new Response(JSON.stringify({ status: 'success', new_status: newStatus }), { status: 200 });
            }

            if (action === 'update-return') {
                // Teknisi perbaiki field yang di-return
                await OdpReplacementModel.updateReturnedFields(Number(id), fields || {});
                return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
            }

            return new Response(JSON.stringify({ status: 'error', message: 'Unknown action' }), { status: 400 });
        }

        // ── FormData: submit baru atau update evidence ─────────────────────
        const formData = await request.formData();
        const action = formData.get('action')?.toString() || 'submit';

        if (action === 'submit') {
            const userId = formData.get('user_id')?.toString() || '';
            if (!userId) return new Response(JSON.stringify({ status: 'error', message: 'user_id required' }), { status: 400 });

            const tech = await TechnicianModel.getByBotId(userId);

            const data = {
                user_id:              userId,
                nik_teknisi:          tech?.nik || '',
                nama_teknisi:         tech?.nama || '',
                tanggal:              formData.get('tanggal')?.toString() || new Date().toISOString().split('T')[0],
                no_tiket:             formData.get('no_tiket')?.toString() || '',
                datek_odp:            formData.get('datek_odp')?.toString() || '',
                datek_odc:            formData.get('datek_odc')?.toString() || '',
                lokasi:               formData.get('lokasi')?.toString() || '',
                barcode_odp:          formData.get('barcode_odp')?.toString() || '',
                ps_count:             Number(formData.get('ps_count') || 1),
                barcode_ps1:          formData.get('barcode_ps1')?.toString() || null,
                barcode_ps2:          formData.get('barcode_ps2')?.toString() || null,
                material_odp_solid:   Number(formData.get('material_odp_solid') || 0),
                material_clam_cooker: Number(formData.get('material_clam_cooker') || 0),
                odp_rise_count:       Number(formData.get('odp_rise_count') || 0),
                catatan:              formData.get('catatan')?.toString() || null,
            };

            const odpId = await OdpReplacementModel.create(data);

            // Upload semua foto
            const imageFields = [
                'foto_label_odp',
                'foto_setelah_1', 'foto_setelah_2',
                'foto_clam_cooker_1', 'foto_clam_cooker_2',
                'foto_odp_rise',
                'foto_sebelum_1', 'foto_sebelum_2',
                // Sesudah: 9 atau 18 foto tergantung ps_count
                ...Array.from({ length: data.ps_count === 2 ? 18 : 9 }, (_, i) => `foto_sesudah_${i + 1}`)
            ];

            for (const field of imageFields) {
                const file = formData.get(field) as File | null;
                if (file && file.size > 0) {
                    try {
                        const { url, filePath } = await saveImage(file, `${odpId}_${field}`);
                        await OdpReplacementModel.addEvidence(odpId, field, url, filePath, file.type);
                    } catch (imgErr: any) {
                        console.error(`[ODP Upload] ${field}:`, imgErr.message);
                    }
                }
            }

            return new Response(JSON.stringify({ status: 'success', id: odpId }), { status: 200 });
        }

        if (action === 'update-evidence') {
            // Teknisi upload ulang foto yang di-return
            const odpId = Number(formData.get('odp_id'));
            const field = formData.get('field_name')?.toString() || '';
            const file  = formData.get('file') as File | null;

            if (!odpId || !field || !file) {
                return new Response(JSON.stringify({ status: 'error', message: 'Missing params' }), { status: 400 });
            }

            const { url, filePath } = await saveImage(file, `${odpId}_${field}`);
            await OdpReplacementModel.updateEvidence(odpId, field, url, filePath, file.type);

            return new Response(JSON.stringify({ status: 'success', url }), { status: 200 });
        }

        return new Response(JSON.stringify({ status: 'error', message: 'Unknown action' }), { status: 400 });

    } catch (err: any) {
        console.error('[ODP API]', err);
        return new Response(JSON.stringify({ status: 'error', message: err.message }), { status: 500 });
    }
};
