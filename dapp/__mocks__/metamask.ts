import { vi } from 'vitest'

export const mockAddress = 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp'
export const SNAP_ID = 'npm:@hathor/snap'

// Mock balance response
export const mockBalanceResponse = {
  response: [
    {
      token: { id: '00', name: 'Hathor', symbol: 'HTR' },
      balance: { unlocked: 1250.5, locked: 0 },
      transactions: 42,
    },
    {
      token: { id: '01', name: 'USD Coin', symbol: 'USDC' },
      balance: { unlocked: 500.0, locked: 0 },
      transactions: 15,
    },
  ],
}

// Mock network response
export const mockNetworkResponse = {
  network: 'testnet',
  genesisHash: '000000000000000000000000000000000000000000000000000000000000test',
}

// Mock wallet information response
export const mockWalletInfoResponse = {
  address0: mockAddress,
  network: 'testnet',
}

// Mock transaction response
export const mockTxResponse = {
  hash: '0000000000000000' + Math.random().toString(36).substring(2, 15),
  success: true,
}

// Create mock Ethereum provider (window.ethereum)
export const createMockEthereum = () => {
  const eventHandlers: Record<string, Array<(...args: any[]) => void>> = {}

  return {
    isMetaMask: true,
    request: vi.fn(async ({ method, params }: { method: string; params?: any }) => {
      switch (method) {
        case 'wallet_requestSnaps':
          return {
            [SNAP_ID]: {
              id: SNAP_ID,
              version: '1.0.0',
              enabled: true,
            },
          }

        case 'wallet_getSnaps':
          return {
            [SNAP_ID]: {
              id: SNAP_ID,
              version: '1.0.0',
              enabled: true,
            },
          }

        case 'wallet_invokeSnap':
          const snapMethod = params?.request?.method
          const snapParams = params?.request?.params

          switch (snapMethod) {
            case 'htr_getAddress':
              return { address: mockAddress, index: snapParams?.index || 0 }

            case 'htr_getBalance':
              return mockBalanceResponse

            case 'htr_getConnectedNetwork':
              return mockNetworkResponse

            case 'htr_getWalletInformation':
              return mockWalletInfoResponse

            case 'htr_sendNanoContractTx':
              return mockTxResponse

            case 'htr_changeNetwork':
              return {
                network: snapParams?.newNetwork || 'testnet',
                success: true,
              }

            default:
              return { success: false, error: `Unknown snap method: ${snapMethod}` }
          }

        default:
          return { success: false, error: `Unknown Ethereum method: ${method}` }
      }
    }),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!eventHandlers[event]) {
        eventHandlers[event] = []
      }
      eventHandlers[event].push(handler)
    }),
    removeListener: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (eventHandlers[event]) {
        eventHandlers[event] = eventHandlers[event].filter(h => h !== handler)
      }
    }),
    emit: vi.fn((event: string, ...args: any[]) => {
      if (eventHandlers[event]) {
        eventHandlers[event].forEach(handler => handler(...args))
      }
    }),
  }
}

// Setup MetaMask global mock
export const setupMetaMaskMock = () => {
  const mockEthereum = createMockEthereum()

  Object.defineProperty(window, 'ethereum', {
    writable: true,
    configurable: true,
    value: mockEthereum,
  })

  return mockEthereum
}

// Remove MetaMask mock
export const cleanupMetaMaskMock = () => {
  delete (window as any).ethereum
}

// Mock MetaMask context value for testing
export const createMockMetaMaskContext = (overrides?: Partial<any>) => ({
  address: mockAddress,
  walletNetwork: 'testnet',
  isConnected: true,
  isInstalled: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
  request: vi.fn(async (method: string, params?: any) => {
    const mockEthereum = createMockEthereum()
    return mockEthereum.request({
      method: 'wallet_invokeSnap',
      params: {
        snapId: SNAP_ID,
        request: { method, params },
      },
    })
  }),
  ...overrides,
})

// Helper to test snap not installed scenario
export const createMockEthereumWithoutSnap = () => {
  const mockEthereum = createMockEthereum()

  mockEthereum.request = vi.fn(async ({ method }: { method: string; params?: any }) => {
    if (method === 'wallet_requestSnaps') {
      throw new Error('User rejected snap installation')
    }
    throw new Error('Snap not installed')
  })

  return mockEthereum
}

// Helper to test MetaMask not installed scenario
export const createMockWindowWithoutMetaMask = () => {
  Object.defineProperty(window, 'ethereum', {
    writable: true,
    configurable: true,
    value: undefined,
  })
}
