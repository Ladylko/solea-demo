// Routing and rendering only. Calculations live in calc.js, data in data.js,
// strings in i18n.js. Every figure shown is an estimate on demo data.
import {
  homeMonthsKwh,
  monthlyCost,
  annualTotals,
  monthsAboveThreshold,
  rankActions,
  kwhPerM2,
  co2Estimate,
  priceScenario,
  goalKwh,
  peakIndex,
  setpointSavings,
  reductionSavings,
  shiftSavings,
  planSummary,
  goalCoverage,
  changeRatio,
  monthBreakdown,
  combinedScenario,
  monthsToCsv,
} from './calc.js';
import { HOMES, CO2_FACTORS, META, USAGE_KEYS } from './data.js';
import { LANGS, LOCALES, translate } from './i18n.js';

const ROUTES = ['dashboard', 'bill', 'simulate', 'plan', 'track', 'compare', 'settings', 'about'];
const PCT_PER_DEGREE = 7;
const PRICE_STEPS = [-10, 0, 10, 20, 30];
const SORTS = ['ratio', 'euros', 'cost', 'effort'];

// ---------- storage (every access wrapped) ----------

const PREFIX = 'solea:';

function load(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, blocked). The app keeps working in memory.
  }
}

function clearStored() {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Nothing stored, or storage unavailable.
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function defaultState() {
  return {
    lang: 'en',
    theme: null,
    homeId: HOMES[0].id,
    chosen: {},
    done: {},
    thresholds: {},
    goalPct: 10,
    profiles: {},
    notifications: { summary: false, threshold: true, reminders: false },
  };
}

function loadState() {
  const s = defaultState();
  const lang = load('lang', s.lang);
  if (LANGS.includes(lang)) s.lang = lang;
  const theme = load('theme', null);
  if (theme === 'light' || theme === 'dark') s.theme = theme;
  const homeId = load('home', s.homeId);
  if (HOMES.some((h) => h.id === homeId)) s.homeId = homeId;
  const chosen = load('chosen', {});
  if (isObject(chosen)) s.chosen = chosen;
  const done = load('done', {});
  if (isObject(done)) s.done = done;
  const thresholds = load('thresholds', {});
  if (isObject(thresholds)) s.thresholds = thresholds;
  const goal = Number(load('goal', s.goalPct));
  if (Number.isFinite(goal) && goal >= 0 && goal <= 100) s.goalPct = goal;
  const profiles = load('profiles', {});
  if (isObject(profiles)) s.profiles = profiles;
  const notifications = load('notifications', s.notifications);
  if (isObject(notifications)) s.notifications = { ...s.notifications, ...notifications };
  return s;
}

const state = loadState();

// UI state that is not stored.
const ui = { billUnit: 'kwh', overlay: false, selectedMonth: null, sort: 'ratio', csvOpen: false };
const SIM_DEFAULTS = { usage: 'climate', reducePct: 10, shiftKwh: 500, degrees: 1, pricePct: 0 };
const sim = { ...SIM_DEFAULTS };

// ---------- formatting ----------

const t = (key, vars) => translate(state.lang, key, vars);
const locale = () => LOCALES[state.lang];

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const fmt = {
  num: (v, digits = 0) =>
    new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v),
  compact: (v) => new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v),
  compactEur: (v) =>
    new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(v),
  eur: (v, digits = 0) =>
    new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(v),
  kwh: (v) => `${fmt.num(v)} kWh`,
  pct: (fraction, digits = 0) =>
    new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: digits }).format(fraction),
  signedPct: (fraction, digits = 1) =>
    new Intl.NumberFormat(locale(), {
      style: 'percent',
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
      signDisplay: 'exceptZero',
    }).format(fraction),
  signedEur: (v) =>
    new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
      signDisplay: 'exceptZero',
    }).format(v),
  signedNum: (v) =>
    new Intl.NumberFormat(locale(), { maximumFractionDigits: 0, signDisplay: 'exceptZero' }).format(v),
  month: (i, style = 'short') => new Intl.DateTimeFormat(locale(), { month: style }).format(new Date(2026, i, 1)),
  date: (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(y, m - 1, d),
    );
  },
  hour: (h) => `${String(h).padStart(2, '0')}:00`,
  years: (v) => {
    if (v === null) return t('payback.none');
    if (v === 0) return t('payback.free');
    return t('payback.years', { n: fmt.num(v, 1) });
  },
};

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- model ----------

const homeById = (id) => HOMES.find((h) => h.id === id) || HOMES[0];
const currentHome = () => homeById(state.homeId);
const chosenFor = (h) => (Array.isArray(state.chosen[h.id]) ? state.chosen[h.id] : []);
const doneFor = (h) => (isObject(state.done[h.id]) ? state.done[h.id] : {});

function thresholdFor(h) {
  const v = Number(state.thresholds[h.id]);
  return Number.isFinite(v) && v >= 0 ? v : h.defaultThreshold;
}

function profileFor(h) {
  const p = isObject(state.profiles[h.id]) ? state.profiles[h.id] : {};
  const surface = Number(p.surface);
  const occupants = Number(p.occupants);
  return {
    surface: Number.isFinite(surface) && surface > 0 ? surface : h.surface,
    occupants: Number.isFinite(occupants) && occupants > 0 ? occupants : h.occupants,
  };
}

function model(h = currentHome()) {
  const thisYear = homeMonthsKwh(h, 'thisYear');
  const lastYear = homeMonthsKwh(h, 'lastYear');
  const solarExport = homeMonthsKwh(h, 'solarExport');
  const totals = annualTotals(thisYear, h.price, h.fixedPerMonth);
  const lastTotals = annualTotals(lastYear, h.price, h.fixedPerMonth);
  const profile = profileFor(h);
  const threshold = thresholdFor(h);
  const ranked = rankActions(h.actions, h.price, 'ratio');
  const plan = planSummary(ranked, chosenFor(h));
  const goal = goalKwh(totals.kwh, state.goalPct);
  const mainUsage = USAGE_KEYS.reduce((best, k) => (h.breakdown[k] > h.breakdown[best] ? k : best), USAGE_KEYS[0]);
  return {
    home: h,
    thisYear,
    lastYear,
    solarExport,
    totals,
    lastTotals,
    profile,
    threshold,
    above: monthsAboveThreshold(thisYear, threshold),
    ranked,
    plan,
    goal,
    coverage: goalCoverage(plan.kwhAvoided, goal),
    co2Factor: CO2_FACTORS[h.country],
    co2: co2Estimate(totals.kwh, CO2_FACTORS[h.country]),
    perM2: kwhPerM2(totals.kwh, profile.surface),
    kwhChange: changeRatio(totals.kwh, lastTotals.kwh),
    peakHour: peakIndex(h.dayProfile),
    highestMonth: peakIndex(thisYear),
    climateKwh: totals.kwh * h.breakdown.climate,
    mainUsage,
  };
}

const usageLabel = (h, key) => (key === 'climate' ? t(`usage.climate.${h.climate}`) : t(`usage.${key}`));
const fixedLabel = (h) => t(`fixed.${h.fixedLabel}`);
const placeLabel = (h) => `${h.city}, ${t(`country.${h.country}`)}`;

// ---------- small render helpers ----------

function statusTag(kind, label) {
  const icon = { good: '▼', attention: '▲', alert: '!' }[kind];
  return `<span class="status status-${kind}"><span aria-hidden="true">${icon}</span> ${esc(label)}</span>`;
}

// Lower is better for consumption: a fall is good, a rise needs attention.
function changeTag(fraction) {
  if (fraction === null) return '';
  if (Math.abs(fraction) < 0.0005) return `<span class="status status-neutral">${esc(t('change.flat'))}</span>`;
  return fraction < 0
    ? statusTag('good', t('change.lower'))
    : statusTag('attention', t('change.higher'));
}

function effortDots(effort) {
  const dots = [1, 2, 3].map((i) => `<span class="dot${i <= effort ? ' on' : ''}"></span>`).join('');
  return `<span class="effort" role="img" aria-label="${esc(t('effort.aria', { n: effort }))}">${dots}</span>`;
}

function meter(fraction, label) {
  const v = fraction === null ? 0 : Math.round(fraction * 100);
  return `<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${esc(label)}"><span style="width:${v}%"></span></div>`;
}

function ratioLabel(a) {
  if (a.ratio === Infinity) return t('ratio.free');
  if (a.ratio === 0) return t('ratio.none');
  return t('ratio.value', { n: fmt.num(a.ratio, 2) });
}

function toggleButton(h, a, extraClass = '') {
  const chosen = chosenFor(h).includes(a.id);
  const label = chosen ? t('plan.remove') : t('plan.add');
  return `<button type="button" class="btn ${chosen ? 'btn-quiet' : 'btn-primary'} ${extraClass}" data-action="toggle-plan" data-id="${esc(a.id)}" data-fk="toggle:${esc(a.id)}" aria-label="${esc(`${label}: ${a.label[state.lang]}`)}">${esc(label)}</button>`;
}

function viewHead(key) {
  return `<header class="view-head">
    <h1 id="view-title" tabindex="-1">${esc(t(`${key}.title`))}</h1>
    <p class="lede">${esc(t(`${key}.lede`, { name: currentHome().name }))}</p>
  </header>`;
}

function hbars(rows, { max, valueFormat, emphasis } = {}) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return `<ul class="hbars">${rows
    .map((r, i) => {
      const w = top > 0 ? Math.max(0, (r.value / top) * 100) : 0;
      return `<li class="hbar${emphasis === i ? ' is-emphasis' : ''}">
        <span class="hbar-label">${esc(r.label)}</span>
        <span class="hbar-track"><span class="hbar-fill${r.tone ? ` tone-${r.tone}` : ''}" style="width:${w.toFixed(2)}%"></span></span>
        <span class="hbar-value">${esc(valueFormat ? valueFormat(r) : r.value)}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

// ---------- shell ----------

const SUN_MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <circle cx="16" cy="17" r="9" class="mark-sun"/>
  <path d="M3 22c6-3.5 20-3.5 26 0v6H3z" class="mark-leaf"/>
