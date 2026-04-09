'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContractState } from '@/types/hathor';
import { formatTokenAmount, formatNumber } from '@/lib/utils';

interface ContractInfoPanelProps {
  contractState: ContractState | null;
  loading?: boolean;
  token?: string;
  title?: string;
  description?: string;
}

export function ContractInfoPanel({
  contractState,
  loading,
  token = 'HTR',
  title = 'Contract Information',
  description = 'Current state of the nano contract'
}: ContractInfoPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">&#x2139;&#xFE0F;</span>
            {title}
          </CardTitle>
          <CardDescription>Loading contract state...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!contractState) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">&#x2139;&#xFE0F;</span>
            {title}
          </CardTitle>
          <CardDescription>No contract data available. Configure contract IDs in your environment variables.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-xl">&#x2139;&#xFE0F;</span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-400">Available Tokens</p>
            <p className="text-lg font-semibold">{formatTokenAmount(contractState.available_tokens)} {token}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Total Liquidity</p>
            <p className="text-lg font-semibold">{formatTokenAmount(contractState.total_liquidity_provided)} {token}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Token UID</p>
            <p className="text-sm font-mono truncate" title={contractState.token_uid}>{contractState.token_uid}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
