import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeKwh,
  homeMonthsKwh,
  monthlyCost,
  estimatedSavings,
  reductionSavings,
  shiftSavings,
  annualTotals,
  monthsAboveThreshold,
  rankActions,
  kwhPerM2,
  co2Estimate,
  priceScenario,
  goalKwh,
  paybackYears,
  peakIndex,
  setpointSavings,
  planSummary,
  goalCoverage,
  changeRatio,
  monthBreakdown,
  combinedScenario,
  monthsToCsv,
  actionEurosPerYear,
} from '../src/calc.js';
import { HOMES, CO2_FACTORS, USAGE_KEYS } from '../src/data.js';
import { LANGS, STRINGS, translate } from '../src/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------- known results from the brief ----------

test('100 kWh avoided at 0.20 € saves 20 €', () => {
  assert.ok(close(estimatedSavings(100, 0.2), 20));
});

test('10 % of 1,000 kWh at 0.20 € is 100 kWh and 20 €', () => {
  assert.deepEqual(reductionSavings(1000, 10, 0.2), { kwh: 100, euros: 20 });
});

test('shifting 100 kWh from 0.20 to 0.16 saves 4 € and avoids 0 kWh', () => {
  assert.ok(close(shiftSavings(100, 0.2, 0.16), 4));
  const shift = { id: 's', kind: 'shift', kwhPerYear: 100, peakPrice: 0.2, offPeakPrice: 0.16, cost: 0, effort: 1 };
  const [ranked] = rankActions([shift], 0.2);
  assert.equal(ranked.kwhAvoided, 0);
  assert.ok(close(ranked.eurosPerYear, 4));
});

test('monthlyCost(0, 0.20, 15) is 15: the fixed part never disappears', () => {
  assert.equal(monthlyCost(0, 0.2, 15), 15);
  assert.ok(close(monthlyCost(100, 0.2, 15), 35));
});

test('normalizeKwh(1500, "Wh") is 1.5', () => {
  assert.equal(normalizeKwh(1500, 'Wh'), 1.5);
  assert.equal(normalizeKwh(2, 'MWh'), 2000);
  assert.equal(normalizeKwh(42, 'kWh'), 42);
  assert.equal(normalizeKwh(0.57, 'MWh'), 570);
  assert.throws(() => normalizeKwh(1, 'GJ'));
});

// ---------- formulas ----------

test('shiftSavings is never negative', () => {
  assert.equal(shiftSavings(100, 0.12, 0.2), 0);
  assert.equal(shiftSavings(0, 0.2, 0.16), 0);
});

test('annualTotals returns kwh, variable, fixed and total', () => {
  const months = Array(12).fill(100);
  assert.deepEqual(annualTotals(months, 0.2, 15), { kwh: 1200, variable: 240, fixed: 180, total: 420 });
});

test('monthsAboveThreshold lists months strictly above', () => {
  assert.deepEqual(monthsAboveThreshold([5, 10, 15, 10], 10), [2]);
  assert.deepEqual(monthsAboveThreshold([1, 2], 5), []);
});

test('rankActions sorts by ratio, euros, cost and effort', () => {
  const actions = [
    { id: 'a', kind: 'reduce', kwhPerYear: 1000, cost: 1000, effort: 3 }, // 200 €, ratio 0.2
    { id: 'b', kind: 'reduce', kwhPerYear: 100, cost: 0, effort: 1 }, // 20 €, free
    { id: 'c', kind: 'reduce', kwhPerYear: 500, cost: 100, effort: 2 }, // 100 €, ratio 1
    { id: 'd', kind: 'fixed', kwhPerYear: 0, fixedSavingPerMonth: 2, cost: 0, effort: 2 }, // 24 €, free
  ];
  const ids = (criterion) => rankActions(actions, 0.2, criterion).map((a) => a.id);
  assert.deepEqual(ids('ratio'), ['d', 'b', 'c', 'a']);
  assert.deepEqual(ids('euros'), ['a', 'c', 'd', 'b']);
  assert.deepEqual(ids('cost'), ['d', 'b', 'c', 'a']);
  assert.deepEqual(ids('effort'), ['b', 'c', 'd', 'a']);
  assert.throws(() => rankActions(actions, 0.2, 'colour'));
  // The input is not mutated.
  assert.equal(actions[0].eurosPerYear, undefined);
});

