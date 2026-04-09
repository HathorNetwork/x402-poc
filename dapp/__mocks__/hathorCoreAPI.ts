import { vi } from 'vitest'
import { ContractState, BlueprintInfo, ContractHistory } from '@/types/hathor'
import { Network } from '@/lib/config'

export const mockBlueprintInfo: BlueprintInfo = {
  id: 'test-blueprint-id',
  name: 'TestContract',
  attributes: {
    public_methods: ['deposit', 'withdraw', 'get_balance'],
  },
}

export const mockContractStates: Record<string, ContractState> = {
  'contract-htr': {
    token_uid: '00',
    available_tokens: 100000000n,
    total_liquidity_provided: 100000000n,
  },
  'contract-usdc': {
    token_uid: '01',
    available_tokens: 50000000n,
    total_liquidity_provided: 50000000n,
  },
}

export const mockTransactions = [
  {
    tx_id: '0000000000000001',
    timestamp: Date.now() - 60000,
    nc_method: 'deposit',
    nc_caller: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp',
    first_block: '0000000000000abc',
    is_voided: false,
    nc_args_decoded: {
      amount: 1000,
    },
    nc_events: [
      {
        type: 'Deposit',
        data: '{"user":"WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp","amount":1000}',
      },
    ],
  },
  {
    tx_id: '0000000000000002',
    timestamp: Date.now() - 120000,
    nc_method: 'withdraw',
    nc_caller: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp',
    first_block: '0000000000000abd',
    is_voided: false,
    nc_args_decoded: {
      amount: 500,
    },
    nc_events: [
      {
        type: 'Withdrawal',
        data: '{"user":"WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp","amount":500}',
      },
    ],
  },
]

export const mockContractHistory: ContractHistory = {
  transactions: mockTransactions,
  total: mockTransactions.length,
  hasMore: false,
}

export class MockHathorCoreAPI {
  private baseUrl: string
  public network: Network

  constructor(network: Network) {
    this.network = network
    this.baseUrl = `https://mock-${network}.hathor.network/v1a`
  }

  async getBlueprintInfo(blueprintId: string): Promise<BlueprintInfo> {
    return mockBlueprintInfo
  }

  async getContractState(contractId: string): Promise<ContractState> {
    return mockContractStates[contractId] || mockContractStates['contract-htr']
  }

  async getContractHistory(
    contractId: string,
    limit: number = 50,
    after?: string
  ): Promise<ContractHistory> {
    // Simulate pagination
    const allTransactions = mockTransactions
    const startIndex = after ? allTransactions.findIndex(tx => tx.tx_id === after) + 1 : 0
    const transactions = allTransactions.slice(startIndex, startIndex + limit)

    return {
      transactions,
      total: transactions.length,
      hasMore: startIndex + limit < allTransactions.length,
    }
  }

  async getTransaction(txId: string): Promise<any> {
    const tx = mockTransactions.find(t => t.tx_id === txId)
    if (!tx) {
      throw new Error(`Transaction not found: ${txId}`)
    }
    return tx
  }

  async callViewFunction(
    contractId: string,
    method: string,
    args: any[] = [],
    callerAddress?: string
  ): Promise<any> {
    const callKey = `${method}(${args.map(arg => JSON.stringify(arg)).join(', ')})`

    // Mock different view function responses
    if (method === 'get_address_balance') {
      return {
        calls: {
          [callKey]: {
            value: 5000,
          },
        },
      }
    }

    if (method === 'get_balance') {
      return {
        calls: {
          [callKey]: {
            value: 10000,
          },
        },
      }
    }

    return {
      calls: {
        [callKey]: {
          value: 0,
        },
      },
    }
  }

  async getClaimableBalance(contractId: string, callerAddress: string): Promise<bigint> {
    const result = await this.callViewFunction(contractId, 'get_address_balance', [callerAddress], callerAddress)
    const callKey = Object.keys(result.calls)[0]
    if (callKey && result.calls[callKey]?.value !== undefined) {
      return BigInt(result.calls[callKey].value)
    }
    return 0n
  }
}

// Create mock instance
export const createMockHathorCoreAPI = (network: Network = 'testnet') => {
  return new MockHathorCoreAPI(network)
}

// Vitest mock factory
export const mockHathorCoreAPIFactory = () => {
  const mockInstance = createMockHathorCoreAPI()

  return {
    HathorCoreAPI: vi.fn().mockImplementation((network: Network) => {
      const instance = createMockHathorCoreAPI(network)
      return {
        getBlueprintInfo: vi.fn().mockImplementation(instance.getBlueprintInfo.bind(instance)),
        getContractState: vi.fn().mockImplementation(instance.getContractState.bind(instance)),
        getContractHistory: vi.fn().mockImplementation(instance.getContractHistory.bind(instance)),
        getTransaction: vi.fn().mockImplementation(instance.getTransaction.bind(instance)),
        callViewFunction: vi.fn().mockImplementation(instance.callViewFunction.bind(instance)),
        getClaimableBalance: vi.fn().mockImplementation(instance.getClaimableBalance.bind(instance)),
      }
    }),
  }
}
