# Usage Calculator — Household Energy & Utility Tracker (Germany)

> A self-tracking web app for German homeowners to record their own meter
> readings for **electricity (Strom)**, **gas**, and **water/wastewater
> (Wasser/Abwasser)**, and see — on a dashboard — how much they have used and
> what it costs, projected against their provider's annual reconciliation
> (**Jahresabrechnung**).

This document is the product & engineering plan. It is grounded in how German
utility metering and billing actually work (see [§3 Domain model](#3-domain-model-german-utilities)).

---

## 1. Problem & goal

German households pay their utility providers via **monthly advance payments
(Abschläge)** based on an *estimated* yearly consumption. Once a year the
provider reads the meter and produces a **Jahresabrechnung** that settles the
difference: you either owe money (**Nachzahlung**) or get a refund
(**Guthaben/Erstattung**).

Between those yearly bills, homeowners are essentially flying blind: they don't
know whether they're on track, over-spending, or building up a refund. This app
closes that gap.

**Core value:** the user periodically enters a meter reading; the app computes
the consumption since the previous reading, converts it to cost using the
user's own tariff, and shows running totals plus a projection of the eventual
settlement — *before* the provider's bill arrives.

### Primary user stories

1. As a new user, I enter my **starting meter reading** (typically last year's
   year-end reading that went to the provider) so future deltas are measured
   from a known baseline.
2. As a user, I enter my **tariff** per utility: base price (Grundpreis) and
   per-unit price (Arbeitspreis).
3. As a user, I **add a new reading** whenever I check my meter; the app shows
   *"you used X kWh / m³ since last time, costing €Y"*.
4. As a user, I open a **dashboard** and see current-period consumption, cost,
   trends, and a projected year-end settlement vs. my Abschläge.
5. As a user, I record what my provider's **actual annual bill** said, so the
   app can show how close its estimate was and re-baseline.

---

## 2. Scope

### In scope (v1)
- Three utility types: electricity, gas, water (+ wastewater as a linked line item).
- Manual meter-reading entry with history.
- Per-utility tariff config (Grundpreis + Arbeitspreis, VAT).
- Gas **m³ → kWh** conversion with user-editable Brennwert & Zustandszahl.
- Consumption + cost calculation between consecutive readings.
- Dashboard: per-utility cards, running totals, charts, year-end projection.
- Abschlag tracking and settlement (Nachzahlung/Guthaben) estimate.
- Single household, single user account. German-first UI (i18n-ready).

### In scope (v1.1+ / stretch)
- HT/NT two-register electricity (day/night tariffs, heat pumps).
- Dated **price history** per contract (price changes mid-year).
- Multiple properties / meters per user; meter-swap handling.
- CSV export / import; PDF period report.
- Reminders to take a reading.
- OCR photo of the meter to prefill the reading.

### Out of scope (for now)
- Direct integration with provider APIs / smart-meter gateways (Smart-Meter-Gateway / MsbG). Manual entry only.
- Payment processing.
- Multi-tenant / landlord-tenant apportionment (Nebenkostenabrechnung).

---

## 3. Domain model (German utilities)

This section captures the real-world rules the calculations must honor.

### 3.1 Units

| Utility | Meter reads in | Billed in | Notes |
|---|---|---|---|
| Electricity (Strom) | **kWh** | kWh | 1:1. Optional HT/NT two registers (`1.8.1`/`1.8.2`). |
| Gas (Erdgas) | **m³** | **kWh** | Volume measured, energy billed → convert (see §3.2). |
| Water (Wasser) | **m³** | m³ | 1:1. |
| Wastewater (Abwasser) | usually **not metered** | m³ | Billed off the fresh-water reading (Frischwassermaßstab). Stormwater portion may be a fixed per-m²-sealed-area charge. |

**Store gas readings as raw m³** and compute kWh separately, so a corrected
conversion factor can be re-applied retroactively.

### 3.2 Gas m³ → kWh conversion (exact formula)

```
Energy (kWh) = Volume (m³) × Brennwert (kWh/m³) × Zustandszahl (z)
```

- **Brennwert** (calorific value, from the bill / grid operator): H-Gas typical
  **~11.0–11.5 kWh/m³**; default **~11.2**.
- **Zustandszahl** (state number, corrects operating volume to standard
  conditions; depends on altitude & gas temperature): typical **~0.90–1.00**,
  default **~0.95**.
- Quick sanity rule of thumb only: `kWh ≈ m³ × 10` (can be off 10–15% — never
  use for real cost).

Both factors are **user-editable fields per gas contract/period**, defaulted to
the values above and ideally copied from the user's actual bill.

### 3.3 Tariff structure

Every tariff = **Grundpreis** (fixed standing charge, €/year or €/month,
independent of use) **+ Arbeitspreis** (per-unit price, ct/kWh or €/m³).

```
net_cost      = grundpreis_for_period + (consumption × arbeitspreis)
gross_cost    = net_cost × (1 + VAT)          // VAT = 19% for electricity & gas
```

Typical 2025/2026 gross ranges (defaults / sanity-check bounds — **all
user-editable**, water especially is municipal):

| | Arbeitspreis (gross) | Grundpreis (gross) |
|---|---|---|
| Electricity | ~25–40 ct/kWh | ~€100–180/yr |
| Gas | ~9–13 ct/kWh | ~€120–240/yr |
| Water (Trinkwasser) | ~1.3–3.3 €/m³ | ~€20–100/yr |
| Wastewater (Abwasser) | ~2.0–3.6 €/m³ | (often combined) |

VAT is **19%** for electricity and gas throughout 2025/2026 (the temporary 7%
gas rate ended 31 Mar 2024). Levies (Stromsteuer, CO₂-Preis, Netzentgelte,
etc.) are **already baked into the gross Arbeitspreis/Grundpreis** the provider
quotes — v1 lets the user enter gross prices and does not decompose levies.

### 3.4 Billing cycle & settlement

- **Abschlag**: 11–12 equal monthly advance payments, sized from estimated
  annual consumption × price.
- **Jahresabrechnung**: yearly, provider reads the meter (or estimates) and
  computes actual cost.
- **Settlement**:

```
settlement = actual_gross_cost_for_year − Σ(Abschläge paid)
// settlement > 0  → Nachzahlung (you owe)
// settlement < 0  → Guthaben  (refund)
```

The app mirrors this: it projects `actual_gross_cost_for_year` from readings so
far, subtracts the Abschläge the user has entered, and shows the expected
Nachzahlung/Guthaben live.

### 3.5 Edge cases the model must respect

- **Reading periods ≠ calendar year** — provider periods run reading-to-reading.
  Pro-rate Grundpreis by **days**; keep exact reading dates.
- **Mid-period price change** — store dated price history; split consumption
  across the change date (time-weighted or reading-based). *(v1.1)*
- **Meter replacement (Zählerwechsel)** — track meter serial + start reading so
  a swap doesn't produce a negative delta. *(v1.1)*
- **Meter rollover** — finite digit count; handle wrap-around.
- **Estimated vs. actual readings** — flag each reading's source; provider
  estimates can legitimately differ from a real self-read.
- **Water two-part** — fresh water and wastewater are separate line items with
  independent €/m³, both driven by the same water reading (unless a separate
  Gartenwasserzähler subtracts non-drained use).
- **Money rounding** — compute net, apply 19%, round to the cent, to match
  provider totals.

---

## 4. Core calculations (reference)

Given consecutive readings `r_prev` (value `v0`, date `d0`) and `r_curr`
(value `v1`, date `d1`) for a meter with tariff `T`:

```
raw_delta      = v1 − v0                          // guard: < 0 ⇒ rollover/meter-swap
consumption    = raw_delta                        // electricity, water
consumption_kwh= raw_delta × Brennwert × Zustandszahl   // gas only

days           = d1 − d0
grundpreis_part= grundpreis_per_year × days / 365
arbeit_part    = consumption × arbeitspreis
net            = grundpreis_part + arbeit_part
gross          = round2(net × (1 + vat))
```

**Year-end projection** (simple linear model for v1):

```
elapsed_days   = today − period_start
avg_daily      = consumption_so_far / elapsed_days
projected_year = avg_daily × period_length_days
projected_cost = grundpreis_per_year + projected_year × arbeitspreis, ×(1+vat)
projected_settlement = projected_cost − Σ Abschläge
```

v1.1 can improve projection with seasonal weighting (gas/heating is
front/back-loaded in winter — use degree-day or monthly-profile weighting).

---

## 5. Data model

Relational (Postgres). All money stored as integer **cents**; all prices stored
at their natural precision (e.g. ct/kWh as numeric). Timestamps in UTC, dates as
`date`.

```
user
  id, email, created_at, locale (default 'de-DE'), currency (default 'EUR')

property                         -- a household/address (v1: exactly one)
  id, user_id → user, name, postal_code, created_at

meter                            -- one per utility per property
  id, property_id → property
  utility_type      enum('electricity','gas','water')
  name, serial_number
  unit              enum('kWh','m3')          -- reading unit
  register          enum('single','HT','NT')  -- v1: 'single'
  install_date, initial_reading, active (bool)

tariff                           -- price config, dated (price history)
  id, meter_id → meter
  valid_from date, valid_to date NULL
  grundpreis_cents_per_year
  arbeitspreis                    -- numeric, per unit (ct or € per unit)
  arbeitspreis_unit enum('ct_per_kwh','eur_per_m3')
  vat_rate          numeric default 0.19
  -- gas only:
  brennwert         numeric NULL   -- kWh/m³, default 11.2
  zustandszahl      numeric NULL   -- default 0.95

reading                          -- a meter reading event
  id, meter_id → meter
  read_at date
  value             numeric        -- raw meter value (m³ for gas)
  source            enum('self','provider','estimate') default 'self'
  note

abschlag                         -- monthly advance payment schedule
  id, meter_id → meter (or contract-level)
  period_year int
  monthly_amount_cents
  months_count int default 12

settlement                       -- recorded provider annual bill (actuals)
  id, meter_id → meter
  period_start, period_end
  billed_consumption
  billed_gross_cents
  paid_abschlaege_cents
  result_cents                   -- + Nachzahlung / − Guthaben
  note
```

**Derived (not stored, computed in a view/service):** per-interval consumption &
cost, running totals, projections.

---

## 6. UX / screens

1. **Onboarding / first run**
   - Create property (name + PLZ, default `99974`).
   - For each utility: add meter, enter **initial reading** (last year-end
     value) + tariff. Gas step asks for Brennwert/Zustandszahl with defaults.
   - Optionally enter current Abschlag amounts.

2. **Dashboard (home)**
   - One card per utility: current-period consumption, cost so far, projected
     year total, projected settlement (Nachzahlung/Guthaben badge, red/green).
   - Combined "this period" total cost across utilities.
   - Trend chart (consumption over time) and cost breakdown.
   - "Add reading" primary action.

3. **Add reading**
   - Pick meter, date, value. Live preview: *"Δ = X kWh/m³, ≈ €Y since
     <last date>."* Validation: not < previous (unless rollover/swap flagged).

4. **Meter / tariff detail**
   - Reading history table + chart; edit tariff; manage price history (v1.1).

5. **Settlement / year review**
   - Enter provider's actual annual bill; app shows estimate-vs-actual delta and
     re-baselines the starting reading for the new period.

6. **Settings**
   - Profile, locale, VAT default, data export.

Design: mobile-first (readings are taken standing at the meter in the
basement), responsive, dark-mode friendly, accessible. Charts kept simple and
legible.

---

## 7. Tech stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript + React** | SSR + PWA-capable, one framework for UI and API routes, great DX. |
| Styling | **Tailwind CSS** + a small component set (shadcn/ui) | Fast, consistent, accessible primitives. |
| Charts | **Recharts** (or visx) | Simple declarative charts for the dashboard. |
| Backend / DB | **Supabase (Postgres + Auth + Row-Level Security)** | Managed Postgres, built-in auth, RLS for per-user data isolation, generous free tier; MCP tooling available in this environment. |
| Auth | Supabase Auth (email magic-link / password) | Single account per user; RLS keys off `auth.uid()`. |
| Validation | **Zod** shared client/server | One schema for forms + API. |
| Testing | **Vitest** (unit: calculations) + **Playwright** (e2e) | Calculation correctness is critical → heavy unit coverage. |
| Hosting | **Vercel** (frontend) + Supabase (data) | Zero-config deploys. |
| i18n | **next-intl** | German default, English fallback. |

**Alternatives considered**
- *Local-first PWA (no backend, IndexedDB)* — simplest and fully private, but no
  cross-device sync and weaker backup story. Good fallback if the user wants
  zero hosting/accounts. Could be offered as an offline mode later.
- *SQLite + a thin Node/Express API* — fine, but Supabase gives auth + RLS +
  hosting for less setup.

> **Decision needed from the user before build:** confirm the stack above
> (Next.js + Supabase) vs. a local-first no-account PWA. Recommendation:
> Next.js + Supabase for sync, backup, and future multi-property support.

---

## 8. Architecture

```
Browser (Next.js PWA)
  ├─ UI (React, Tailwind, Recharts)
  ├─ Forms (Zod validation)
  └─ Data access (Supabase JS client, RLS-scoped)
        │
        ▼
Supabase
  ├─ Postgres (schema in §5)  ← RLS: user sees only their rows
  ├─ Auth (auth.uid())
  └─ SQL views / RPC for aggregations (consumption, projections)

Calculation library  (pure TypeScript, shared, framework-agnostic)
  └─ convertGasToKwh(), intervalCost(), projectYear(), settlement()
     — 100% unit-tested, no I/O. This is the heart of the app.
```

Keep **all domain math in a pure, dependency-free `lib/calc` module** so it can
be tested exhaustively and reused (web, future mobile, server RPC).

---

## 9. Milestones / roadmap

**M0 — Project setup**
- Scaffold Next.js + TS + Tailwind; ESLint/Prettier; Vitest/Playwright; CI.
- Supabase project, schema migration (§5), RLS policies.

**M1 — Calculation core (test-first)**
- `lib/calc`: gas conversion, interval consumption/cost, day-prorated
  Grundpreis, VAT rounding, year projection, settlement. Full Vitest suite with
  worked examples from real bills.

**M2 — Data + auth**
- Auth flow; CRUD for property, meter, tariff, reading via Supabase client.
- Onboarding wizard (first-run baseline reading + tariff).

**M3 — Dashboard**
- Per-utility cards, running totals, trend/cost charts, projected settlement.

**M4 — Add-reading flow + live preview + validation.**

**M5 — Settlement/year-review + re-baselining + CSV export.**

**M6 — Polish**: PWA/offline reads, i18n (de/en), a11y pass, reminders.

**Later (v1.1+)**: HT/NT registers, price history, multi-property, meter-swap,
seasonal projection, OCR reading.

---

## 10. Open questions

1. **Stack**: Next.js + Supabase (sync/accounts) vs. local-first PWA (no
   account)? *(recommend Supabase)*
2. **Auth scope**: single household per account for v1 — confirmed?
3. **Wastewater**: is it billed purely off the water reading in the user's
   municipality, or is there a separate stormwater area charge to model?
4. **Gas**: does the user's contract bill in kWh (needs Brennwert/Zustandszahl)
   — assume yes (standard in Germany).
5. **Projection fidelity**: is a simple linear projection acceptable for v1, with
   seasonal weighting deferred to v1.1? *(recommend yes)*
6. **HT/NT**: does the user have a day/night or heat-pump electricity meter
   (two registers)? Affects whether register support is v1 or v1.1.

---

## 11. Risks

- **Calculation correctness** — the whole product's credibility rests on
  matching the provider's bill. Mitigation: pure tested calc lib, real-bill
  fixtures, show the formula/breakdown transparently.
- **Price/factor drift** — tariffs, VAT, Brennwert change. Mitigation: everything
  user-editable + dated price history; ship sane 2025/26 defaults as hints only.
- **Data loss** — self-entered history is irreplaceable. Mitigation: hosted DB +
  export; consider automatic backups.
- **Reading discipline** — value depends on the user actually taking readings.
  Mitigation: fast add-reading flow, reminders, projection tolerates irregular
  intervals.

---

*Location default: PLZ **99974** (Germany). All prices/units are user-editable;
built-in numbers are 2025/2026 sanity-check defaults, not fixed constants.*
