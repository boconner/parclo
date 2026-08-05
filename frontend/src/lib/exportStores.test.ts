import { describe, it, expect } from 'vitest'
import { cleanStoreName, cityFromAddress, computedStoreName, storeExportName } from './exportStores'

// ─── cleanStoreName ────────────────────────────────────────────────────────────

describe('cleanStoreName', () => {
  it('strips an abbreviation prefix and trailing "Store"', () => {
    expect(cleanStoreName('VV-Addison Store', 'Vine Valley')).toBe('Addison')
  })

  it('strips the full chain name used as a prefix', () => {
    expect(cleanStoreName('Vine Valley - Uptown', 'Vine Valley')).toBe('Uptown')
  })

  it('prefers the full chain name over its initials (no over-stripping)', () => {
    // Must remove "Vine Valley - ", not just a leading "V".
    expect(cleanStoreName('Vine Valley - Bishop Arts', 'Vine Valley')).toBe('Bishop Arts')
  })

  it('falls back to a short alpha+dash prefix when the chain name does not match', () => {
    expect(cleanStoreName('LD - Arlington', null)).toBe('Arlington')
    expect(cleanStoreName('LD - Arlington', 'Lone Star Distributing')).toBe('Arlington')
  })

  it('is case-insensitive about the prefix and trailing word', () => {
    expect(cleanStoreName('vv-addison store', 'Vine Valley')).toBe('addison')
  })

  it('leaves a clean independent name untouched', () => {
    expect(cleanStoreName("Joe's Bottle Shop", null)).toBe("Joe's Bottle Shop")
  })

  it('does not chop a name that merely starts with the chain initial', () => {
    expect(cleanStoreName('Vineyard Fine Wines', 'Vine Valley')).toBe('Vineyard Fine Wines')
  })
})

// ─── cityFromAddress ───────────────────────────────────────────────────────────

describe('cityFromAddress', () => {
  it('pulls the city from a standard address', () => {
    expect(cityFromAddress('123 Main St, Addison, TX 75001')).toBe('Addison')
  })

  it('handles a multi-word city', () => {
    expect(cityFromAddress('500 Broadway, San Antonio, TX 78205')).toBe('San Antonio')
  })

  it('handles ZIP+4', () => {
    expect(cityFromAddress('1 Oak Ave, Dallas, TX 75201-1234')).toBe('Dallas')
  })

  it('handles a city-only address with no street', () => {
    expect(cityFromAddress('Addison, TX 75001')).toBe('Addison')
  })

  it('returns empty when there is no "ST Zip" tail to anchor on', () => {
    expect(cityFromAddress('Behind the gas station')).toBe('')
  })

  it('returns empty for a null/empty address', () => {
    expect(cityFromAddress(null)).toBe('')
    expect(cityFromAddress('')).toBe('')
  })
})

// ─── computedStoreName ─────────────────────────────────────────────────────────

describe('computedStoreName', () => {
  it('chain store → city from address', () => {
    expect(computedStoreName({
      chainName: 'Vine Valley', name: 'VV-Addison Store', address: '1 Main St, Addison, TX 75001',
    })).toBe('Addison')
  })

  it('chain store with no usable address → cleaned name', () => {
    expect(computedStoreName({
      chainName: 'Vine Valley', name: 'VV-Addison Store', address: null,
    })).toBe('Addison')
  })

  it('independent store → actual name, verbatim', () => {
    expect(computedStoreName({
      chainName: null, name: "Joe's Bottle Shop", address: '9 Oak Ave, Dallas, TX 75201',
    })).toBe("Joe's Bottle Shop")
  })
})

// ─── storeExportName ───────────────────────────────────────────────────────────

describe('storeExportName', () => {
  it('prefers an explicit display name over the computed name', () => {
    expect(storeExportName({
      displayName: 'Addison (North)', chainName: 'Vine Valley',
      name: 'VV-Addison Store', address: '1 Main St, Addison, TX 75001',
    })).toBe('Addison (North)')
  })

  it('falls back to the computed name when display name is blank/whitespace', () => {
    expect(storeExportName({
      displayName: '   ', chainName: 'Vine Valley',
      name: 'VV-Addison Store', address: '1 Main St, Addison, TX 75001',
    })).toBe('Addison')
  })

  it('falls back to the computed name when display name is null', () => {
    expect(storeExportName({
      displayName: null, chainName: null, name: "Joe's Bottle Shop", address: null,
    })).toBe("Joe's Bottle Shop")
  })
})
