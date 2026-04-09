'use client';

const STATUS_STYLES: Record<string, string> = {
  LOCKED: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  RELEASED: 'bg-green-500/20 text-green-400 border-green-500/30',
  REFUNDED: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export function EscrowStatusBadge({ phase }: { phase: string }) {
  const style = STATUS_STYLES[phase] || STATUS_STYLES.LOCKED;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      {phase}
    </span>
  );
}
