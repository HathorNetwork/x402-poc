'use client';

import { useHathor } from '@/contexts/HathorContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TokenSelectorProps {
  selectedToken: string;
  onTokenChange: (token: string) => void;
}

export default function TokenSelector({ selectedToken, onTokenChange }: TokenSelectorProps) {
  const { contractStates } = useHathor();

  // Get available tokens from contract states
  const availableTokens = Object.keys(contractStates);
  const isDisabled = availableTokens.length === 0;

  return (
    <Select value={selectedToken} onValueChange={onTokenChange} disabled={isDisabled}>
      <SelectTrigger className="w-full md:w-[85px]">
        <SelectValue placeholder="Select token" />
      </SelectTrigger>
      <SelectContent>
        {availableTokens.map((token) => (
          <SelectItem key={token} value={token}>
            {token}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
