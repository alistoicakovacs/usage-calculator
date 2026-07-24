import { describe, expect, it } from 'vitest'
import { installState, isIos, isStandalone, type InstallEnv } from './pwaInstall'

const env = (over: Partial<InstallEnv>): InstallEnv => ({
  userAgent: '',
  platform: '',
  maxTouchPoints: 0,
  standalone: undefined,
  displayModeStandalone: false,
  ...over,
})

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPADOS_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0 Mobile Safari/537.36'
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0 Safari/537.36'

describe('isIos', () => {
  it('detects an iPhone', () => {
    expect(isIos(env({ userAgent: IPHONE_SAFARI }))).toBe(true)
  })

  it('detects iPadOS masquerading as desktop Safari via touch points', () => {
    expect(
      isIos(env({ userAgent: IPADOS_DESKTOP, platform: 'MacIntel', maxTouchPoints: 5 })),
    ).toBe(true)
  })

  it('does not treat a real (non-touch) Mac as iOS', () => {
    expect(
      isIos(env({ userAgent: IPADOS_DESKTOP, platform: 'MacIntel', maxTouchPoints: 0 })),
    ).toBe(false)
  })

  it('is false for Android and desktop Chrome', () => {
    expect(isIos(env({ userAgent: ANDROID_CHROME }))).toBe(false)
    expect(isIos(env({ userAgent: DESKTOP_CHROME }))).toBe(false)
  })
})

describe('isStandalone', () => {
  it('is true via the display-mode media query', () => {
    expect(isStandalone(env({ displayModeStandalone: true }))).toBe(true)
  })

  it('is true via the legacy navigator.standalone flag', () => {
    expect(isStandalone(env({ standalone: true }))).toBe(true)
  })

  it('is false in an ordinary browser tab', () => {
    expect(isStandalone(env({ userAgent: IPHONE_SAFARI }))).toBe(false)
  })
})

describe('installState', () => {
  it('reports standalone once installed, even on iOS', () => {
    expect(
      installState(env({ userAgent: IPHONE_SAFARI, standalone: true })),
    ).toBe('standalone')
  })

  it('reports ios for Safari on an iPhone', () => {
    expect(installState(env({ userAgent: IPHONE_SAFARI }))).toBe('ios')
  })

  it('reports other for non-iOS browsers', () => {
    expect(installState(env({ userAgent: ANDROID_CHROME }))).toBe('other')
    expect(installState(env({ userAgent: DESKTOP_CHROME }))).toBe('other')
  })
})
