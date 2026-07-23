import { describe, expect, it } from 'vitest'
import { dec } from './decimal'
import { formatEuro, formatGermanDecimal, parseGermanDecimal } from './parse'

function expectValue(input: string, expected: string) {
  const r = parseGermanDecimal(input)
  expect(r.ok, `expected "${input}" to parse`).toBe(true)
  if (r.ok) expect(r.value.toString()).toBe(expected)
}

function expectReject(input: string) {
  const r = parseGermanDecimal(input)
  expect(r.ok, `expected "${input}" to be rejected`).toBe(false)
}

describe('parseGermanDecimal', () => {
  it('accepts plain integers', () => {
    expectValue('0', '0')
    expectValue('42', '42')
    expectValue('12345', '12345')
  })

  it('accepts comma decimals', () => {
    expectValue('1234,56', '1234.56')
    expectValue('0,5', '0.5')
    expectValue('0,001', '0.001')
  })

  it('accepts correct thousands grouping', () => {
    expectValue('1.234', '1234')
    expectValue('1.234,56', '1234.56')
    expectValue('1.234.567', '1234567')
    expectValue('12.345,678', '12345.678')
    expectValue('123.456', '123456')
  })

  it('rejects ambiguous dot usage', () => {
    expectReject('1.23') // dot with 2-digit group: ambiguous
    expectReject('1.2345') // 4-digit group
    expectReject('12.34')
    expectReject('1.23.456') // wrong grouping
    expectReject('1234.567') // first group too long with separator
  })

  it('rejects malformed input', () => {
    expectReject('')
    expectReject('   ')
    expectReject('abc')
    expectReject('1,2,3')
    expectReject('1 234')
    expectReject(',5')
    expectReject('-,5')
    expectReject('1,')
    expectReject('.')
    expectReject('..')
    expectReject('1..234')
  })

  it('rejects negatives by default, accepts with option', () => {
    expectReject('-5')
    const r = parseGermanDecimal('-5,5', { allowNegative: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.toString()).toBe('-5.5')
  })

  it('trims surrounding whitespace', () => {
    expectValue(' 1.234,56 ', '1234.56')
  })
})

describe('formatGermanDecimal', () => {
  it('formats with grouping and comma', () => {
    expect(formatGermanDecimal(dec('1234.56'))).toBe('1.234,56')
    expect(formatGermanDecimal(dec('1234567.8'))).toBe('1.234.567,8')
    expect(formatGermanDecimal(dec('0.5'))).toBe('0,5')
    expect(formatGermanDecimal(dec('42'))).toBe('42')
    expect(formatGermanDecimal(dec('-1234.5'))).toBe('-1.234,5')
  })

  it('applies fixed decimal places', () => {
    expect(formatGermanDecimal(dec('1234.5'), 2)).toBe('1.234,50')
    expect(formatGermanDecimal(dec('1234.567'), 2)).toBe('1.234,57')
  })
})

describe('formatEuro', () => {
  it('formats money', () => {
    expect(formatEuro(dec('1234.5'))).toBe('1.234,50 €')
    expect(formatEuro(dec('-80.125'))).toBe('-80,13 €')
  })
})

describe('round trip', () => {
  it('parse(format(x)) === x', () => {
    for (const s of ['0', '1', '999', '1000', '1234.56', '123456.789']) {
      const formatted = formatGermanDecimal(dec(s))
      const parsed = parseGermanDecimal(formatted)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(parsed.value.toString()).toBe(s)
    }
  })
})