</svg>`;

function renderShell() {
  document.documentElement.lang = state.lang;
  document.title = t('app.docTitle');
  const route = currentRoute();
  const app = document.getElementById('app');
  app.innerHTML = `
    <a class="skip" href="#main" data-action="skip">${esc(t('app.skip'))}</a>
    <header class="topbar">
      <div class="topbar-inner">
        <a class="wordmark" href="#dashboard" aria-label="${esc(t('app.home'))}">${SUN_MARK}<span>Soléa</span></a>
        <nav class="nav" aria-label="${esc(t('app.navLabel'))}">
          <ul>${ROUTES.map(
            (r) =>
              `<li><a href="#${r}" ${r === route ? 'aria-current="page"' : ''}>${esc(t(`nav.${r}`))}</a></li>`,
          ).join('')}</ul>
        </nav>
        <div class="toggles">
          <div class="seg" role="group" aria-label="${esc(t('app.language'))}">
            ${LANGS.map(
              (l) =>
                `<button type="button" class="seg-btn" data-action="lang" data-lang="${l}" data-fk="lang:${l}" aria-pressed="${l === state.lang}" lang="${l}" aria-label="${esc(t(`lang.${l}`))}">${l.toUpperCase()}</button>`,
            ).join('')}
          </div>
          <button type="button" class="icon-btn" data-action="theme" data-fk="theme" aria-pressed="${effectiveTheme() === 'dark'}" aria-label="${esc(t('app.darkTheme'))}" title="${esc(t('app.darkTheme'))}">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
          </button>
        </div>
      </div>
    </header>
    <p class="demo-banner" role="note"><span class="banner-dot" aria-hidden="true"></span>${esc(t('app.banner'))}</p>
    <section class="homes" aria-label="${esc(t('homes.label'))}"><div class="homes-inner" id="homes"></div></section>
    <main id="main" class="main" tabindex="-1"></main>
    <footer class="footer">
      <p>${esc(t('app.footer'))}</p>
      <p class="footer-meta">Soléa ${esc(META.version)}</p>
    </footer>
    <div class="sr-only" aria-live="polite" id="live"></div>`;
  renderHomes();
}

function renderHomes() {
  const el = document.getElementById('homes');
  if (!el) return;
  el.innerHTML = HOMES.map((h) => {
    const m = model(h);
    const active = h.id === state.homeId;
    return `<button type="button" class="home-card${active ? ' is-active' : ''}" data-action="home" data-id="${h.id}" data-fk="home:${h.id}" aria-pressed="${active}">
      <span class="home-name">${esc(h.name)}</span>
      <span class="home-meta">${esc(t(`kind.${h.kind}`))}, ${esc(placeLabel(h))}</span>
      <span class="home-heat">${esc(h.heating[state.lang])}</span>
      <span class="home-fig">${esc(fmt.kwh(m.totals.kwh))} <span class="home-fig-sub">${esc(t('homes.perYear'))}</span></span>
    </button>`;
  }).join('');
}

function effectiveTheme() {
  if (state.theme) return state.theme;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme() {
  if (state.theme) document.documentElement.setAttribute('data-theme', state.theme);
  else document.documentElement.removeAttribute('data-theme');
}

function announce(message) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  window.setTimeout(() => {
    live.textContent = message;
  }, 30);
}

// ---------- dashboard ----------

function kpiTile(id, label, value, sub, def, extra = '') {
  return `<div class="kpi" tabindex="0" aria-describedby="def-${id}">
    <p class="kpi-label">${esc(label)}</p>
    <p class="kpi-value">${value}</p>
    ${sub ? `<p class="kpi-sub">${sub}</p>` : ''}
    ${extra}
    <span class="kpi-def" role="tooltip" id="def-${id}">${esc(def)}</span>
  </div>`;
}

function sparkline(values) {
  const w = 120;
  const h = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 8) + 4, h - 4 - ((v - min) / span) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">
    <path d="${d}" class="spark-line"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" class="spark-dot"/>
  </svg>`;
}

function renderDashboard() {
  const m = model();
  const h = m.home;
  const avgDay = m.totals.total / 365;
  const fixedShare = m.totals.fixed / m.totals.total;
  const co2Value = m.co2 >= 1000 ? `${fmt.num(m.co2 / 1000, 2)} t` : `${fmt.num(m.co2)} kg`;
  const best = m.ranked.slice(0, 3);
  const tiles = [
    kpiTile(
      'bill',
      t('kpi.bill'),
      esc(fmt.eur(m.totals.total)),
      esc(t('kpi.billSub', { variable: fmt.eur(m.totals.variable), fixed: fmt.eur(m.totals.fixed) })),
      t('kpi.billDef'),
    ),
    kpiTile('kwh', t('kpi.kwh'), esc(fmt.kwh(m.totals.kwh)), '', t('kpi.kwhDef'), sparkline(m.thisYear)),
    kpiTile(
      'change',
      t('kpi.change'),
      esc(m.kwhChange === null ? t('common.na') : fmt.signedPct(m.kwhChange)),
      changeTag(m.kwhChange),
      t('kpi.changeDef'),
    ),
    kpiTile(
      'perm2',
      t('kpi.perM2'),
      esc(m.perM2 === null ? t('common.na') : `${fmt.num(m.perM2)} kWh/m²`),
      esc(t('kpi.perM2Sub', { surface: fmt.num(m.profile.surface) })),
      t('kpi.perM2Def'),
    ),
    kpiTile('day', t('kpi.perDay'), esc(fmt.eur(avgDay, 2)), esc(t('kpi.perDaySub')), t('kpi.perDayDef')),
    kpiTile(
      'fixed',
      t('kpi.fixedShare'),
      esc(fmt.pct(fixedShare, 1)),
      esc(t('kpi.fixedShareSub', { label: fixedLabel(h), amount: fmt.eur(h.fixedPerMonth) })),
      t('kpi.fixedShareDef'),
    ),
    kpiTile(
      'co2',
      t('kpi.co2'),
      esc(co2Value),
      esc(t('kpi.co2Sub', { factor: fmt.num(m.co2Factor, 2) })),
      t('kpi.co2Def'),
    ),
    kpiTile(
      'highest',
      t('kpi.highest'),
      esc(fmt.month(m.highestMonth, 'long')),
      esc(fmt.kwh(m.thisYear[m.highestMonth])),
      t('kpi.highestDef'),
    ),
    kpiTile(
      'above',
      t('kpi.above'),
      esc(fmt.num(m.above.length)),
      esc(t('kpi.aboveSub', { threshold: fmt.kwh(m.threshold) })),
      t('kpi.aboveDef'),
    ),
    kpiTile(
      'peak',
      t('kpi.peakHour'),
      esc(fmt.hour(m.peakHour)),
      esc(t('kpi.peakHourSub', { share: fmt.pct(h.dayProfile[m.peakHour]) })),
      t('kpi.peakHourDef'),
    ),
    kpiTile(
      'plan',
      t('kpi.plan'),
      esc(fmt.eur(m.plan.eurosPerYear)),
      esc(t('kpi.planSub', { n: m.plan.count })),
      t('kpi.planDef'),
    ),
    kpiTile(
      'goal',
      t('kpi.goal'),
      esc(m.coverage === null ? t('common.na') : fmt.pct(m.coverage)),
      esc(t('kpi.goalSub', { pct: fmt.pct(state.goalPct / 100), kwh: fmt.kwh(m.goal) })),
      t('kpi.goalDef'),
      meter(m.coverage, t('kpi.goal')),
    ),
  ];

  const log = activityLog(h).slice(0, 4);
  return `${viewHead('dashboard')}
    <section class="kpis" aria-label="${esc(t('dashboard.kpis'))}">${tiles.join('')}</section>
    <div class="split-2">
      <section class="block">
        <h2>${esc(t('dashboard.bestTitle'))}</h2>
        <p class="block-note">${esc(t('dashboard.bestNote'))}</p>
        <ol class="best">${best
          .map(
            (a) => `<li class="best-item">
              <div class="best-text">
                <p class="best-label">${esc(a.label[state.lang])}</p>
                <p class="best-meta">${esc(t('dashboard.bestMeta', { euros: fmt.eur(a.eurosPerYear), cost: fmt.eur(a.cost), ratio: ratioLabel(a) }))}</p>
              </div>
              ${toggleButton(h, a)}
            </li>`,
          )
          .join('')}</ol>
        <p><a class="text-link" href="#plan">${esc(t('dashboard.allActions'))}</a></p>
      </section>
      <section class="block">
        <h2>${esc(t('dashboard.activity'))}</h2>
        ${renderLogList(log)}
        <p><a class="text-link" href="#track">${esc(t('dashboard.allActivity'))}</a></p>
      </section>
    </div>`;
}

function activityLog(h) {
  const demo = h.activity.map((e) => ({ date: e.date, text: e.text[state.lang], kind: 'demo' }));
  const done = Object.entries(doneFor(h))
    .map(([id, date]) => {
      const a = h.actions.find((x) => x.id === id);
      return a ? { date, text: t('track.doneEvent', { action: a.label[state.lang] }), kind: 'done' } : null;
    })
    .filter(Boolean);
  return [...demo, ...done].sort((a, b) => b.date.localeCompare(a.date) || (a.kind === 'done' ? -1 : 1));
}

function renderLogList(entries) {
  if (!entries.length) return `<p class="empty">${esc(t('track.emptyLog'))}</p>`;
  return `<ol class="log">${entries
    .map(
      (e) => `<li class="log-item log-${e.kind}">
        <time datetime="${esc(e.date)}">${esc(fmt.date(e.date))}</time>
        <span class="log-text">${esc(e.text)}</span>
        <span class="log-kind">${esc(t(`log.${e.kind}`))}</span>
      </li>`,
    )
    .join('')}</ol>`;
}

// ---------- bill ----------

