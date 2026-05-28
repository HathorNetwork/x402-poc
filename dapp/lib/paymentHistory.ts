// localStorage-backed list of x402 payments this browser has made. Used by
// X402Fetch and the /payment/[txId] detail page.

const STORAGE_KEY = 'x402_payments';

export type PaymentScheme = 'hathor-direct' | 'hathor-direct-upto';
export type PaymentStatus = 'served' | 'voided';

export interface PaymentRecord {
  txId: string;
  url: string;
  route: string;
  scheme: PaymentScheme;
  amount: string;            // atomic units paid
  chargedAmount?: string;    // upto only
  refundAmount?: string;     // upto only
  refundTxId?: string;       // upto only
  asset: string;
  payTo: string;
  payerAddress: string;
  network: string;
  status: PaymentStatus;
  ts: number;
}

function safeReadAll(): PaymentRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWriteAll(records: PaymentRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* quota or private mode — ignore */
  }
}

export function getPayments(): PaymentRecord[] {
  return safeReadAll();
}

export function getPayment(txId: string): PaymentRecord | undefined {
  return safeReadAll().find((p) => p.txId === txId);
}

export function addPayment(record: PaymentRecord): void {
  const existing = safeReadAll();
  const i = existing.findIndex((p) => p.txId === record.txId);
  if (i >= 0) existing[i] = { ...existing[i], ...record };
  else existing.unshift(record);
  safeWriteAll(existing);
}

export function markVoided(txId: string): void {
  const existing = safeReadAll();
  const i = existing.findIndex((p) => p.txId === txId);
  if (i < 0) return;
  existing[i] = { ...existing[i], status: 'voided' };
  safeWriteAll(existing);
}

export function clearPayments(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
