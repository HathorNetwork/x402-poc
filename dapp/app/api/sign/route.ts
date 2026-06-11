import { NextRequest, NextResponse } from 'next/server';
import {
  assertWalletReady,
  getTransactionInputAddresses,
  signMessage,
  toErrorResponse,
} from '@/lib/server/headless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TX_ID_RE = /^[0-9a-f]{64}$/;
// x402 requestIds are base64url(claims).base64url(mac). Restricting the
// message shape stops this route being a general-purpose signing oracle.
const REQUEST_ID_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export async function POST(req: NextRequest) {
  let body: { txId?: string; requestId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { txId, requestId } = body;
  if (!txId || !TX_ID_RE.test(txId)) {
    return NextResponse.json({ error: 'invalid_tx_id' }, { status: 400 });
  }
  if (!requestId || requestId.length > 2048 || !REQUEST_ID_RE.test(requestId)) {
    return NextResponse.json({ error: 'invalid_request_id' }, { status: 400 });
  }

  try {
    await assertWalletReady();
    const addresses = await getTransactionInputAddresses(txId);
    const signatures = [];
    for (const address of addresses) {
      signatures.push(await signMessage(requestId, address));
    }
    return NextResponse.json({ signatures });
  } catch (err) {
    return toErrorResponse(err);
  }
}
