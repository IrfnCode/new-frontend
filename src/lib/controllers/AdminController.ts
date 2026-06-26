import { TechnicianModel } from '../models/TechnicianModel';
import { GroupModel } from '../models/GroupModel';

export class AdminController {
    static async getTechnicians() {
        return await TechnicianModel.getAll();
    }

    static async manageTechnician(action: string, data: any) {
        try {
            if (action === 'add') return await TechnicianModel.create(data);
            if (action === 'edit') return await TechnicianModel.update(data.nik_lama || data.nik, data);
            if (action === 'delete') return await TechnicianModel.delete(data.ids);
            throw new Error("Invalid action");
        } catch (error) {
            console.error(`[AdminController] Error during ${action} technician:`, error);
            throw error;
        }
    }
    static async getGroups() {
        const groups = await GroupModel.getAll();
        const { PersonnelMappingModel } = await import('../models/PersonnelMappingModel');
        const mappings = await PersonnelMappingModel.getAll();
        
        return groups.map(group => ({
            ...group,
            korlap: mappings.filter(m => m.service_area_id === group.id && m.role === 'KORLAP'),
            hsa: mappings.filter(m => m.service_area_id === group.id && m.role === 'HSA')
        }));
    }

    static async manageGroup(action: string, data: any) {
        if (action === 'add') return await GroupModel.create(data);
        if (action === 'edit') return await GroupModel.update(data.id, data);
        if (action === 'delete') return await GroupModel.delete(data.id);
        throw new Error("Invalid action");
    }
}
