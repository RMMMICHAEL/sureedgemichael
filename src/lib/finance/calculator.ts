/**
 * calculator.ts
 * Pure financial calculation functions — no side effects, fully testable.
 */

import type { Leg, Operation, ResultType, SignalType } from '@/types';

// ── Leg profit ───────────────────────────────────────────────────────────────

export function calcLegProfit(leg: Pick<Leg, 'st' | 'od' | 're' | 'manualProfit' | 'cashoutValue'>): number {
  if (leg.manualProfit !== undefined) return +leg.manualProfit.toFixed(2);
  const st = +(leg.st) || 0;
  const od = +(leg.od) || 0;
  switch (leg.re as ResultType) {
    case 'Green':      return +(st * (od - 1)).toFixed(2);
    case 'Meio Green': return +(st * (od - 1) * 0.5).toFixed(2);
    case 'Red':        return -st;
    case 'Meio Red':   return +(-st * 0.5).toFixed(2);
    case 'Devolvido':  return 0;
    // Cashout: profit = cashoutValue received − stake invested
    case 'Cashout':    return leg.cashoutValue !== undefined
                         ? +(leg.cashoutValue - st).toFixed(2)
                         : 0;
    default:           return 0;  // Pendente
  }
}

// ── Signal classification (live vs pre-match) ────────────────────────────────
// Delta between bet date and event date.
// If bet is placed within [-5, +45] minutes of event start → live.

export function classifySignal(
  bd: string | undefined,
  ed: string | undefined
): SignalType {
  if (!bd || !ed) return 'pre';
  const delta = (new Date(ed).getTime() - new Date(bd).getTime()) / 60_000;
  return delta >= -5 && delta <= 45 ? 'live' : 'pre';
}

// ── Group legs into operations ───────────────────────────────────────────────

export function groupLegsIntoOps(legs: Leg[]): Operation[] {
  const map: Record<string, Leg[]> = {};
  legs.forEach(l => {
    if (!map[l.oid]) map[l.oid] = [];
    map[l.oid].push(l);
  });

  return Object.values(map).map(ls => ({
    id:       ls[0].oid,
    legs:     ls,
    sport:    ls[0].sp,
    event:    ls[0].ev,
    bet_date: ls[0].bd,
    signal:   classifySignal(ls[0].bd, ls[0].ed),
    profit:   +ls.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2),
    pending:  ls.some(l => l.re === 'Pendente'),
    hasFlag:  ls.some(l => l.fl && l.fl.length > 0),
  }));
}

// ── Period filtering ─────────────────────────────────────────────────────────

export function filterByDate(
  legs: Leg[],
  from: string | null,
  to: string | null
): Leg[] {
  if (!from && !to) return legs;
  return legs.filter(l => {
    const d = (l.bd || '').slice(0, 10);
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
}

// ── KPI calculations ─────────────────────────────────────────────────────────

export interface KPIs {
  profitDay:   number;
  profitWeek:  number;
  profitMonth: number;
  profitTotal: number;
  roi:         number;
  cash:        number;
  pending:     number;
  totalLegs:   number;
  totalOps:    number;
  liveCount:   number;
  preCount:    number;
}

export function calcKPIs(
  allLegs: Leg[],
  filteredLegs: Leg[],
  bmBalances: number[],
  bankBalances: number[]
): KPIs {
  const today   = new Date().toISOString().slice(0, 10);
  const weekMon = (() => {
    const d = new Date(today);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return d.toISOString().slice(0, 10);
  })();
  const mStart = today.slice(0, 7) + '-01';

  const profitDay   = +allLegs.filter(l => (l.bd || '').slice(0, 10) === today)
    .reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);
  const profitWeek  = +allLegs.filter(l => (l.bd || '').slice(0, 10) >= weekMon)
    .reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);
  const profitMonth = +allLegs.filter(l => (l.bd || '').slice(0, 10) >= mStart)
    .reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);
  const profitTotal = +allLegs.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);

  const filtProfit = +filteredLegs.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);
  const filtStake  = filteredLegs
    .filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido')
    .reduce((s, l) => s + l.st, 0);
  const roi = filtStake > 0 ? +(filtProfit / filtStake * 100).toFixed(2) : 0;

  const cash = [...bmBalances, ...bankBalances].reduce((s, b) => s + b, 0);
  const pending = allLegs.filter(l => l.re === 'Pendente').length;

  const ops = groupLegsIntoOps(filteredLegs);
  const liveCount = filteredLegs.filter(l => classifySignal(l.bd, l.ed) === 'live').length;
  const preCount  = filteredLegs.length - liveCount;

  return {
    profitDay, profitWeek, profitMonth, profitTotal,
    roi, cash, pending,
    totalLegs: filteredLegs.length,
    totalOps:  ops.length,
    liveCount, preCount,
  };
}

