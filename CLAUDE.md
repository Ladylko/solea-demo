# Soléa: working notes for Claude

Soléa is a demo web app that helps a homeowner in France or Spain understand their energy bill, pick one action and check that it works. Three fictional homes: Clara (house, electric heating, France), Javier (apartment, air conditioning, Málaga), Nora (house with solar panels, France).

## Non-negotiable rules

- Demo only: fictional data, estimates only, no connection to any meter or supplier.
- Never write "real time", "guaranteed" or "measured" (nor "temps réel", "garanti", "mesuré", "tiempo real", "garantizado", "medido"). The only exception is the demo banner, which says results are NOT measured; the test exempts that one key.
- The banner "Demo data. Savings shown are estimates, not measured results." is visible on every view. The footer says: demo prototype, no connection to any meter, fictional prices and consumptions.
- No em dash and no en dash anywhere (code, strings, docs). A test scans the repository.
- No medical vocabulary in any copy (no health, diagnosis, check-up, symptom, treatment and the like, in any language).
- Vanilla JavaScript, ES modules, zero npm dependency, zero build step to run. Node 20 or later.
- Every monthly series is read through `homeMonthsKwh(home, key)`, which converts the home's unit with `normalizeKwh`. Never read `home.months` in the interface (a test checks `src/app.js`).
- Every string exists in English, French and Spanish. English is the default.
- Every `localStorage` read and write goes through `load` and `save` in `src/app.js`, both wrapped in try/catch. The app must work with storage blocked.
- Light and dark themes with CSS variables on `:root`; dark under `prefers-color-scheme` (guarded by `:not([data-theme='light'])`) and under `[data-theme='dark']`.
- Phone layout from 360 px, no horizontal page scroll, visible keyboard focus, `prefers-reduced-motion` respected.

## Files

| Path | Role |
| --- | --- |
| `index.html` | Page shell, loads `src/styles.css` and `src/app.js` |
| `src/app.js` | Routing and rendering only (views, SVG charts, events, storage) |
| `src/calc.js` | Pure functions, all exported and tested |
| `src/data.js` | Demo homes, actions, CO2 factors, version and data date |
| `src/i18n.js` | Strings in `en`, `fr`, `es`, `translate(lang, key, vars)` |
| `src/styles.css` | Design tokens and styles |
| `tests/calc.test.js` | `node:test` suite: formulas, data, translations, repository rules |
| `scripts/serve.js` | Static server, `npm start`, port 8080 |
| `scripts/build-single.js` | `npm run build`, writes `dist/solea.html` (one self-contained file) |

Scripts: `npm start`, `npm test`, `npm run build`, `npm run check` (test then build).

Routes (URL hash): `#dashboard` (default), `#bill`, `#simulate`, `#plan`, `#track`, `#compare`, `#settings`, `#about`.

## Formulas (src/calc.js)

Percent arguments are whole numbers: `10` means 10 %.

- `monthlyCost(kwh, price, fixed) = kwh × price + fixed`. The fixed part never disappears.
- `estimatedSavings(kwhAvoided, price) = kwhAvoided × price`, at constant prices.
- `reductionSavings(baseKwh, percent, price)` returns `{ kwh: baseKwh × percent ÷ 100, euros: kwh × price }`.
- `shiftSavings(kwhShifted, peakPrice, offPeakPrice) = kwhShifted × (peakPrice minus offPeakPrice)`, never negative, 0 kWh avoided.
- `annualTotals(months, price, fixed)` returns `{ kwh, variable, fixed: 12 × fixed, total }`.
- `monthsAboveThreshold(months, threshold)` returns the indexes strictly above.
- `rankActions(actions, price, criterion)` with `ratio` (euros a year per euro of upfront cost, free actions with a saving first), `euros`, `cost`, `effort`. Returns enriched copies, does not mutate.
- `normalizeKwh(value, unit)` for `Wh`, `kWh`, `MWh`. `homeMonthsKwh(home, key)` returns 12 kWh values or `null`.
- `kwhPerM2(kwh, surface)`, `co2Estimate(kwh, factor)` (kg CO2e, demo factor), `priceScenario(kwh, price, pct, fixed) = kwh × price × (1 + pct ÷ 100) + fixed`, `goalKwh(kwh, pct)` = kWh to avoid, `paybackYears(cost, eurosPerYear)` (0 when free, `null` when nothing saved), `peakIndex(values)`, `setpointSavings(usageKwh, degrees, pctPerDegree, price)` (capped at 100 % of the usage), `planSummary(rankedActions, chosenIds)`.
- Helpers also tested: `actionEurosPerYear`, `goalCoverage`, `changeRatio`, `monthBreakdown`, `combinedScenario`, `monthsToCsv`.

Known results kept in the tests: 100 kWh at 0.20 € = 20 €; 10 % of 1,000 kWh at 0.20 € = 100 kWh and 20 €; shifting 100 kWh from 0.20 to 0.16 = 4 € and 0 kWh avoided; `monthlyCost(0, 0.20, 15) = 15`; `normalizeKwh(1500, "Wh") = 1.5`.

## Choices made where the brief was silent

- Months are January to December; "this year" and "last year" are relative labels on fictional data. Last demo data update: 2026-10-01 (`META` in `src/data.js`).
- Units: Clara is stored in kWh, Javier in Wh, Nora in MWh, so `normalizeKwh` is exercised by real data.
- Action kind `fixed` lowers the fixed monthly part (`fixedSavingPerMonth`), for example a lower subscribed power or potencia contratada.
- The reduction goal is one global percentage (default 10 %). `goalKwh` returns the kWh to avoid; shifts count for 0 kWh toward it.
- Alert thresholds are per home, with a default in the data (Clara 1,000, Javier 450, Nora 500 kWh a month). The profile (surface, occupants) is per home.
- Price changes move the price per kWh (peak and off-peak), never the fixed part.
- Setpoint lever: 7 % per degree is a demo hypothesis. A cooling home raises its setpoint to save, so the lever says "raise" for Javier. It applies to what is left after a heating or cooling reduction, so levers never double count.
- Month breakdown: usages other than heating or cooling are spread evenly over the year; heating or cooling takes the rest of the month.
- Solar export is shown in the kWh view only and is not credited in the bill estimate.
- Compare view: green for lowest and red for highest only on rows where lower is better (kWh, euros, kWh per m², fixed share, CO2e). "My plan saving" and "main usage" are not coloured.
- Track lists every action of the home, actions in the plan first.
- Fonts: Young Serif (wordmark and big figures) and Public Sans (everything else) from Google Fonts, with system fallbacks. The single-file build inlines all code and styles; the fonts are its only external request and it still works offline.
- `dist/` is a build output and is not committed. Run `npm run build` to produce it.
- Chart colours were checked with the dataviz palette validator: light `#c58300`, `#2479b5`, `#4d912c`; dark `#c08a1c`, `#2e8dd0`, `#5a9e3a`. Status colours (good, attention, clay alert) are separate from the accents and always come with an icon and a label.

## Workflow

1. Read the files you will touch before editing them.
2. For a bug: write a failing test in `tests/calc.test.js` first, then fix.
3. For a feature: add the strings in the three languages, the data if any, a test, then run `npm run check`.
4. Check every view in a browser (desktop and 360 px, light and dark) when the interface changes.
5. Update `CHANGELOG.md`.
6. Commit messages in English, imperative mood ("Add the export view", not "Added").
