import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/server/env';
import {
  assertWalletReady,
  getNewAddress,
  sendTx,
  toErrorResponse,
} from '@/lib/server/headless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This endpoint dispenses treasury funds (5.00 hUSDC per allocation), so:
// - allocations are SERIALIZED through a module-level queue: concurrent first
//   visits must not race for the same fresh address or the same treasury UTXOs
//   (single-instance assumption — fine for one Next container);
// - a small in-memory per-IP rate limit caps abuse.
let allocationQueue: Promise<unknown> = Promise.resolve();
const allocationLog = new Map<string, number[]>();
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entries = (allocationLog.get(ip) || []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  allocationLog.set(ip, entries);
  if (entries.length >= RATE_LIMIT) return true;
  entries.push(now);
  return false;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'rate_limited', detail: 'Too many wallet allocations — try later' },
      { status: 429 }
    );
  }

  const work = allocationQueue.then(async () => {
    await assertWalletReady();
    const address = await getNewAddress();
    // Fund from the treasury; change MUST return to the treasury, otherwise it
    // lands on a fresh address and corrupts future allocations.
    const fundTxId = await sendTx({
      toAddress: address,
      amountAtomic: serverEnv.fundAmountAtomic,
      fromAddress: serverEnv.treasuryAddress,
      changeAddress: serverEnv.treasuryAddress,
    });
    return { address, fundTxId };
  });
  // Keep the queue alive even when this allocation fails.
  allocationQueue = work.catch(() => undefined);

  try {
    const { address, fundTxId } = await work;
    return NextResponse.json({
      address,
      fundTxId,
      balanceAtomic: serverEnv.fundAmountAtomic,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
