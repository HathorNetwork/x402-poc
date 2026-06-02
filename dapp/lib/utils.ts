export function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(' ')
}

export const TOKENS = [
  { value: 'HTR', label: 'HTR' },
];

export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatNumber(num: number, decimals: number = 2): string {
  return num.toFixed(decimals);
}

export function formatTokenAmount(amount: bigint | number, decimals: number = 2): string {
  if (typeof amount === 'bigint') {
    // Convert BigInt to string to avoid precision loss with large numbers
    const amountStr = amount.toString();

    // Pad with zeros if needed (for values less than 100)
    const paddedStr = amountStr.padStart(decimals + 1, '0');

    // Insert decimal point
    const decimalPosition = paddedStr.length - decimals;
    const integerPart = paddedStr.slice(0, decimalPosition);
    const decimalPart = paddedStr.slice(decimalPosition);

    return `${integerPart}.${decimalPart}`;
  }
  return (amount / 100).toFixed(decimals);
}

export function formatBalance(balance: bigint | number, decimals: number = 2): string {
  if (typeof balance === 'bigint') {
    // Convert BigInt to string to avoid precision loss with large numbers
    const balanceStr = balance.toString();

    // Pad with zeros if needed (for values less than 100)
    const paddedStr = balanceStr.padStart(decimals + 1, '0');

    // Insert decimal point
    const decimalPosition = paddedStr.length - decimals;
    const integerPart = paddedStr.slice(0, decimalPosition);
    const decimalPart = paddedStr.slice(decimalPosition);

    return `${integerPart}.${decimalPart}`;
  }
  return (balance / 100).toFixed(decimals);
}

export function formatBalanceWithCommas(balance: bigint | number, decimals: number = 2): string {
  const formatted = formatBalance(balance, decimals);
  const [integerPart, decimalPart] = formatted.split('.');

  // Add thousand separators
  const withCommas = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return decimalPart ? `${withCommas}.${decimalPart}` : withCommas;
}
