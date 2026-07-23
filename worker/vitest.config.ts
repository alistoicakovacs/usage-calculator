import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// Worker tests run inside workerd via miniflare, not jsdom, so they live in
// their own config away from the app's vitest projects.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' } })],
  test: {
    include: ['test/**/*.test.ts'],
  },
})