function renderBill() {
  const m = model();
  const h = m.home;
  const variableShare = m.totals.variable / m.totals.total;
  const eurChange = m.totals.total - m.lastTotals.total;
  const selected = ui.selectedMonth ?? m.highestMonth;
  const breakdown = monthBreakdown(m.thisYear, selected, h.breakdown);
  const monthKwh = m.thisYear[selected];

  const sensitivity = PRICE_STEPS.map((pct) => ({
    pct,
    total: priceScenario(m.totals.kwh, h.price, pct, m.totals.fixed),
  }));
  const maxSens = Math.max(...sensitivity.map((s) => s.total));

  const euroSplit = USAGE_KEYS.map((k) => ({
    label: usageLabel(h, k),
    value: m.totals.kwh * h.breakdown[k] * h.price,
  }));
  euroSplit.push({ label: fixedLabel(h), value: m.totals.fixed, tone: 'fixed' });

  return `${viewHead('bill')}
    <section class="bill-hero" aria-labelledby="bill-hero-label">
      <div class="hero-figure">
        <p class="hero-label" id="bill-hero-label">${esc(t('bill.annual'))}</p>
        <p class="hero-value">${esc(fmt.eur(m.totals.total))}</p>
        <p class="hero-change">${changeTag(changeRatio(m.totals.total, m.lastTotals.total))} <span class="muted">${esc(t('bill.changeEur', { pct: fmt.signedPct(changeRatio(m.totals.total, m.lastTotals.total)), eur: fmt.signedEur(eurChange) }))}</span></p>
      </div>
      <div class="split-bar-wrap">
        <div class="split-bar" role="img" aria-label="${esc(t('bill.splitAria', { variable: fmt.eur(m.totals.variable), fixed: fmt.eur(m.totals.fixed) }))}">
          <span class="split-variable" style="width:${(variableShare * 100).toFixed(2)}%"></span>
          <span class="split-fixed" style="width:${((1 - variableShare) * 100).toFixed(2)}%"></span>
        </div>
        <dl class="split-legend">
          <div><dt><span class="key key-variable"></span>${esc(t('bill.variable'))}</dt><dd>${esc(fmt.eur(m.totals.variable))} <span class="muted">${esc(t('bill.variableDetail', { kwh: fmt.kwh(m.totals.kwh), price: fmt.eur(h.price, 2) }))}</span></dd></div>
          <div><dt><span class="key key-fixed"></span>${esc(fixedLabel(h))}</dt><dd>${esc(fmt.eur(m.totals.fixed))} <span class="muted">${esc(t('bill.fixedDetail', { amount: fmt.eur(h.fixedPerMonth) }))}</span></dd></div>
        </dl>
      </div>
    </section>

    <section class="chart-block" aria-labelledby="bill-chart-title">
      <div class="chart-head">
        <h2 id="bill-chart-title">${esc(t('bill.chartTitle'))}</h2>
        <div class="controls">
          <div class="seg" role="group" aria-label="${esc(t('bill.unit'))}">
            <button type="button" class="seg-btn" data-action="bill-unit" data-unit="kwh" data-fk="unit:kwh" aria-pressed="${ui.billUnit === 'kwh'}">kWh</button>
            <button type="button" class="seg-btn" data-action="bill-unit" data-unit="eur" data-fk="unit:eur" aria-pressed="${ui.billUnit === 'eur'}">€</button>
          </div>
          <label class="check"><input type="checkbox" data-action="overlay" data-fk="overlay" ${ui.overlay ? 'checked' : ''}> ${esc(t('bill.overlay'))}</label>
          <label class="field-inline">${esc(t('bill.threshold'))}
            <input type="number" inputmode="numeric" min="0" step="10" id="threshold-input" data-fk="threshold-input" value="${Math.round(m.threshold)}" aria-describedby="threshold-unit">
            <span id="threshold-unit" class="muted">${esc(t('bill.perMonth'))}</span>
          </label>
        </div>
      </div>
      <div class="chart-wrap" id="bill-chart"></div>
      <div class="legend" id="bill-legend"></div>
      <p class="alert-line" id="alert-line" role="status"></p>
      <p class="chart-note">${esc(t('bill.dragHint'))}</p>
      <details class="table-view">
        <summary>${esc(t('common.showTable'))}</summary>
        ${billTable(m)}
      </details>
    </section>

    <div class="split-2">
      <section class="block" id="month-detail" aria-live="polite">
        <h2>${esc(t('bill.monthTitle', { month: fmt.month(selected, 'long') }))}</h2>
        <p class="block-note">${esc(t('bill.monthNote', { kwh: fmt.kwh(monthKwh), eur: fmt.eur(monthlyCost(monthKwh, h.price, h.fixedPerMonth)) }))}</p>
        ${hbars(
          USAGE_KEYS.map((k) => ({ label: usageLabel(h, k), value: breakdown[k] })),
          { max: monthKwh, valueFormat: (r) => fmt.kwh(r.value) },
        )}
      </section>
      <section class="block">
        <h2>${esc(t('bill.splitTitle'))}</h2>
        <p class="block-note">${esc(t('bill.splitNote'))}</p>
        ${hbars(euroSplit, { valueFormat: (r) => fmt.eur(r.value) })}
      </section>
    </div>

    <div class="split-2">
      <section class="block">
        <h2>${esc(t('bill.sensTitle'))}</h2>
        <p class="block-note">${esc(t('bill.sensNote'))}</p>
        <table class="table sens">
          <thead><tr><th scope="col">${esc(t('bill.sensPrice'))}</th><th scope="col" class="num">${esc(t('bill.sensBill'))}</th><th scope="col" class="num">${esc(t('bill.sensDiff'))}</th><th scope="col" class="bar-col"><span class="sr-only">${esc(t('bill.sensBar'))}</span></th></tr></thead>
          <tbody>${sensitivity
            .map(
              (s) => `<tr${s.pct === 0 ? ' class="is-current"' : ''}>
                <th scope="row">${esc(s.pct === 0 ? t('bill.sensToday') : fmt.signedPct(s.pct / 100, 0))}</th>
                <td class="num">${esc(fmt.eur(s.total))}</td>
                <td class="num">${esc(s.pct === 0 ? fmt.eur(0) : fmt.signedEur(s.total - m.totals.total))}</td>
                <td class="bar-col"><span class="mini-bar" style="width:${((s.total / maxSens) * 100).toFixed(1)}%"></span></td>
              </tr>`,
            )
            .join('')}</tbody>
        </table>
      </section>
      <section class="block">
        <h2>${esc(t('bill.dayTitle'))}</h2>
        <p class="block-note">${esc(t('bill.dayNote', { hour: fmt.hour(m.peakHour), kwh: fmt.num(m.totals.kwh / 365, 1) }))}</p>
        <div class="chart-wrap chart-small" id="day-chart"></div>
        <details class="table-view">
          <summary>${esc(t('common.showTable'))}</summary>
          <table class="table compact"><thead><tr><th scope="col">${esc(t('bill.hour'))}</th><th scope="col" class="num">${esc(t('bill.share'))}</th></tr></thead>
          <tbody>${h.dayProfile.map((s, i) => `<tr${i === m.peakHour ? ' class="is-current"' : ''}><th scope="row">${fmt.hour(i)}</th><td class="num">${esc(fmt.pct(s, 1))}</td></tr>`).join('')}</tbody></table>
        </details>
      </section>
    </div>`;
}

