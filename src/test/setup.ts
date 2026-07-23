import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Auto-unmount React trees between tests (vitest globals are not enabled).
afterEach(() => {
  cleanup()
})
