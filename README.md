# Soléa

A demo web app to understand a home energy bill, pick one action and check that it works. Three fictional homes in France and Spain. Every figure is an estimate on demo data.

> Demo data. Savings shown are estimates, not measured results.

## Run

Requires Node 20 or later. No dependency to install.

```sh
npm start        # http://localhost:8080
npm test         # node:test suite
npm run build    # writes dist/solea.html, one self-contained file
npm run check    # tests, then build
```

`dist/solea.html` opens directly from the file system and can be shared as a single file.

## What works

- Eight views, each with its own address: overview, bill, what if, plan, track, compare, settings, about.
- Three homes to switch between at any time: Clara (house, electric heating, Tours), Javier (apartment, air conditioning, Málaga), Nora (house with solar panels, Nantes).
- Overview with twelve key figures, the three best actions by saving per euro and recent activity.
- Bill: annual estimate with its variable and fixed parts, a 12-month chart (kWh or euros, last year overlay, solar export for Nora), a draggable alert threshold synced with a number field, monthly breakdown, split in euros, price sensitivity and a typical day.
- What if: five levers (reduce a usage, shift to off-peak hours, setpoint, price change, reduction goal) with a combined estimate.
- Plan: sortable actions with their assumptions, a plan summary you can copy, cost against saving.
- Track: mark actions as done, a log, month by month against last year.
- Compare: the three homes side by side.
- Settings: alert threshold, demo notification switches, home profile, data source status, twelve months as CSV, reset.
- English, French and Spanish; light and dark themes; phone layout from 360 px; keyboard navigation.
- Choices are kept on this device (`localStorage`); the app still works if storage is blocked.

## What is simulated

- All consumptions, prices, fixed parts and actions are fictional.
- Breakdowns by usage and the typical day are estimates.
- Savings are estimates at constant prices, never results.
- CO2e uses demo factors (France 0.06, Spain 0.16 kg CO2e per kWh), not official values.
- Notifications and data sources (Linky, Datadis) are switches with no connection. Nothing is ever sent or read from a meter or a supplier.

## Project

See `CLAUDE.md` for the rules, the formulas, the file structure and the workflow, and `CHANGELOG.md` for the history.
