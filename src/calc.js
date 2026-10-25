// Pure calculation functions. No DOM, no storage, no side effects.
// Every figure produced here is an estimate based on demo data.

const UNIT_FACTORS = { Wh: 0.001, kWh: 1, MWh: 1000 };

const round = (value, digits = 6) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

const sum = (values) => values.reduce((total, v) => total + v, 0);

// Converts a value expressed in Wh, kWh or MWh to kWh.
export function normalizeKwh(value, unit = 'kWh') {
  const factor = UNIT_FACTORS[unit];
  if (factor === undefined) throw new Error(`Unknown energy unit: ${unit}`);
  return round(Number(value) * factor);
}

// The only way the interface reads a monthly series. Returns 12 values in kWh,
// or null when the home has no such series (for example no solar export).
export function homeMonthsKwh(home, key) {
  const series = home && home.months ? home.months[key] : undefined;
  if (!Array.isArray(series)) return null;
  return series.map((v) => normalizeKwh(v, home.unit));
}

// Cost of one month: variable part plus the fixed part, which never disappears.
export function monthlyCost(kwh, price, fixed) {
  return kwh * price + fixed;
}

// Euros saved by avoiding kWh, at constant prices.
export function estimatedSavings(kwhAvoided, price) {
  return kwhAvoided * price;
}

// Reducing a base consumption by a percentage (10 means 10 %).
export function reductionSavings(baseKwh, percent, price) {
  const kwh = round((baseKwh * percent) / 100);
  return { kwh, euros: round(estimatedSavings(kwh, price)) };
}

// Moving kWh from peak to off-peak hours saves the price gap, avoids no kWh,
// and never returns a negative saving.
export function shiftSavings(kwhShifted, peakPrice, offPeakPrice) {
  return Math.max(0, round(kwhShifted * (peakPrice - offPeakPrice)));
}

// Annual totals from 12 monthly kWh values and a monthly fixed part.
export function annualTotals(months, price, fixed) {
  const kwh = round(sum(months));
  const variable = round(kwh * price);
  const fixedTotal = round(fixed * months.length);
  return { kwh, variable, fixed: fixedTotal, total: round(variable + fixedTotal) };
}

// Indexes (0 to 11) of the months strictly above the threshold.
export function monthsAboveThreshold(months, threshold) {
  const out = [];
  months.forEach((v, i) => {
    if (v > threshold) out.push(i);
  });
  return out;
}

// Estimated euros per year for one action, by kind.
export function actionEurosPerYear(action, price) {
  if (action.kind === 'shift') {
    return shiftSavings(action.kwhPerYear, action.peakPrice, action.offPeakPrice);
  }
  if (action.kind === 'fixed') return round((action.fixedSavingPerMonth || 0) * 12);
  return round(estimatedSavings(action.kwhPerYear, price));
}

// kWh per year avoided by an action. A shift avoids nothing.
export function actionKwhAvoided(action) {
  return action.kind === 'reduce' ? action.kwhPerYear : 0;
}

// Saving per euro spent. Free actions with a saving rank first (Infinity).
export function savingRatio(eurosPerYear, cost) {
  if (cost <= 0) return eurosPerYear > 0 ? Infinity : 0;
  return eurosPerYear / cost;
}

const SORTERS = {
  ratio: (a, b) => b.ratio - a.ratio || b.eurosPerYear - a.eurosPerYear,
  euros: (a, b) => b.eurosPerYear - a.eurosPerYear || b.ratio - a.ratio,
  cost: (a, b) => a.cost - b.cost || b.eurosPerYear - a.eurosPerYear,
  effort: (a, b) => a.effort - b.effort || b.eurosPerYear - a.eurosPerYear,
};

// Returns a new array of actions enriched with eurosPerYear, kwhAvoided,
// ratio and paybackYears, sorted by criterion: ratio, euros, cost or effort.
export function rankActions(actions, price, criterion = 'ratio') {
  const sorter = SORTERS[criterion];
  if (!sorter) throw new Error(`Unknown criterion: ${criterion}`);
  return actions
    .map((action) => {
      const eurosPerYear = actionEurosPerYear(action, price);
      return {
        ...action,
        eurosPerYear,
        kwhAvoided: actionKwhAvoided(action),
        ratio: savingRatio(eurosPerYear, action.cost),
        paybackYears: paybackYears(action.cost, eurosPerYear),
      };
    })
    .sort((a, b) => sorter(a, b) || a.id.localeCompare(b.id));
}

// ---------- KPI helpers ----------

export function kwhPerM2(kwh, surface) {
  if (!surface || surface <= 0) return null;
  return round(kwh / surface);
}

// Estimated kg CO2e from kWh and a demo factor in kg CO2e per kWh.
export function co2Estimate(kwh, factor) {
  return round(kwh * factor);
}

// Cost of kwh when the energy price changes by pct percent. The fixed part
// (same period as kwh) does not move with the energy price.
export function priceScenario(kwh, price, pct, fixed = 0) {
  return round(kwh * price * (1 + pct / 100) + fixed);
}

