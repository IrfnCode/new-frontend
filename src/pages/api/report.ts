// D:\batix\src\pages\api\report.ts
import type { APIRoute } from 'astro';
import pool from '../../lib/db';

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        let start_date = url.searchParams.get('start_date') || new Date().toISOString().split('T')[0];
        let end_date = url.searchParams.get('end_date') || new Date().toISOString().split('T')[0];

        // Validasi tanggal
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) start_date = new Date().toISOString().split('T')[0];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(end_date)) end_date = new Date().toISOString().split('T')[0];
        if (start_date > end_date) [start_date, end_date] = [end_date, start_date];

        const allowedAreas = [
            'BATAM CENTER', 'BGES', 'LUBUK BAJA', 'SAGULUNG',
            'TANJUNG BALAI KARIMUN', 'TANJUNGPINANG', 'WILSUS TANJUNG PINANG'
        ];

        // Ambil daftar jenis tiket
        let allJenisList: string[] = [];
        try {
            const [jenisTable]: any = await pool.query("SHOW TABLES LIKE 'tiket_jenis'");
            if (jenisTable.length > 0) {
                const [jenisRows]: any = await pool.query("SELECT nama_jenis FROM tiket_jenis ORDER BY id");
                allJenisList = jenisRows.map((r: any) => r.nama_jenis);
            }
            if (allJenisList.length === 0) {
                const [distinctJenis]: any = await pool.query(
                    "SELECT DISTINCT jenis FROM tiket_simple WHERE jenis IS NOT NULL AND jenis != '' ORDER BY jenis"
                );
                allJenisList = distinctJenis.map((r: any) => r.jenis);
            }
        } catch (err) {
            console.error("Error getting jenis list:", err);
            allJenisList = [];
        }

        // Query utama - Robust Join
        const sql = `
            SELECT 
                t.id, t.nik_teknisi, t.user_id, t.jenis, t.odp, t.no_tiket, t.no_inet, 
                t.jam_open, t.jam_close, t.rca, t.catatan,
                COALESCE(n.nama, t.nama, 'Unknown') AS nama_teknisi,
                n.service_area, n.posisi
            FROM tiket_simple t
            LEFT JOIN naker n ON (t.nik_teknisi = n.nik OR t.user_id = n.id_bot_telegram)
            WHERE DATE(NULLIF(NULLIF(t.jam_close, '0000-00-00 00:00:00'), '')) BETWEEN ? AND ?
        `;
        const [rows]: any[] = await pool.query(sql, [start_date, end_date]);

        // ========== PROSES DATA ==========
        const data: any = {};           // [area][teknisiKey][jenis] = count
        const detailData: any = {};     // [area][teknisiKey][jenis] = array tiket
        const teknisiTotal: any = {};   // global top teknisi
        const teknisiArea: any = {};
        const areaTeknisiSet: any = {}; // area => Set(nik)
        const areaTicketCount: any = {};
        const uniqueTeknisi: Set<string> = new Set();
        
        // FFG Specific Data
        const ffgTickets: any[] = [];
        const ffgRcaCounts: any = {};
        const ffgAreaCounts: any = {};

        for (const row of rows) {
            let area = (row.service_area || '').trim().toUpperCase();
            // Fallback: Jika area masih kosong, coba mapping manual jika ada pola tertentu atau biarkan SKIP jika tidak valid
            if (!area || !allowedAreas.includes(area)) {
                // Check if any allowed area is contained in the string
                const foundArea = allowedAreas.find(a => area.includes(a));
                if (foundArea) {
                    area = foundArea;
                } else {
                    continue; 
                }
            }
            
            const jenis = row.jenis;
            if (!jenis || (allJenisList.length > 0 && !allJenisList.includes(jenis))) continue;

            const nik = row.nik_teknisi;
            const nama = row.nama_teknisi || row.nama || 'Unknown';
            const posisi = row.posisi || '';
            const key = `${nik}|${nama}|${posisi}`;
            const globalKey = `${nik}|${nama}`;

            uniqueTeknisi.add(nik);

            // Top teknisi global
            if (!teknisiTotal[globalKey]) {
                teknisiTotal[globalKey] = { nama, nik, total: 0 };
                teknisiArea[globalKey] = area;
            }
            teknisiTotal[globalKey].total++;

            // Area set teknisi & total tiket
            if (!areaTeknisiSet[area]) areaTeknisiSet[area] = new Set();
            areaTeknisiSet[area].add(nik);
            areaTicketCount[area] = (areaTicketCount[area] || 0) + 1;

            // Data per area & teknisi (counts)
            if (!data[area]) data[area] = {};
            if (!data[area][key]) {
                data[area][key] = {
                    nama, nik, posisi,
                    counts: {}
                };
            }
            data[area][key].counts[jenis] = (data[area][key].counts[jenis] || 0) + 1;

            // Detail data
            if (!detailData[area]) detailData[area] = {};
            if (!detailData[area][key]) detailData[area][key] = {};
            if (!detailData[area][key][jenis]) detailData[area][key][jenis] = [];
            detailData[area][key][jenis].push({
                id: row.id,
                no_tiket: row.no_tiket,
                no_inet: row.no_inet,
                jenis: row.jenis,
                jam_open: row.jam_open,
                jam_close: row.jam_close,
                rca: row.rca,
                catatan: row.catatan,
                odp: row.odp,
                service_area: area,
                nama_teknisi: nama
            });

            // FFG processing
            if (jenis === 'FFG') {
                const rcaVal = row.rca ? row.rca.trim() : 'Tanpa Keterangan';
                ffgRcaCounts[rcaVal] = (ffgRcaCounts[rcaVal] || 0) + 1;
                ffgAreaCounts[area] = (ffgAreaCounts[area] || 0) + 1;
                ffgTickets.push({
                    id: row.id,
                    no_tiket: row.no_tiket,
                    no_inet: row.no_inet,
                    jam_close: row.jam_close,
                    rca: rcaVal,
                    catatan: row.catatan,
                    odp: row.odp,
                    service_area: area,
                    nama_teknisi: nama
                });
            }
        }

        // Daftar jenis yang aktif (muncul di data)
        const activeJenisSet = new Set<string>();
        for (const area of Object.values(data) as any[]) {
            for (const tek of Object.values(area) as any[]) {
                Object.keys(tek.counts).forEach(j => activeJenisSet.add(j));
            }
        }
        const activeJenisList = Array.from(activeJenisSet).sort();
        if (activeJenisList.length === 0 && allJenisList.length > 0) {
            // Fallback: gunakan semua jenis yang ada di master
            activeJenisList.push(...allJenisList);
        }

        // Total per area
        const totalPerArea: any = {};
        for (const area of allowedAreas) {
            const areaTotal: any = {};
            for (const j of activeJenisList) areaTotal[j] = 0;
            if (data[area]) {
                for (const tek of Object.values(data[area]) as any[]) {
                    for (const j of activeJenisList) {
                        areaTotal[j] += tek.counts[j] || 0;
                    }
                }
            }
            totalPerArea[area] = areaTotal;
        }

        // Grand total per jenis
        const grandTotalDisplay: any = {};
        for (const j of activeJenisList) grandTotalDisplay[j] = 0;
        for (const areaTotal of Object.values(totalPerArea)) {
            for (const j of activeJenisList) {
                grandTotalDisplay[j] += areaTotal[j];
            }
        }
        const grandTotalAll = Object.values(grandTotalDisplay).reduce((a: number, b: number) => a + b, 0);
        const totalTeknisiGlobal = uniqueTeknisi.size;
        const rataPerTeknisiGlobal = totalTeknisiGlobal ? grandTotalAll / totalTeknisiGlobal : 0;

        // Top 5 teknisi
        const topTeknisi = Object.values(teknisiTotal)
            .sort((a: any, b: any) => b.total - a.total)
            .slice(0, 5);

        // Rata-rata per area
        const areaAvg: any = {};
        for (const area of allowedAreas) {
            const totalTiket = areaTicketCount[area] || 0;
            const jmlTeknisi = areaTeknisiSet[area] ? areaTeknisiSet[area].size : 0;
            areaAvg[area] = jmlTeknisi ? totalTiket / jmlTeknisi : 0;
        }

        // Data untuk grafik bar
        const areaNames = allowedAreas;
        const areaTotals = areaNames.map(area => {
            const total = Object.values(totalPerArea[area] || {}).reduce((a: number, b: number) => a + b, 0);
            return total;
        });
        const jenisNames = activeJenisList;
        const jenisValues = jenisNames.map(j => grandTotalDisplay[j]);

        // ========== TIMESLOT ==========
        const jamList = Array.from({ length: 17 }, (_, i) => String(i + 8).padStart(2, '0'));
        const timeslotSql = `
            SELECT 
                t.id, t.nik_teknisi, t.user_id, t.jam_close, t.no_tiket, t.no_inet, t.rca, t.catatan,
                COALESCE(n.nama, t.nama, 'Unknown') AS nama_teknisi, n.service_area, n.posisi,
                HOUR(t.jam_close) AS jam_close_hour
            FROM tiket_simple t
            LEFT JOIN naker n ON (t.nik_teknisi = n.nik OR t.user_id = n.id_bot_telegram)
            WHERE DATE(NULLIF(NULLIF(t.jam_close, '0000-00-00 00:00:00'), '')) BETWEEN ? AND ?
        `;
        const [timeslotRows]: any[] = await pool.query(timeslotSql, [start_date, end_date]);

        const dataTimeslot: any = {};
        const detailDataTimeslot: any = {};
        for (const row of timeslotRows) {
            let area = (row.service_area || '').trim().toUpperCase();
            if (!area || !allowedAreas.includes(area)) {
                const foundArea = allowedAreas.find(a => area.includes(a));
                if (foundArea) area = foundArea;
                else continue;
            }
            const jam = row.jam_close_hour;
            if (jam < 8 || jam > 24) continue;
            const jamLabel = String(jam).padStart(2, '0');
            const nik = row.nik_teknisi;
            const nama = row.nama_teknisi || row.nama || 'Unknown';
            const posisi = row.posisi || '';
            const key = `${nik}|${nama}|${posisi}`;

            if (!dataTimeslot[area]) dataTimeslot[area] = {};
            if (!dataTimeslot[area][key]) {
                dataTimeslot[area][key] = {
                    nama, nik, posisi,
                    counts: {}
                };
            }
            dataTimeslot[area][key].counts[jamLabel] = (dataTimeslot[area][key].counts[jamLabel] || 0) + 1;

            if (!detailDataTimeslot[area]) detailDataTimeslot[area] = {};
            if (!detailDataTimeslot[area][key]) detailDataTimeslot[area][key] = {};
            if (!detailDataTimeslot[area][key][jamLabel]) detailDataTimeslot[area][key][jamLabel] = [];
            detailDataTimeslot[area][key][jamLabel].push({
                id: row.id,
                no_tiket: row.no_tiket,
                no_inet: row.no_inet,
                jam_close: row.jam_close,
                rca: row.rca,
                catatan: row.catatan,
                service_area: area,
                nama_teknisi: nama
            });
        }

        // Total per area timeslot
        const totalPerAreaTimeslot: any = {};
        for (const area of allowedAreas) {
            const areaTotal: any = {};
            for (const j of jamList) areaTotal[j] = 0;
            if (dataTimeslot[area]) {
                for (const tek of Object.values(dataTimeslot[area]) as any[]) {
                    for (const j of jamList) {
                        areaTotal[j] += tek.counts[j] || 0;
                    }
                }
            }
            totalPerAreaTimeslot[area] = areaTotal;
        }

        const grandTotalJam: any = {};
        for (const j of jamList) grandTotalJam[j] = 0;
        for (const areaTotal of Object.values(totalPerAreaTimeslot)) {
            for (const j of jamList) {
                grandTotalJam[j] += areaTotal[j];
            }
        }
        const grandTotalAllTimeslot = Object.values(grandTotalJam).reduce((a: number, b: number) => a + b, 0);
        let peakHour = '-', peakCount = 0;
        for (const j of jamList) {
            if (grandTotalJam[j] > peakCount) {
                peakCount = grandTotalJam[j];
                peakHour = j;
            }
        }

        // Helper untuk detail modal (agregat per area/jenis)
        const areaDetailData: any = {};
        for (const area of allowedAreas) {
            if (!detailData[area]) continue;
            for (const tekKey in detailData[area]) {
                for (const jenis in detailData[area][tekKey]) {
                    if (!areaDetailData[area]) areaDetailData[area] = {};
                    if (!areaDetailData[area][jenis]) areaDetailData[area][jenis] = [];
                    areaDetailData[area][jenis].push(...detailData[area][tekKey][jenis]);
                }
            }
        }

        const areaDetailDataTimeslotMap: any = {};
        for (const area of allowedAreas) {
            if (!detailDataTimeslot[area]) continue;
            for (const tekKey in detailDataTimeslot[area]) {
                for (const jam in detailDataTimeslot[area][tekKey]) {
                    if (!areaDetailDataTimeslotMap[area]) areaDetailDataTimeslotMap[area] = {};
                    if (!areaDetailDataTimeslotMap[area][jam]) areaDetailDataTimeslotMap[area][jam] = [];
                    areaDetailDataTimeslotMap[area][jam].push(...detailDataTimeslot[area][tekKey][jam]);
                }
            }
        }

        // Semua tiket global
        const allTicketsGlobal = Object.values(detailData).flatMap(area =>
            Object.values(area).flatMap(tek =>
                Object.values(tek).flatMap((arr: any) => arr)
            )
        );
        const allTicketsGlobalTimeslot = Object.values(detailDataTimeslot).flatMap(area =>
            Object.values(area).flatMap(tek =>
                Object.values(tek).flatMap((arr: any) => arr)
            )
        );

        const responseData = {
            success: true,
            status: 'success',
            start_date, end_date,
            allowedAreas,
            activeJenisList,
            jamList,
            data,
            detailData,
            dataTimeslot,
            detailDataTimeslot,
            totalPerArea,
            grandTotalDisplay,
            grandTotalAll,
            totalTeknisiGlobal,
            rataPerTeknisiGlobal,
            topTeknisi,
            areaAvg,
            areaNames,
            areaTotals,
            jenisNames,
            jenisValues,
            totalPerAreaTimeslot,
            grandTotalJam,
            peakHour,
            peakCount,
            areaDetailData,
            areaDetailDataTimeslot: areaDetailDataTimeslotMap,
            allTicketsGlobal,
            allTicketsGlobalTimeslot,
            ffgTickets,
            ffgRcaCounts,
            ffgAreaCounts
        };

        return new Response(JSON.stringify(responseData), { status: 200 });
    } catch (error: any) {
        console.error('Report API Error:', error);
        return new Response(JSON.stringify({ 
            success: false, 
            status: 'error', 
            message: error.message 
        }), { status: 500 });
    }
};