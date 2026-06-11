import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/server/env';
import {
  HATHOR_ADDRESS_RE,
  assertWalletReady,
  sendTx,
  toErrorResponse,
} from '@/lib/server/headless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hard server-side cap on a single payment (1.00 hUSDC) — well above any demo
// price, well below a user's 5.00 allocation.
const MAX_PAYMENT_ATOMIC = 100;

export async function POST(req: NextRequest) {
  let body: {
    userAddress?: string;
    payTo?: string;
    amountAtomic?: number;
    token?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { userAddress, payTo, amountAtomic, token } = body;
  if (!userAddress || !HATHOR_ADDRESS_RE.test(userAddress)) {
    return NextResponse.json({ error: 'invalid_user_address' }, { status: 400 });
  }
  if (!payTo || !HATHOR_ADDRESS_RE.test(payTo)) {
    return NextResponse.json({ error: 'invalid_pay_to' }, { status: 400 });
  }
  if (token !== serverEnv.tokenUid) {
    return NextResponse.json({ error: 'unsupported_token' }, { status: 400 });
  }
  if (
    !Number.isInteger(amountAtomic) ||
    amountAtomic! < 1 ||
    amountAtomic! > MAX_PAYMENT_ATOMIC
  ) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 });
  }
  // Nobody spends the treasury through the pay proxy — only per-user addresses.
  if (userAddress === serverEnv.treasuryAddress) {
    return NextResponse.json({ error: 'forbidden_address' }, { status: 403 });
  }

  try {
    await assertWalletReady();
    const txId = await sendTx({
      toAddress: payTo,
      amountAtomic: amountAtomic!,
      fromAddress: userAddress,
      changeAddress: userAddress,
    });
    return NextResponse.json({ txId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
