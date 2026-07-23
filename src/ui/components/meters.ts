// Pure presentation helpers for meter kinds (no components, fast-refresh safe).
import type { MeterKind } from '../../domain/types'

export function meterIcon(kind: MeterKind): string {
  return kind === 'electricity' ? '⚡' : kind === 'gas' ? '🔥' : '💧'
}

export function meterKindLabel(kind: MeterKind): string {
  return kind === 'electricity' ? 'Strom' : kind === 'gas' ? 'Gas' : 'Wasser'
}

export function meterUnit(kind: MeterKind): string {
  return kind === 'electricity' ? 'kWh' : 'm³'
}
