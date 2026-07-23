import { describe, expect, it } from 'vitest'
import { computeConsumption, totalUsage } from './consumption'
import type { Reading } from './types'

function r(id: string, date: string, value: string, isBaseline = false): Reading {
  return { id, meterId: 'm1', date, value, isBaseline }
}

describe('computeConsumption', () => {
  it('first reading is baseline, no consumption', () => {
    const { intervals, anomalies } = computeConsumption([r('a', '2026-01-01', '1000')])
    expect(intervals).toHaveLength(0)
    expect(anomalies).toHaveLength(0)
  })

  it('computes interval consumption between readings', () => {
    const { intervals } = computeConsumption([
      r('a', '2026-01-01', '1000'),
      r('b', '2026-01-31', '1150.5'),
    ])
    expect(intervals).toHaveLength(1)
    expect(intervals[0].usage.toString()).toBe('150.5')
    expect(intervals[0].days).toBe(30)
    expect(intervals[0].dailyAverage?.toFixed(4)).toBe('5.0167')
  })

  it('handles irregular dates and preserves interval attachment', () => {
    const { intervals } = computeConsumption([
      r('a', '2026-01-01', '100'),
      r('c', '2026-03-15', '200'),
      r('b', '2026-01-10', '120'),
    ])
    expect(intervals).toHaveLength(2)
    expect(intervals[0].from).toBe('2026-01-01')
    expect(intervals[0].to).toBe('2026-01-10')
    expect(intervals[0].usage.toString()).toBe('20')
    expect(intervals[1].from).toBe('2026-01-10')
    expect(intervals[1].to).toBe('2026-03-15')
    expect(intervals[1].usage.toString()).toBe('80')
  })

  it('flags decreasing readings as anomalies, never negative usage', () => {
    const { intervals, anomalies } = computeConsumption([
      r('a', '2026-01-01', '1000'),
      r('b', '2026-02-01', '900'),
    ])
    expect(intervals).toHaveLength(0)
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0].previousValue.toString()).toBe('1000')
    expect(anomalies[0].currentValue.toString()).toBe('900')
  })

  it('continues the series after an anomaly from the lower value', () => {
    const { intervals, anomalies } = computeConsumption([
      r('a', '2026-01-01', '1000'),
      r('b', '2026-02-01', '900'),
      r('c', '2026-03-01', '950'),
    ])
    expect(anomalies).toHaveLength(1)
    expect(intervals).toHaveLength(1)
    expect(intervals[0].usage.toString()).toBe('50')
  })

  it('baseline after replacement produces no consumption from predecessor', () => {
    const { intervals, anomalies } = computeConsumption([
      r('a', '2026-01-01', '99990'),
      r('b', '2026-02-01', '99999'),
      r('c', '2026-02-15', '5', true), // new meter baseline
      r('d', '2026-03-15', '105'),
    ])
    expect(anomalies).toHaveLength(0)
    expect(intervals).toHaveLength(2)
    expect(intervals[0].usage.toString()).toBe('9')
    expect(intervals[1].usage.toString()).toBe('100')
  })

  it('equal consecutive values yield zero usage, not an anomaly', () => {
    const { intervals, anomalies } = computeConsumption([
      r('a', '2026-01-01', '500'),
      r('b', '2026-02-01', '500'),
    ])
    expect(anomalies).toHaveLength(0)
    expect(intervals).toHaveLength(1)
    expect(intervals[0].usage.isZero()).toBe(true)
  })

  it('handles decimal readings exactly', () => {
    const { intervals } = computeConsumption([
      r('a', '2026-01-01', '1000.1'),
      r('b', '2026-01-08', '1000.4'),
    ])
    // 0.4 - 0.1 must be exactly 0.3 (no float artifacts)
    expect(intervals[0].usage.toString()).toBe('0.3')
  })

  it('editing/deleting readings recalculates deterministically (pure function)', () => {
    const base = [
      r('a', '2026-01-01', '100'),
      r('b', '2026-01-15', '150'),
      r('c', '2026-02-01', '210'),
    ]
    const withoutMiddle = base.filter((x) => x.id !== 'b')
    const s1 = computeConsumption(withoutMiddle)
    expect(s1.intervals).toHaveLength(1)
    expect(s1.intervals[0].usage.toString()).toBe('110')

    // Same input → same output
    const s2 = computeConsumption(withoutMiddle)
    expect(s2).toEqual(s1)
  })
})

describe('totalUsage', () => {
  it('sums interval usage', () => {
    const { intervals } = computeConsumption([
      r('a', '2026-01-01', '0'),
      r('b', '2026-01-10', '10.5'),
      r('c', '2026-01-20', '30.75'),
    ])
    expect(totalUsage(intervals).toString()).toBe('30.75')
  })
})
