import { vi } from 'vitest'
import { SessionTypes, PairingTypes } from '@walletconnect/types'

export const mockAddress = 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp'

export const mockSession: SessionTypes.Struct = {
  topic: 'mock-session-topic',
  relay: { protocol: 'irn' },
  expiry: Math.floor(Date.now() / 1000) + 86400,
  acknowledged: true,
  controller: 'mock-controller',
  namespaces: {
    hathor: {
      accounts: [`hathor:testnet:${mockAddress}`],
      methods: [
        'htr_getAddress',
        'htr_getBalance',
        'htr_getUtxos',
        'htr_signWithAddress',
        'htr_sendNanoContractTx',
      ],
      events: [],
    },
  },
  requiredNamespaces: {},
  optionalNamespaces: {},
  pairingTopic: 'mock-pairing-topic',
  self: {
    publicKey: 'mock-public-key',
    metadata: {
      name: 'Mock dApp',
      description: 'Mock dApp',
      url: 'http://localhost:3000',
      icons: [],
    },
  },
  peer: {
    publicKey: 'mock-peer-public-key',
    metadata: {
      name: 'Mock Wallet',
      description: 'Mock Wallet',
      url: 'http://localhost',
      icons: [],
    },
  },
}

export const mockPairing: PairingTypes.Struct = {
  topic: 'mock-pairing-topic',
  relay: { protocol: 'irn' },
  peerMetadata: {
    name: 'Mock Wallet',
    description: 'Mock Wallet',
    url: 'http://localhost',
    icons: [],
  },
  expiry: Math.floor(Date.now() / 1000) + 86400,
  active: true,
}

export const createMockSignClient = () => {
  const eventHandlers: Record<string, Array<(...args: any[]) => void>> = {}

  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!eventHandlers[event]) {
        eventHandlers[event] = []
      }
      eventHandlers[event].push(handler)
    }),
    connect: vi.fn(async () => ({
      uri: 'wc:mock-uri',
      approval: async () => mockSession,
    })),
    disconnect: vi.fn(async () => {}),
    request: vi.fn(),
    pairing: {
      getAll: vi.fn(() => [mockPairing]),
    },
    session: {
      length: 1,
      keys: ['mock-session-topic'],
      get: vi.fn(() => mockSession),
    },
    emit: vi.fn((event: string, ...args: any[]) => {
      if (eventHandlers[event]) {
        eventHandlers[event].forEach(handler => handler(...args))
      }
    }),
  }
}

export const createMockWeb3Modal = () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
  subscribeModal: vi.fn((callback: (state: { open: boolean }) => void) => {
    return vi.fn()
  }),
})

// Mock the @walletconnect/sign-client module
export const mockWalletConnectSignClient = {
  default: vi.fn().mockImplementation(() => createMockSignClient()),
}

// Mock the @web3modal/standalone module
export const mockWeb3ModalStandalone = {
  Web3Modal: vi.fn().mockImplementation(() => createMockWeb3Modal()),
}

// Mock the @walletconnect/utils module
export const mockWalletConnectUtils = {
  getSdkError: vi.fn((errorKey: string) => ({
    code: 1000,
    message: errorKey,
  })),
}

// Helper to setup WalletConnect mocks in tests
export const setupWalletConnectMocks = () => {
  vi.mock('@walletconnect/sign-client', () => mockWalletConnectSignClient)
  vi.mock('@web3modal/standalone', () => mockWeb3ModalStandalone)
  vi.mock('@walletconnect/utils', () => mockWalletConnectUtils)
}

// Mock WalletConnect context value for testing
export const createMockWalletConnectContext = (overrides?: Partial<any>) => ({
  client: createMockSignClient(),
  session: mockSession,
  connect: vi.fn(),
  disconnect: vi.fn(),
  chains: ['hathor:testnet'],
  pairings: [mockPairing],
  accounts: [`hathor:testnet:${mockAddress}`],
  setChains: vi.fn(),
  getFirstAddress: vi.fn(() => mockAddress),
  isConnected: true,
  isInitializing: false,
  ...overrides,
})
