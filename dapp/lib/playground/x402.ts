// Client-side helpers for the x402 protocol dance against the merchant API.

export interface X402Accept {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  resource: string;
  description?: string;
  extra: { requestId: string };
}

export async function fetch402(url: string): Promise<X402Accept> {
  const resp = await fetch(url, { cache: 'no-store' });
  if (resp.status !== 402) {
    throw new Error(`Expected 402 challenge, got HTTP ${resp.status}`);
  }
  const body = await resp.json();
  const accept = body?.accepts?.[0];
  if (!accept?.extra?.requestId) {
    throw new Error('Malformed 402 response (no requestId)');
  }
  return accept as X402Accept;
}

export function buildPaymentSignatureHeader(params: {
  scheme: string;
  network: string;
  txId: string;
  signatures: { address: string; signature: string }[];
  requestId: string;
}): string {
  const payload = {
    x402Version: 2,
    scheme: params.scheme,
    network: params.network,
    payload: {
      txId: params.txId,
      signatures: params.signatures,
      requestId: params.requestId,
    },
  };
  return window.btoa(JSON.stringify(payload));
}

export interface PaymentResponse {
  success: boolean;
  transaction: string;
  amount: string;
  payer: string;
}

export function decodePaymentResponse(header: string | null): PaymentResponse | null {
  if (!header) return null;
  try {
    return JSON.parse(window.atob(header));
  } catch {
    return null;
  }
}
