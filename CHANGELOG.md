# Changelog

## 0.1.0 (2026-10-25)

First prototype.

- Eight views routed by URL hash: overview, bill, what if, plan, track, compare, settings, about.
- Three demo homes (Clara, Javier, Nora) with consumption in kWh, Wh and MWh, normalised through `homeMonthsKwh`.
- Pure calculation module `src/calc.js` with tests for every formula, the demo data, the translations and the repository rules.
- English, French and Spanish strings, English by default, with a language toggle.
- Light and dark themes, phone layout from 360 px, keyboard focus, reduced motion.
- Bill chart in SVG with tooltips, month selection, draggable alert threshold, kWh or euros, last year overlay and solar export.
- Choices kept in `localStorage` with safe reads and writes.
- `npm start` static server and `npm run build` single-file output in `dist/solea.html`.
