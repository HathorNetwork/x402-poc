import { Network, config } from './config';

// Tiny read-only fullnode client. We only need what the hathor-direct flow
// needs: fetch a transaction (to render the payment detail page) and check a
// token balance.

export class HathorCoreAPI {
  private baseUrl: string;

  constructor(network: Network) {
    this.baseUrl = config.hathorNodeUrls[network];
  }

  // GET /v1a/transaction?id=<hash> — returns { success, tx, meta: {voided_by, conflict_with, first_block, ...} }
  async getTransaction(txId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/transaction?id=${encodeURIComponent(txId)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch transaction: ${response.statusText}`);
    }
    return response.json();
  }

  async getTokenInfo(tokenUid: string): Promise<{ symbol: string; name: string } | null> {
    if (tokenUid === '00' || /^0+$/.test(tokenUid)) {
      return { symbol: 'HTR', name: 'Hathor' };
    }
    try {
      const response = await fetch(`${this.baseUrl}/thin_wallet/token?id=${encodeURIComponent(tokenUid)}`);
      if (!response.ok) return null;
      const data = await response.json();
      return {
        symbol: data.symbol || tokenUid.slice(0, 8),
        name: data.name || 'Unknown Token',
      };
    } catch {
      return null;
    }
  }
}
