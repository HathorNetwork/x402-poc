import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { vi } from 'vitest'

// Mock fetch globally
export const mockFetch = vi.fn()
global.fetch = mockFetch

// Helper to create mock fetch responses
export const createMockResponse = (data: any, status: number = 200) => {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response)
}

// Helper to mock fetch with specific responses
export const setupMockFetch = (responses: Record<string, any>) => {
  mockFetch.mockImplementation(async (url: string) => {
    const urlStr = url.toString()

    // Check for blueprint endpoint
    if (urlStr.includes('/nc_blueprint/')) {
      return createMockResponse(responses.blueprint || {})
    }

    // Check for contract state endpoint
    if (urlStr.includes('/nano_contract/state')) {
      if (urlStr.includes('calls[]=')) {
        return createMockResponse(responses.viewFunction || { calls: {} })
      }
      return createMockResponse(responses.contractState || { fields: {} })
    }

    // Check for contract history endpoint
    if (urlStr.includes('/nano_contract/history')) {
      return createMockResponse(responses.contractHistory || { history: [], has_more: false })
    }

    // Check for transaction endpoint
    if (urlStr.includes('/transaction')) {
      return createMockResponse(responses.transaction || {})
    }

    // Default response
    return createMockResponse({})
  })
}

// Helper to reset fetch mock
export const resetMockFetch = () => {
  mockFetch.mockReset()
}

// Test wrapper with all providers
interface AllTheProvidersProps {
  children: React.ReactNode
}

export const AllTheProviders: React.FC<AllTheProvidersProps> = ({ children }) => {
  return <>{children}</>
}

// Custom render function that includes providers
export const renderWithProviders = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  return render(ui, { wrapper: AllTheProviders, ...options })
}

// Helper to wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0))

// Helper to create mock timers
export const setupMockTimers = () => {
  vi.useFakeTimers()
  return {
    advanceTime: (ms: number) => vi.advanceTimersByTime(ms),
    runAll: () => vi.runAllTimers(),
    cleanup: () => vi.useRealTimers(),
  }
}

// Helper to mock console methods
export const mockConsole = () => {
  const originalConsole = { ...console }

  const mocks = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  }

  return {
    ...mocks,
    restore: () => {
      Object.assign(console, originalConsole)
    },
  }
}

// Helper to create test addresses
export const createTestAddress = (suffix: string = '') => {
  return `WYBwT3xLpDnHNtYZiU52oanupVeDKhAvN${suffix || 'p'}`
}

// Helper to create test transaction hash
export const createTestTxHash = () => {
  return '00000000' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// Re-export everything from React Testing Library
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
