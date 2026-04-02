const STORAGE_KEY = 'x402_escrows';

export function getEscrowIds(): string[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

export function addEscrowId(ncId: string): void {
  const ids = getEscrowIds();
  if (!ids.includes(ncId)) {
    ids.unshift(ncId); // newest first
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }
}

export function removeEscrowId(ncId: string): void {
  const ids = getEscrowIds().filter(id => id !== ncId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}
