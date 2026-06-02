'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Network } from '@/lib/config';

interface NetworkSelectorProps {
  value: Network;
  onChange: (network: Network) => void;
}

export function NetworkSelector({ value, onChange }: NetworkSelectorProps) {
  const handleChange = (value: string) => {
    onChange(value as Network);
  };

  const networkLabels: Record<string, string> = {
    privatenet: 'Privatenet',
    testnet: 'Testnet',
    mainnet: 'Mainnet',
  };

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="w-full md:w-[108px]">
        <SelectValue placeholder="Select network" labels={networkLabels} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="privatenet">Privatenet</SelectItem>
        <SelectItem value="mainnet">Mainnet</SelectItem>
        <SelectItem value="testnet">Testnet</SelectItem>
      </SelectContent>
    </Select>
  );
}