function billTable(m) {
  const h = m.home;
  const withExport = Boolean(m.solarExport);
  return `<table class="table compact">
    <thead><tr>
      <th scope="col">${esc(t('common.month'))}</th>
      <th scope="col" class="num">${esc(t('bill.thisYearKwh'))}</th>
      <th scope="col" class="num">${esc(t('bill.lastYearKwh'))}</th>
      <th scope="col" class="num">${esc(t('bill.thisYearEur'))}</th>
      ${withExport ? `<th scope="col" class="num">${esc(t('bill.exportKwh'))}</th>` : ''}
    </tr></thead>
    <tbody>${m.thisYear
      .map(
        (v, i) => `<tr>
          <th scope="row">${esc(fmt.month(i, 'long'))}</th>
          <td class="num">${esc(fmt.num(v))}</td>
          <td class="num">${esc(fmt.num(m.lastYear[i]))}</td>
          <td class="num">${esc(fmt.eur(monthlyCost(v, h.price, h.fixedPerMonth)))}</td>
          ${withExport ? `<td class="num">${esc(fmt.num(m.solarExport[i]))}</td>` : ''}
        </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

// ---------- SVG charts ----------

function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

// Bar with a 4px rounded data end and a square end on the baseline.
function barPath(x, base, w, h, down = false) {
  if (h <= 0.5 || w <= 0) return '';
  const r = Math.min(4, w / 2, h);
  if (down) {
    const b = base + h;
    return `M${x} ${base}V${b - r}Q${x} ${b} ${x + r} ${b}H${x + w - r}Q${x + w} ${b} ${x + w} ${b - r}V${base}Z`;
  }
  const top = base - h;
  return `M${x} ${base}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + w - r}Q${x + w} ${top} ${x + w} ${top + r}V${base}Z`;
}

function rectPath(x, base, w, h) {
  if (h <= 0.5 || w <= 0) return '';
  return `M${x} ${base}V${base - h}H${x + w}V${base}Z`;
}

function showTooltip(wrap, html, anchorX, anchorY) {
  let tip = wrap.querySelector('.tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tooltip';
    wrap.appendChild(tip);
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const ww = wrap.clientWidth;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let left = anchorX - tw / 2;
  left = Math.max(4, Math.min(ww - tw - 4, left));
  let top = anchorY - th - 12;
  if (top < 0) top = anchorY + 16;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideTooltip(wrap) {
  const tip = wrap.querySelector('.tooltip');
  if (tip) tip.hidden = true;
}

function tipRow(value, label, keyClass) {
  return `<div class="tip-row">${keyClass ? `<span class="tip-key ${keyClass}"></span>` : ''}<strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}

function mountBillChart() {
  const wrap = document.getElementById('bill-chart');
  if (!wrap) return;
  const m = model();
  const h = m.home;
  const W = Math.max(280, wrap.clientWidth || 640);
  const narrow = W < 560;
  const H = narrow ? 260 : 340;
  const euros = ui.billUnit === 'eur';
  const showExport = !euros && Boolean(m.solarExport);
  const mg = { top: 26, right: narrow ? 10 : 18, bottom: 30, left: narrow ? 42 : 56 };
  const toUnit = (kwh) => (euros ? monthlyCost(kwh, h.price, h.fixedPerMonth) : kwh);
  const cur = m.thisYear.map(toUnit);
  const prev = m.lastYear.map(toUnit);
  const thresholdMaxKwh = Math.max(...m.thisYear, ...m.lastYear) * 1.25;
  const maxV = Math.max(...cur, ...(ui.overlay ? prev : []), toUnit(m.threshold)) * 1.06;
  const ticks = niceTicks(maxV, narrow ? 3 : 4);
  const top = ticks[ticks.length - 1];
  const expTicks = showExport ? niceTicks(Math.max(...m.solarExport), 1) : [0];
  const bottom = showExport ? -expTicks[expTicks.length - 1] : 0;
  const plotH = H - mg.top - mg.bottom;
  const plotW = W - mg.left - mg.right;
  const y = (v) => mg.top + ((top - v) / (top - bottom)) * plotH;
  const valueFromY = (py) => top - ((py - mg.top) / plotH) * (top - bottom);
  const slot = plotW / 12;
  const barW = ui.overlay ? Math.min(18, slot * 0.34) : Math.min(24, slot * 0.56);
  const gap = 2;
  const base = y(0);
  const fmtV = (v) => (euros ? fmt.eur(v) : fmt.kwh(v));
  const tickFmt = (v) => (euros ? fmt.compactEur(v) : fmt.compact(v));
  const selected = ui.selectedMonth ?? m.highestMonth;
  const fixedH = euros ? base - y(h.fixedPerMonth) : 0;

  const grid = [...ticks, ...(showExport ? [bottom] : [])]
    .map(
      (v) => `<line x1="${mg.left}" x2="${W - mg.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="${v === 0 ? 'axis' : 'grid'}"/>
        <text x="${mg.left - 8}" y="${(y(v) + 4).toFixed(1)}" class="tick" text-anchor="end">${esc(tickFmt(Math.abs(v)))}</text>`,
    )
    .join('');

  const cols = cur
    .map((v, i) => {
      const cx = mg.left + slot * i + slot / 2;
      const x1 = ui.overlay ? cx - barW - gap / 2 : cx - barW / 2;
      const hCur = base - y(v);
      let bars;
      if (euros) {
        bars = `<path d="${rectPath(x1, base, barW, fixedH)}" class="bar-fixed"/>
          <path d="${barPath(x1, base - fixedH - gap, barW, hCur - fixedH - gap)}" class="bar-sun"/>`;
      } else {
        bars = `<path d="${barPath(x1, base, barW, hCur)}" class="bar-sun"/>`;
      }
      if (ui.overlay) {
        bars += `<path d="${barPath(cx + gap / 2, base, barW, base - y(prev[i]))}" class="bar-prev"/>`;
      }
      if (showExport) {
        bars += `<path d="${barPath(x1, base + gap, barW, y(-m.solarExport[i]) - base - gap, true)}" class="bar-export"/>`;
      }
      const label = narrow ? fmt.month(i, 'narrow') : fmt.month(i, 'short');
      const aria = `${fmt.month(i, 'long')}: ${fmtV(v)}${m.above.includes(i) ? `, ${t('bill.aboveThreshold')}` : ''}`;
      return `<g class="col${i === selected ? ' is-selected' : ''}" data-i="${i}" tabindex="0" role="button" aria-pressed="${i === selected}" aria-label="${esc(aria)}" data-fk="month:${i}">
        <rect class="col-band" x="${(mg.left + slot * i + 1).toFixed(1)}" y="${mg.top - 18}" width="${(slot - 2).toFixed(1)}" height="${(H - mg.bottom - mg.top + 18).toFixed(1)}" rx="6"/>
        ${bars}
        <circle class="above-dot" cx="${(x1 + barW / 2).toFixed(1)}" cy="${(y(v) - 9).toFixed(1)}" r="4" ${m.above.includes(i) ? '' : 'display="none"'}/>
        <text x="${cx.toFixed(1)}" y="${H - 10}" class="tick month-tick" text-anchor="middle">${esc(label)}</text>
      </g>`;
    })
    .join('');

  const maxI = peakIndex(cur);
  const maxX = mg.left + slot * maxI + slot / 2 - (ui.overlay ? barW / 2 + gap / 2 : 0);
  const directLabel = narrow
    ? ''
    : `<text x="${maxX.toFixed(1)}" y="${(y(cur[maxI]) - 20).toFixed(1)}" class="direct" text-anchor="middle">${esc(fmtV(cur[maxI]))}</text>`;

  const thY = y(toUnit(m.threshold));
  wrap.innerHTML = `<svg class="chart bill-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(t('bill.chartAria'))}">
      ${grid}
      ${cols}
      ${directLabel}
      <g class="threshold" id="threshold">
        <line class="th-hit" x1="${mg.left}" x2="${W - mg.right}" y1="${thY}" y2="${thY}"/>
        <line class="th-line" x1="${mg.left}" x2="${W - mg.right}" y1="${thY}" y2="${thY}"/>
        <g class="th-handle" tabindex="0" role="slider" aria-label="${esc(t('bill.threshold'))}" aria-valuemin="0" aria-valuemax="${Math.round(thresholdMaxKwh)}" aria-valuenow="${Math.round(m.threshold)}" aria-valuetext="${esc(fmt.kwh(m.threshold))}" data-fk="th-handle" transform="translate(${W - mg.right - 14} ${thY})">
          <rect x="-14" y="-11" width="28" height="22" rx="11" class="th-knob"/>
          <path d="M-5 -3l5 -4l5 4M-5 3l5 4l5 -4" class="th-grip"/>
        </g>
        <text class="th-label" x="${W - mg.right - 34}" y="${thY - 8}" text-anchor="end">${esc(t('bill.thresholdLabel', { value: fmtV(toUnit(m.threshold)) }))}</text>
      </g>
    </svg>`;

  const svg = wrap.querySelector('svg');
  renderBillLegend(showExport, euros);
  updateAlertLine(m.above, m.threshold);

  // Tooltips and month selection.
  const tipFor = (i) => {
    let html = `<p class="tip-title">${esc(fmt.month(i, 'long'))}</p>`;
    if (euros) {
      html += tipRow(fmt.eur(cur[i]), t('bill.tipTotal'), 'key-variable');
      html += tipRow(fmt.eur(h.fixedPerMonth), fixedLabel(h), 'key-fixed');
    } else {
      html += tipRow(fmt.kwh(cur[i]), t('bill.thisYear'), 'key-variable');
    }
    if (ui.overlay) html += tipRow(fmtV(prev[i]), t('bill.lastYear'), 'key-prev');
    if (showExport) html += tipRow(fmt.kwh(m.solarExport[i]), t('bill.export'), 'key-export');
    if (monthsAboveThreshold(m.thisYear, thresholdFor(h)).includes(i)) {
      html += `<p class="tip-alert">${esc(t('bill.aboveThreshold'))}</p>`;
    }
    return html;
  };
  svg.querySelectorAll('.col').forEach((g) => {
    const i = Number(g.dataset.i);
    const anchor = () => {
      const cx = mg.left + slot * i + slot / 2;
      return [cx, ui.overlay ? Math.min(y(cur[i]), y(prev[i])) : y(cur[i])];
    };
    g.addEventListener('pointerenter', () => showTooltip(wrap, tipFor(i), ...anchor()));
    g.addEventListener('pointerleave', () => hideTooltip(wrap));
    g.addEventListener('focus', () => showTooltip(wrap, tipFor(i), ...anchor()));
    g.addEventListener('blur', () => hideTooltip(wrap));
    const select = () => {
      ui.selectedMonth = i;
      renderView();
    };
    g.addEventListener('click', select);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
  });

  // Draggable threshold, synced with the number input.
  const handle = svg.querySelector('.th-handle');
  const hit = svg.querySelector('.th-hit');
  const toKwh = (v) => (euros ? (v - h.fixedPerMonth) / h.price : v);
  const clampKwh = (v) => Math.max(0, Math.min(thresholdMaxKwh, Math.round(v / 10) * 10));
  const svgY = (evt) => {
    const rect = svg.getBoundingClientRect();
    return ((evt.clientY - rect.top) / rect.height) * H;
  };
  let dragging = false;
  const startDrag = (evt) => {
    dragging = true;
    svg.classList.add('is-dragging');
    evt.currentTarget.setPointerCapture(evt.pointerId);
    evt.preventDefault();
    // preventDefault keeps focus where it was: move it to the handle so the
    // number input (if it had focus) is updated while dragging.
    handle.focus({ preventScroll: true });
  };
  const moveDrag = (evt) => {
    if (!dragging) return;
    const v = clampKwh(toKwh(valueFromY(svgY(evt))));
    setThreshold(v, { redraw: false });
    positionThreshold(v);
  };
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    svg.classList.remove('is-dragging');
    save('thresholds', state.thresholds);
  };
  [handle, hit].forEach((el) => {
    el.addEventListener('pointerdown', startDrag);
    el.addEventListener('pointermove', moveDrag);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  });
  handle.addEventListener('keydown', (e) => {
    const stepKwh = e.shiftKey ? 100 : 10;
    const now = thresholdFor(h);
    let v = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v = now + stepKwh;
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v = now - stepKwh;
    if (e.key === 'PageUp') v = now + 100;
    if (e.key === 'PageDown') v = now - 100;
    if (v === null) return;
    e.preventDefault();
    v = clampKwh(v);
    setThreshold(v, { redraw: false });
    positionThreshold(v);
    save('thresholds', state.thresholds);
  });

  function positionThreshold(kwh) {
    const ty = y(toUnit(kwh));
    svg.querySelectorAll('.threshold line').forEach((l) => {
      l.setAttribute('y1', ty);
      l.setAttribute('y2', ty);
    });
    handle.setAttribute('transform', `translate(${W - mg.right - 14} ${ty})`);
    handle.setAttribute('aria-valuenow', Math.round(kwh));
    handle.setAttribute('aria-valuetext', fmt.kwh(kwh));
    const label = svg.querySelector('.th-label');
    label.setAttribute('y', ty - 8);
    label.textContent = t('bill.thresholdLabel', { value: fmtV(toUnit(kwh)) });
    const above = monthsAboveThreshold(m.thisYear, kwh);
    svg.querySelectorAll('.col').forEach((g) => {
      const i = Number(g.dataset.i);
      const dot = g.querySelector('.above-dot');
      if (above.includes(i)) dot.removeAttribute('display');
      else dot.setAttribute('display', 'none');
      g.setAttribute('aria-label', `${fmt.month(i, 'long')}: ${fmtV(cur[i])}${above.includes(i) ? `, ${t('bill.aboveThreshold')}` : ''}`);
    });
  }
  wrap.positionThreshold = positionThreshold;
}

function renderBillLegend(showExport, euros) {
  const el = document.getElementById('bill-legend');
  if (!el) return;
  const items = [];
  if (euros) {
    items.push([t('bill.variable'), 'key-variable']);
    items.push([fixedLabel(currentHome()), 'key-fixed']);
  } else {
    items.push([t('bill.thisYear'), 'key-variable']);
  }
  if (ui.overlay) items.push([t('bill.lastYear'), 'key-prev']);
  if (showExport) items.push([t('bill.export'), 'key-export']);
  items.push([t('bill.thresholdKey'), 'key-threshold']);
  items.push([t('bill.aboveThreshold'), 'key-above']);
  el.innerHTML = items.map(([label, cls]) => `<span class="legend-item"><span class="key ${cls}"></span>${esc(label)}</span>`).join('');
}

function updateAlertLine(above, threshold) {
  const el = document.getElementById('alert-line');
  if (!el) return;
  if (!above.length) {
    el.innerHTML = statusTag('good', t('bill.alertNone', { threshold: fmt.kwh(threshold) }));
    return;
  }
  const months = above.map((i) => fmt.month(i, 'long')).join(', ');
  el.innerHTML = statusTag('alert', t('bill.alertSome', { n: above.length, threshold: fmt.kwh(threshold), months }));
}

// Updates the threshold everywhere on the current view without a full render.
function setThreshold(kwh, { redraw = true } = {}) {
  const h = currentHome();
  state.thresholds[h.id] = kwh;
  const m = model(h);
  updateAlertLine(m.above, kwh);
  const input = document.getElementById('threshold-input');
  if (input && document.activeElement !== input) input.value = Math.round(kwh);
  const out = document.getElementById('threshold-out');
  if (out) out.textContent = t('settings.thresholdOut', { n: m.above.length });
  if (redraw) {
    const wrap = document.getElementById('bill-chart');
    if (wrap && wrap.positionThreshold) wrap.positionThreshold(kwh);
  }
}

function mountDayChart() {
  const wrap = document.getElementById('day-chart');
  if (!wrap) return;
  const m = model();
  const profile = m.home.dayProfile;
  const W = Math.max(260, wrap.clientWidth || 400);
  const H = 170;
  const mg = { top: 14, right: 6, bottom: 24, left: 34 };
  const plotW = W - mg.left - mg.right;
  const plotH = H - mg.top - mg.bottom;
  const ticks = niceTicks(Math.max(...profile), 2);
  const top = ticks[ticks.length - 1];
  const y = (v) => mg.top + (1 - v / top) * plotH;
  const slot = plotW / 24;
  const barW = Math.max(3, Math.min(14, slot - 2));
  const dayKwh = m.totals.kwh / 365;
  const grid = ticks
    .map(
      (v) => `<line x1="${mg.left}" x2="${W - mg.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="${v === 0 ? 'axis' : 'grid'}"/>
      <text x="${mg.left - 6}" y="${(y(v) + 4).toFixed(1)}" class="tick" text-anchor="end">${esc(fmt.pct(v))}</text>`,
    )
    .join('');
  const bars = profile
    .map((s, i) => {
      const x = mg.left + slot * i + (slot - barW) / 2;
      const showLabel = i % (W < 420 ? 6 : 3) === 0;
      return `<g class="col" data-i="${i}">
        <rect class="col-band" x="${(mg.left + slot * i).toFixed(1)}" y="${mg.top}" width="${slot.toFixed(1)}" height="${plotH}"/>
        <path d="${barPath(x, y(0), barW, y(0) - y(s))}" class="${i === m.peakHour ? 'bar-sun' : 'bar-quiet'}"/>
        ${showLabel ? `<text x="${(mg.left + slot * i + slot / 2).toFixed(1)}" y="${H - 6}" class="tick" text-anchor="middle">${i}h</text>` : ''}
      </g>`;
    })
    .join('');
  const peakX = mg.left + slot * m.peakHour + slot / 2;
  wrap.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('bill.dayAria', { hour: fmt.hour(m.peakHour) }))}">
    ${grid}${bars}
    <text x="${peakX.toFixed(1)}" y="${(y(profile[m.peakHour]) - 4).toFixed(1)}" class="direct" text-anchor="middle">${esc(fmt.hour(m.peakHour))}</text>
  </svg>`;
  wrap.querySelectorAll('.col').forEach((g) => {
    const i = Number(g.dataset.i);
    g.addEventListener('pointerenter', () =>
      showTooltip(
        wrap,
        `<p class="tip-title">${esc(t('bill.hourRange', { from: fmt.hour(i), to: fmt.hour((i + 1) % 24) }))}</p>${tipRow(fmt.pct(profile[i], 1), t('bill.ofDay'))}${tipRow(`${fmt.num(dayKwh * profile[i], 2)} kWh`, t('bill.onAverageDay'))}`,
        mg.left + slot * i + slot / 2,
        y(profile[i]),
      ),
    );
    g.addEventListener('pointerleave', () => hideTooltip(wrap));
  });
}

// ---------- what if ----------

function simValues(m) {
  const h = m.home;
  const usageKwh = m.totals.kwh * h.breakdown[sim.usage];
  const reduce = reductionSavings(usageKwh, sim.reducePct, h.price);
  const climateLeft = m.climateKwh - (sim.usage === 'climate' ? reduce.kwh : 0);
  const setpoint = setpointSavings(climateLeft, sim.degrees, PCT_PER_DEGREE, h.price);
  const shiftEur = shiftSavings(sim.shiftKwh, h.price, h.offPeakPrice);
  const combined = combinedScenario({
    annualKwh: m.totals.kwh,
    price: h.price,
    offPeakPrice: h.offPeakPrice,
    fixedPerYear: m.totals.fixed,
    reduceKwh: reduce.kwh,
    setpointKwh: setpoint.kwh,
    shiftKwh: sim.shiftKwh,
    pricePct: sim.pricePct,
  });
  const goal = goalKwh(m.totals.kwh, state.goalPct);
  return {
    usageKwh,
    reduce,
    setpoint,
    shiftEur,
    combined,
    goal,
    scenarioCoverage: goalCoverage(combined.kwhAvoided, goal),
    planCoverage: goalCoverage(m.plan.kwhAvoided, goal),
  };
}

function lever({ id, title, min, max, step, value, unit, note, extra = '' }) {
  return `<fieldset class="lever">
    <legend>${esc(title)}</legend>
    ${extra}
    <div class="range-row">
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-sim="${id}" data-fk="${id}" aria-describedby="${id}-out" style="--pct:${(((value - min) / (max - min)) * 100).toFixed(1)}%">
      <output for="${id}" id="${id}-val" class="range-val">${esc(unit(value))}</output>
    </div>
    <p class="lever-out" id="${id}-out"></p>
    ${note ? `<p class="lever-note">${esc(note)}</p>` : ''}
  </fieldset>`;
}

function renderSimulate() {
  const m = model();
  const h = m.home;
  const maxShift = Math.max(500, Math.round((m.totals.kwh * 0.3) / 50) * 50);
  if (sim.shiftKwh > maxShift) sim.shiftKwh = maxShift;
  const setpointTitle = h.climate === 'cooling' ? t('sim.setpointCooling') : t('sim.setpointHeating');
  return `${viewHead('sim')}
    <div class="sim-layout">
      <div class="levers">
        ${lever({
          id: 'sim-reduce',
          title: t('sim.reduceTitle'),
          min: 0,
          max: 50,
          step: 5,
          value: sim.reducePct,
          unit: (v) => fmt.pct(v / 100),
          extra: `<label class="field">${esc(t('sim.usage'))}
            <select id="sim-usage" data-sim="sim-usage" data-fk="sim-usage">${USAGE_KEYS.map(
              (k) => `<option value="${k}" ${k === sim.usage ? 'selected' : ''}>${esc(usageLabel(h, k))}</option>`,
            ).join('')}</select></label>`,
        })}
        ${lever({
          id: 'sim-shift',
          title: t('sim.shiftTitle'),
          min: 0,
          max: maxShift,
          step: 50,
          value: sim.shiftKwh,
          unit: (v) => fmt.kwh(v),
          note: t('sim.shiftNote', { peak: fmt.eur(h.price, 2), off: fmt.eur(h.offPeakPrice, 2) }),
        })}
        ${lever({
          id: 'sim-setpoint',
          title: setpointTitle,
          min: 0,
          max: 3,
          step: 0.5,
          value: sim.degrees,
          unit: (v) => `${fmt.num(v, 1)} °C`,
          note: t('sim.setpointNote', { pct: fmt.pct(PCT_PER_DEGREE / 100) }),
        })}
        ${lever({
          id: 'sim-price',
          title: t('sim.priceTitle'),
          min: -10,
          max: 30,
          step: 5,
          value: sim.pricePct,
          unit: (v) => fmt.signedPct(v / 100, 0),
          note: t('sim.priceNote'),
        })}
        ${lever({
          id: 'sim-goal',
          title: t('sim.goalTitle'),
          min: 0,
          max: 40,
          step: 5,
          value: state.goalPct,
          unit: (v) => fmt.pct(v / 100),
          note: t('sim.goalNote'),
        })}
        <p class="sim-mini" aria-hidden="true"><span>${esc(t('sim.newBill'))}</span> <strong id="sim-mini-bill"></strong></p>
      </div>
      <aside class="sim-result" aria-labelledby="sim-result-title">
        <h2 id="sim-result-title">${esc(t('sim.resultTitle'))}</h2>
        <p class="hero-label">${esc(t('sim.newBill'))}</p>
        <p class="hero-value" id="sim-bill"></p>
        <p class="sim-vs" id="sim-vs"></p>
        <dl class="facts">
          <div><dt>${esc(t('sim.saved'))}</dt><dd id="sim-saved"></dd></div>
          <div><dt>${esc(t('sim.avoided'))}</dt><dd id="sim-avoided"></dd></div>
          <div><dt>${esc(t('sim.shifted'))}</dt><dd id="sim-shifted"></dd></div>
        </dl>
        <div class="goal-block">
          <p class="goal-line" id="sim-goal-line"></p>
          <p class="meter-label">${esc(t('sim.scenarioCovers'))} <strong id="sim-cov-scn"></strong></p>
          <div id="sim-meter-scn"></div>
          <p class="meter-label">${esc(t('sim.planCovers'))} <strong id="sim-cov-plan"></strong></p>
          <div id="sim-meter-plan"></div>
          <p class="lever-note">${esc(t('sim.planCoversNote'))} <a class="text-link" href="#plan">${esc(t('sim.openPlan'))}</a></p>
        </div>
        <p class="lever-note">${esc(t('sim.disclaimer'))}</p>
      </aside>
    </div>`;
}

function bindSimulate() {
  const root = document.querySelector('.sim-layout');
  if (!root) return;
  const handler = (e) => {
    const id = e.target.dataset.sim;
    if (!id) return;
    const v = e.target.value;
    if (id === 'sim-usage') sim.usage = v;
    if (id === 'sim-reduce') sim.reducePct = Number(v);
    if (id === 'sim-shift') sim.shiftKwh = Number(v);
    if (id === 'sim-setpoint') sim.degrees = Number(v);
    if (id === 'sim-price') sim.pricePct = Number(v);
    if (id === 'sim-goal') {
      state.goalPct = Number(v);
      save('goal', state.goalPct);
    }
    updateSimulate();
  };
  root.addEventListener('input', handler);
  root.addEventListener('change', handler);
  updateSimulate();
}

// Updates the What if outputs in place: no re-render while sliding.
function updateSimulate() {
  const m = model();
  const h = m.home;
  const v = simValues(m);
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('sim-reduce-val', fmt.pct(sim.reducePct / 100));
  set('sim-reduce-out', t('sim.reduceOut', { kwh: fmt.kwh(v.reduce.kwh), eur: fmt.eur(v.reduce.euros), usage: usageLabel(h, sim.usage), base: fmt.kwh(v.usageKwh) }));
  set('sim-shift-val', fmt.kwh(sim.shiftKwh));
  set('sim-shift-out', t('sim.shiftOut', { eur: fmt.eur(v.shiftEur) }));
  set('sim-setpoint-val', `${fmt.num(sim.degrees, 1)} °C`);
  set('sim-setpoint-out', t('sim.setpointOut', { kwh: fmt.kwh(v.setpoint.kwh), eur: fmt.eur(v.setpoint.euros) }));
  set('sim-price-val', fmt.signedPct(sim.pricePct / 100, 0));
  set('sim-price-out', t('sim.priceOut', { bill: fmt.eur(v.combined.billAtScenarioPrice) }));
  set('sim-goal-val', fmt.pct(state.goalPct / 100));
  set('sim-goal-out', t('sim.goalOut', { kwh: fmt.kwh(v.goal) }));
  set('sim-bill', fmt.eur(v.combined.newBill));
  set('sim-mini-bill', fmt.eur(v.combined.newBill));
  set('sim-vs', t('sim.vsToday', { diff: fmt.signedEur(v.combined.changeVsToday), today: fmt.eur(v.combined.todayBill) }));
  set('sim-saved', `${fmt.eur(v.combined.eurosSaved)} ${t('common.perYear')}`);
  set('sim-avoided', fmt.kwh(v.combined.kwhAvoided));
  set('sim-shifted', fmt.kwh(v.combined.kwhShifted));
  set('sim-goal-line', t('sim.goalLine', { pct: fmt.pct(state.goalPct / 100), kwh: fmt.kwh(v.goal) }));
  set('sim-cov-scn', v.scenarioCoverage === null ? t('common.na') : fmt.pct(v.scenarioCoverage));
  set('sim-cov-plan', v.planCoverage === null ? t('common.na') : fmt.pct(v.planCoverage));
  const scn = document.getElementById('sim-meter-scn');
  if (scn) scn.innerHTML = meter(v.scenarioCoverage, t('sim.scenarioCovers'));
  const plan = document.getElementById('sim-meter-plan');
  if (plan) plan.innerHTML = meter(v.planCoverage, t('sim.planCovers'));
  document.querySelectorAll('.levers input[type="range"]').forEach((input) => {
    const min = Number(input.min);
    const max = Number(input.max);
    input.style.setProperty('--pct', `${(((Number(input.value) - min) / (max - min)) * 100).toFixed(1)}%`);
  });
}

// ---------- plan ----------

function renderPlan() {
  const m = model();
  const h = m.home;
  const ranked = rankActions(h.actions, h.price, ui.sort);
  const chosen = chosenFor(h);
  const p = m.plan;
  const sortHeader = (key, label, cls = '') => {
    const active = ui.sort === key;
    const dir = key === 'cost' || key === 'effort' ? 'ascending' : 'descending';
    return `<th scope="col" class="${cls}" ${active ? `aria-sort="${dir}"` : ''}>
      <button type="button" class="sort-btn${active ? ' is-active' : ''}" data-action="sort" data-sort="${key}" data-fk="sort:${key}">${esc(label)}<span class="sort-ind" aria-hidden="true">${active ? (dir === 'ascending' ? '↑' : '↓') : ''}</span></button>
    </th>`;
  };
  const rows = ranked
    .map(
      (a) => `<tr class="${chosen.includes(a.id) ? 'is-chosen' : ''}">
        <td class="action-cell" data-label="${esc(t('plan.action'))}">
          <p class="action-label">${esc(a.label[state.lang])}</p>
          <p class="action-kind"><span class="kind kind-${a.kind}">${esc(t(`kind.${a.kind}Action`))}</span> ${esc(a.kind === 'shift' ? t('plan.shiftKwh', { kwh: fmt.kwh(a.kwhPerYear) }) : a.kind === 'reduce' ? t('plan.reduceKwh', { kwh: fmt.kwh(a.kwhPerYear) }) : t('plan.fixedEur', { eur: fmt.eur(a.fixedSavingPerMonth) }))}</p>
          <details class="assumption"><summary>${esc(t('plan.assumption'))}</summary><p>${esc(a.assumption[state.lang])}</p></details>
        </td>
        <td class="num" data-label="${esc(t('plan.colRatio'))}">${esc(ratioLabel(a))}</td>
        <td class="num" data-label="${esc(t('plan.colEuros'))}">${esc(fmt.eur(a.eurosPerYear))}</td>
        <td class="num" data-label="${esc(t('plan.colCost'))}">${esc(a.cost === 0 ? t('plan.noCost') : fmt.eur(a.cost))}</td>
        <td data-label="${esc(t('plan.colEffort'))}">${effortDots(a.effort)}</td>
        <td data-label="${esc(t('plan.colConfidence'))}">${esc(t(`confidence.${a.confidence}`))}</td>
        <td class="row-action">${toggleButton(h, a, 'btn-small')}</td>
      </tr>`,
    )
    .join('');

  const maxBar = Math.max(1, ...p.actions.flatMap((a) => [a.cost, a.eurosPerYear]));
  const chart = p.actions.length
    ? `<div class="legend"><span class="legend-item"><span class="key key-cost"></span>${esc(t('plan.chartCost'))}</span><span class="legend-item"><span class="key key-saving"></span>${esc(t('plan.chartSaving'))}</span></div>
      <ul class="pairs">${p.actions
        .map(
          (a) => `<li class="pair">
            <p class="pair-label">${esc(a.label[state.lang])}</p>
            <div class="pair-row"><span class="pair-track"><span class="pair-fill fill-cost" style="width:${((a.cost / maxBar) * 100).toFixed(1)}%"></span></span><span class="pair-val">${esc(a.cost === 0 ? t('plan.noCost') : fmt.eur(a.cost))}</span></div>
            <div class="pair-row"><span class="pair-track"><span class="pair-fill fill-saving" style="width:${((a.eurosPerYear / maxBar) * 100).toFixed(1)}%"></span></span><span class="pair-val">${esc(`${fmt.eur(a.eurosPerYear)} ${t('common.perYear')}`)}</span></div>
          </li>`,
        )
        .join('')}</ul>`
    : `<p class="empty">${esc(t('plan.chartEmpty'))}</p>`;

  return `${viewHead('plan')}
    <div class="plan-layout">
      <div class="plan-main">
        <label class="field sort-select">${esc(t('plan.sortBy'))}
          <select data-action="sort-select" data-fk="sort-select">${SORTS.map(
            (k) => `<option value="${k}" ${k === ui.sort ? 'selected' : ''}>${esc(t(`plan.col${k[0].toUpperCase()}${k.slice(1)}`))}</option>`,
          ).join('')}</select>
        </label>
        <table class="table plan-table">
          <caption class="sr-only">${esc(t('plan.caption'))}</caption>
          <thead><tr>
            <th scope="col">${esc(t('plan.action'))}</th>
            ${sortHeader('ratio', t('plan.colRatio'), 'num')}
            ${sortHeader('euros', t('plan.colEuros'), 'num')}
            ${sortHeader('cost', t('plan.colCost'), 'num')}
            ${sortHeader('effort', t('plan.colEffort'))}
            <th scope="col">${esc(t('plan.colConfidence'))}</th>
            <th scope="col"><span class="sr-only">${esc(t('plan.colToggle'))}</span></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="chart-note">${esc(t('plan.ratioNote'))}</p>
      </div>
      <aside class="plan-panel" aria-labelledby="plan-panel-title">
        <h2 id="plan-panel-title">${esc(t('plan.panelTitle'))}</h2>
        <p class="hero-value small">${esc(fmt.eur(p.eurosPerYear))}<span class="hero-unit"> ${esc(t('common.perYear'))}</span></p>
        <p class="muted">${esc(t('plan.estimatedSaving'))}</p>
        <dl class="facts">
          <div><dt>${esc(t('plan.count'))}</dt><dd>${esc(fmt.num(p.count))}</dd></div>
          <div><dt>${esc(t('plan.kwhAvoided'))}</dt><dd>${esc(fmt.kwh(p.kwhAvoided))}</dd></div>
          <div><dt>${esc(t('plan.kwhShifted'))}</dt><dd>${esc(fmt.kwh(p.kwhShifted))}</dd></div>
          <div><dt>${esc(t('plan.upfront'))}</dt><dd>${esc(fmt.eur(p.upfrontCost))}</dd></div>
          <div><dt>${esc(t('plan.payback'))}</dt><dd>${esc(p.count ? fmt.years(p.paybackYears) : t('common.na'))}</dd></div>
        </dl>
        ${
          p.count
            ? `<ul class="plan-list">${p.actions.map((a) => `<li>${esc(a.label[state.lang])}</li>`).join('')}</ul>`
            : `<p class="empty">${esc(t('plan.empty'))}</p>`
        }
        <button type="button" class="btn btn-quiet" data-action="copy-plan" data-fk="copy-plan" ${p.count ? '' : 'disabled'}>${esc(t('plan.copy'))}</button>
        <p class="lever-note">${esc(t('plan.panelNote'))}</p>
      </aside>
    </div>
    <section class="block" aria-labelledby="pair-title">
      <h2 id="pair-title">${esc(t('plan.chartTitle'))}</h2>
      ${chart}
    </section>`;
}

function planText() {
  const m = model();
  const h = m.home;
  const p = m.plan;
  const lines = [
    t('plan.copyTitle', { name: h.name }),
    ...p.actions.map((a) => `- ${a.label[state.lang]}: ${fmt.eur(a.eurosPerYear)} ${t('common.perYear')}, ${t('plan.colCost').toLowerCase()} ${fmt.eur(a.cost)}`),
    `${t('plan.estimatedSaving')}: ${fmt.eur(p.eurosPerYear)} ${t('common.perYear')}`,
    `${t('plan.kwhAvoided')}: ${fmt.kwh(p.kwhAvoided)}`,
    `${t('plan.upfront')}: ${fmt.eur(p.upfrontCost)}`,
    `${t('plan.payback')}: ${fmt.years(p.paybackYears)}`,
    t('app.banner'),
  ];
  return lines.join('\n');
}

// ---------- track ----------

function renderTrack() {
  const m = model();
  const h = m.home;
  const done = doneFor(h);
  const chosen = chosenFor(h);
  const actions = [...m.ranked].sort((a, b) => Number(chosen.includes(b.id)) - Number(chosen.includes(a.id)));
  const rows = m.thisYear.map((v, i) => {
    const prev = m.lastYear[i];
    const eur = monthlyCost(v, h.price, h.fixedPerMonth);
    const eurPrev = monthlyCost(prev, h.price, h.fixedPerMonth);
    return { i, v, prev, diff: v - prev, eur, eurPrev, eurDiff: eur - eurPrev };
  });
  const diffCell = (d, formatted) => {
    const cls = d < 0 ? 'good' : d > 0 ? 'attention' : 'neutral';
    const icon = d < 0 ? '▼' : d > 0 ? '▲' : '';
    return `<td class="num diff diff-${cls}"><span aria-hidden="true">${icon}</span> ${esc(formatted)}</td>`;
  };
  return `${viewHead('track')}
    <div class="split-2">
      <section class="block">
        <h2>${esc(t('track.actionsTitle'))}</h2>
        <ul class="track-list">${actions
          .map((a) => {
            const date = done[a.id];
            return `<li class="track-item${date ? ' is-done' : ''}">
              <div>
                <p class="action-label">${esc(a.label[state.lang])}</p>
                <p class="track-status">${
                  date
                    ? statusTag('good', t('track.doneOn', { date: fmt.date(date) }))
                    : esc(chosen.includes(a.id) ? t('track.inPlan') : t('track.notInPlan'))
                }</p>
              </div>
              ${
                date
                  ? `<button type="button" class="btn btn-quiet btn-small" data-action="undo" data-id="${esc(a.id)}" data-fk="done:${esc(a.id)}" aria-label="${esc(`${t('track.undo')}: ${a.label[state.lang]}`)}">${esc(t('track.undo'))}</button>`
                  : `<button type="button" class="btn btn-primary btn-small" data-action="done" data-id="${esc(a.id)}" data-fk="done:${esc(a.id)}" aria-label="${esc(`${t('track.markDone')}: ${a.label[state.lang]}`)}">${esc(t('track.markDone'))}</button>`
              }
            </li>`;
          })
          .join('')}</ul>
      </section>
      <section class="block">
        <h2>${esc(t('track.logTitle'))}</h2>
        ${renderLogList(activityLog(h))}
      </section>
    </div>
    <section class="block">
      <h2>${esc(t('track.compareTitle'))}</h2>
      <p class="note-box">${esc(t('track.compareNote'))}</p>
      <div class="table-scroll">
      <table class="table compact month-table">
        <thead><tr>
          <th scope="col">${esc(t('common.month'))}</th>
          <th scope="col" class="num">${esc(t('track.thisYear'))}</th>
          <th scope="col" class="num">${esc(t('track.lastYear'))}</th>
          <th scope="col" class="num">${esc(t('track.diffKwh'))}</th>
          <th scope="col" class="num col-eur">${esc(t('track.eurThis'))}</th>
          <th scope="col" class="num">${esc(t('track.diffEur'))}</th>
        </tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
              <th scope="row">${esc(fmt.month(r.i, 'short'))}</th>
              <td class="num">${esc(fmt.num(r.v))}</td>
              <td class="num">${esc(fmt.num(r.prev))}</td>
              ${diffCell(r.diff, fmt.signedNum(r.diff))}
              <td class="num col-eur">${esc(fmt.eur(r.eur))}</td>
              ${diffCell(r.eurDiff, fmt.signedEur(r.eurDiff))}
            </tr>`,
          )
          .join('')}</tbody>
        <tfoot><tr>
          <th scope="row">${esc(t('track.total'))}</th>
          <td class="num">${esc(fmt.num(m.totals.kwh))}</td>
          <td class="num">${esc(fmt.num(m.lastTotals.kwh))}</td>
          ${diffCell(m.totals.kwh - m.lastTotals.kwh, fmt.signedNum(m.totals.kwh - m.lastTotals.kwh))}
          <td class="num col-eur">${esc(fmt.eur(m.totals.total))}</td>
          ${diffCell(m.totals.total - m.lastTotals.total, fmt.signedEur(m.totals.total - m.lastTotals.total))}
        </tr></tfoot>
      </table>
      </div>
      <p class="chart-note">${esc(t('track.unitNote'))}</p>
    </section>`;
}

// ---------- compare ----------

function renderCompare() {
  const models = HOMES.map((h) => model(h));
  const metrics = [
    { key: 'kwh', label: t('compare.kwh'), value: (m) => m.totals.kwh, show: (v) => fmt.kwh(v), color: true },
    { key: 'eur', label: t('compare.eur'), value: (m) => m.totals.total, show: (v) => fmt.eur(v), color: true },
    { key: 'perm2', label: t('compare.perM2'), value: (m) => m.perM2, show: (v) => `${fmt.num(v)} kWh/m²`, color: true },
    { key: 'fixed', label: t('compare.fixedShare'), value: (m) => m.totals.fixed / m.totals.total, show: (v) => fmt.pct(v, 1), color: true },
    { key: 'co2', label: t('compare.co2'), value: (m) => m.co2, show: (v) => `${fmt.num(v)} kg`, color: true },
    { key: 'main', label: t('compare.mainUsage'), value: () => null, show: () => '', text: (m) => `${usageLabel(m.home, m.mainUsage)} (${fmt.pct(m.home.breakdown[m.mainUsage])})` },
    { key: 'plan', label: t('compare.plan'), value: (m) => m.plan.eurosPerYear, show: (v) => `${fmt.eur(v)} ${t('common.perYear')}`, color: false },
  ];
  const body = metrics
    .map((mt) => {
      const values = models.map((m) => mt.value(m));
      const valid = values.filter((v) => typeof v === 'number');
      const min = Math.min(...valid);
      const max = Math.max(...valid);
      const cells = models
        .map((m, i) => {
          if (mt.text) return `<td class="num${m.home.id === state.homeId ? ' is-current' : ''}">${esc(mt.text(m))}</td>`;
          const v = values[i];
          let tag = '';
          if (mt.color && min !== max) {
            if (v === min) tag = statusTag('good', t('compare.lowest'));
            if (v === max) tag = statusTag('alert', t('compare.highest'));
          }
          return `<td class="num${m.home.id === state.homeId ? ' is-current' : ''}">${esc(mt.show(v))}${tag ? `<br>${tag}` : ''}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${esc(mt.label)}</th>${cells}</tr>`;
    })
    .join('');
  const current = models.findIndex((m) => m.home.id === state.homeId);
  return `${viewHead('compare')}
    <section class="block">
      <div class="table-scroll">
      <table class="table compare-table">
        <caption class="sr-only">${esc(t('compare.caption'))}</caption>
        <thead><tr><th scope="col"><span class="sr-only">${esc(t('compare.metric'))}</span></th>${models
          .map(
            (m) =>
              `<th scope="col" class="num${m.home.id === state.homeId ? ' is-current' : ''}">${esc(m.home.name)}<span class="th-sub">${esc(t(`kind.${m.home.kind}`))}, ${esc(m.home.city)}</span></th>`,
          )
          .join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      </div>
      <p class="chart-note">${esc(t('compare.note'))}</p>
    </section>
    <section class="block">
      <h2>${esc(t('compare.barsTitle'))}</h2>
      <p class="block-note">${esc(t('compare.barsNote'))}</p>
      ${hbars(
        models.map((m) => ({ label: m.home.name, value: m.perM2 || 0 })),
        { valueFormat: (r) => `${fmt.num(r.value)} kWh/m²`, emphasis: current },
      )}
    </section>`;
}

// ---------- settings ----------

function renderSettings() {
  const m = model();
  const h = m.home;
  const n = state.notifications;
  const sources = [
    ['Linky', t('settings.notConnected'), 'off'],
    ['Datadis', t('settings.notConnected'), 'off'],
    [t('settings.manual'), t('settings.available'), 'on'],
    [t('settings.currentHome', { name: h.name }), t('settings.demoData'), 'demo'],
  ];
  return `${viewHead('settings')}
    <div class="settings">
      <section class="block setting">
        <h2>${esc(t('settings.thresholdTitle'))}</h2>
        <label class="field">${esc(t('settings.thresholdLabel', { name: h.name }))}
          <span class="input-unit"><input type="number" inputmode="numeric" min="0" step="10" id="settings-threshold" data-fk="settings-threshold" value="${Math.round(m.threshold)}"> <span>kWh</span></span>
        </label>
        <p class="lever-note" id="threshold-out">${esc(t('settings.thresholdOut', { n: m.above.length }))}</p>
      </section>

      <section class="block setting">
        <h2>${esc(t('settings.notifTitle'))}</h2>
        <p class="block-note">${esc(t('settings.notifNote'))}</p>
        ${['summary', 'threshold', 'reminders']
          .map(
            (k) => `<label class="switch"><input type="checkbox" data-action="notif" data-key="${k}" data-fk="notif:${k}" ${n[k] ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>${esc(t(`settings.notif.${k}`))} <span class="tag">${esc(t('common.demo'))}</span></span></label>`,
          )
          .join('')}
      </section>

      <section class="block setting">
        <h2>${esc(t('settings.profileTitle'))}</h2>
        <div class="field-row">
          <label class="field">${esc(t('settings.surface'))}
            <span class="input-unit"><input type="number" min="10" max="1000" step="1" id="profile-surface" data-profile="surface" data-fk="profile-surface" value="${m.profile.surface}"> <span>m²</span></span>
          </label>
          <label class="field">${esc(t('settings.occupants'))}
            <input type="number" min="1" max="12" step="1" id="profile-occupants" data-profile="occupants" data-fk="profile-occupants" value="${m.profile.occupants}">
          </label>
        </div>
        <p class="lever-note" id="profile-out">${esc(t('settings.profileOut', { value: fmt.num(m.perM2 || 0), perPerson: fmt.kwh(m.totals.kwh / m.profile.occupants) }))}</p>
      </section>

      <section class="block setting">
        <h2>${esc(t('settings.sourcesTitle'))}</h2>
        <dl class="sources">${sources
          .map(
            ([name, status, kind]) => `<div class="source"><dt>${esc(name)}</dt><dd><span class="pill pill-${kind}">${esc(status)}</span></dd></div>`,
          )
          .join('')}</dl>
        <p class="lever-note">${esc(t('settings.sourcesNote'))}</p>
      </section>

      <section class="block setting">
        <h2>${esc(t('settings.csvTitle'))}</h2>
        <p class="block-note">${esc(t('settings.csvNote'))}</p>
        <button type="button" class="btn btn-quiet" data-action="copy-csv" data-fk="copy-csv">${esc(t('settings.csvCopy'))}</button>
        <details class="table-view"${ui.csvOpen ? ' open' : ''}>
          <summary>${esc(t('settings.csvShow'))}</summary>
          <label class="sr-only" for="csv-text">CSV</label>
          <textarea id="csv-text" class="csv" rows="8" readonly>${esc(csvText())}</textarea>
        </details>
      </section>

      <section class="block setting">
        <h2>${esc(t('settings.resetTitle'))}</h2>
        <p class="block-note">${esc(t('settings.resetNote'))}</p>
        <button type="button" class="btn btn-danger" data-action="reset" data-fk="reset">${esc(t('settings.reset'))}</button>
      </section>
    </div>`;
}

function csvText() {
  const m = model();
  const h = m.home;
  const rows = m.thisYear.map((v, i) => ({
    month: fmt.month(i, 'long'),
    thisYear: v,
    lastYear: m.lastYear[i],
    euros: monthlyCost(v, h.price, h.fixedPerMonth),
    export: m.solarExport ? m.solarExport[i] : 0,
  }));
  return monthsToCsv(rows, Boolean(m.solarExport));
}

function bindSettings() {
  const thr = document.getElementById('settings-threshold');
  if (thr) {
    thr.addEventListener('input', () => {
      const v = Number(thr.value);
      if (!Number.isFinite(v) || v < 0) return;
      setThreshold(v);
      save('thresholds', state.thresholds);
    });
  }
  document.querySelectorAll('[data-profile]').forEach((input) => {
    input.addEventListener('input', () => {
      const h = currentHome();
      const v = Number(input.value);
      if (!Number.isFinite(v) || v <= 0) return;
      const current = isObject(state.profiles[h.id]) ? state.profiles[h.id] : {};
      state.profiles[h.id] = { ...current, [input.dataset.profile]: v };
      save('profiles', state.profiles);
      const m = model(h);
      const out = document.getElementById('profile-out');
      if (out) out.textContent = t('settings.profileOut', { value: fmt.num(m.perM2 || 0), perPerson: fmt.kwh(m.totals.kwh / m.profile.occupants) });
    });
  });
}

// ---------- about ----------

function renderAbout() {
  const list = (key) =>
    `<ul class="plain-list">${t(key)
      .split('|')
      .map((s) => `<li>${esc(s)}</li>`)
      .join('')}</ul>`;
  const formulas = [
    'monthlyCost',
    'estimatedSavings',
    'reductionSavings',
    'shiftSavings',
    'annualTotals',
    'priceScenario',
    'goalKwh',
    'setpointSavings',
    'paybackYears',
    'co2Estimate',
    'kwhPerM2',
    'rankActions',
  ];
  return `${viewHead('about')}
    <div class="split-2">
      <section class="block">
        <h2>${esc(t('about.worksTitle'))}</h2>
        ${list('about.works')}
      </section>
      <section class="block">
        <h2>${esc(t('about.simTitle'))}</h2>
        ${list('about.simulated')}
      </section>
    </div>
    <section class="block">
      <h2>${esc(t('about.formulasTitle'))}</h2>
      <p class="block-note">${esc(t('about.formulasNote'))}</p>
      <dl class="formulas">${formulas.map((name) => `<div><dt><code>${esc(name)}</code></dt><dd>${esc(t(`about.f.${name}`))}</dd></div>`).join('')}</dl>
    </section>
    <section class="block">
      <h2>${esc(t('about.versionTitle'))}</h2>
      <dl class="facts facts-narrow">
        <div><dt>${esc(t('about.version'))}</dt><dd>${esc(META.version)}</dd></div>
        <div><dt>${esc(t('about.dataUpdate'))}</dt><dd><time datetime="${META.dataUpdated}">${esc(fmt.date(META.dataUpdated))}</time></dd></div>
      </dl>
    </section>`;
}

// ---------- router ----------

const VIEWS = {
  dashboard: { render: renderDashboard },
  bill: { render: renderBill, mount: () => { mountBillChart(); mountDayChart(); } },
  simulate: { render: renderSimulate, mount: bindSimulate },
  plan: { render: renderPlan },
  track: { render: renderTrack },
  compare: { render: renderCompare },
  settings: { render: renderSettings, mount: bindSettings },
  about: { render: renderAbout },
};

function currentRoute() {
  const r = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(r) ? r : 'dashboard';
}

const focusKey = () => (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null);

function restoreFocus(fk) {
  if (!fk) return;
  const el = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
  if (el) el.focus({ preventScroll: true });
}

function renderView({ focusTitle = false, fk = focusKey() } = {}) {
  const main = document.getElementById('main');
  if (!main) return;
  const route = currentRoute();
  main.innerHTML = VIEWS[route].render();
  main.dataset.view = route;
  if (VIEWS[route].mount) VIEWS[route].mount();
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.getAttribute('href') === `#${route}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${t(`nav.${route}`)} | ${t('app.docTitle')}`;
  if (focusTitle) {
    const title = document.getElementById('view-title');
    if (title) title.focus({ preventScroll: true });
  } else {
    restoreFocus(fk);
  }
}

function renderAll() {
  const fk = focusKey();
  renderShell();
  renderView({ fk });
}

// ---------- events ----------

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function flashButton(btn, text) {
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = text;
  window.setTimeout(() => {
    if (btn.isConnected) btn.textContent = original;
  }, 1600);
}

function onClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const h = currentHome();
  switch (action) {
    case 'skip': {
      e.preventDefault();
      document.getElementById('main').focus();
      break;
    }
    case 'lang':
      state.lang = target.dataset.lang;
      save('lang', state.lang);
      renderAll();
      announce(t('app.langChanged'));
      break;
    case 'theme':
      state.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
      save('theme', state.theme);
      applyTheme();
      target.setAttribute('aria-pressed', String(state.theme === 'dark'));
      break;
    case 'home':
      state.homeId = target.dataset.id;
      ui.selectedMonth = null;
      save('home', state.homeId);
      {
        const fk = focusKey();
        renderHomes();
        renderView({ fk });
      }
      announce(t('homes.changed', { name: currentHome().name }));
      break;
    case 'toggle-plan': {
      const id = target.dataset.id;
      const list = chosenFor(h);
      const adding = !list.includes(id);
      state.chosen[h.id] = adding ? [...list, id] : list.filter((x) => x !== id);
      save('chosen', state.chosen);
      renderView();
      const a = h.actions.find((x) => x.id === id);
      announce(t(adding ? 'plan.added' : 'plan.removed', { action: a ? a.label[state.lang] : '' }));
      break;
    }
    case 'sort':
      ui.sort = SORTS.includes(target.dataset.sort) ? target.dataset.sort : 'ratio';
      renderView();
      break;
    case 'done':
    case 'undo': {
      const id = target.dataset.id;
      const map = { ...doneFor(h) };
      if (action === 'done') map[id] = todayIso();
      else delete map[id];
      state.done[h.id] = map;
      save('done', state.done);
      renderView();
      announce(t(action === 'done' ? 'track.markedDone' : 'track.undone'));
      break;
    }
    case 'bill-unit':
      ui.billUnit = target.dataset.unit === 'eur' ? 'eur' : 'kwh';
      renderView();
      break;
    case 'copy-plan':
      copyText(planText()).then((ok) => {
        flashButton(target, ok ? t('common.copied') : t('common.copyFailed'));
        announce(ok ? t('common.copied') : t('common.copyFailed'));
      });
      break;
    case 'copy-csv':
      copyText(csvText()).then((ok) => {
        flashButton(target, ok ? t('common.copied') : t('common.copyFailed'));
        announce(ok ? t('common.copied') : t('common.copyFailed'));
        if (!ok) {
          ui.csvOpen = true;
          const details = target.parentElement.querySelector('details');
          if (details) details.open = true;
        }
      });
      break;
    case 'reset': {
      clearStored();
      const fresh = defaultState();
      Object.assign(state, fresh);
      Object.assign(ui, { billUnit: 'kwh', overlay: false, selectedMonth: null, sort: 'ratio', csvOpen: false });
      Object.assign(sim, SIM_DEFAULTS);
      applyTheme();
      renderAll();
      announce(t('settings.resetDone'));
      const btn = document.querySelector('[data-action="reset"]');
      if (btn) {
        btn.focus();
        flashButton(btn, t('settings.resetDone'));
      }
      break;
    }
    default:
      break;
  }
}

function onChange(e) {
  const target = e.target;
  if (target.dataset.action === 'overlay') {
    ui.overlay = target.checked;
    renderView();
  }
  if (target.dataset.action === 'sort-select') {
    ui.sort = SORTS.includes(target.value) ? target.value : 'ratio';
    renderView();
  }
  if (target.dataset.action === 'notif') {
    state.notifications = { ...state.notifications, [target.dataset.key]: target.checked };
    save('notifications', state.notifications);
  }
}

function onInput(e) {
  if (e.target.id === 'threshold-input') {
    const v = Number(e.target.value);
    if (!Number.isFinite(v) || v < 0) return;
    setThreshold(v);
    save('thresholds', state.thresholds);
  }
}

let resizeTimer = null;
let lastWidth = window.innerWidth;
function onResize() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (Math.abs(window.innerWidth - lastWidth) < 8) return;
    lastWidth = window.innerWidth;
    const mount = VIEWS[currentRoute()].mount;
    if (currentRoute() === 'bill' && mount) mount();
  }, 150);
}

function start() {
  applyTheme();
  renderAll();
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  window.addEventListener('hashchange', () => {
    renderView({ focusTitle: true });
    window.scrollTo({ top: 0 });
  });
  window.addEventListener('resize', onResize);
}

start();