// ── Weekly breakdown ─────────────────────────────────────────────────────────

export interface WeekDay {
  label: string;
  date: string;
  profit: number;
  isToday: boolean;
}

export function calcWeekDays(legs: Leg[]): WeekDay[] {
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date(today);
  const dow = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));

  const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(mon);
    dt.setDate(mon.getDate() + i);
    const date = dt.toISOString().slice(0, 10);
    const profit = +legs
      .filter(l => (l.bd || '').slice(0, 10) === date)
      .reduce((s, l) => s + calcLegProfit(l), 0)
      .toFixed(2);
    return { label: labels[i], date, profit, isToday: date === today };
  });
}

// ── Monthly cumulative ───────────────────────────────────────────────────────

export interface MonthPoint {
  day: string;       // "dd"
  date: string;      // "YYYY-MM-DD"
  cumulative: number;
}

export function calcMonthCumulative(legs: Leg[]): MonthPoint[] {
  const today  = new Date().toISOString().slice(0, 10);
  const mStart = today.slice(0, 7) + '-01';
  const mLegs  = legs.filter(l => (l.bd || '').slice(0, 10) >= mStart);

  const byDay: Record<string, number> = {};
  mLegs.forEach(l => {
    const d = l.bd.slice(0, 10);
    byDay[d] = (byDay[d] || 0) + calcLegProfit(l);
  });

  const days = Object.keys(byDay).sort();
  let cum = 0;
  return days.map(date => {
    cum += byDay[date];
    return { day: date.slice(8), date, cumulative: +cum.toFixed(2) };
  });
}

// ── By sport ─────────────────────────────────────────────────────────────────

export interface SportStat {
  sport: string;
  profit: number;
  legs: number;
}

export function calcBySport(legs: Leg[]): SportStat[] {
  const map: Record<string, SportStat> = {};
  legs.forEach(l => {
    const sp = l.sp || 'Outros';
    if (!map[sp]) map[sp] = { sport: sp, profit: 0, legs: 0 };
    map[sp].profit += calcLegProfit(l);
    map[sp].legs   += 1;
  });
  return Object.values(map)
    .map(s => ({ ...s, profit: +s.profit.toFixed(2) }))
    .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit));
}

// ── By hour ──────────────────────────────────────────────────────────────────

export interface HourStat {
  hour: string;   // "HH"
  legs: number;
  profit: number;
}

