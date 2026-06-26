import { TechnicianModel } from '../models/TechnicianModel';
import { GroupModel } from '../models/GroupModel';
import { PersonnelMappingModel } from '../models/PersonnelMappingModel';
import axios from 'axios';

export class BotController {
    static async handleUpdate(body: any) {
        if (body.message && body.message.text === '/start') {
            const chatId = body.message.chat.id;
            const userId = body.message.from?.id.toString();
            if (!userId) return;

            const tech = await TechnicianModel.getByBotId(userId);
            // Base URL from environment variable
            const baseUrl = process.env.BASE_URL || 'http://10.10.10.8:3000';

            if (tech) {
                const message = `✅ *Halo ${tech.nama}!*\n\n`
                    + `📋 *Data Anda:*\n`
                    + `• NIK: ${tech.nik}\n• Posisi: ${tech.posisi}\n• Service Area: ${tech.service_area}\n\n`
                    + `🎫 *SISTEM INPUT TIKET*\n\nSilakan pilih menu di bawah:`;

                // Fetch managed sectors from the NEW dynamic mapping table
                const mappings = await PersonnelMappingModel.getByNIK(tech.nik);
                const baseUrl = process.env.BASE_URL || 'https://morena.tabatam.com';

                const keyboard: any = { inline_keyboard: [] };

                if (mappings.length > 0) {
                    // KORLAP / HSA MODE: Only Show Sector Tickets
                    mappings.forEach((m: any) => {
                        keyboard.inline_keyboard.push([
                            { text: `📊 TIKET SEKTOR ${m.service_area}`, web_app: { url: `${baseUrl}/sector-tickets?sa=${encodeURIComponent(m.service_area)}` } }
                        ]);
                    });
                } else {
                    // REGULAR TECHNICIAN MODE: Show Standard Buttons
                    keyboard.inline_keyboard = [
                        [{ text: "📝 INPUT TIKET (MANUAL)", web_app: { url: `${baseUrl}/input` } }],
                        [{ text: "🎫 MY TICKET", web_app: { url: `${baseUrl}/my-tickets` } }],
                        [{ text: "✏️ UPDATE TIKET (MANUAL)", web_app: { url: `${baseUrl}/update` } }],
                        [{ text: "📦 INPUT GANTI ODP", web_app: { url: `${baseUrl}/ganti-odp` } }],
                        [{ text: "📋 STATUS GANTI ODP", web_app: { url: `${baseUrl}/status-ganti-odp?uid=${userId}` } }]
                    ];
                }

                // Auto-Update Menu Button (Persistent Button bottom left)
                this.updateMenuButton(chatId, tech, baseUrl).catch(err => console.error("Menu Button Update Error:", err.message));

                // Non-blocking response
                this.sendMessage(chatId, message, keyboard).catch(err => console.error("Bot Reply Error:", err.message));
            } else {
                this.sendMessage(chatId, `❌ *Akses Ditolak!*\n\nID Telegram Anda (${userId}) belum terdaftar.`);
            }
        }
    }

    public static async updateMenuButton(chatId: string | number, tech: any, baseUrl: string) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        try {
            const mappings = await PersonnelMappingModel.getByNIK(tech.nik);
            
            // If Korlap/HSA, point to sector tickets (pick first SA if multiple)
            // If regular tech, point to my-tickets
            let targetUrl = `${baseUrl}/my-tickets`;
            let buttonText = "My Tickets";

            if (mappings.length > 0) {
                targetUrl = `${baseUrl}/sector-tickets?sa=${encodeURIComponent(mappings[0].service_area)}`;
                buttonText = "Monitoring";
            }

            const payload = {
                chat_id: chatId,
                menu_button: {
                    type: 'web_app',
                    text: buttonText,
                    web_app: { url: targetUrl }
                }
            };

            await axios.post(`https://api.telegram.org/bot${token}/setChatMenuButton`, payload);
        } catch (err: any) {
            const errorData = err.response?.data;
            if (errorData?.description === 'Bad Request: user not found') {
                console.warn(`[Bot Sync Notice] Personel ${tech.nama} (${tech.nik}) belum terdaftar/start bot Telegram.`);
            } else {
                console.error(`[Bot Sync Error] Gagal update menu button ${tech.nama}:`, errorData || err.message);
            }
        }
    }

    private static async sendMessage(chatId: string | number, text: string, keyboard?: any) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const payload: any = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
        if (keyboard) payload.reply_markup = keyboard;
        try {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, payload);
        } catch (err: any) {
            console.error("Telegram API Error:", err.response?.data || err.message);
        }
    }
}
