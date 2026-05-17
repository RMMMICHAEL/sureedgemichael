'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  ScanSearch, Search, X, Building2, Filter, RefreshCw,
  ChevronDown, ChevronUp, Star,
} from 'lucide-react';
import { SurebetCalc, ALL_HOUSES } from '@/components/calcalendario/SurebetCalc';

// ── CSS keyframes (injected once) ─────────────────────────────────────────────
const LIVE_STYLES = `
@keyframes oddBounce {
  0%   { transform: scale(1); }
  18%  { transform: scale(1.22); }
  38%  { transform: scale(0.93); }
  58%  { transform: scale(1.1);  }
  78%  { transform: scale(0.97); }
  100% { transform: scale(1);   }
}
@keyframes livePulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: .4; transform: scale(0.75); }
}
`;

// ── Types ──────────────────────────────────────────────────────────────────────

interface CachedEvent {
  id: string;
  name: string;
  sport: string;
  league: string;
  start_utc: string;
  house_count: number;
}

interface BMRow {
  house:   string;
  pa:      boolean;
  url?:    string;
  mlHome?: number;
  mlDraw?: number;
  mlAway?: number;
  dc1X?:   number;
  dcX2?:   number;
  dc12?:   number;
}

interface ParsedSearch {
  home:   string;
  away:   string;
  date:   string;
  league: string;
  rows:   BMRow[];
}

type ColKey = 'mlHome' | 'mlDraw' | 'mlAway' | 'dc1X' | 'dcX2' | 'dc12';

interface RankLeg {
  house: string;
  label: string;
  odd: number;
}

interface RankItem {
  legs: [RankLeg, RankLeg, RankLeg];
  margin: number;
  profit: number;
}

// ── Live odds types ────────────────────────────────────────────────────────────
type ChangeDir = 'up' | 'down';
interface OddChange { direction: ChangeDir; changedAt: number; }
type LiveChanges = Map<string, OddChange>; // key = `${house}:${colKey}`

// ── PA bookmakers set ──────────────────────────────────────────────────────────

const PA_SET = new Set([
  'betano','novibet','betvip','betsul','betesporte','brasilbet','betsson','bet365',
  'bet365arg','bet365pe','lotogreen','kto','vivasorte','sportingbet','superbet',
  'apostabet','br4bet','esportesdasorte','esportiva','esportivabet','sortenabet',
  'betmgm','estrelabet','bet7k','jogodeouro','mcgames','meridianbet','meridian',
  'versusbet','vupi','vupibet','vaidebet',
]);

function isPa(house: string): boolean {
  const n = house.toLowerCase().replace(/[\s\-_.]/g, '');
  // Suffix "SO" (Sem Odds / sem pagamento antecipado) — never PA, even if base name is PA
  if (n.endsWith('so')) return false;
  if (PA_SET.has(n)) return true;
  for (const pa of PA_SET) {
    if (n.length >= 4 && pa.length >= 4 && (n.startsWith(pa) || pa.startsWith(n))) return true;
  }
  return false;
}

function normHouseForCalc(raw: string): string {
  const s = (h: string) => h.toLowerCase().replace(/[\s\-_.]/g, '');
  return ALL_HOUSES.find(h => s(h) === s(raw)) ?? raw;
}

// ── Parse search results ───────────────────────────────────────────────────────

function parseSearchResults(raw: unknown): ParsedSearch | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const results: Record<string, unknown>[] = Array.isArray(r.results) ? r.results
    : Array.isArray(r.data) ? r.data : [];
  if (!results.length) return null;

  const first = results[0];
  const leagueRaw = first.league;
  const league = typeof leagueRaw === 'object' && leagueRaw !== null
    ? String((leagueRaw as Record<string, unknown>).name ?? '')
    : String(leagueRaw ?? '');

  const houseMap = new Map<string, BMRow>();

  for (const result of results) {
    const bms  = result.bookmakers;
    const urls = result.urls as Record<string, string> | undefined;
    if (!bms || typeof bms !== 'object' || Array.isArray(bms)) continue;

    for (const [hn, markets] of Object.entries(bms as Record<string, unknown>)) {
      if (!Array.isArray(markets)) continue;
      let row = houseMap.get(hn);
      if (!row) {
        row = { house: hn, pa: isPa(hn), url: urls?.[hn] };
        houseMap.set(hn, row);
      }
      for (const market of markets as Record<string, unknown>[]) {
        const mName = String(market.name ?? '').toLowerCase();
        const odds = Array.isArray(market.odds) && market.odds.length > 0
          ? (market.odds[0] as Record<string, unknown>) : null;
        if (!odds) continue;

        if (mName === 'ml' || mName === '1x2' || mName === 'moneyline' || mName.includes('resultado')) {
          const h = parseFloat(String(odds.home ?? odds['1'] ?? ''));
          const d = parseFloat(String(odds.draw ?? odds.x ?? ''));
          const a = parseFloat(String(odds.away ?? odds['2'] ?? ''));
          if (!isNaN(h) && h > 1) row.mlHome = h;
          if (!isNaN(d) && d > 1) row.mlDraw = d;
          if (!isNaN(a) && a > 1) row.mlAway = a;
        } else if (mName === 'dc' || mName.includes('double') || mName.includes('dupla')) {
          const x1  = parseFloat(String(odds.dc1X ?? odds['1x'] ?? odds['1X'] ?? ''));
          const x2  = parseFloat(String(odds.dcX2 ?? odds['x2'] ?? odds['X2'] ?? ''));
          const d12 = parseFloat(String(odds.dc12 ?? odds['12'] ?? ''));
          if (!isNaN(x1)  && x1  > 1) row.dc1X  = x1;
          if (!isNaN(x2)  && x2  > 1) row.dcX2  = x2;
          if (!isNaN(d12) && d12 > 1) row.dc12  = d12;
        }
      }
    }
  }

  return {
    home:   String(first.home ?? ''),
    away:   String(first.away ?? ''),
    date:   String(first.date ?? ''),
    league,
    rows: Array.from(houseMap.values()),
  };
}

function getBests(rows: BMRow[]): Record<ColKey, number | undefined> {
  const cols: ColKey[] = ['mlHome','mlDraw','mlAway','dc1X','dcX2','dc12'];
  const b = {} as Record<ColKey, number | undefined>;
  for (const col of cols) {
    const vals = rows.map(r => r[col]).filter((v): v is number => v != null && v > 1);
    b[col] = vals.length ? Math.max(...vals) : undefined;
  }
  return b;
}

// ── Top 5 PA ranking algorithm ──────────────────────────────────────────────────
// Rules: 1 (casa) = PA only · X (empate) = qualquer casa · 2 (fora) = PA only

