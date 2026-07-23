# Home Utility Calculator — Implementation Plan

**Status:** Proposed; awaiting approval
**Supersedes open decisions in:** `docs/product-design-draft.md`
**Updated:** 2026-07-23

## Resolved product decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Home-dashboard hierarchy | **Action-first / mobile-first.** Home screen lists "Enter reading" actions per meter plus a compact forecast card per property (Guthaben/Nachzahlung). Property and portfolio views are one tap away. |
| 2 | Sync backend | **Cloudflare Workers + Durable Objects (free tier).** Stores only opaque encrypted blobs keyed by vault ID, authenticated by a key-derived token, versioned with a counter. |
| 3 | Conflict resolution | **Record-level automatic merge; explicit prompt only on true conflicts.** Version vectors per record. Independent additions merge silently. Same-record edits and deletions raise a side-by-side chooser. Nothing silently overwrites. |
| 4 | v1 scope | **Lean v1 + CSV export.** Manual entry, effective-dated tariffs, gas conversion, forecasting, encrypted vault + recovery key, device pairing + sync, CSV export. Deferred to v1.1: reminders, meter photos. |
| 5 | Stack | **TypeScript + React + Vite**, UI components from **reactbits.dev**, Dexie (IndexedDB), decimal.js, Vitest + Playwright, GitHub Actions → GitHub Pages. |

## Architecture overview

```
┌─────────────────────────────────────────────┐
│  PWA (React + Vite, GitHub Pages)           │
│                                             │
│  UI layer (React + reactbits.dev)           │
│    └── screens, forms, conflict chooser     │
│  Domain layer (pure TypeScript)             │
│    └── consumption, tariffs, gas conversion,│
│        proration, forecast (decimal.js)     │
│  Data layer                                 │
│    └── Dexie/IndexedDB, repository API,     │
│        version vectors, change log          │
│  Crypto layer                               │
│    └── WebCrypto AES-GCM, key derivation,   │
│        recovery-key + QR pairing            │
│  Sync client                                │
│    └── push/pull encrypted change batches   │
└──────────────────┬──────────────────────────┘
                   │ HTTPS (ciphertext only)
┌──────────────────▼──────────────────────────┐
│  Cloudflare Worker + Durable Object         │
│  per-vault blob store, version counter,     │
│  token auth, no plaintext ever              │
└─────────────────────────────────────────────┘
```

### Layering rules

- **Domain layer is pure**: no React, no IndexedDB, no Date.now() (clock injected). All money/measurement math in decimal.js. This is where most unit tests live.
- **UI never touches Dexie directly**; it goes through repository hooks.
- **Crypto boundary**: everything leaving the device is encrypted in the sync client. The Worker never sees schema, only `{vaultId, version, blob}`.

### Data model (local, per vault)

- `Vault` — id, key metadata, settings (locale fixed `de-DE`).
- `Property` — id, label, postalCode (5-char string).
- `Meter` — id, propertyId, kind (`electricity|gas|water`), unit, lifecycle events (`replacement`, `reset`) as explicit records.
- `Reading` — id, meterId, date (local calendar date), cumulative value (decimal string).
- `TariffPeriod` — id, meterId, effectiveFrom, usagePrice, basePrice.
- `GasConversion` — id, meterId, effectiveFrom, brennwert, zustandszahl (or combined factor).
- `BillingPeriod` — id, meterId, start, end, monthly Abschlag.
- Every record carries `{updatedAt, deviceId, versionVector, deleted}` for sync.

### Domain calculations

- Interval consumption = current − previous cumulative reading; first reading is baseline only.
- Lower reading triggers the correction/rollover/replacement chooser, never negative consumption.
- Gas: `m³ × Brennwert × Zustandszahl = kWh`, effective-dated, preserved with historical results; missing conversion blocks cost calc with a warning.
- Tariff-crossing intervals split by day across tariff periods.
- Calendar proration labelled as estimate.
- Forecast: accrued + projected cost vs recorded Abschläge → Guthaben/Nachzahlung.
- German decimal input parsing (`1.234,56`), rejecting ambiguous forms.

### Sync protocol

1. Client encrypts its pending change batch, pushes `{vaultId, baseVersion, blob}`.
2. Durable Object rejects if `baseVersion` is stale, returning newer blobs; client merges locally (version vectors), re-encrypts, retries.
3. True conflicts are queued into a local "needs resolution" list surfaced in the UI.
4. Pairing: QR code / recovery key transports vault id + symmetric key; new device pulls full encrypted state.

### Error handling

- All domain functions return typed results (`ok | error` unions), no thrown exceptions across layer boundaries.
- Sync failures are non-blocking: app remains fully usable offline, retry with backoff, status indicator in UI.
- Corrupt/undecryptable blobs never overwrite local data; surfaced with a recovery dialog.
- Form validation at input time with German-locale messages.

## Component boundaries (packages)

```
src/
  domain/        pure calculation + validation (no deps except decimal.js)
  data/          Dexie schema, repositories, change log, migrations
  crypto/        key management, encrypt/decrypt, pairing payloads
  sync/          sync client, merge engine, conflict queue
  ui/            screens, components (reactbits.dev), routing, hooks
worker/          Cloudflare Worker + Durable Object (separate package)
```

## Testing design

- **Vitest unit tests**: domain layer exhaustively (consumption, tariff splits, gas conversion, proration, forecast, German parsing, rollover/replacement cases).
- **Vitest integration tests**: repositories against fake-indexeddb; merge engine with simulated two-device histories including concurrent edits and deletes.
- **Worker tests**: version counter, stale-push rejection, auth (vitest + miniflare).
- **Playwright e2e**: vault creation → meter → readings → forecast; pairing + sync round-trip against local Worker; conflict chooser flow.
- CI runs all suites on every push; Pages deploy only on green main.

## Phased milestones

| Phase | Deliverable | Exit criteria |
|-------|-------------|---------------|
| 0 | Project scaffold: Vite + React + TS, Dexie, CI, Pages deploy, PWA shell | Empty app installs as PWA from github.io |
| 1 | Domain layer complete with unit tests | All calculation rules from design draft covered by passing tests |
| 2 | Local-only app: vault (unencrypted-at-rest ok locally), properties, meters, readings, tariffs, forecast UI | Required user flows 2–7 work offline |
| 3 | Crypto + recovery key | Vault encrypted, recovery key export/restore tested |
| 4 | Worker + sync + pairing + conflict UI | Flows 1, 8; two-browser e2e sync test green |
| 5 | Polish: CSV export, meter replacement flow, validation edge cases, a11y, German formatting audit | Flows 9–10; full e2e suite green |

Each phase ends with a commit series and a short review checkpoint before the next begins.

## Out of scope for v1

Reminders, meter-reading photos, analytics of any kind, multi-language UI (German-first), custom domain.