test('KPI helpers', () => {
  assert.equal(kwhPerM2(1000, 100), 10);
  assert.equal(kwhPerM2(1000, 0), null);
  assert.ok(close(co2Estimate(1000, 0.06), 60));
  assert.ok(close(priceScenario(1000, 0.2, 10, 180), 400));
  assert.ok(close(priceScenario(1000, 0.2, 0, 180), 380));
  assert.equal(goalKwh(5000, 10), 500);
  assert.equal(paybackYears(0, 50), 0);
  assert.equal(paybackYears(100, 0), null);
  assert.equal(paybackYears(100, 50), 2);
  assert.equal(peakIndex([1, 5, 3, 5]), 1);
  assert.equal(peakIndex([]), -1);
  assert.deepEqual(setpointSavings(1000, 1, 7, 0.2), { kwh: 70, euros: 14 });
  assert.deepEqual(setpointSavings(1000, 20, 7, 0.2), { kwh: 1000, euros: 200 });
  assert.equal(goalCoverage(50, 100), 0.5);
  assert.equal(goalCoverage(500, 100), 1);
  assert.equal(goalCoverage(50, 0), null);
  assert.ok(close(changeRatio(90, 100), -0.1));
  assert.equal(changeRatio(5, 0), null);
});

test('planSummary adds up the chosen actions only', () => {
  const ranked = rankActions(
    [
      { id: 'r', kind: 'reduce', kwhPerYear: 100, cost: 40, effort: 1 },
      { id: 's', kind: 'shift', kwhPerYear: 100, peakPrice: 0.2, offPeakPrice: 0.16, cost: 0, effort: 1 },
      { id: 'x', kind: 'reduce', kwhPerYear: 999, cost: 0, effort: 1 },
    ],
    0.2,
  );
  const p = planSummary(ranked, ['r', 's']);
  assert.equal(p.count, 2);
  assert.ok(close(p.eurosPerYear, 24));
  assert.equal(p.kwhAvoided, 100);
  assert.equal(p.kwhShifted, 100);
  assert.equal(p.upfrontCost, 40);
  assert.ok(close(p.paybackYears, 40 / 24, 0.01));
  const empty = planSummary(ranked, []);
  assert.equal(empty.count, 0);
  assert.equal(empty.paybackYears, 0);
});

test('monthBreakdown sums to the month and keeps usage shares outside heating', () => {
  const months = [200, 150, 100, 80, 60, 50, 50, 50, 60, 80, 120, 200];
  const shares = { climate: 0.5, hotWater: 0.2, appliances: 0.2, cooking: 0.05, other: 0.05 };
  months.forEach((m, i) => {
    const b = monthBreakdown(months, i, shares);
    const total = Object.values(b).reduce((s, v) => s + v, 0);
    assert.ok(close(total, m, 1e-6), `month ${i}`);
    Object.values(b).forEach((v) => assert.ok(v >= -1e-9));
  });
});

test('combinedScenario combines levers without negative values', () => {
  const base = { annualKwh: 1000, price: 0.2, offPeakPrice: 0.16, fixedPerYear: 180 };
  const today = combinedScenario(base);
  assert.equal(today.newBill, 380);
  assert.equal(today.eurosSaved, 0);
  const r = combinedScenario({ ...base, reduceKwh: 100, shiftKwh: 100 });
  assert.equal(r.kwhAvoided, 100);
  assert.ok(close(r.newBill, 900 * 0.2 + 180 - 4));
  assert.ok(close(r.eurosSaved, 24));
  const price = combinedScenario({ ...base, pricePct: 10 });
  assert.ok(close(price.newBill, 400));
  assert.ok(close(price.changeVsToday, 20));
  const capped = combinedScenario({ ...base, reduceKwh: 5000, shiftKwh: 5000 });
  assert.equal(capped.kwhAvoided, 1000);
  assert.equal(capped.kwhShifted, 0);
  assert.equal(capped.newBill, 180);
});

test('monthsToCsv writes a header and twelve rows', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ month: `m${i}`, thisYear: i, lastYear: i + 1, euros: 15 + i * 0.2 }));
  const csv = monthsToCsv(rows).split('\n');
  assert.equal(csv.length, 13);
  assert.equal(csv[0], 'month,kwh_this_year,kwh_last_year,estimated_euros_this_year');
  assert.equal(csv[2], 'm1,1,2,15.2');
  assert.ok(monthsToCsv(rows, true).startsWith('month,kwh_this_year,kwh_last_year,estimated_euros_this_year,kwh_solar_export'));
});

// ---------- demo data ----------

test('every home is between 1,000 and 30,000 kWh a year', () => {
  HOMES.forEach((h) => {
    ['thisYear', 'lastYear'].forEach((key) => {
      const months = homeMonthsKwh(h, key);
      assert.equal(months.length, 12, `${h.id} ${key}`);
      const total = months.reduce((s, v) => s + v, 0);
      assert.ok(total >= 1000 && total <= 30000, `${h.id} ${key}: ${total}`);
    });
  });
});

