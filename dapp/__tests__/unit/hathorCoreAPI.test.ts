import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HathorCoreAPI } from '@/lib/hathorCoreAPI'
import { mockFetch, createMockResponse, resetMockFetch } from '@/__mocks__/testUtils'

describe('HathorCoreAPI', () => {
  let api: HathorCoreAPI

  beforeEach(() => {
    resetMockFetch()
    api = new HathorCoreAPI('testnet')
  })

  describe('constructor', () => {
    it('should initialize with testnet URL', () => {
      const testnetApi = new HathorCoreAPI('testnet')
      expect(testnetApi).toBeInstanceOf(HathorCoreAPI)
    })

    it('should initialize with mainnet URL', () => {
      const mainnetApi = new HathorCoreAPI('mainnet')
      expect(mainnetApi).toBeInstanceOf(HathorCoreAPI)
    })
  })

  describe('getBlueprintInfo', () => {
    it('should fetch blueprint info successfully', async () => {
      const mockBlueprint = {
        id: 'test-blueprint-id',
        name: 'TestContract',
        attributes: {
          public_methods: ['deposit', 'withdraw'],
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockBlueprint))

      const result = await api.getBlueprintInfo('test-blueprint-id')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/nc_blueprint/test-blueprint-id')
      )
      expect(result).toEqual(mockBlueprint)
    })

    it('should throw error on failed request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, 404))

      await expect(api.getBlueprintInfo('invalid-id')).rejects.toThrow(
        'Failed to fetch blueprint info'
      )
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(api.getBlueprintInfo('test-id')).rejects.toThrow('Network error')
    })
  })

  describe('getContractState', () => {
    it('should fetch and parse contract state successfully', async () => {
      const mockResponse = {
        fields: {
          token_uid: { value: '00' },
          available_tokens: { value: 100000000n },
          total_liquidity_provided: { value: 100000000n },
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getContractState('contract-id')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/nano_contract/state?id=contract-id')
      )
      expect(result.token_uid).toBe('00')
      expect(result.available_tokens).toBe(100000000n)
      expect(result.total_liquidity_provided).toBe(100000000n)
    })

    it('should use default values when fields are missing', async () => {
      const mockResponse = {
        fields: {},
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getContractState('contract-id')

      expect(result.token_uid).toBe('00')
      expect(result.available_tokens).toBe(0n)
      expect(result.total_liquidity_provided).toBe(0n)
    })

    it('should fetch custom fields when provided', async () => {
      const mockResponse = {
        fields: {
          token_uid: { value: '00' },
          custom_field: { value: 42 },
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getContractState('contract-id', ['token_uid', 'custom_field'])

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('fields[]=token_uid')
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('fields[]=custom_field')
      )
      expect(result.custom_field).toBe(42)
    })

    it('should throw error on failed request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, 500))

      await expect(api.getContractState('contract-id')).rejects.toThrow(
        'Failed to fetch contract state'
      )
    })
  })

  describe('getContractHistory', () => {
    it('should fetch contract history successfully', async () => {
      const mockResponse = {
        history: [
          {
            hash: '0000000000000001',
            timestamp: Date.now() - 60000,
            nc_method: 'deposit',
            nc_address: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp',
            first_block: '0000000000000abc',
            is_voided: false,
            nc_args_decoded: { amount: 1000 },
            nc_events: [
              {
                type: 'Deposit',
                data: '{"user":"WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp","amount":1000}',
              },
            ],
          },
        ],
        has_more: false,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getContractHistory('contract-id', 50)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/nano_contract/history?id=contract-id&count=50')
      )
      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0].tx_id).toBe('0000000000000001')
      expect(result.transactions[0].nc_method).toBe('deposit')
      expect(result.hasMore).toBe(false)
    })

    it('should include pagination parameter when provided', async () => {
      const mockResponse = {
        history: [],
        has_more: true,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      await api.getContractHistory('contract-id', 50, 'after-tx-id')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('after=after-tx-id')
      )
    })

    it('should handle empty history', async () => {
      const mockResponse = {
        history: [],
        has_more: false,
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getContractHistory('contract-id')

      expect(result.transactions).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.hasMore).toBe(false)
    })

    it('should throw error on failed request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, 404))

      await expect(api.getContractHistory('invalid-id')).rejects.toThrow(
        'Failed to fetch contract history'
      )
    })
  })

  describe('getTransaction', () => {
    it('should fetch transaction successfully', async () => {
      const mockTx = {
        hash: '0000000000000001',
        timestamp: Date.now(),
        inputs: [],
        outputs: [],
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockTx))

      const result = await api.getTransaction('0000000000000001')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/transaction?id=0000000000000001')
      )
      expect(result.hash).toBe('0000000000000001')
    })

    it('should throw error on failed request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, 404))

      await expect(api.getTransaction('invalid-tx-id')).rejects.toThrow(
        'Failed to fetch transaction'
      )
    })
  })

  describe('callViewFunction', () => {
    it('should call view function without caller address', async () => {
      const mockResponse = {
        calls: {
          'get_balance()': {
            value: 1000,
          },
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.callViewFunction('contract-id', 'get_balance', [])

      const callUrl = mockFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('/nano_contract/state?')
      expect(callUrl).toContain('id=contract-id')
      expect(callUrl).toContain('get_balance')
      expect(result).toEqual(mockResponse)
    })

    it('should call view function with arguments', async () => {
      const mockResponse = {
        calls: {
          'get_address_balance("WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp")': {
            value: 5000,
          },
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.callViewFunction(
        'contract-id',
        'get_address_balance',
        ['WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp']
      )

      const callUrl = mockFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('get_address_balance')
      expect(callUrl).toContain('WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp')
      expect(result).toEqual(mockResponse)
    })

    it('should call view function with caller address', async () => {
      const mockResponse = {
        calls: {
          'calculate_max()': {
            value: 10000,
          },
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      await api.callViewFunction(
        'contract-id',
        'calculate_max',
        [],
        'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp'
      )

      expect(mockFetch).toHaveBeenCalled()
    })

    it('should throw error on failed request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, 500))

      await expect(
        api.callViewFunction('contract-id', 'invalid_method', [])
      ).rejects.toThrow('Failed to call view function')
    })
  })

  describe('getMaximumLiquidityRemoval', () => {
    it('should get maximum liquidity removal amount', async () => {
      const mockResponse = {
        calls: {
          'calculate_address_maximum_liquidity_removal("WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp")': {
            value: 10000,
          },
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getMaximumLiquidityRemoval(
        'contract-id',
        'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp'
      )

      expect(result).toBe(10000n)
    })

    it('should return 0n when no result is available', async () => {
      const mockResponse = {
        calls: {},
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getMaximumLiquidityRemoval(
        'contract-id',
        'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp'
      )

      expect(result).toBe(0n)
    })

    it('should handle undefined value', async () => {
      const mockResponse = {
        calls: {
          'calculate_address_maximum_liquidity_removal("WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp")': {
            value: undefined,
          },
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getMaximumLiquidityRemoval(
        'contract-id',
        'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp'
      )

      expect(result).toBe(0n)
    })
  })

  describe('getClaimableBalance', () => {
    it('should get claimable balance', async () => {
      const mockResponse = {
        calls: {
          'get_address_balance("WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp")': {
            value: 5000,
          },
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getClaimableBalance(
        'contract-id',
        'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp'
      )

      expect(result).toBe(5000n)
    })

    it('should return 0n when no balance is available', async () => {
      const mockResponse = {
        calls: {},
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getClaimableBalance(
        'contract-id',
        'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp'
      )

      expect(result).toBe(0n)
    })

    it('should handle string value conversion to bigint', async () => {
      const mockResponse = {
        calls: {
          'get_address_balance("WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp")': {
            value: '999999999999',
          },
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

      const result = await api.getClaimableBalance(
        'contract-id',
        'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp'
      )

      expect(result).toBe(999999999999n)
    })
  })
})
