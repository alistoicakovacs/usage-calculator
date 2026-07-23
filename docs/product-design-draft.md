# Home Utility Calculator — Product Design Draft

**Status:** Discovery draft; not yet approved for implementation  
**Locale:** Germany (`de-DE`, EUR), initially informed by postcode `99974`  
**Updated:** 2026-07-23

## Goal

Build a responsive household utility application for recording cumulative electricity, gas, and water meter readings; calculating interval consumption and cost; forecasting the annual bill; and estimating whether the household should expect a credit (`Guthaben`) or additional payment (`Nachzahlung`).

## Agreed product decisions

### Properties and meters

- One encrypted household vault may contain multiple properties.
- Each property may contain multiple electricity, gas, and water meters.
- Every meter has its own readings, tariff history, billing periods, and lifecycle.
- Meter replacement or reset must be represented explicitly; the application must never silently treat a lower reading as negative consumption.

### Meter readings

- Readings are cumulative totals associated with a local calendar date.
- The first reading establishes the baseline and does not create consumption by itself.
- Consumption between readings is `current cumulative reading − previous cumulative reading`.
- Readings may be entered on irregular dates.
- Exact consumption remains attached to the measured interval.
- Calendar-day and calendar-month allocations are prorated and visibly labelled as estimates.
- Editing or deleting a reading recalculates the adjacent intervals deterministically.

### Units and calculations

- Electricity meters use kWh.
- Water meters use m³.
- Gas meters use m³ while German tariffs normally bill kWh.
- Gas conversion is billing-accurate: `usage m³ × Brennwert × Zustandszahl = billed kWh`.
- The application accepts either the two factors or their combined conversion factor when supplied by the bill.
- Conversion inputs are effective-dated and preserved with the historical calculation.
- Decimal arithmetic is used for measurements and prices; money is rounded only for presentation and final bill totals.

### Tariffs and annual balance

- Tariffs are effective-dated rather than overwriting historical prices.
- Electricity, gas, and water can each have a variable usage price and a time-based base price.
- Calculations crossing a tariff change are split across the applicable tariff periods.
- Billing periods do not have to match calendar years.
- Monthly advance payments (`Abschläge`) are recorded for the billing period.
- The forecast compares accrued/projected cost with recorded advance payments to estimate `Guthaben` or `Nachzahlung`.
- Usage values with incompatible units are never summed. Portfolio totals may aggregate money only.

### Local-first encrypted synchronization

- Every device maintains a local IndexedDB copy so the application remains usable offline.
- Household devices synchronize automatically in both directions after reconnecting.
- The first device creates a household vault and a random encryption key.
- Another device joins using a QR code or recovery key and downloads the existing encrypted dataset.
- Data is encrypted on the device before upload; the synchronization service stores ciphertext and cannot read household values.
- The application supports explicit conflict detection and resolution rather than silently overwriting concurrent edits.
- Loss of every paired device and the recovery key means the encrypted household data cannot be recovered.

### Distribution

- The client is an installable static progressive web application.
- GitHub Pages is the preferred static host, using its HTTPS `github.io` address initially.
- The application shell may be publicly reachable, but household data is neither embedded in the site nor stored by GitHub Pages.
- A separate minimal synchronization service is required because GitHub Pages is static hosting, not a synchronization database.
- No analytics, advertising, or unnecessary third-party scripts are included in the initial product.

## Required user flows

1. Create an encrypted household vault and save the recovery key.
2. Add a property with a German postal code and optional label.
3. Add one or more meters and configure their native units.
4. Configure effective-dated tariffs, base prices, advance payments, and gas conversion values where applicable.
5. Enter an initial cumulative reading as the baseline.
6. Enter later readings and see interval usage, cost, daily average, and estimated calendar allocation.
7. Review property and portfolio forecasts for annual cost, `Guthaben`, or `Nachzahlung`.
8. Pair another device and synchronize the existing encrypted household dataset.
9. Record tariff changes without altering historical calculations.
10. Replace or reset a meter without producing negative consumption.

## Validation and exceptional cases

- Accept German-formatted decimal input while rejecting ambiguous malformed values.
- Reject duplicate or invalid same-date readings unless the user is correcting the existing entry.
- Treat a lower reading as a possible correction, rollover, or meter replacement requiring an explicit choice.
- Mark prorated calendar values as estimated.
- Warn when gas conversion inputs are missing; do not multiply m³ directly by a kWh tariff.
- Preserve tariff and conversion metadata used by historical calculations.
- Reconcile edits received from another device without losing an independently added reading.
- Store postal codes as five-character strings so leading zeroes are retained.

## Decisions remaining before implementation planning

- Select the home-dashboard hierarchy: portfolio-first, property-first, or action-first/mobile-first.
- Select the synchronization backend and its free-tier/deployment strategy.
- Define the exact conflict-resolution interaction for concurrent edits to the same record.
- Decide whether the first release includes reminders, meter-reading photos, CSV export, or only manual entry and encrypted recovery.
- Approve the complete architecture, component boundaries, error handling, and testing design.

This document records discovery decisions only. Implementation must not begin until the remaining product decisions and the complete design are reviewed and approved.
