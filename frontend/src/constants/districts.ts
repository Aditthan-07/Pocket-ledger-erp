/**
 * Pocket Ledger ERP - All 38 Districts of Tamil Nadu & Dispatch Route Utilities
 */

export const TN_DISTRICTS = [
  'Ariyalur',
  'Chengalpattu',
  'Chennai',
  'Coimbatore',
  'Cuddalore',
  'Dharmapuri',
  'Dindigul',
  'Erode',
  'Kallakurichi',
  'Kancheepuram',
  'Kanniyakumari',
  'Karur',
  'Krishnagiri',
  'Madurai',
  'Mayiladuthurai',
  'Nagapattinam',
  'Namakkal',
  'Nilgiris',
  'Perambalur',
  'Pudukkottai',
  'Ramanathapuram',
  'Ranipet',
  'Salem',
  'Sivaganga',
  'Tenkasi',
  'Thanjavur',
  'Theni',
  'Thoothukudi',
  'Tiruchirappalli',
  'Tirunelveli',
  'Tirupathur',
  'Tiruppur',
  'Tiruvallur',
  'Tiruvannamalai',
  'Tiruvarur',
  'Vellore',
  'Viluppuram',
  'Virudhunagar',
] as const;

export type TNDistrict = (typeof TN_DISTRICTS)[number];

export const DEFAULT_FACTORY_DISTRICT = 'Karur';
export const FACTORY_STATE = 'Tamil Nadu';

/**
 * Compute dispatch route string, e.g.:
 * "Karur → Tiruchirappalli (TN • CGST+SGST)"
 * "Karur → Bengaluru (KA • IGST)"
 */
export function getDispatchRoute(
  factoryDistrict: string = DEFAULT_FACTORY_DISTRICT,
  destinationDistrict?: string,
  destinationState?: string
): string {
  const state = destinationState || 'Tamil Nadu';
  const dest = (destinationDistrict || '').trim() || (state.toLowerCase() === 'tamil nadu' ? 'Tamil Nadu' : state);
  const isExport = state.toLowerCase() === 'export' || dest.toLowerCase().includes('export');
  if (isExport) {
    return `${factoryDistrict || DEFAULT_FACTORY_DISTRICT} → ${dest} (Export • 0% LUT)`;
  }
  const isIntra = state.trim().toLowerCase() === FACTORY_STATE.toLowerCase();
  const stateCode = isIntra ? 'TN' : state.length >= 2 ? state.slice(0, 2).toUpperCase() : 'INT';
  const taxRule = isIntra ? 'CGST+SGST' : 'IGST';

  return `${factoryDistrict || DEFAULT_FACTORY_DISTRICT} → ${dest} (${stateCode} • ${taxRule})`;
}
