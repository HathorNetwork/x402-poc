import { NextRequest, NextResponse } from 'next/server';
import {
  HATHOR_ADDRESS_RE,
  assertWalletReady,
  getAddressBalance,
  toErrorResponse,
} from '@/lib/server/headless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address') || '';
  if (!HATHOR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'invalid_address' }, { status: 400 });
  }
  try {
    // Returning visitors hit this route first on page load, so it must also
    // go through the ready check — it triggers the wallet auto-start and maps
    // a not-started wallet to 503 wallet_loading (which the client polls),
    // instead of surfacing a fatal-looking headless error.
    await assertWalletReady();
    const balanceAtomic = await getAddressBalance(address);
    return NextResponse.json({ address, balanceAtomic });
  } catch (err) {
    return toErrorResponse(err);
  }
}