function getTop5PA(rows: BMRow[], disabledHouses: Set<string>): RankItem[] {
  const active = rows.filter(r => !disabledHouses.has(r.house));
  const paRows = active.filter(r => r.pa);
  const results: RankItem[] = [];

  // For every PA home × PA away combination, use the best available draw from any house
  for (const homeRow of paRows.filter(r => r.mlHome)) {
    for (const awayRow of paRows.filter(r => r.mlAway)) {
      // Best draw from any active house (PA or SEM PA)
      const bestX = active
        .filter(r => r.mlDraw)
        .sort((a, b) => (b.mlDraw ?? 0) - (a.mlDraw ?? 0))[0];
      if (!bestX?.mlDraw) continue;

      const margin = 1 / homeRow.mlHome! + 1 / bestX.mlDraw + 1 / awayRow.mlAway!;
      results.push({
        legs: [
          { house: homeRow.house, label: '1', odd: homeRow.mlHome! },
          { house: bestX.house,   label: 'X', odd: bestX.mlDraw },
          { house: awayRow.house, label: '2', odd: awayRow.mlAway! },
        ],
        margin,
        profit: (1 / margin - 1) * 100,
      });
    }
  }

  // Sort by margin ascending, deduplicate by PA home+away pair, take top 5
  const seen = new Set<string>();
  return results
    .sort((a, b) => a.margin - b.margin)
    .filter(item => {
      const key = `${item.legs[0].house}|${item.legs[2].house}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(utc: string) {
  try { return new Date(utc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return utc; }
}

function fmtDate(utc: string) {
  try {
    const d = new Date(utc);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

const COL_LABELS: Record<ColKey, string> = {
  mlHome: '1', mlDraw: 'X', mlAway: '2', dc1X: '1X', dcX2: 'X2', dc12: '12',
};
const ALL_COLS: ColKey[] = ['mlHome','mlDraw','mlAway','dc1X','dcX2','dc12'];
const ML_COLS:  ColKey[] = ['mlHome','mlDraw','mlAway'];
const DC_COLS:  ColKey[] = ['dc1X','dcX2','dc12'];

// ── SSE helpers ────────────────────────────────────────────────────────────────

/** Converte mercado SSE (market + label) → ColKey da tabela */
function marketToColKey(market: string, label: string): ColKey | null {
  const m = market.toUpperCase();
  const l = label.toUpperCase();
  if (m === 'ML' || m === '1X2' || m === 'MONEYLINE') {
    if (l === '1') return 'mlHome';
    if (l === 'X') return 'mlDraw';
    if (l === '2') return 'mlAway';
  }
  if (m === 'DC' || m === 'DOUBLE_CHANCE') {
    if (l === '1X') return 'dc1X';
    if (l === 'X2') return 'dcX2';
    if (l === '12') return 'dc12';
  }
  return null;
}

/** Normaliza string para comparação de nomes (remove acentos, espaços, lowercase) */
function normStr(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s\-_]/g, '');
}

/** Verifica se event_key do SSE bate com o evento carregado */
function matchEventKey(eventKey: string, home: string, away: string): boolean {
  const parts = eventKey.split('|');
  if (parts.length < 2) return false;
  const kh = normStr(parts[0]);
  const ka = normStr(parts[1]);
  const h  = normStr(home);
  const a  = normStr(away);
  // Aceita se home ou away incluem a parte da chave (ou vice-versa)
  return (h.includes(kh) || kh.includes(h) || kh.startsWith(h.slice(0, 5)))
      && (a.includes(ka) || ka.includes(a) || ka.startsWith(a.slice(0, 5)));
}

// ── Odds cell ──────────────────────────────────────────────────────────────────

function OCell({
  val, best, onClick, change,
}: {
  val?: number;
  best: boolean;
  onClick?: () => void;
  change?: OddChange;
}) {
  if (!val || val <= 1) {
    return (
      <td style={{ textAlign: 'center', padding: '9px 5px' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.1)', fontFamily: 'inherit' }}>—</span>
      </td>
    );
  }

  const isUp   = change?.direction === 'up';
  const isDown = change?.direction === 'down';
  const isLive = !!change;

  return (
    <td style={{ textAlign: 'center', padding: '9px 5px' }}>
      <span
        onClick={onClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          minWidth: 56,
          padding: '5px 10px',
          borderRadius: 7,
          fontSize: 14,
          fontWeight: 800,
          fontFamily: '"JetBrains Mono", "Fira Mono", "Consolas", monospace',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
          background: isLive
            ? (isUp ? 'rgba(63,255,33,.26)' : 'rgba(255,77,109,.22)')
            : (best ? 'rgba(63,255,33,.16)' : 'rgba(255,255,255,.055)'),
          color: isLive
            ? (isUp ? '#3fff21' : '#ff4d6d')
            : (best ? '#3fff21' : 'oklch(82% 0.01 250)'),
          border: isLive
            ? `1px solid ${isUp ? 'rgba(63,255,33,.55)' : 'rgba(255,77,109,.45)'}`
            : (best ? '1px solid rgba(63,255,33,.32)' : '1px solid rgba(255,255,255,.08)'),
          boxShadow: isLive
            ? `0 0 14px ${isUp ? 'rgba(63,255,33,.35)' : 'rgba(255,77,109,.35)'}`
            : (best ? '0 0 10px rgba(63,255,33,.13)' : 'none'),
          transition: isLive ? 'none' : 'background .15s, box-shadow .15s',
          cursor: onClick ? 'pointer' : 'default',
          animation: isLive ? 'oddBounce 0.52s ease-out' : 'none',
        }}
      >
        {/* Ícone de direção */}
        {isUp   && <span style={{ fontSize: 9, lineHeight: 1, marginRight: 1 }}>▲</span>}
        {isDown && <span style={{ fontSize: 9, lineHeight: 1, marginRight: 1 }}>▼</span>}
        {val.toFixed(2)}
      </span>
    </td>
  );
}

// ── Odds section (SEM PA or COM PA) ───────────────────────────────────────────

function OddsSection({
  pa, rows, bests, disabledHouses, onCellClick, liveChanges,
}: {
  pa: boolean;
  rows: BMRow[];
  bests: Record<ColKey, number | undefined>;
  disabledHouses: Set<string>;
  onCellClick?: (house: string, col: ColKey, val: number) => void;
  liveChanges?: LiveChanges;
}) {
  const filtered = rows
    .filter(r => r.pa === pa && !disabledHouses.has(r.house))
    .sort((a, b) => {
      const sa = (a.mlHome ?? 0) + (a.mlDraw ?? 0) + (a.mlAway ?? 0);
      const sb = (b.mlHome ?? 0) + (b.mlDraw ?? 0) + (b.mlAway ?? 0);
      return sb - sa;
    });
  if (!filtered.length) return null;

  const accentColor  = pa ? '#FF9F0A' : '#3fff21';
  const accentBg     = pa ? 'rgba(255,159,10,.07)' : 'rgba(63,255,33,.06)';
  const accentBorder = pa ? 'rgba(255,159,10,.22)' : 'rgba(63,255,33,.18)';
  const label        = pa ? 'PAGAMENTO ANTECIPADO' : 'CASAS SEM PA';

  return (
    <>
      {/* Section banner */}
      <tr>
        <td colSpan={8} style={{ padding: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 16px',
            background: accentBg,
            borderTop: '1px solid var(--b)',
            borderBottom: `2px solid ${accentBorder}`,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 900, textTransform: 'uppercase',
              letterSpacing: '.15em', color: accentColor,
            }}>
              {label}
            </span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 11, fontWeight: 700,
              padding: '2px 9px',
              borderRadius: 5,
              background: pa ? 'rgba(255,159,10,.12)' : 'rgba(63,255,33,.1)',
              color: accentColor,
              border: `1px solid ${accentBorder}`,
            }}>
              {filtered.length} {filtered.length !== 1 ? 'casas' : 'casa'}
            </span>
          </div>
        </td>
      </tr>

      {filtered.map((row, idx) => (
        <tr
          key={row.house}
          style={{
            background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.022)',
            borderBottom: '1px solid rgba(255,255,255,.04)',
            transition: 'background .12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.048)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.022)'; }}
        >
          {/* House name */}
          <td style={{ padding: '0 16px', height: 46, fontSize: 13, fontWeight: 700, color: 'oklch(88% 0.01 250)', whiteSpace: 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {pa && (
                <span style={{
                  fontSize: 9, fontWeight: 900, letterSpacing: '.07em',
                  color: '#FF9F0A',
                  background: 'rgba(255,159,10,.14)',
                  border: '1px solid rgba(255,159,10,.3)',
                  borderRadius: 4,
                  padding: '2px 5px',
                  flexShrink: 0,
                  lineHeight: 1,
                }}>PA</span>
              )}
              {row.url ? (
                <a href={row.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'inherit', textDecoration: 'none', transition: 'color .15s' }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.color = '#818cf8'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.color = ''; }}>
                  {row.house}
                </a>
              ) : row.house}
            </div>
          </td>

          {/* ML odds */}
          {ML_COLS.map(col => (
            <OCell
              key={col}
              val={row[col]}
              best={!!(row[col] && row[col] === bests[col])}
              onClick={onCellClick && row[col] && row[col]! > 1
                ? () => onCellClick!(row.house, col, row[col]!)
                : undefined}
              change={liveChanges?.get(`${row.house}:${col}`)}
            />
          ))}

          {/* Separator */}
          <td style={{ width: 1, padding: 0, borderLeft: '1px solid rgba(255,255,255,.07)' }} />

          {/* DC odds */}
          {DC_COLS.map(col => (
            <OCell
              key={col}
              val={row[col]}
              best={!!(row[col] && row[col] === bests[col])}
              change={liveChanges?.get(`${row.house}:${col}`)}
            />
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Calculator (3-way) with external fill ──────────────────────────────────────

interface Calc3WayProps {
  title: string;
  labels: [string, string, string];
  cols: [ColKey, ColKey, ColKey];
  bests: Record<ColKey, number | undefined>;
  externalFill?: [string, string, string] | null;
  calcRef?: React.RefObject<HTMLDivElement | null>;
}

function Calc3Way({ title, labels, cols, bests, externalFill, calcRef }: Calc3WayProps) {
  const [odds,  setOdds]  = useState(['', '', '']);
  const [stake, setStake] = useState('1000');

  // Pre-fill with best odds on first load / when bests change (only if no external fill)
  useEffect(() => {
    if (externalFill) return;
    setOdds([
      bests[cols[0]] ? bests[cols[0]]!.toFixed(2) : '',
      bests[cols[1]] ? bests[cols[1]]!.toFixed(2) : '',
      bests[cols[2]] ? bests[cols[2]]!.toFixed(2) : '',
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bests[cols[0]], bests[cols[1]], bests[cols[2]]]);

  // External fill (from ranking "+" button)
  useEffect(() => {
    if (externalFill) setOdds([...externalFill]);
  }, [externalFill]);

  function setOdd(i: number, v: string) {
    setOdds(prev => prev.map((o, idx) => idx === i ? v : o));
  }

  const result = useMemo(() => {
    const [o1, o2, o3] = odds.map(o => parseFloat(o));
    const s = parseFloat(stake);
    if (!o1 || !o2 || !o3 || !s || o1 <= 1 || o2 <= 1 || o3 <= 1) return null;
    const m      = 1/o1 + 1/o2 + 1/o3;
    const s1     = s * (1/o1) / m;
    const s2     = s * (1/o2) / m;
    const s3     = s * (1/o3) / m;
    const profit = s * (1/m - 1);
    const roi    = (1/m - 1) * 100;
    return { m, s1, s2, s3, profit, roi, ok: m < 1 };
  }, [odds, stake]);

  const isOk = result?.ok;

  return (
    <div
      ref={calcRef as React.RefObject<HTMLDivElement>}
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{
        background: 'var(--bg2)',
        border: `1px solid ${isOk ? 'rgba(63,255,33,.3)' : 'var(--b)'}`,
        transition: 'border-color .3s',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-black" style={{ color: 'var(--t)' }}>{title}</span>
        {result && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
            style={{
              background: isOk ? 'rgba(63,255,33,.1)' : 'rgba(255,77,109,.08)',
              color: isOk ? '#3fff21' : 'var(--r)',
              border: `1px solid ${isOk ? 'rgba(63,255,33,.2)' : 'rgba(255,77,109,.2)'}`,
            }}>
            {isOk ? `Surebet ${result.roi.toFixed(2)}%` : `Margem ${(result.m * 100).toFixed(1)}%`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {labels.map((lbl, i) => (
          <div key={i}>
            <label className="block text-[9px] font-black uppercase tracking-[.1em] mb-1" style={{ color: 'var(--t3)' }}>
              {lbl}
            </label>
            <input
              type="number" step="any" value={odds[i]}
              onChange={e => setOdd(i, e.target.value)}
              className="w-full bg-transparent text-sm font-bold outline-none rounded-lg px-2.5 py-2"
              style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)', color: 'var(--t)' }}
            />
          </div>
        ))}
        <div>
          <label className="block text-[9px] font-black uppercase tracking-[.1em] mb-1" style={{ color: 'var(--t3)' }}>
            Stake Total
          </label>
          <div className="flex items-center rounded-lg overflow-hidden"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)' }}>
            <span className="px-2 text-[10px] font-bold flex-shrink-0" style={{ color: 'var(--t3)', borderRight: '1px solid var(--b)' }}>
              R$
            </span>
            <input
              type="number" step="any" value={stake}
              onChange={e => setStake(e.target.value)}
              className="flex-1 bg-transparent px-2 py-2 text-sm font-bold outline-none"
              style={{ color: 'var(--t)' }}
            />
          </div>
        </div>
      </div>

      {result && (
        <div className="flex flex-col gap-2 pt-1">
          <div className="grid grid-cols-3 gap-2">
            {labels.map((lbl, i) => {
              const st = [result.s1, result.s2, result.s3][i];
              return (
                <div key={i} className="rounded-xl p-2.5 text-center"
                  style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)' }}>
                  <div className="text-[9px] font-black uppercase tracking-[.1em] mb-1" style={{ color: 'var(--t3)' }}>
                    Stake {lbl}
                  </div>
                  <div className="text-sm font-black" style={{ color: 'var(--t)' }}>
                    {st.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl px-3 py-2.5 text-sm font-bold text-center"
            style={{
              background: isOk ? 'rgba(63,255,33,.07)' : 'rgba(255,255,255,.03)',
              border: `1px solid ${isOk ? 'rgba(63,255,33,.2)' : 'var(--b)'}`,
              color: isOk ? '#3fff21' : 'var(--t3)',
            }}>
            {isOk
              ? `Lucro garantido: R$ ${result.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `Sem surebet — falta ${((result.m - 1) * 100).toFixed(2)}% de margem`}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ranking card ───────────────────────────────────────────────────────────────

function RankingCard({
  item, rank, onFill,
}: {
  item: RankItem;
  rank: number;
  onFill: (item: RankItem) => void;
}) {
  const isProfit = item.profit >= 0;

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2.5"
      style={{
        background: 'var(--bg)',
        border: `1px solid ${isProfit ? 'rgba(63,255,33,.2)' : 'var(--b)'}`,
        transition: 'border-color .2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.025)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
    >
      {/* Rank + profit */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black" style={{ color: 'var(--t3)' }}>#{rank}</span>
        <span
          className="text-[11px] font-black px-2 py-0.5 rounded-md"
          style={{
            background: isProfit ? 'rgba(63,255,33,.1)' : 'rgba(255,77,109,.08)',
            color: isProfit ? '#3fff21' : 'var(--r)',
            border: `1px solid ${isProfit ? 'rgba(63,255,33,.2)' : 'rgba(255,77,109,.2)'}`,
          }}
        >
          {isProfit ? '+' : ''}{item.profit.toFixed(2)}%
        </span>
      </div>

      {/* Legs */}
      <div className="flex flex-col gap-1.5">
        {item.legs.map((leg, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--t2)' }}>
              {leg.house}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,.07)', color: 'var(--t3)' }}>
                {leg.label}
              </span>
              <span className="text-[12px] font-black tabular-nums" style={{ color: 'var(--t)' }}>
                {leg.odd.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Fill button */}
      <button
        type="button"
        onClick={() => onFill(item)}
        className="w-full rounded-lg py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
        style={{
          background: 'rgba(63,255,33,.08)',
          color: '#3fff21',
          border: '1px solid rgba(63,255,33,.2)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(63,255,33,.15)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(63,255,33,.08)'; }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        Preencher calculadora
      </button>
    </div>
  );
}

// ── Toast notification ─────────────────────────────────────────────────────────

function FillToast({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'rgba(17,30,46,.96)',
        border: '1px solid rgba(63,255,33,.4)',
        borderRadius: 12,
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,.6)',
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity .3s ease',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 16 }}>✓</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#3fff21' }}>
        Odd preenchida — clique em Adicionar ao Painel para salvar
      </span>
    </div>
  );
}

// ── House filter panel ─────────────────────────────────────────────────────────

function HouseFilterPanel({
  rows, disabledHouses, onToggle, onReset,
}: {
  rows: BMRow[];
  disabledHouses: Set<string>;
  onToggle: (house: string) => void;
  onReset: () => void;
}) {
  const houses = [...rows].sort((a, b) => a.house.localeCompare(b.house));

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: 'var(--t3)' }}>
          Filtrar Casas de Aposta
        </span>
        {disabledHouses.size > 0 && (
          <button
            type="button" onClick={onReset}
            className="text-[10px] font-bold px-2 py-0.5 rounded-md"
            style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)' }}
          >
            Restaurar todas
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {houses.map(row => {
          const active = !disabledHouses.has(row.house);
          return (
            <button
              key={row.house}
              type="button"
              onClick={() => onToggle(row.house)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all"
              style={{
                background: active ? (row.pa ? 'rgba(255,159,10,.1)' : 'rgba(63,255,33,.08)') : 'rgba(255,255,255,.04)',
                color: active ? (row.pa ? '#FF9F0A' : '#3fff21') : 'rgba(255,255,255,.3)',
                border: `1px solid ${active ? (row.pa ? 'rgba(255,159,10,.3)' : 'rgba(63,255,33,.2)') : 'rgba(255,255,255,.08)'}`,
                textDecoration: active ? 'none' : 'line-through',
              }}
            >
              {row.pa && <span style={{ fontSize: 8, fontWeight: 900, opacity: .8 }}>PA</span>}
              {row.house}
            </button>
          );
        })}
      </div>
      {disabledHouses.size > 0 && (
        <p className="text-[10px]" style={{ color: 'var(--t3)' }}>
          {disabledHouses.size} casa{disabledHouses.size !== 1 ? 's' : ''} desativada{disabledHouses.size !== 1 ? 's' : ''} — não aparecerão na tabela nem no ranking
        </p>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function BuscarOddsPage() {
  // ── Event search state ───────────────────────────────────────────────────────
  const [query,       setQuery]       = useState('');
  const [events,      setEvents]      = useState<CachedEvent[]>([]);
  const [evLoading,   setEvLoading]   = useState(false);
  const [evErr,       setEvErr]       = useState('');
  const [fetchedDate, setFetchedDate] = useState('');
  const [dropOpen,    setDropOpen]    = useState(false);
  const [searchType,  setSearchType]  = useState<'all' | 'event' | 'league'>('all');
  const [dateTime,    setDateTime]    = useState(() => {
    const n   = new Date();
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  // ── Odds state ───────────────────────────────────────────────────────────────
  const [selectedEvent,   setSelectedEvent]   = useState<CachedEvent | null>(null);
  const [oddsLoading,     setOddsLoading]     = useState(false);
  const [oddsLoadingMsg,  setOddsLoadingMsg]  = useState('Buscando odds...');
  const [parsed,          setParsed]          = useState<ParsedSearch | null>(null);
  const [oddsErr,         setOddsErr]         = useState('');
  const [disabledHouses,  setDisabledHouses]  = useState<Set<string>>(new Set());
  const [showFilter,      setShowFilter]      = useState(false);

  // ── Calculator fill state ────────────────────────────────────────────────────
  const [surebetFill, setSurebetFill] = useState<{ odds: string[]; houses: string[] } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const surebetCalcRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Live odds state ──────────────────────────────────────────────────────────
  const [liveChanges, setLiveChanges] = useState<LiveChanges>(new Map());
  const [liveStatus, setLiveStatus] = useState<'off' | 'connecting' | 'connected' | 'error'>('off');
  const parsedRef  = useRef<ParsedSearch | null>(null);
  const sseRef     = useRef<EventSource | null>(null);
  const sseTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Normalize ────────────────────────────────────────────────────────────────
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // ── Filtered suggestions ─────────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    if (!query.trim()) return events.slice(0, 10);
    const q = normalize(query);
    return events.filter(ev => {
      if (searchType === 'event')  return normalize(ev.name).includes(q);
      if (searchType === 'league') return normalize(ev.league ?? '').includes(q);
      return normalize(ev.name).includes(q) || normalize(ev.league ?? '').includes(q);
    }).slice(0, 12);
  }, [events, query, searchType]);

  // ── Load events ──────────────────────────────────────────────────────────────
  const loadEvents = useCallback(async (date?: string) => {
    setEvLoading(true);
    setEvErr('');
    setEvents([]);
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    try {
      const res  = await fetch('/api/supermonitor/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: targetDate }),
      });
      const json = await res.json() as { ok: boolean; events?: CachedEvent[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar eventos');
      setEvents(json.events ?? []);
      setFetchedDate(targetDate);
    } catch {
      setEvErr('Não foi possível carregar os eventos. Tente novamente.');
    } finally {
      setEvLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Mantém parsedRef sincronizado ───────────────────────────────────────────
  useEffect(() => { parsedRef.current = parsed; }, [parsed]);

  // ── Limpa indicadores após 4 s ───────────────────────────────────────────────
  useEffect(() => {
    if (liveChanges.size === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setLiveChanges(prev => {
        const next = new Map(prev);
        for (const [k, v] of next) {
          if (now - v.changedAt > 4000) next.delete(k);
        }
        return next.size !== prev.size ? next : prev;
      });
    }, 4200);
    return () => clearTimeout(timer);
  }, [liveChanges]);

  // ── Conexão SSE ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    function closeSse() {
      sseRef.current?.close();
      sseRef.current = null;
    }

    function clearTimer() {
      if (sseTimer.current) { clearTimeout(sseTimer.current); sseTimer.current = null; }
    }

    async function connect() {
      if (!active) return;
      clearTimer();
      setLiveStatus('connecting');

      try {
        const res  = await fetch('/api/supermonitor/sse-token');
        const json = await res.json() as { ok: boolean; token?: string };
        if (!active) return;
        if (!json.ok || !json.token) {
          setLiveStatus('off');
          return; // script ainda não rodou — silencioso
        }

        closeSse();
        const es = new EventSource(
          `https://api5.nomacisoft.com/search/events?temp_token=${encodeURIComponent(json.token)}`
        );
        sseRef.current = es;

        es.addEventListener('update', (e: MessageEvent) => {
          if (!active) return;
          try {
            const payload = JSON.parse(e.data) as {
              type?: string;
              deltas?: { event_key: string; house: string; market: string; label: string; odd: number }[];
            };
            if (payload.type !== 'odds_delta' || !payload.deltas?.length) return;

            const current = parsedRef.current;
            if (!current) return;

            const relevant = payload.deltas.filter(d =>
              matchEventKey(d.event_key, current.home, current.away)
            );
            if (!relevant.length) return;

            const pendingChanges = new Map<string, OddChange>();
            let anyChange = false;

            const newRows = current.rows.map(row => {
              const matching = relevant.filter(d => d.house === row.house);
              if (!matching.length) return row;
              let updated = { ...row };
              for (const d of matching) {
                const col = marketToColKey(d.market, d.label);
                if (!col) continue;
                const oldVal = row[col];
                if (oldVal === d.odd) continue;
                const dir: ChangeDir = d.odd > (oldVal ?? 0) ? 'up' : 'down';
                pendingChanges.set(`${d.house}:${col}`, { direction: dir, changedAt: Date.now() });
                updated = { ...updated, [col]: d.odd };
                anyChange = true;
              }
              return updated;
            });

            if (!anyChange) return;

            setParsed({ ...current, rows: newRows });
            setLiveChanges(prev => {
              const next = new Map(prev);
              for (const [k, v] of pendingChanges) next.set(k, v);
              return next;
            });
          } catch { /* ignore parse errors */ }
        });

        es.onopen = () => { if (active) setLiveStatus('connected'); };

        es.onerror = () => {
          closeSse();
          if (!active) return;
          setLiveStatus('error');
          // Tenta reconectar em 45 s (token pode ter expirado → pega novo)
          sseTimer.current = setTimeout(connect, 45_000);
        };

      } catch {
        if (!active) return;
        setLiveStatus('error');
        sseTimer.current = setTimeout(connect, 60_000);
      }
    }

    connect();

    return () => {
      active = false;
      clearTimer();
      closeSse();
      setLiveStatus('off');
    };
  }, []); // monta uma vez; parsedRef atualiza automaticamente

  // ── Load odds for selected event (queue-aware) ───────────────────────────────
  const fetchOdds = useCallback(async (event: CachedEvent) => {
    setOddsLoading(true);
    setOddsLoadingMsg('Buscando odds...');
    setOddsErr('');
    setParsed(null);
    setDisabledHouses(new Set());
    setSurebetFill(null);

    try {
      // 1. Tenta cache primeiro
      const res = await fetch('/api/supermonitor/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: event.name, eventId: event.id }),
      });
      const json = await res.json() as {
        ok: boolean; data?: unknown; reason?: string;
        event_id?: string; event_name?: string; hint?: string; error?: string;
      };

      if (json.ok) {
        // Cache hit — mostra imediatamente
        const p = parseSearchResults(json.data);
        if (!p) throw new Error('Nenhuma odd encontrada para este evento');
        setParsed(p);
        setOddsLoading(false);
        return;
      }

      // 2. Cache miss ou dado velho — enfileira
      if (json.reason === 'stale' || json.reason === 'not_found') {
        setOddsLoadingMsg('Pedindo ao PC...');

        await fetch('/api/supermonitor/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: event.id, event_name: event.name }),
        });

        // 3. Polling até ficar pronto (máx 90s)
        const start = Date.now();
        while (Date.now() - start < 90_000) {
          await new Promise(r => setTimeout(r, 3000));

          const pollRes  = await fetch(`/api/supermonitor/queue?event_id=${encodeURIComponent(event.id)}`);
          const pollJson = await pollRes.json() as { ok: boolean; ready?: boolean; cached_at?: string };

          if (pollJson.ready) {
            // Dado pronto — busca o resultado final
            const finalRes  = await fetch('/api/supermonitor/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: event.name, eventId: event.id }),
            });
            const finalJson = await finalRes.json() as { ok: boolean; data?: unknown };
            if (finalJson.ok) {
              const p = parseSearchResults(finalJson.data);
              if (p) { setParsed(p); setOddsLoading(false); return; }
            }
          }

          const elapsed = Math.round((Date.now() - start) / 1000);
          const pcNote  = elapsed >= 10 ? ' · PC precisa estar ligado' : '';
          setOddsLoadingMsg(`Aguardando PC... ${elapsed}s${pcNote}`);
        }

        // Timeout
        throw new Error('PC offline ou demorando. Verifique se o script process-queue.mjs está rodando.');
      }

      throw new Error(json.hint ?? json.error ?? 'Erro desconhecido');
    } catch (e: unknown) {
      const msg = (e as Error).message ?? '';
      setOddsErr(msg || 'Não foi possível carregar as odds.');
      setOddsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEvent) fetchOdds(selectedEvent);
  }, [selectedEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle event select ──────────────────────────────────────────────────────
  function handleSelect(ev: CachedEvent) {
    setSelectedEvent(ev);
    setQuery(ev.name);
    setDropOpen(false);
  }

  function handleClear() {
    setSelectedEvent(null);
    setQuery('');
    setParsed(null);
    setOddsErr('');
  }

  // ── Handle ranking fill ──────────────────────────────────────────────────────
  function handleRankingFill(item: RankItem) {
    setSurebetFill({
      odds:   item.legs.map(l => l.odd.toFixed(2)),
      houses: item.legs.map(l => normHouseForCalc(l.house)),
    });
    surebetCalcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setShowToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShowToast(false), 3000);
  }

  // ── House filter handlers ────────────────────────────────────────────────────
  function toggleHouse(house: string) {
    setDisabledHouses(prev => {
      const next = new Set(prev);
      if (next.has(house)) next.delete(house);
      else next.add(house);
      return next;
    });
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const today       = new Date().toISOString().slice(0, 10);
  const isOlderData = fetchedDate && fetchedDate !== today;
  const bests       = useMemo(() => parsed ? getBests(parsed.rows.filter(r => !disabledHouses.has(r.house))) : {} as Record<ColKey, number | undefined>, [parsed, disabledHouses]);
  const bestsPa     = useMemo(() => parsed ? getBests(parsed.rows.filter(r =>  r.pa && !disabledHouses.has(r.house))) : {} as Record<ColKey, number | undefined>, [parsed, disabledHouses]);
  const bestsNonPa  = useMemo(() => parsed ? getBests(parsed.rows.filter(r => !r.pa && !disabledHouses.has(r.house))) : {} as Record<ColKey, number | undefined>, [parsed, disabledHouses]);
  const top5        = useMemo(() => parsed ? getTop5PA(parsed.rows, disabledHouses) : [], [parsed, disabledHouses]);
  const semPaCount  = parsed?.rows.filter(r => !r.pa && !disabledHouses.has(r.house)).length ?? 0;
  const comPaCount  = parsed?.rows.filter(r =>  r.pa && !disabledHouses.has(r.house)).length ?? 0;

  // ── Odd click → fill SurebetCalc ─────────────────────────────────────────────
  function handleCellClick(house: string, col: ColKey, val: number) {
    const legMap: Record<ColKey, number> = {
      mlHome: 0, mlDraw: 1, mlAway: 2, dc1X: 0, dcX2: 1, dc12: 2,
    };
    const legIndex = legMap[col];
    // Build 3-way ML odds: clicked value for this leg, global best for others
    const mlOdds = ML_COLS.map((c, i) =>
      i === legIndex ? val.toFixed(2) : (bests[c] ? bests[c]!.toFixed(2) : '')
    );
    const houses = ['', '', ''];
    houses[legIndex] = normHouseForCalc(house);
    setSurebetFill({ odds: mlOdds, houses });
    surebetCalcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setShowToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShowToast(false), 3000);
  }

  return (
    <div className="flex flex-col gap-4 pb-8">

      {/* ── CSS keyframes (montado uma vez) ── */}
      <style dangerouslySetInnerHTML={{ __html: LIVE_STYLES }} />

      {/* ── Toast ── */}
      <FillToast visible={showToast} />

      {/* ── Page header ── */}
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--t)' }}>
          Buscar Odds
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
          Compare odds de todas as casas, encontre surebets com PA e preencha a calculadora automaticamente.
        </p>
      </div>

      {/* ── Search panel ── */}
      <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>
            Pesquise por nome do evento ou campeonato. Ex: Napoli x Juventus, Bundesliga...
          </p>
          <div className="flex items-center gap-2">
            {evLoading && <span className="text-[10px]" style={{ color: 'var(--t3)' }}>Carregando...</span>}
            {!evLoading && !evErr && events.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                style={{
                  background: isOlderData ? 'rgba(255,159,10,.12)' : 'rgba(63,255,33,.1)',
                  color: isOlderData ? '#FF9F0A' : '#3fff21',
                  border: `1px solid ${isOlderData ? 'rgba(255,159,10,.25)' : 'rgba(63,255,33,.2)'}`,
                }}>
                {events.length} eventos{isOlderData ? ` · ${fetchedDate}` : ' · hoje'}
              </span>
            )}
            {!evLoading && evErr && (
              <button type="button" onClick={() => loadEvents()}
                className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
                Tentar novamente
              </button>
            )}
          </div>
        </div>

        {/* Search row */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Input + dropdown */}
          <div className="flex-1 min-w-0" ref={wrapRef}>
            <div className="relative">
              <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setDropOpen(true); }}
                placeholder={evLoading ? 'Carregando eventos...' : 'Ex: Napoli x Juventus, Bundesliga...'}
                disabled={evLoading}
                onFocus={() => setDropOpen(true)}
                style={{
                  width: '100%', background: 'rgba(255,255,255,.04)',
                  border: '1px solid var(--b)', borderRadius: 10,
                  padding: '9px 32px', fontSize: 13, color: 'var(--t)', outline: 'none',
                  opacity: evLoading ? 0.5 : 1,
                }}
              />
              {query && (
                <button type="button" onClick={handleClear}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)' }}>
                  <X size={13} />
                </button>
              )}

              {/* Dropdown */}
              {dropOpen && !evLoading && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: 4,
                  background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 10,
                  boxShadow: '0 8px 32px rgba(0,0,0,.5)', maxHeight: 260, overflowY: 'auto',
                }}>
                  {suggestions.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--t3)' }}>
                      {evErr ? `Erro: ${evErr}` : events.length === 0 ? 'Nenhum evento disponível.' : 'Nenhum evento encontrado.'}
                    </div>
                  ) : (
                    suggestions.map(ev => (
                      <button key={ev.id} type="button" onMouseDown={() => handleSelect(ev)}
                        className="flex items-start w-full gap-2 px-3 py-2.5 text-left"
                        style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.05)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate" style={{ color: 'var(--t)' }}>{ev.name}</div>
                          <div className="text-[10px]" style={{ color: 'var(--t3)' }}>{ev.league} · {fmtTime(ev.start_utc)}</div>
                        </div>
                        {ev.house_count > 0 && (
                          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            <Building2 size={10} style={{ color: '#818cf8' }} />
                            <span className="text-[10px] font-bold" style={{ color: '#818cf8' }}>{ev.house_count}</span>
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected event badge */}
            {selectedEvent && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-md font-bold"
                  style={{ background: 'rgba(63,255,33,.1)', color: '#3fff21', border: '1px solid rgba(63,255,33,.2)' }}>
                  {selectedEvent.league}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--t3)' }}>
                  {fmtTime(selectedEvent.start_utc)}{selectedEvent.house_count > 0 ? ` · ${selectedEvent.house_count} casas` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Search type select */}
          <select
            value={searchType}
            onChange={e => setSearchType(e.target.value as typeof searchType)}
            style={{
              background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)',
              borderRadius: 10, padding: '9px 12px', fontSize: 12,
              color: 'var(--t)', outline: 'none', flexShrink: 0,
            }}
          >
            <option value="all">Todos os campos</option>
            <option value="event">Apenas eventos</option>
            <option value="league">Campeonato</option>
          </select>

          {/* Date picker */}
          <input
            type="datetime-local"
            value={dateTime}
            onChange={e => {
              setDateTime(e.target.value);
              const datePart = e.target.value.slice(0, 10);
              if (datePart && datePart !== fetchedDate) loadEvents(datePart);
            }}
            style={{
              height: 40, background: 'rgba(255,255,255,.04)',
              border: '1px solid var(--b)', borderRadius: 10,
              padding: '0 12px', fontSize: 12, color: 'var(--t)',
              outline: 'none', colorScheme: 'dark', flexShrink: 0,
              minWidth: 190,
            }}
          />

          {/* Filters toggle */}
          {parsed && (
            <button
              type="button"
              onClick={() => setShowFilter(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0"
              style={{
                background: showFilter ? 'rgba(129,140,248,.15)' : 'rgba(255,255,255,.05)',
                color: showFilter ? '#818cf8' : 'var(--t3)',
                border: `1px solid ${showFilter ? 'rgba(129,140,248,.3)' : 'var(--b)'}`,
              }}
            >
              <Filter size={12} />
              Filtros
              {disabledHouses.size > 0 && (
                <span className="rounded-full w-4 h-4 text-[9px] font-black flex items-center justify-center flex-shrink-0"
                  style={{ background: '#818cf8', color: 'white' }}>
                  {disabledHouses.size}
                </span>
              )}
              {showFilter ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>

        {/* Filter panel */}
        {showFilter && parsed && (
          <HouseFilterPanel
            rows={parsed.rows}
            disabledHouses={disabledHouses}
            onToggle={toggleHouse}
            onReset={() => setDisabledHouses(new Set())}
          />
        )}
      </div>

      {/* ── Calculator ── */}
      {parsed && (
        <div ref={surebetCalcRef} className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-sm font-black" style={{ color: 'var(--t)' }}>Calculadora</span>
            <span className="text-[10px] px-2 py-0.5 rounded-md font-bold"
              style={{ background: 'rgba(63,255,33,.08)', color: 'rgba(63,255,33,.75)', border: '1px solid rgba(63,255,33,.15)' }}>
              Clique em qualquer odd para preencher
            </span>
          </div>
          <SurebetCalc
            selectedEvent={selectedEvent ? { name: selectedEvent.name, start_utc: selectedEvent.start_utc } : null}
            externalFill={surebetFill}
            defaultNumOutcomes={3}
          />
        </div>
      )}

      {/* ── Top 5 PA Ranking ── */}
      {parsed && top5.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
          {/* Header */}
          <div className="px-5 py-4 flex items-center gap-3"
            style={{ background: 'rgba(255,159,10,.06)', borderBottom: '1px solid rgba(255,159,10,.15)' }}>
            <Star size={14} style={{ color: '#FF9F0A', flexShrink: 0 }} />
            <div>
              <div className="text-sm font-black" style={{ color: '#FF9F0A' }}>
                Top 5 — PA Casa ou Fora
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,159,10,.6)' }}>
                Melhores combinações com casas de Pagamento Antecipado no time da casa ou visitante
              </div>
            </div>
            {disabledHouses.size > 0 && (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md"
                style={{ background: 'rgba(255,159,10,.12)', color: '#FF9F0A', border: '1px solid rgba(255,159,10,.25)' }}>
                {disabledHouses.size} filtrada{disabledHouses.size !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {top5.map((item, i) => (
                <RankingCard key={i} item={item} rank={i + 1} onFill={handleRankingFill} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Odds table ── */}
      {!selectedEvent && !oddsLoading && !parsed && !oddsErr && (
        <div className="rounded-2xl p-12 text-center flex flex-col items-center gap-4"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <ScanSearch size={36} style={{ color: 'var(--t3)' }} />
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--t2)' }}>Selecione um evento acima</p>
            <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
              As odds de todas as casas aparecerão aqui, separadas por SEM PA e COM PA
            </p>
          </div>
        </div>
      )}

      {oddsLoading && (
        <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <div className="text-xs mb-2" style={{ color: 'var(--t3)' }}>{oddsLoadingMsg}</div>
          <div className="text-sm font-black" style={{ color: 'var(--t)' }}>{selectedEvent?.name}</div>
          <div className="mt-4 flex justify-center gap-1">
            {[0,1,2].map(i => (
              <div key={i} className="rounded-full"
                style={{ width: 6, height: 6, background: '#3fff21',
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
          {oddsLoadingMsg.includes('PC') && (
            <p className="mt-4 text-[10px]" style={{ color: 'var(--t3)' }}>
              O PC precisa estar ligado e com o script process-queue.mjs rodando
            </p>
          )}
        </div>
      )}

      {oddsErr && (
        <div className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: 'rgba(255,77,109,.06)', border: '1px solid rgba(255,77,109,.2)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--r)' }}>⚠ {oddsErr}</p>
          {selectedEvent && (
            <button type="button" onClick={() => fetchOdds(selectedEvent)}
              className="self-start text-xs font-bold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {parsed && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
          {/* Odds table header */}
          <div className="flex items-center justify-between px-5 py-3.5"
            style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black truncate" style={{ color: 'var(--t)' }}>
                {parsed.home} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>×</span> {parsed.away}
              </div>
              <div className="text-[11px] mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--t3)' }}>
                <span>{parsed.league}</span>
                {fmtDate(parsed.date) && <><span style={{ opacity: .4 }}>·</span><span>{fmtDate(parsed.date)}</span></>}
                <span style={{ opacity: .4 }}>·</span>
                <span>{parsed.rows.length} casas no total</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="flex items-center gap-3 text-[10px] font-bold">
                <span style={{ color: 'rgba(63,255,33,.8)' }}>{semPaCount} sem PA</span>
                <span style={{ color: 'rgba(255,255,255,.2)' }}>·</span>
                <span style={{ color: 'rgba(255,159,10,.8)' }}>{comPaCount} com PA</span>
              </div>

              {/* Indicador SSE */}
              {liveStatus === 'connected' && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.22)' }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', background: '#3fff21', display: 'block', flexShrink: 0,
                    animation: 'livePulse 2s ease-in-out infinite',
                  }} />
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.08em', color: '#3fff21' }}>LIVE</span>
                </div>
              )}
              {liveStatus === 'connecting' && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,.4)', display: 'block', flexShrink: 0,
                    animation: 'livePulse 1s ease-in-out infinite',
                  }} />
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.08em', color: 'rgba(255,255,255,.4)' }}>SYNC</span>
                </div>
              )}

              <button type="button" onClick={() => fetchOdds(selectedEvent!)}
                className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg"
                style={{ background: 'rgba(99,102,241,.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,.25)' }}>
                <RefreshCw size={11} />
                Atualizar
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                {/* Group row */}
                <tr style={{ background: 'oklch(16% 0.008 250)' }}>
                  <th style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 900,
                    textTransform: 'uppercase', letterSpacing: '.13em',
                    color: 'oklch(55% 0.01 250)', whiteSpace: 'nowrap', minWidth: 160,
                  }}>EVENTO</th>

                  <th colSpan={3} style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      fontSize: 9, fontWeight: 900, textTransform: 'uppercase',
                      letterSpacing: '.14em', color: 'rgba(63,255,33,.7)',
                      padding: '2px 10px', borderRadius: 4,
                      background: 'rgba(63,255,33,.07)',
                      border: '1px solid rgba(63,255,33,.15)',
                    }}>
                      ML — 1×2
                    </span>
                  </th>
                  <th style={{ padding: 0, width: 1 }} />
                  <th colSpan={3} style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      fontSize: 9, fontWeight: 900, textTransform: 'uppercase',
                      letterSpacing: '.14em', color: 'rgba(255,255,255,.35)',
                      padding: '2px 10px', borderRadius: 4,
                      background: 'rgba(255,255,255,.04)',
                      border: '1px solid rgba(255,255,255,.08)',
                    }}>
                      Dupla Chance
                    </span>
                  </th>
                </tr>

                {/* Column labels row */}
                <tr style={{ background: 'oklch(14% 0.007 250)', borderBottom: '2px solid rgba(255,255,255,.07)' }}>
                  <th style={{ padding: '0 16px', height: 32 }} />
                  {ML_COLS.map(col => (
                    <th key={col} style={{
                      padding: '0 5px', textAlign: 'center',
                      fontSize: 13, fontWeight: 900,
                      color: 'rgba(63,255,33,.85)',
                      minWidth: 68,
                      letterSpacing: '.02em',
                    }}>
                      {COL_LABELS[col]}
                    </th>
                  ))}
                  <th style={{ padding: 0, width: 1, borderLeft: '1px solid rgba(255,255,255,.07)' }} />
                  {DC_COLS.map(col => (
                    <th key={col} style={{
                      padding: '0 5px', textAlign: 'center',
                      fontSize: 12, fontWeight: 800,
                      color: 'rgba(255,255,255,.35)',
                      minWidth: 68,
                      letterSpacing: '.02em',
                    }}>
                      {COL_LABELS[col]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* COM PA first */}
                <OddsSection pa={true}  rows={parsed.rows} bests={bestsPa}    disabledHouses={disabledHouses} onCellClick={handleCellClick} liveChanges={liveChanges} />
                {/* SEM PA second */}
                <OddsSection pa={false} rows={parsed.rows} bests={bestsNonPa} disabledHouses={disabledHouses} onCellClick={handleCellClick} liveChanges={liveChanges} />
              </tbody>
            </table>
          </div>

          {/* Best odds footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 flex-wrap"
            style={{ background: 'rgba(63,255,33,.03)', borderTop: '1px solid rgba(63,255,33,.12)' }}>
            <span className="text-[9px] font-black uppercase tracking-[.12em]" style={{ color: 'rgba(63,255,33,.6)' }}>
              Melhores odds
            </span>
            {ALL_COLS.map(col => bests[col] ? (
              <span key={col} className="text-[10px] font-bold" style={{ color: 'var(--t2)' }}>
                <span style={{ color: 'var(--t3)' }}>{COL_LABELS[col]}</span>
                {' '}<span style={{ color: '#3fff21', fontWeight: 800 }}>{bests[col]!.toFixed(2)}</span>
              </span>
            ) : null)}
          </div>
        </div>
      )}

      {/* ── DC Calculator (secondary) ── */}
      {parsed && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: 'var(--t3)' }}>
              Calculadora DC (Dupla Chance)
            </span>
          </div>
          <Calc3Way
            title="Calculadora DC — 1X · X2 · 12"
            labels={['1X', 'X2', '12']}
            cols={['dc1X', 'dcX2', 'dc12']}
            bests={bests}
          />
        </div>
      )}

      {/* Spacer for when no odds loaded yet */}
      {!parsed && !oddsErr && !oddsLoading && (
        <div style={{ height: 24 }} />
      )}
    </div>
  );
}
