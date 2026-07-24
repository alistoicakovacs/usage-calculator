// Platform detection for the "Add to Home Screen" install guide.
//
// The app is already a standalone PWA (see vite.config manifest), so getting it
// onto an iPhone or iPad needs no App Store and no native build — the user opens
// it in Safari and taps Share → Zum Home-Bildschirm. This module works out which
// hint to show: a done-state when it is already installed, iOS steps when it can
// be installed from Safari, or a fallback pointer for every other browser.
//
// Detection is deliberately dependency-injected (env passed in) so it can be
// unit-tested without a real navigator/window.

export type InstallState = 'standalone' | 'ios' | 'other'

export interface InstallEnv {
  userAgent: string
  platform: string
  maxTouchPoints: number
  /** navigator.standalone — legacy iOS flag, true inside an installed PWA. */
  standalone?: boolean
  /** display-mode: standalone — set once launched from the home screen. */
  displayModeStandalone: boolean
}

/** True when the app is already running as an installed home-screen app. */
export function isStandalone(env: InstallEnv): boolean {
  return env.displayModeStandalone || env.standalone === true
}

/**
 * True on iPhone/iPad/iPod. iPadOS 13+ masquerades as desktop Safari
 * ("MacIntel" / "Macintosh"), so a touch-capable Mac counts as iOS too.
 */
export function isIos(env: InstallEnv): boolean {
  if (/iphone|ipad|ipod/i.test(env.userAgent)) return true
  const macLike = env.platform === 'MacIntel' || /macintosh/i.test(env.userAgent)
  return macLike && env.maxTouchPoints > 1
}

/** Which install hint the Settings screen should render. */
export function installState(env: InstallEnv): InstallState {
  if (isStandalone(env)) return 'standalone'
  if (isIos(env)) return 'ios'
  return 'other'
}

/** Reads the detection inputs from the live browser, guarding SSR/tests. */
export function readInstallEnv(): InstallEnv {
  const nav =
    typeof navigator === 'undefined'
      ? ({ userAgent: '', platform: '', maxTouchPoints: 0 } as Partial<Navigator>)
      : navigator
  const displayModeStandalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches

  return {
    userAgent: nav.userAgent ?? '',
    platform: nav.platform ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: (nav as Navigator & { standalone?: boolean }).standalone,
    displayModeStandalone,
  }
}
