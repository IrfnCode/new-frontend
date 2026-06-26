import axios from 'axios';
import fs from 'node:fs';
import FormData from 'form-data';

export class AnnouncementController {
    static async broadcast(groupConfigs: { id: string, name: string }[], message: string, imageFile?: any) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const results = [];

        for (const group of groupConfigs) {
            try {
                if (imageFile && imageFile.path) {
                    // Send with Photo
                    const form = new FormData();
                    form.append('chat_id', group.id);
                    form.append('caption', message);
                    form.append('photo', fs.createReadStream(imageFile.path));
                    form.append('parse_mode', 'Markdown');

                    await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, form, {
                        headers: form.getHeaders()
                    });
                } else {
                    // Send Text Only
                    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                        chat_id: group.id,
                        text: message,
                        parse_mode: 'Markdown'
                    });
                }
                results.push({ group: group.name, status: 'success' });
            } catch (error: any) {
                console.error(`Broadcast Error to ${group.name}:`, error.response?.data || error.message);
                results.push({ group: group.name, status: 'failed', error: error.response?.data?.description || error.message });
            }
        }

        return results;
    }
}
