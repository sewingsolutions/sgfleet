import { fmt } from '../src/lib/format'

describe('fmt', () => {
  test('null and undefined return "0"', () => {
    expect(fmt(null)).toBe('0')
    expect(fmt(undefined)).toBe('0')
  })

  test('0 returns "0"', () => {
    expect(fmt(0)).toBe('0')
  })

  test('small integers render as toLocaleString', () => {
    expect(fmt(42)).toBe('42')
  })

  test('1234 renders as "1.2k"', () => {
    expect(fmt(1234)).toBe('1.2k')
  })

  test('exact thousand boundary renders as "1k"', () => {
    expect(fmt(1000)).toBe('1k')
  })

  test('1_500_000 renders as "1.5M"', () => {
    expect(fmt(1_500_000)).toBe('1.5M')
  })

  test('exact million boundary renders as "1M"', () => {
    expect(fmt(1_000_000)).toBe('1M')
  })

  test('negative numbers', () => {
    expect(fmt(-42)).toBe('-42')
    expect(fmt(-1500)).toBe('-1.5k')
  })

  test('large decimals', () => {
    expect(fmt(1234567.89)).toBe('1.2M')
  })
})
