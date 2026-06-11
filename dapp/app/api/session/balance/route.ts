import { NextRequest, NextResponse } from 'next/server';
import {
  HATHOR_ADDRESS_RE,
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
    const balanceAtomic = await getAddressBalance(address);
    return NextResponse.json({ address, balanceAtomic });
  } catch (err) {
    return toErrorResponse(err);
  }
}
