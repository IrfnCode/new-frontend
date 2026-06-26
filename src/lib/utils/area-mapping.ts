export const WORKZONE_TO_AREA: Record<string, string> = {
    // BATAM CENTER
    'BTC': 'BATAM CENTER',
    'CDN': 'BATAM CENTER',
    'KAI': 'BATAM CENTER',
    'NGS': 'BATAM CENTER',
    'PNI': 'BATAM CENTER',
    'TUS': 'BATAM CENTER',

    // LUBUK BAJA
    'BUM': 'LUBUK BAJA',
    'LBJ': 'LUBUK BAJA',
    'MOR': 'LUBUK BAJA',
    'SGT': 'LUBUK BAJA',
    'SYA': 'LUBUK BAJA',
    'TBK': 'LUBUK BAJA',
    'TJT': 'LUBUK BAJA',

    // SAGULUNG
    'DGS': 'SAGULUNG',
    'SGL': 'SAGULUNG',
    'SKN': 'SAGULUNG',
    'SLU': 'SAGULUNG',
    'TIN': 'SAGULUNG',
    'TJU': 'SAGULUNG',
    'BDS': 'SAGULUNG',
    'AVI': 'SAGULUNG',
    'BLP': 'SAGULUNG',

    // TANJUNGPINANG
    'KIJ': 'TANJUNGPINANG',
    'KMS': 'TANJUNGPINANG',
    'PYT': 'TANJUNGPINANG',
    'TPI': 'TANJUNGPINANG',
    'TUB': 'TANJUNGPINANG',
    'TER': 'TANJUNGPINANG',
    'RAI': 'TANJUNGPINANG',
    'DBS': 'TANJUNGPINANG',
};

export function getServiceAreaByWorkzone(wz: string): string | null {
    if (!wz) return null;
    const key = wz.trim().toUpperCase();
    return WORKZONE_TO_AREA[key] || null;
}

export function getWorkzonesByArea(area: string): string[] {
    return Object.keys(WORKZONE_TO_AREA).filter(wz => WORKZONE_TO_AREA[wz] === area.toUpperCase());
}
