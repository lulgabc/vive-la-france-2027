export const DARK_PARTY_COLORS: Record<string, string> = {
  rn: '#4f7cff',
  renaissance: '#ffd23f',
  lfi: '#ff4d6d',
  ps: '#ff8fb1',
  lr: '#4da3ff',
  eelv: '#39d98a',
  pcf: '#ff6b6b',
  horizons: '#35d6ff',
  modem: '#ffa94d',
  reconquete: '#b388ff',
  dlf: '#c084fc',
  'nous-france': '#6ea8fe',
  resistons: '#9ccc65',
  lo: '#ff8a80',
  npa: '#ff5252',
};

export function darkPartyColor(partyId: string | null | undefined): string {
  if (!partyId) return '#26364a';
  return DARK_PARTY_COLORS[partyId] ?? '#4b5d75';
}