test('homes match the orders of magnitude of the brief', () => {
  const expected = { clara: [9900, 0.2, 15], javier: [4600, 0.18, 20], nora: [4700, 0.2, 15] };
  HOMES.forEach((h) => {
    const [kwh, price, fixed] = expected[h.id];
    const total = annualTotals(homeMonthsKwh(h, 'thisYear'), h.price, h.fixedPerMonth);
    assert.ok(Math.abs(total.kwh - kwh) / kwh < 0.05, `${h.id}: ${total.kwh}`);
    assert.equal(h.price, price);
    assert.equal(h.fixedPerMonth, fixed);
  });
});

test('homeMonthsKwh converts each unit and returns null for a missing series', () => {
  const javier = HOMES.find((h) => h.id === 'javier');
  const nora = HOMES.find((h) => h.id === 'nora');
  assert.equal(javier.unit, 'Wh');
  assert.equal(homeMonthsKwh(javier, 'thisYear')[0], 310);
  assert.equal(nora.unit, 'MWh');
  assert.equal(homeMonthsKwh(nora, 'thisYear')[0], 660);
  assert.equal(homeMonthsKwh(nora, 'solarExport').length, 12);
  assert.equal(homeMonthsKwh(javier, 'solarExport'), null);
});

// Bug report: Javier's apartment in Málaga showed 4,600,000 kWh and 828,240 € a year.
// His series is stored in Wh; read without its unit, it was silently taken as kWh.
test('a series without a known unit is rejected, never read as kWh', () => {
  const javier = HOMES.find((h) => h.id === 'javier');
  const { unit, ...javierWithoutUnit } = javier;
  assert.equal(unit, 'Wh');
  assert.throws(() => homeMonthsKwh(javierWithoutUnit, 'thisYear'), /unit/);
  assert.throws(() => homeMonthsKwh({ ...javier, unit: 'wh' }, 'thisYear'), /unit/);
  assert.throws(() => normalizeKwh(310000), /unit/);
  assert.throws(() => normalizeKwh(310000, undefined), /unit/);
  assert.throws(() => normalizeKwh(1, 'toString'), /unit/);
});

test('each daily profile sums to 1 and has 24 hours', () => {
  HOMES.forEach((h) => {
    assert.equal(h.dayProfile.length, 24, h.id);
    const total = h.dayProfile.reduce((s, v) => s + v, 0);
    assert.ok(close(total, 1, 1e-9), `${h.id}: ${total}`);
  });
});

test('each usage breakdown sums to 1 and covers the five usages', () => {
  HOMES.forEach((h) => {
    assert.deepEqual(Object.keys(h.breakdown).sort(), [...USAGE_KEYS].sort(), h.id);
    const total = Object.values(h.breakdown).reduce((s, v) => s + v, 0);
    assert.ok(close(total, 1, 1e-9), `${h.id}: ${total}`);
  });
});

test('homes have the required fields, actions and a demo log', () => {
  const minActions = { clara: 4, javier: 3, nora: 3 };
  HOMES.forEach((h) => {
    ['id', 'name', 'country', 'surface', 'occupants', 'heating', 'unit', 'price', 'offPeakPrice', 'fixedPerMonth', 'fixedLabel'].forEach(
      (field) => assert.ok(h[field] !== undefined, `${h.id}.${field}`),
    );
    assert.ok(CO2_FACTORS[h.country] > 0, `${h.id} CO2 factor`);
    assert.ok(h.actions.length >= minActions[h.id], `${h.id} actions`);
    assert.ok(h.activity.length > 0, `${h.id} activity`);
    h.actions.forEach((a) => {
      assert.ok(['reduce', 'shift', 'fixed'].includes(a.kind), a.id);
      assert.ok([1, 2, 3].includes(a.effort), a.id);
      assert.ok(['low', 'medium', 'high'].includes(a.confidence), a.id);
      assert.ok(a.cost >= 0, a.id);
      if (a.kind === 'shift') assert.ok(a.peakPrice > a.offPeakPrice, a.id);
      assert.ok(actionEurosPerYear(a, h.price) >= 0, a.id);
    });
  });
  assert.equal(HOMES.find((h) => h.id === 'javier').fixedLabel, 'potencia');
  assert.ok(HOMES.find((h) => h.id === 'nora').months.solarExport);
});

test('every action has a label and a demo assumption in the three languages', () => {
  const marker = { en: 'Demo hypothesis', fr: 'Hypothèse de démonstration', es: 'Hipótesis de demostración' };
  HOMES.forEach((h) =>
    h.actions.forEach((a) => {
      LANGS.forEach((lang) => {
        assert.ok(a.label[lang] && a.label[lang].trim(), `${a.id} label ${lang}`);
        assert.ok(a.assumption[lang] && a.assumption[lang].startsWith(marker[lang]), `${a.id} assumption ${lang}`);
      });
    }),
  );
});

