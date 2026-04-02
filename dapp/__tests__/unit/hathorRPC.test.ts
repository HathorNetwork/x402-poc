import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { HathorRPCService } from '@/lib/hathorRPC'
import { createMockSignClient, mockSession } from '@/__mocks__/walletConnect'

describe('HathorRPCService', () => {
  describe('Mock Mode', () => {
    let rpcService: HathorRPCService

    beforeEach(() => {
      rpcService = new HathorRPCService(true)
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return mock network data', async () => {
      const networkPromise = rpcService.getConnectedNetwork()
      vi.advanceTimersByTime(500)
      const result = await networkPromise

      expect(result).toEqual({
        network: 'testnet',
        genesisHash: '0x123...',
      })
    })

    it('should return mock balance data', async () => {
      const balancePromise = rpcService.getBalance({ index: 0 })
      vi.advanceTimersByTime(500)
      const result = await balancePromise

      expect(result.response).toHaveLength(1)
      expect(result.response[0].token.symbol).toBe('HTR')
      expect(result.response[0].balance.unlocked).toBe(1250.5)
    })

    it('should return mock address', async () => {
      const addressPromise = rpcService.getAddress({ index: 0 })
      vi.advanceTimersByTime(500)
      const result = await addressPromise

      expect(result.address).toBe('WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp')
      expect(result.index).toBe(0)
    })

    it('should return mock transaction response', async () => {
      const txPromise = rpcService.sendNanoContractTx({
        address: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp',
        nc_id: 'contract-id',
        nc_blueprint_id: 'blueprint-id',
        nc_method: 'deposit',
        nc_args: ['32768'],
        nc_actions: []
      })
      vi.advanceTimersByTime(500)
      const result = await txPromise

      expect(result.hash).toMatch(/^00000000[a-z0-9]+/)
      expect(result.success).toBe(true)
      expect(result.timestamp).toBeDefined()
    })

    it('should throw error for unimplemented mock method', async () => {
      const unknownPromise = rpcService.request('htr_unknownMethod')
      vi.advanceTimersByTime(500)

      await expect(unknownPromise).rejects.toThrow('Mock not implemented for method')
    })

    it('should simulate network delay', async () => {
      const addressPromise = rpcService.getAddress({ index: 0 })

      // Advance time to simulate delay
      vi.advanceTimersByTime(500)
      const result = await addressPromise

      expect(result.address).toBe('WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp')
    })
  })

  describe('WalletConnect Mode', () => {
    let rpcService: HathorRPCService
    let mockClient: any

    beforeEach(() => {
      mockClient = createMockSignClient()
      // Pass 'testnet' as the network parameter
      rpcService = new HathorRPCService(false, mockClient, mockSession, undefined, 'testnet')
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should make request through WalletConnect client', async () => {
      mockClient.request.mockResolvedValueOnce({
        network: 'testnet',
        genesisHash: '0xreal',
      })

      const result = await rpcService.getConnectedNetwork()

      expect(mockClient.request).toHaveBeenCalledWith({
        chainId: 'hathor:testnet',
        topic: mockSession.topic,
        request: {
          method: 'htr_getConnectedNetwork',
          params: undefined,
        },
      })
      expect(result.network).toBe('testnet')
    })

    it('should pass parameters to WalletConnect request', async () => {
      mockClient.request.mockResolvedValueOnce({
        address: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp',
        index: 0,
        addressPath: "m/44'/280'/0'/0/0",
      })

      await rpcService.getAddress({ index: 0 })

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            method: 'htr_getAddress',
            params: { index: 0 },
          }),
        })
      )
    })

    it('should throw error when wallet not connected', async () => {
      const disconnectedRpcService = new HathorRPCService(false)

      await expect(disconnectedRpcService.getConnectedNetwork()).rejects.toThrow(
        'Wallet not connected'
      )
    })

    it('should handle WalletConnect request errors', async () => {
      mockClient.request.mockRejectedValueOnce(new Error('User rejected'))

      await expect(rpcService.getConnectedNetwork()).rejects.toThrow('User rejected')
    })

    it('should update client and session', () => {
      const newMockClient = createMockSignClient()
      const newMockSession = { ...mockSession, topic: 'new-topic' }

      rpcService.updateClientAndSession(newMockClient, newMockSession)

      expect(rpcService['client']).toBe(newMockClient)
      expect(rpcService['session']).toBe(newMockSession)
    })
  })

  describe('Custom Request Function Mode (MetaMask)', () => {
    let rpcService: HathorRPCService
    let customRequest: any

    beforeEach(() => {
      customRequest = vi.fn()
      rpcService = new HathorRPCService(false, undefined, undefined, customRequest)
    })

    it('should use custom request function when provided', async () => {
      customRequest.mockResolvedValueOnce({
        address: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp',
        index: 0,
      })

      const result = await rpcService.getAddress({ index: 0 })

      expect(customRequest).toHaveBeenCalledWith('htr_getAddress', { index: 0 })
      expect(result.address).toBe('WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp')
    })

    it('should handle custom request function errors', async () => {
      customRequest.mockRejectedValueOnce(new Error('MetaMask error'))

      await expect(rpcService.getBalance({ index: 0 })).rejects.toThrow('MetaMask error')
    })

    it('should prefer custom request over WalletConnect', async () => {
      const mockClient = createMockSignClient()
      rpcService = new HathorRPCService(false, mockClient, mockSession, customRequest)

      customRequest.mockResolvedValueOnce({ network: 'mainnet' })

      await rpcService.getConnectedNetwork()

      expect(customRequest).toHaveBeenCalled()
      expect(mockClient.request).not.toHaveBeenCalled()
    })

    it('should update custom request function', () => {
      const newCustomRequest = vi.fn()

      rpcService.updateClientAndSession(undefined, undefined, newCustomRequest)

      expect(rpcService['customRequest']).toBe(newCustomRequest)
    })
  })

  describe('sendNanoContractTx', () => {
    it('should send nano contract transaction with all parameters', async () => {
      const mockClient = createMockSignClient()
      // Pass 'testnet' as the network parameter
      const rpcService = new HathorRPCService(false, mockClient, mockSession, undefined, 'testnet')

      mockClient.request.mockResolvedValueOnce({
        hash: '0000000000000001',
        success: true,
      })

      const txParams = {
        address: 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp',
        nc_id: 'contract-id',
        nc_blueprint_id: 'blueprint-id',
        nc_method: 'deposit',
        nc_args: ['32768'],
        nc_actions: [
          {
            type: 'deposit',
            token: '00',
            amount: '1000',
          },
        ],
      }

      const result = await rpcService.sendNanoContractTx(txParams)

      expect(mockClient.request).toHaveBeenCalledWith({
        chainId: 'hathor:testnet',
        topic: mockSession.topic,
        request: {
          method: 'htr_sendNanoContractTx',
          params: txParams,
        },
      })
      expect(result.success).toBe(true)
    })
  })

  describe('Mode switching', () => {
    it('should respect useMock flag throughout lifecycle', async () => {
      const mockClient = createMockSignClient()
      const mockRpcService = new HathorRPCService(true, mockClient, mockSession)

      vi.useFakeTimers()
      const resultPromise = mockRpcService.getConnectedNetwork()
      vi.advanceTimersByTime(500)
      const result = await resultPromise
      vi.useRealTimers()

      expect(result.genesisHash).toBe('0x123...') // Mock value
      expect(mockClient.request).not.toHaveBeenCalled()
    })

    it('should switch from mock to real mode', async () => {
      const mockClient = createMockSignClient()
      mockClient.request.mockResolvedValueOnce({
        network: 'testnet',
        genesisHash: '0xreal',
      })

      const rpcService = new HathorRPCService(false, mockClient, mockSession, undefined, 'testnet')
      const result = await rpcService.getConnectedNetwork()

      expect(result.genesisHash).toBe('0xreal')
      expect(mockClient.request).toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    let mockClient: any
    let rpcService: HathorRPCService

    beforeEach(() => {
      mockClient = createMockSignClient()
      rpcService = new HathorRPCService(false, mockClient, mockSession, undefined, 'testnet')
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should handle errors with messages', async () => {
      mockClient.request.mockRejectedValueOnce({
        message: 'Specific error message',
      })

      await expect(rpcService.getConnectedNetwork()).rejects.toThrow(
        'Specific error message'
      )
    })

    it('should handle errors without messages', async () => {
      mockClient.request.mockRejectedValueOnce({})

      await expect(rpcService.getConnectedNetwork()).rejects.toThrow(
        'RPC request failed'
      )
    })

    it('should handle custom request errors with messages', async () => {
      const customRequest = vi.fn()
      const rpcService = new HathorRPCService(false, undefined, undefined, customRequest)

      customRequest.mockRejectedValueOnce({
        message: 'Custom error',
      })

      await expect(rpcService.getConnectedNetwork()).rejects.toThrow('Custom error')
    })
  })
})
