import { describe, it, expect } from 'vitest'
import {
  cn,
  formatAddress,
  formatNumber,
  formatTokenAmount,
  formatBalance,
  formatBalanceWithCommas,
} from '@/lib/utils'

describe('utils', () => {
  describe('cn - className utility', () => {
    it('should join valid class names', () => {
      expect(cn('class1', 'class2', 'class3')).toBe('class1 class2 class3')
    })

    it('should filter out falsy values', () => {
      expect(cn('class1', undefined, 'class2', null, false, 'class3')).toBe('class1 class2 class3')
    })

    it('should return empty string for all falsy inputs', () => {
      expect(cn(undefined, null, false)).toBe('')
    })

    it('should handle empty input', () => {
      expect(cn()).toBe('')
    })
  })

  describe('formatAddress', () => {
    it('should format a standard Hathor address', () => {
      const address = 'WYBwT3xLpDnHNtYZiU52oanupVeDKhAvNp'
      const formatted = formatAddress(address)
      expect(formatted).toBe('WYBwT3...AvNp')
    })

    it('should handle shorter addresses', () => {
      const address = 'WYBwT3xLp'
      const formatted = formatAddress(address)
      expect(formatted).toBe('WYBwT3...3xLp')
    })

    it('should handle empty string', () => {
      expect(formatAddress('')).toBe('')
    })

    it('should preserve format for very short addresses', () => {
      const address = 'ABCD'
      const formatted = formatAddress(address)
      expect(formatted).toBe('ABCD...ABCD')
    })
  })

  describe('formatNumber', () => {
    it('should format number with default 2 decimals', () => {
      expect(formatNumber(123.456)).toBe('123.46')
    })

    it('should format number with custom decimals', () => {
      expect(formatNumber(123.456, 3)).toBe('123.456')
      expect(formatNumber(123.456, 1)).toBe('123.5')
      expect(formatNumber(123.456, 0)).toBe('123')
    })

    it('should handle integers', () => {
      expect(formatNumber(123)).toBe('123.00')
    })

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0.00')
    })

    it('should handle negative numbers', () => {
      expect(formatNumber(-123.456)).toBe('-123.46')
    })
  })

  describe('formatTokenAmount', () => {
    it('should format bigint amount correctly (100 = 1.00)', () => {
      expect(formatTokenAmount(100n)).toBe('1.00')
    })

    it('should format bigint amount with large value', () => {
      expect(formatTokenAmount(123456n)).toBe('1234.56')
    })

    it('should format bigint amount with small value', () => {
      expect(formatTokenAmount(50n)).toBe('0.50')
    })

    it('should format bigint amount with very small value', () => {
      expect(formatTokenAmount(5n)).toBe('0.05')
    })

    it('should format bigint amount with 1 unit', () => {
      expect(formatTokenAmount(1n)).toBe('0.01')
    })

    it('should format bigint zero', () => {
      expect(formatTokenAmount(0n)).toBe('0.00')
    })

    it('should format number amount correctly', () => {
      expect(formatTokenAmount(100)).toBe('1.00')
      expect(formatTokenAmount(12345)).toBe('123.45')
    })

    it('should handle large bigint amounts', () => {
      expect(formatTokenAmount(100000000n)).toBe('1000000.00')
    })

    it('should pad with zeros for amounts less than 100', () => {
      expect(formatTokenAmount(99n)).toBe('0.99')
      expect(formatTokenAmount(10n)).toBe('0.10')
      expect(formatTokenAmount(1n)).toBe('0.01')
    })
  })

  describe('formatBalance', () => {
    it('should format bigint balance correctly (100 = 1.00)', () => {
      expect(formatBalance(100n)).toBe('1.00')
    })

    it('should format bigint balance with large value', () => {
      expect(formatBalance(125050n)).toBe('1250.50')
    })

    it('should format bigint balance with small value', () => {
      expect(formatBalance(50n)).toBe('0.50')
    })

    it('should format bigint zero balance', () => {
      expect(formatBalance(0n)).toBe('0.00')
    })

    it('should format number balance correctly', () => {
      expect(formatBalance(100)).toBe('1.00')
      expect(formatBalance(125050)).toBe('1250.50')
    })

    it('should handle large balances', () => {
      expect(formatBalance(10000000000n)).toBe('100000000.00')
    })

    it('should pad with zeros for small amounts', () => {
      expect(formatBalance(5n)).toBe('0.05')
      expect(formatBalance(1n)).toBe('0.01')
    })
  })

  describe('formatBalanceWithCommas', () => {
    it('should format balance with thousand separators', () => {
      expect(formatBalanceWithCommas(123456789n)).toBe('1,234,567.89')
    })

    it('should format small balance without commas', () => {
      expect(formatBalanceWithCommas(12345n)).toBe('123.45')
    })

    it('should format large balance with multiple commas', () => {
      expect(formatBalanceWithCommas(123456789012n)).toBe('1,234,567,890.12')
    })

    it('should handle zero', () => {
      expect(formatBalanceWithCommas(0n)).toBe('0.00')
    })

    it('should handle numbers', () => {
      expect(formatBalanceWithCommas(123456789)).toBe('1,234,567.89')
    })
  })
})