// ---------- translations ----------

test('every translation key exists in the three languages', () => {
  const keys = (lang) => Object.keys(STRINGS[lang]).sort();
  LANGS.forEach((lang) => {
    assert.deepEqual(keys(lang), keys('en'), `keys of ${lang}`);
    Object.entries(STRINGS[lang]).forEach(([k, v]) => assert.ok(String(v).trim(), `${lang}.${k} is empty`));
  });
});

test('placeholders match across languages', () => {
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  Object.keys(STRINGS.en).forEach((k) => {
    LANGS.forEach((lang) => assert.equal(vars(STRINGS[lang][k]), vars(STRINGS.en[k]), `${lang}.${k}`));
  });
});

test('every static key used in app.js exists', () => {
  const app = readFileSync(join(ROOT, 'src/app.js'), 'utf8');
  const used = [...app.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(used.length > 100);
  used.forEach((k) => assert.ok(k in STRINGS.en, `missing key ${k}`));
  // Keys built from data.
  const dynamic = [
    ...['dashboard', 'bill', 'sim', 'plan', 'track', 'compare', 'settings', 'about'].flatMap((v) => [`${v}.title`, `${v}.lede`]),
    ...['dashboard', 'bill', 'simulate', 'plan', 'track', 'compare', 'settings', 'about'].map((r) => `nav.${r}`),
    ...HOMES.flatMap((h) => [`country.${h.country}`, `fixed.${h.fixedLabel}`, `kind.${h.kind}`, `usage.climate.${h.climate}`]),
    ...USAGE_KEYS.filter((k) => k !== 'climate').map((k) => `usage.${k}`),
    ...['reduce', 'shift', 'fixed'].map((k) => `kind.${k}Action`),
    ...['low', 'medium', 'high'].map((k) => `confidence.${k}`),
    ...LANGS.map((l) => `lang.${l}`),
    ...['demo', 'done'].map((k) => `log.${k}`),
    ...['summary', 'threshold', 'reminders'].map((k) => `settings.notif.${k}`),
    'plan.added',
    'plan.removed',
    'track.markedDone',
    'track.undone',
  ];
  dynamic.forEach((k) => assert.ok(k in STRINGS.en, `missing key ${k}`));
});

test('translate falls back to English and fills placeholders', () => {
  assert.equal(translate('fr', 'nav.bill'), 'Facture');
  assert.equal(translate('xx', 'nav.bill'), 'Bill');
  assert.equal(translate('en', 'track.doneOn', { date: '1 Oct' }), 'Done on 1 Oct');
  assert.equal(translate('en', 'no.such.key'), 'no.such.key');
});

test('no string claims real time, guarantees or measured results', () => {
  const forbidden = /real[ -]time|guarantee|\bmeasured\b|temps réel|garanti|mesuré|tiempo real|garantiza|medid[oa]s?\b/i;
  const texts = [];
  LANGS.forEach((lang) =>
    Object.entries(STRINGS[lang]).forEach(([k, v]) => {
      // The demo banner states that results are NOT measured, as required by the brief.
      if (k !== 'app.banner') texts.push([`${lang}.${k}`, v]);
    }),
  );
  HOMES.forEach((h) => {
    h.actions.forEach((a) => LANGS.forEach((l) => texts.push([`${a.id}.${l}`, `${a.label[l]} ${a.assumption[l]}`])));
    h.activity.forEach((e, i) => LANGS.forEach((l) => texts.push([`${h.id}.activity${i}.${l}`, e.text[l]])));
  });
  texts.forEach(([where, text]) => assert.ok(!forbidden.test(text), `${where}: ${text}`));
});

// ---------- repository rules ----------

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (['node_modules', '.git', 'dist'].includes(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

// Built from code points so this file does not contain the characters it looks for.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

test('no em dash or en dash anywhere in the sources and docs', () => {
  const files = listFiles(ROOT).filter((f) => ['.js', '.css', '.html', '.md', '.json'].includes(extname(f)));
  assert.ok(files.length > 5);
  files.forEach((f) => {
    const text = readFileSync(f, 'utf8');
    assert.ok(!DASHES.test(text), `dash found in ${f}`);
  });
});

test('the interface never reads home.months directly', () => {
  const app = readFileSync(join(ROOT, 'src/app.js'), 'utf8');
  assert.ok(!/\.months\b/.test(app), 'app.js must use homeMonthsKwh');
});