export function calcByHour(legs: Leg[]): HourStat[] {
  const map: Record<string, HourStat> = {};
  legs.forEach(l => {
    const h = (l.bd || '').slice(11, 13) || '00';
    if (!map[h]) map[h] = { hour: h, legs: 0, profit: 0 };
    map[h].legs   += 1;
    map[h].profit += calcLegProfit(l);
  });
  return Object.values(map)
    .map(h => ({ ...h, profit: +h.profit.toFixed(2) }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

// ── Weekly profit (last N weeks) ─────────────────────────────────────────────

export interface WeekStat {
  weekLabel: string;   // "Sem 1", "Sem 2", ...
  dateFrom:  string;   // "YYYY-MM-DD" (Monday)
  dateTo:    string;   // "YYYY-MM-DD" (Sunday)
  profit:    number;
  ops:       number;
  roi:       number;
}

export function calcWeeklyProfit(legs: Leg[], nWeeks = 8): WeekStat[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  // current Monday
  const thisMon = new Date(today);
  thisMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));

  return Array.from({ length: nWeeks }, (_, i) => {
    const weekIndex = nWeeks - 1 - i;
    const from = new Date(thisMon);
    from.setDate(thisMon.getDate() - weekIndex * 7);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);

    const dateFrom = from.toISOString().slice(0, 10);
    const dateTo   = to.toISOString().slice(0, 10);

    const wLegs = legs.filter(l => {
      const d = (l.bd || '').slice(0, 10);
      return d >= dateFrom && d <= dateTo;
    });

    const profit = +wLegs.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);
    const ops    = groupLegsIntoOps(wLegs).length;
    const stake  = wLegs
      .filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido')
      .reduce((s, l) => s + l.st, 0);
    const roi = stake > 0 ? +(profit / stake * 100).toFixed(2) : 0;

    const weekLabel = weekIndex === 0
      ? 'Esta sem.'
      : weekIndex === 1
        ? 'Sem. passada'
        : `-${weekIndex}sem`;

    return { weekLabel, dateFrom, dateTo, profit, ops, roi };
  });
}

// ── Daily profit (last N days) ────────────────────────────────────────────────

export interface DayStat {
  dayLabel: string;   // "DD/MM"
  date:     string;   // "YYYY-MM-DD"
  profit:   number;
  ops:      number;
}

export function calcDailyProfit(legs: Leg[], nDays = 30): DayStat[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: nDays }, (_, i) => {
    const dt = new Date(today);
    dt.setDate(today.getDate() - (nDays - 1 - i));
    const date = dt.toISOString().slice(0, 10);
    const mm = date.slice(5, 7);
    const dd = date.slice(8, 10);

    const dLegs = legs.filter(l => (l.bd || '').slice(0, 10) === date);
    const profit = +dLegs.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);
    const ops    = groupLegsIntoOps(dLegs).length;

    return { dayLabel: `${dd}/${mm}`, date, profit, ops };
  });
}

// ── Result distribution ───────────────────────────────────────────────────────

export interface ResultDist {
  result: string;
  count:  number;
  profit: number;
  color:  string;
}

export function calcResultDistribution(legs: Leg[]): ResultDist[] {
  const RESULTS: { key: ResultType | 'Pendente'; color: string }[] = [
    { key: 'Green',       color: '#22c55e' },
    { key: 'Meio Green',  color: '#86efac' },
    { key: 'Red',         color: '#ef4444' },
    { key: 'Meio Red',    color: '#fca5a5' },
    { key: 'Cashout',     color: '#f59e0b' },
    { key: 'Devolvido',   color: '#6b7280' },
    { key: 'Pendente',    color: '#3b82f6' },
  ];

  return RESULTS.map(({ key, color }) => {
    const subset = legs.filter(l => l.re === key);
    return {
      result: key,
      count:  subset.length,
      profit: +subset.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2),
      color,
    };
  }).filter(r => r.count > 0);
}

// ── By house ─────────────────────────────────────────────────────────────────

export interface HouseStat {
  house: string;
  legs: number;
  profit: number;
  stake: number;
  roi: number;
}

export function calcByHouse(legs: Leg[]): HouseStat[] {
  const map: Record<string, HouseStat> = {};
  legs.forEach(l => {
    const h = l.ho || 'Outros';
    if (!map[h]) map[h] = { house: h, legs: 0, profit: 0, stake: 0, roi: 0 };
    map[h].legs   += 1;
    map[h].profit += calcLegProfit(l);
    if (l.re !== 'Pendente' && l.re !== 'Devolvido') map[h].stake += l.st;
  });
  return Object.values(map).map(h => ({
    ...h,
    profit: +h.profit.toFixed(2),
    roi:    h.stake > 0 ? +(h.profit / h.stake * 100).toFixed(2) : 0,
  })).sort((a, b) => b.legs - a.legs);
}