// kWh to avoid to reach a reduction goal of pct percent.
export function goalKwh(kwh, pct) {
  return round((kwh * pct) / 100);
}

// Years to recover the upfront cost. 0 when free, null when nothing is saved.
export function paybackYears(cost, eurosPerYear) {
  if (cost <= 0) return 0;
  if (!eurosPerYear || eurosPerYear <= 0) return null;
  return round(cost / eurosPerYear, 2);
}

// Index of the largest value (the first one on a tie). -1 for an empty list.
export function peakIndex(values) {
  if (!values || values.length === 0) return -1;
  let best = 0;
  values.forEach((v, i) => {
    if (v > values[best]) best = i;
  });
  return best;
}

// Changing a heating or cooling setpoint by some degrees, with a demo
// hypothesis of pctPerDegree percent of that usage per degree. Capped at 100 %.
export function setpointSavings(usageKwh, degrees, pctPerDegree, price) {
  const share = Math.min(1, Math.max(0, (degrees * pctPerDegree) / 100));
  const kwh = round(usageKwh * share);
  return { kwh, euros: round(kwh * price) };
}

// Summary of the chosen actions. rankedActions must come from rankActions.
export function planSummary(rankedActions, chosenIds) {
  const chosen = rankedActions.filter((a) => chosenIds.includes(a.id));
  const eurosPerYear = round(sum(chosen.map((a) => a.eurosPerYear)));
  const upfrontCost = round(sum(chosen.map((a) => a.cost)));
  return {
    count: chosen.length,
    actions: chosen,
    eurosPerYear,
    kwhAvoided: round(sum(chosen.map((a) => a.kwhAvoided))),
    kwhShifted: round(sum(chosen.filter((a) => a.kind === 'shift').map((a) => a.kwhPerYear))),
    upfrontCost,
    paybackYears: paybackYears(upfrontCost, eurosPerYear),
  };
}

// Share (0 to 1, capped) of a kWh goal covered by kWh avoided. null without a goal.
export function goalCoverage(kwhAvoided, goal) {
  if (!goal || goal <= 0) return null;
  return Math.min(1, round(kwhAvoided / goal, 4));
}

// Relative change from previous to current, as a fraction. null when previous is 0.
export function changeRatio(current, previous) {
  if (!previous) return null;
  return round((current - previous) / previous, 6);
}

// Estimated split of one month by usage. The usages other than heating or
// cooling are spread evenly over the year; heating or cooling takes the rest.
// Returns an object { usageKey: kWh } whose values sum to the month.
export function monthBreakdown(monthsKwh, index, shares, climateKey = 'climate') {
  const annual = sum(monthsKwh);
  const month = monthsKwh[index];
  const otherShare = 1 - (shares[climateKey] || 0);
  const base = (annual * otherShare) / 12;
  const others = Math.min(base, month);
  const out = {};
  Object.keys(shares).forEach((key) => {
    if (key === climateKey) return;
    out[key] = otherShare > 0 ? round((others * shares[key]) / otherShare) : 0;
  });
  out[climateKey] = round(month - sum(Object.values(out)));
  return out;
}

// Combined result of the What if levers, for one year.
// price and offPeakPrice move together with pricePct; fixedPerYear does not.
export function combinedScenario({
  annualKwh,
  price,
  offPeakPrice,
  fixedPerYear,
  reduceKwh = 0,
  setpointKwh = 0,
  shiftKwh = 0,
  pricePct = 0,
}) {
  const factor = 1 + pricePct / 100;
  const p = price * factor;
  const op = offPeakPrice * factor;
  const kwhAvoided = Math.min(annualKwh, Math.max(0, reduceKwh + setpointKwh));
  const kwhShifted = Math.min(Math.max(0, shiftKwh), annualKwh - kwhAvoided);
  const todayBill = round(annualKwh * price + fixedPerYear);
  const billAtScenarioPrice = round(annualKwh * p + fixedPerYear);
  const newBill = round((annualKwh - kwhAvoided) * p + fixedPerYear - shiftSavings(kwhShifted, p, op));
  return {
    kwhAvoided: round(kwhAvoided),
    kwhShifted: round(kwhShifted),
    todayBill,
    billAtScenarioPrice,
    newBill,
    eurosSaved: round(billAtScenarioPrice - newBill),
    changeVsToday: round(newBill - todayBill),
  };
}

// CSV text of the twelve months. rows: [{ month, thisYear, lastYear, euros, export? }]
export function monthsToCsv(rows, withExport = false) {
  const header = ['month', 'kwh_this_year', 'kwh_last_year', 'estimated_euros_this_year'];
  if (withExport) header.push('kwh_solar_export');
  const fmt = (v) => String(round(v, 2));
  const lines = rows.map((r) => {
    const cells = [r.month, fmt(r.thisYear), fmt(r.lastYear), fmt(r.euros)];
    if (withExport) cells.push(fmt(r.export || 0));
    return cells.join(',');
  });
  return [header.join(','), ...lines].join('\n');
}
