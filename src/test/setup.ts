import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom has no IntersectionObserver; the animated React Bits components
// (CountUp etc.) use it via framer-motion's useInView. Stub it so those
// components mount in tests. Real browsers provide the real thing.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return []
    }
    root: Element | null = null
    rootMargin = ''
    thresholds: number[] = []
  }
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver
}

// Auto-unmount React trees between tests (vitest globals are not enabled).
afterEach(() => {
  cleanup()
})
