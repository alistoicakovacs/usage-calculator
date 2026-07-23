# Detailed Implementation Plan — Phases 2 to 5

**Status:** Proposed; awaiting approval
**Parent plan:** `docs/implementation-plan.md` (approved)
**Updated:** 2026-07-23

## Current state (committed + working tree)

| Layer | State |
|---|---|
| Phase 0 scaffold, CI, Pages deploy | ✅ Committed, live at `alistoicakovacs.github.io/usage-calculator/` |
| Phase 1 domain layer | ✅ Committed, 77 unit tests green |
| Data layer (`src/data`) | 🟡 In working tree: Dexie schema with sync metadata, repositories with tombstone deletes, 7 tests green |
| UI screens (`src/ui`) | 🟡 In working tree: Home, PropertyForm, Property, Meter, ReadingForm; typecheck/lint/tests green; **not yet browser-verified** |

## Phase 2 — Local-only app (remaining work)

### 2.1 Commit data layer + screens after browser verification
- Run dev server, walk flows 2–7 manually in the browser.
- Fix `useAsyncData` staleness issues if screens show outdated data after navigation (known risk: back-navigation caching).
- Exit: every flow works offline; commit.

### 2.2 Screen-level tests (jsdom + Testing Library)
- `ReadingFormScreen`: German input accepted, malformed rejected with message, duplicate date rejected, decrease flow requires explicit choice before save enables, replacement creates baseline.
- `HomeScreen`: renders property cards, meter action buttons, balance chip (Guthaben green / Nachzahlung red, estimate tag).
- `MeterScreen`: interval list shows usage/cost, missing gas conversion warning shown.
- Exit: `npm test` covers the main interaction contracts, not just rendering.

### 2.3 UX completeness for flows 2–7
- Delete meter/property with confirm step (tombstones only).
- Meter replacement flow entry point on MeterScreen (flow 10) — sets baseline reading via the existing decrease choice.
- Empty/first-run state on Home pointing to "Immobilie anlegen".
- Exit criteria (from parent plan): flows 2–7 fully usable offline.

### Phase 2 checkpoint: user review of the deployed app.

## Phase 3 — Crypto + recovery key

### 3.1 Key management (`src/crypto/keys.ts`)
- Random 256-bit vault key via WebCrypto; AES-GCM for record encryption.
- Recovery key: vault key encoded as 8 groups of 5 Crockford-base32 chars (checksummed), shown once at vault creation, re-derivable export any time.
- Key storage: raw key in IndexedDB `localState` (device is trusted; threat model is the sync server and transit, per design doc). Document this explicitly.

### 3.2 Vault lifecycle (`src/crypto/vault.ts`)
- Create vault: generate key + vaultId (UUID), store metadata.
- Restore vault: enter recovery key → derive vaultId + key → used by Phase 4 to pull dataset.
- First-run UI: create-or-restore screen before the app shell.

### 3.3 Encryption envelope (`src/crypto/envelope.ts`)
- `encryptRecord(key, row) → {iv, ciphertext}`; `decryptRecord` inverse.
- Deterministic JSON serialization (sorted keys) so tests can assert stability.
- Tests: round-trip, tamper detection (GCM auth failure), wrong-key failure. Corrupt blob never overwrites local data (surfaced error).

### Exit: vault created/restored in browser; recovery key round-trips; tests green.

## Phase 4 — Sync service + pairing + conflicts

### 4.1 Worker (`worker/`)
- Cloudflare Worker + Durable Object per vault: `POST /vault/:id/push {baseVersion, blob}` → 409 with newer blobs when stale; `GET /vault/:id/pull?since=` → batches.
- Auth: bearer token = HMAC(vaultKey, vaultId) — server never sees the key.
- Vitest + miniflare tests: version counter, stale rejection, auth rejection, blob opacity.

### 4.2 Merge engine (`src/sync/merge.ts`)
- Record-level merge using the `versionVector` already stamped by repositories.
- Rules: dominance → take newer; concurrent edits to same id → conflict entry; tombstone vs edit → conflict; independent adds merge silently.
- Simulated two-device test matrix: add/add different ids, edit/edit same id, delete/edit, delete/delete, vector dominance chains.

### 4.3 Sync client (`src/sync/client.ts`)
- Outbox from `updatedAt` watermark; push/pull loop with backoff; offline-first (never blocks UI).
- Conflict queue persisted in `localState`; badge in app header.

### 4.4 Conflict UI + pairing UI
- Side-by-side chooser (device A vs device B values, date-formatted) per conflict; choice writes a new dominant version.
- Pairing: QR code (vaultId + key) via `qrcode` lib + manual recovery-key entry fallback.

### 4.5 Deployment
- Worker deployed to Cloudflare free tier; URL configurable via env/constant.
- **Open item for user: Cloudflare account.** I will need you to create one (free) or hand me an API token when we reach 4.5. Until then all sync tests run against miniflare locally.

### Exit: two browsers sync a dataset end-to-end locally (Playwright, miniflare); conflict chooser resolves concurrent edits; e2e green.

## Phase 5 — Polish and completeness

- CSV export per meter (readings + intervals + costs) with German headers, semicolon-separated for Excel-de.
- Reading-list virtualization not needed (< 1k rows); skip.
- A11y pass: labels, focus order, contrast, `prefers-reduced-motion`.
- reactbits.dev visual pass on Home (animated balance/gradient accents), kept subtle.
- German formatting audit: all numbers/dates through `formatGermanDecimal`/`formatDateDe`.
- Full Playwright suite: flows 1–10 as user journeys against the built app.
- README with screenshots, recovery-key warning, self-host notes.

## Testing gates per phase

| Phase | Gate |
|---|---|
| 2 | Unit + data + screen tests green; manual browser walkthrough of flows 2–7 |
| 3 | Crypto round-trip/tamper tests; create/restore in browser |
| 4 | Merge matrix tests; miniflare worker tests; 2-browser Playwright sync test |
| 5 | Full e2e suite green in CI; Lighthouse PWA installable check |

## Risks / notes

- `useAsyncData` is deliberately simple; if staleness bites, switch to `dexie-react-hooks` `useLiveQuery` (small dependency, purpose-built) rather than growing a custom cache.
- Version vectors are already stamped on every write since Phase 2, so Phase 4 needs no data migration.
- GitHub Pages is public hosting; the repo went public for Pages. Vault data never touches the repo or Pages.
