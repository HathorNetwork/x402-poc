import { NextResponse } from 'next/server';
import { getWalletState } from '@/lib/server/headless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { state, detail } = await getWalletState();
  return NextResponse.json({ state, detail });
}
