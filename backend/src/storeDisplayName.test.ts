import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanStoreName, cityFromAddress, resolveDisplayName } from './storeDisplayName.js'

// ─── cleanStoreName ─────────────────────────────────────────────────────────

test('cleanStoreName strips an abbreviation prefix and trailing "Store"', () => {
  assert.equal(cleanStoreName('VV-Addison Store', 'Vine Valley'), 'Addison')
})

test('cleanStoreName strips the full chain name used as a prefix', () => {
  assert.equal(cleanStoreName('Vine Valley - Uptown', 'Vine Valley'), 'Uptown')
})

test('cleanStoreName falls back to a short alpha+dash prefix', () => {
  assert.equal(cleanStoreName('LD - Arlington', null), 'Arlington')
})

// ─── cityFromAddress ────────────────────────────────────────────────────────

test('cityFromAddress pulls the city from a standard address', () => {
  assert.equal(cityFromAddress('123 Main St, Addison, TX 75001'), 'Addison')
})

test('cityFromAddress handles a multi-word city', () => {
  assert.equal(cityFromAddress('500 Broadway, San Antonio, TX 78205'), 'San Antonio')
})

test('cityFromAddress returns empty without a "ST Zip" tail', () => {
  assert.equal(cityFromAddress('Behind the gas station'), '')
})

// ─── resolveDisplayName ─────────────────────────────────────────────────────

test('resolveDisplayName prefers an explicit display name', () => {
  assert.equal(resolveDisplayName({
    displayName: 'Addison (North)', chainName: 'Vine Valley',
    name: 'VV-Addison Store', address: '1 Main St, Addison, TX 75001',
  }), 'Addison (North)')
})

test('resolveDisplayName: chain store falls back to the city', () => {
  assert.equal(resolveDisplayName({
    displayName: null, chainName: 'Vine Valley',
    name: 'VV-Addison Store', address: '1 Main St, Addison, TX 75001',
  }), 'Addison')
})

test('resolveDisplayName: independent store falls back to its actual name', () => {
  assert.equal(resolveDisplayName({
    displayName: null, chainName: null, name: "Joe's Bottle Shop", address: null,
  }), "Joe's Bottle Shop")
})
