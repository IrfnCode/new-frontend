import type { APIRoute } from 'astro';
import { PersonnelMappingModel } from '../../lib/models/PersonnelMappingModel';
import { BotController } from '../../lib/controllers/BotController';
import { TechnicianModel } from '../../lib/models/TechnicianModel';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { action, id, sa_id, nik, niks, role } = body;
        const baseUrl = process.env.BASE_URL || 'https://morena.tabatam.com';

        console.log(`[API manage-korlap] Action: ${action}, Role: ${role}, SA: ${sa_id || id}`);

        if (action === 'remove' || action === 'delete') {
            if (!id) return new Response(JSON.stringify({ status: "error", msg: "ID Mapping wajib diisi" }), { status: 400 });
            
            const allMappings = await PersonnelMappingModel.getAll();
            const mapping = allMappings.find(m => m.id === parseInt(id));
            
            await PersonnelMappingModel.remove(id);

            if (mapping && mapping.nik) {
                const tech = await TechnicianModel.getByNIK(mapping.nik);
                if (tech && tech.id_bot_telegram) {
                    BotController.updateMenuButton(tech.id_bot_telegram, tech, baseUrl).catch(console.error);
                }
            }

            return new Response(JSON.stringify({ status: "success", msg: "Pemetaan dihapus" }), { status: 200 });
        }

        if (action === 'add') {
            const targetNiks = Array.isArray(niks) ? niks : (nik ? [nik] : []);
            if (!sa_id || targetNiks.length === 0 || !role) {
                return new Response(JSON.stringify({ status: "error", msg: "Data tidak lengkap (SA_ID/NIKs/Role)" }), { status: 400 });
            }

            for (const n of targetNiks) {
                await PersonnelMappingModel.add(sa_id, n, role);
                const tech = await TechnicianModel.getByNIK(n);
                if (tech && tech.id_bot_telegram) {
                    BotController.updateMenuButton(tech.id_bot_telegram, tech, baseUrl).catch(console.error);
                }
            }

            return new Response(JSON.stringify({ status: "success", msg: `${targetNiks.length} personel ditambahkan` }), { status: 200 });
        }

        if ((nik || niks) && role) {
            const targetNiks = Array.isArray(niks) ? niks : [nik];
            for (const n of targetNiks) {
                await PersonnelMappingModel.add(sa_id || id, n, role);
            }
            return new Response(JSON.stringify({ status: "success", msg: "Pemetaan diperbarui" }), { status: 200 });
        }

        return new Response(JSON.stringify({ status: "error", msg: "Action tidak valid" }), { status: 400 });
    } catch (err: any) {
        return new Response(JSON.stringify({ status: "error", msg: err.message }), { status: 500 });
    }
};
