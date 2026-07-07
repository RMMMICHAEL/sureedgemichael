'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { SyncMetrics } from '@/app/api/sync/metrics/route';
import { createPortal } from 'react-dom';
import {
  X, ScanSearch, ChevronLeft, ExternalLink, ArrowDown, RefreshCw, Zap,
  TrendingUp, ChevronDown, Star, Check, Trophy, PlayCircle,
  LayoutGrid, List, Search, Radio, Clock, TrendingDown, ChevronUp,
} from 'lucide-react';
import { SurebetCalc }           from '@/components/calcalendario/SurebetCalc';
import { DGOpportunitiesSection } from './DGOpportunitiesSection';
import { VideoTutorialModal }     from '@/components/ui/VideoTutorialModal';
import { useOdds }               from '@/hooks/useOdds';
import { normSlug, isPaBookmaker as isPa } from '@/lib/bookmakers';
import { resolveTeamLogoUrl } from '@/lib/team-logos';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  green:    '#3FFF21',
  greenDim: 'rgba(63,255,33,.12)',
  greenB:   'rgba(63,255,33,.3)',
  purple:   '#A78BFA',
  purpleDim:'rgba(167,139,250,.12)',
  purpleB:  'rgba(167,139,250,.3)',
  amber:    '#f59e0b',
  amberDim: 'rgba(245,158,11,.12)',
  amberB:   'rgba(245,158,11,.3)',
  red:      '#f87171',
  redDim:   'rgba(248,113,113,.1)',
  surf:     '#0D1117',
  surfB:    '#1A2230',
  bg:       '#030507',
  t1:       '#F0F4F8',
  t2:       '#8899AA',
  t3:       '#7E92A3',
};

// ─── CSS injetado (flash + tooltip) ──────────────────────────────────────────
const GLOBAL_CSS = `
@keyframes row-flash {
  0%   { background-color: rgba(63,255,33,.13); }
  100% { background-color: transparent; }
}
.row-flash { animation: row-flash 1.8s ease-out forwards; }
@keyframes odd-pop {
  0%   { color: #3FFF21; transform: scale(1.08); }
  60%  { color: #3FFF21; transform: scale(1.04); }
  100% { color: inherit; transform: scale(1); }
}
.odd-pop { animation: odd-pop 1.2s ease-out forwards; }

/* Tooltip */
.tt { position: relative; display: inline-flex; }
.tt .tip {
  pointer-events: none;
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  white-space: normal;
  width: max-content;
  max-width: 220px;
  background: #111827;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 11px;
  line-height: 1.45;
  color: #c8d6e5;
  font-weight: 500;
  z-index: 9999;
  opacity: 0;
  transition: opacity .15s;
  box-shadow: 0 8px 28px rgba(0,0,0,.6);
}
.tt:hover .tip { opacity: 1; }
.tt .tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: rgba(255,255,255,.12);
}

/* Card expand animation */
@keyframes card-expand {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.card-expanded-rows { animation: card-expand .2s ease-out forwards; }
`;

function GlobalStyles() {
  return <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />;
}

// ─── Tooltip wrapper ──────────────────────────────────────────────────────────
function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="tt">
      {children}
      <span className="tip">{text}</span>
    </span>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface BookmakerOdds {
  slug: string; name: string; home: number; draw: number; away: number;
  url: string; is_pa?: boolean | null;
}
interface OddsSummary {
  match_id: string; home_team: string; away_team: string;
  start_time: string; league_name: string; league_id: number;
  bookmakers: BookmakerOdds[];
}
interface DGInfo {
  dg_score: number | null; dg_classification: string | null; dg_profit_pct: number | null;
}
type PAFilter = 'ALL' | 'AMBOS_PA' | 'APENAS_PA';
type SortBy   = 'padrao' | 'maior_lucro' | 'menor_lucro' | 'dg_score';
type ViewMode = 'table' | 'card';

// ─── Componente de logo de time (DG CDN com fallback silencioso) ──────────────
// CDN logos.duplogreenengine.com bloqueado — desabilitado temporariamente
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TeamLogo(_props: { name: string; size: number; style?: React.CSSProperties }) {
  return null;
}
function _TeamLogoImpl({ name, size, style }: { name: string; size: number; style?: React.CSSProperties }) {
  const resolved = resolveTeamLogoUrl(name);
  if (!resolved) return null;
  const isFlag = resolved.type === 'flag';
  return (
    <img
      src={resolved.url}
      alt={name}
      width={size}
      height={isFlag ? Math.round(size * 0.67) : size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      style={{
        borderRadius: isFlag ? 2 : '50%',
        objectFit: 'cover',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

// Decodifica códigos de Copa do Mundo: "2E (Wwc)" → "2° do Grupo E", "3CDFGH" → "3° de C,D,F,G ou H"
function decodeTeamName(name: string): string {
  if (!name) return name;
  // "2E (Wwc)" ou "1I" → Xº do Grupo Y
  const single = name.match(/^(\d+)([A-Z])(?:\s*\([^)]+\))?$/);
  if (single) {
    return `${single[1]}° do Grupo ${single[2]}`;
  }
  // "3CDFGH" → 3° de C, D, F, G ou H
  const multi = name.match(/^(\d+)([A-Z]{2,})(?:\s*\([^)]+\))?$/);
  if (multi) {
    const gs = multi[2].split('');
    const last = gs.pop()!;
    return `${multi[1]}° de ${gs.join(', ')} ou ${last}`;
  }
  // "W73" → Venc. jogo 73
  const wMatch = name.match(/^W(\d+)$/);
  if (wMatch) return `Venc. jogo ${wMatch[1]}`;
  // "RU101" → Perd. jogo 101
  const ruMatch = name.match(/^RU(\d+)$/);
  if (ruMatch) return `Perd. jogo ${ruMatch[1]}`;
  return name;
}

// ─── Odds trend tracking (match_id → { home, draw, away }) ───────────────────
type OddSnapshot = Record<string, { home: number; draw: number; away: number }>;
type OddTrend    = 'up' | 'down' | 'same';
function getOddTrend(prev: number, curr: number): OddTrend {
  if (curr > prev + 0.005)  return 'up';
  if (curr < prev - 0.005) return 'down';
  return 'same';
}

// ─── PA helpers ───────────────────────────────────────────────────────────────
function isBkPA(bk: BookmakerOdds): boolean {
  return bk.is_pa === true || isPa(bk.slug);
}
function paSideCount(ev: OddsSummary): number {
  const bh = bestBk(ev.bookmakers, 'home');
  const ba = bestBk(ev.bookmakers, 'away');
  return (bh && isBkPA(bh) ? 1 : 0) + (ba && isBkPA(ba) ? 1 : 0);
}

// ─── Exclusion ───────────────────────────────────────────────────────────────
const EXCL = ['e-futebol','e-soccer','esoccer','virtual','efootball','cyber','esport','h2h'];
function isExcluded(n: string) { const s = n.toLowerCase(); return EXCL.some(e => s.includes(e)); }

// ─── Date helpers ─────────────────────────────────────────────────────────────
function p2(n: number) { return String(n).padStart(2, '0'); }
function todayBRT(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
}
function dateBRT(utc: string): string {
  try {
    const d = new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  } catch { return ''; }
}
function fmtTime(utc: string): string {
  try { return new Date(utc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  catch { return '—'; }
}
function fmtDateShort(utc: string): string {
  try { return new Date(utc).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  catch { return '—'; }
}
function secsAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min`;
}
function weekdayLabel(utc: string, today: string): string {
  const d = dateBRT(utc);
  if (d === today) return 'Hoje';
  const tom = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  tom.setDate(tom.getDate() + 1);
  const tStr = `${tom.getFullYear()}-${p2(tom.getMonth()+1)}-${p2(tom.getDate())}`;
  if (d === tStr) return 'Amanhã';
  return fmtDateShort(utc);
}

// ─── DG helpers ───────────────────────────────────────────────────────────────
function dgColor(c: string | null): string {
  if (c === 'ALTA')  return C.green;
  if (c === 'MEDIA') return C.amber;
  return C.t3;
}
function dgRGB(c: string | null): string {
  if (c === 'ALTA')  return '63,255,33';
  if (c === 'MEDIA') return '245,158,11';
  return '100,116,139';
}

// ─── Margin helpers ───────────────────────────────────────────────────────────
function bestVal(bks: BookmakerOdds[], key: 'home'|'draw'|'away'): number {
  const vals = bks.map(b => b[key]).filter(v => v > 1);
  return vals.length ? Math.max(...vals) : 0;
}
function bestBk(bks: BookmakerOdds[], key: 'home'|'draw'|'away'): BookmakerOdds | null {
  const regular = bks.filter(b => !b.is_pa);
  const pool    = regular.length ? regular : bks;
  const v       = pool.reduce((mx, b) => Math.max(mx, (b[key] as number) ?? 0), 0);
  return pool.find(b => b[key] === v && v > 1) ?? null;
}
function calcMargin(bks: BookmakerOdds[]): number | null {
  const h = bestVal(bks, 'home'), d = bestVal(bks, 'draw'), a = bestVal(bks, 'away');
  if (!h || !d || !a) return null;
  return (1/h + 1/d + 1/a - 1) * 100;
}
function marginColor(mgn: number): string {
  if (mgn < 0)   return C.green;
  if (mgn < 1.5) return '#86efac';
  if (mgn < 3)   return C.amber;
  return C.red;
}
function marginBg(mgn: number): string {
  if (mgn < 0)   return C.greenDim;
  if (mgn < 1.5) return 'rgba(134,239,172,.08)';
  if (mgn < 3)   return C.amberDim;
  return C.redDim;
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortMatches(evs: OddsSummary[], sortBy: SortBy, dgMap: Map<string, DGInfo>): OddsSummary[] {
  const arr = [...evs];
  if (sortBy === 'maior_lucro') return arr.sort((a, b) => (calcMargin(a.bookmakers) ?? 999) - (calcMargin(b.bookmakers) ?? 999));
  if (sortBy === 'menor_lucro') return arr.sort((a, b) => (calcMargin(b.bookmakers) ?? -999) - (calcMargin(a.bookmakers) ?? -999));
  if (sortBy === 'dg_score')    return arr.sort((a, b) => (dgMap.get(b.match_id)?.dg_score ?? 0) - (dgMap.get(a.match_id)?.dg_score ?? 0));
  return arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* noop */ }
}

// ─── Calc types ───────────────────────────────────────────────────────────────
type OddType = 'home' | 'draw' | 'away';
interface CalcSlot { bk: BookmakerOdds; type: OddType; value: number }
const SLOT_COLORS = ['#3FFF21', '#4DA6FF', '#FF9F0A'];
const SLOT_LABELS = ['1ª', '2ª', '3ª'];

// ─── TrendArrow ───────────────────────────────────────────────────────────────
function TrendArrow({ trend }: { trend: OddTrend }) {
  if (trend === 'up')   return <TrendingUp   size={10} style={{ color: C.green, flexShrink: 0 }} />;
  if (trend === 'down') return <TrendingDown  size={10} style={{ color: C.red,   flexShrink: 0 }} />;
  return null;
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────
function ScoreRing({ score, classification }: { score: number | null; classification: string | null }) {
  const r     = 22;
  const circ  = 2 * Math.PI * r;
  const pct   = score != null ? Math.min(score, 100) / 100 : 0;
  const color = dgColor(classification);
  return (
    <Tip text="Score DG: pontuação do Duplo Green Engine (0–100). Quanto maior, maior a probabilidade de lucro identificada pelo algoritmo.">
      <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
        <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="3.5" />
          <circle
            cx="28" cy="28" r={r} fill="none" stroke={color}
            strokeWidth="3.5" strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset .6s ease-out' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 900, color, lineHeight: 1 }}>{score ?? '—'}</span>
        </div>
      </div>
    </Tip>
  );
}

// ─── BestOddCell ──────────────────────────────────────────────────────────────
function BestOddCell({ bk, type, showPaBadge, flash, trend }: {
  bk: BookmakerOdds | null; type: OddType; showPaBadge?: boolean; flash?: boolean; trend?: OddTrend;
}) {
  if (!bk) return (
    <div style={{ display: 'flex', height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)' }}>
      <span style={{ color: 'rgba(255,255,255,.12)', fontSize: 11 }}>—</span>
    </div>
  );
  const val = bk[type] as number;
  const pa  = showPaBadge !== undefined ? showPaBadge : isBkPA(bk);
  return (
    <div style={{
      position: 'relative', display: 'flex', height: 52, flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 8,
      ...(pa ? { background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.28)' }
             : { background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span className={flash ? 'odd-pop' : ''} style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: pa ? C.green : C.t2 }}>
          {val.toFixed(2)}
        </span>
        {trend && trend !== 'same' && <TrendArrow trend={trend} />}
      </div>
      <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 8px', fontSize: 11, color: C.t3 }}>
        {bk.name}
      </span>
      {pa && (
        <Tip text="PA — casa com Pagamento Antecipado: paga antes do resultado. Ideal para Duplo Green.">
          <span style={{
            position: 'absolute', top: -4, right: -4, borderRadius: 4, padding: '1px 3px',
            fontSize: 10, fontWeight: 700, cursor: 'default',
            background: C.greenDim, color: C.green, border: `1px solid ${C.greenB}`,
          }}>PA</span>
        </Tip>
      )}
    </div>
  );
}

// ─── OddBtn ───────────────────────────────────────────────────────────────────
function OddBtn({ bk, type, value, sectionBests, slots, onOddClick, trend }: {
  bk: BookmakerOdds; type: OddType; value: number;
  sectionBests: Record<OddType, number>; slots: (CalcSlot|null)[];
  onOddClick: (bk: BookmakerOdds, type: OddType, value: number) => void;
  trend?: OddTrend;
}) {
  const si    = slots.findIndex(s => s?.bk.slug === bk.slug && s?.type === type);
  const sel   = si >= 0;
  const sc    = SLOT_COLORS[si] ?? SLOT_COLORS[0];
  const isBest = value > 1 && value === sectionBests[type];

  if (value <= 1) return (
    <div style={{ display: 'flex', height: 40, width: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.04)' }}>
      <span style={{ color: 'rgba(255,255,255,.1)', fontSize: 11 }}>—</span>
    </div>
  );
  const base = sel
    ? { background: `${sc}20`, border: `1px solid ${sc}70`, color: sc, boxShadow: `0 0 14px ${sc}30` }
    : isBest
    ? { background: `${C.green}18`, border: `1px solid ${C.green}55`, color: C.green, textShadow: `0 0 10px ${C.green}88` }
    : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: C.t2 };

  return (
    <button type="button" onClick={() => onOddClick(bk, type, value)}
      style={{ position: 'relative', display: 'flex', height: 40, width: 72, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 10, fontFamily: 'monospace', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'opacity .15s', ...base }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {value.toFixed(2)}
        {trend && trend !== 'same' && <TrendArrow trend={trend} />}
      </div>
      {sel && (
        <span style={{ position: 'absolute', top: -5, right: -5, width: 15, height: 15, borderRadius: '50%', background: sc, color: '#060A07', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {si + 1}
        </span>
      )}
    </button>
  );
}

// ─── OddsSection ──────────────────────────────────────────────────────────────
function OddsSection({ label, bks, accent, slots, onOddClick, prevSnap }: {
  label: string; bks: BookmakerOdds[]; accent: string;
  slots: (CalcSlot|null)[]; onOddClick: (bk: BookmakerOdds, type: OddType, value: number) => void;
  prevSnap?: OddSnapshot;
}) {
  const [sortCol, setSortCol] = useState<'home'|'draw'|'away'>('home');
  if (!bks.length) return null;
  const acRgb  = accent === C.amber ? '245,158,11' : '167,139,250';
  const sorted = [...bks].sort((a, b) => (b[sortCol] as number) - (a[sortCol] as number));
  const bests: Record<OddType, number> = {
    home: Math.max(0, ...bks.map(b => b.home > 1 ? b.home : 0)),
    draw: Math.max(0, ...bks.map(b => b.draw > 1 ? b.draw : 0)),
    away: Math.max(0, ...bks.map(b => b.away > 1 ? b.away : 0)),
  };
  const cols: { key: 'home'|'draw'|'away'; label: string }[] = [
    { key: 'home', label: 'Casa (1)' }, { key: 'draw', label: 'Empate (X)' }, { key: 'away', label: 'Fora (2)' },
  ];

  function trendFor(bk: BookmakerOdds, t: OddType): OddTrend {
    const prev = prevSnap?.[bk.slug];
    if (!prev) return 'same';
    return getOddTrend(prev[t], bk[t] as number);
  }

  return (
    <div style={{ overflow: 'hidden', borderRadius: 16, background: `rgba(${acRgb},.03)`, border: `1px solid rgba(${acRgb},.2)`, boxShadow: '0 4px 24px rgba(0,0,0,.3)' }}>
      <div style={{ height: 2, background: `linear-gradient(90deg,${accent} 0%,${accent}44 60%,transparent 100%)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: `rgba(${acRgb},.07)`, borderBottom: `1px solid rgba(${acRgb},.1)` }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: accent }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '1px 6px', background: `rgba(${acRgb},.12)`, color: accent, border: `1px solid rgba(${acRgb},.25)` }}>{bks.length} casas</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px 72px', alignItems: 'center', gap: 12, padding: '8px 20px', background: 'rgba(255,255,255,.01)', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: C.t3 }}>Casa</span>
        {cols.map(c => (
          <button key={c.key} type="button" onClick={() => setSortCol(c.key)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 11, fontWeight: 700, color: sortCol === c.key ? C.t1 : C.t3, borderBottom: sortCol === c.key ? `2px solid rgba(${acRgb},.7)` : '2px solid transparent', paddingBottom: 2, background: 'none', border: 'none', cursor: 'pointer' }}>
            {c.label}{sortCol === c.key && <ArrowDown size={9} style={{ marginLeft: 2 }} />}
          </button>
        ))}
      </div>
      <div>
        {sorted.map((bk, idx) => {
          const anySel = slots.some(s => s?.bk.slug === bk.slug);
          const pa     = bk.is_pa === true;
          return (
            <div key={bk.slug} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px 72px', alignItems: 'center', gap: 12, padding: '10px 20px', background: anySel ? `rgba(${acRgb},.04)` : idx % 2 === 1 ? 'rgba(255,255,255,.01)' : undefined, borderTop: idx > 0 ? '1px solid rgba(255,255,255,.04)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {bk.url ? (
                  <a href={bk.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', fontSize: 13, fontWeight: 600, color: anySel ? C.t1 : C.t2, textDecoration: 'none' }}>
                    <ExternalLink size={10} style={{ opacity: .4, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bk.name}</span>
                  </a>
                ) : (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: C.t2 }}>{bk.name}</span>
                )}
                {pa && (
                  <Tip text="Casa com Pagamento Antecipado: paga antes do resultado, ideal para estratégia Duplo Green.">
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '1px 4px', background: C.amberDim, color: C.amber, border: `1px solid ${C.amberB}`, flexShrink: 0, cursor: 'default' }}>PA</span>
                  </Tip>
                )}
              </div>
              <OddBtn bk={bk} type="home" value={bk.home} sectionBests={bests} slots={slots} onOddClick={onOddClick} trend={trendFor(bk, 'home')} />
              <OddBtn bk={bk} type="draw" value={bk.draw} sectionBests={bests} slots={slots} onOddClick={onOddClick} trend={trendFor(bk, 'draw')} />
              <OddBtn bk={bk} type="away" value={bk.away} sectionBests={bests} slots={slots} onOddClick={onOddClick} trend={trendFor(bk, 'away')} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MatchCard (card view) ────────────────────────────────────────────────────
function MatchCard({ ev, dgInfo, isFlash, isFav, onSelect, onToggleFav, prevSnap }: {
  ev: OddsSummary; dgInfo: DGInfo | null; isFlash: boolean;
  isFav: boolean; onSelect: () => void; onToggleFav: () => void;
  prevSnap?: OddSnapshot;
}) {
  const [expanded, setExpanded] = useState(false);

  const mgn    = calcMargin(ev.bookmakers);
  const isSure = mgn !== null && mgn < 0;
  const bkH    = bestBk(ev.bookmakers, 'home');
  const bkD    = bestBk(ev.bookmakers, 'draw');
  const bkA    = bestBk(ev.bookmakers, 'away');
  const paCnt  = paSideCount(ev);
  const hasDg  = dgInfo != null;
  const dgCol  = hasDg ? dgColor(dgInfo!.dg_classification) : null;
  const dgRgb2 = hasDg ? dgRGB(dgInfo!.dg_classification) : null;

  const borderCol = isFlash
    ? C.green
    : isFav ? `rgba(167,139,250,.45)`
    : isSure ? `rgba(63,255,33,.25)`
    : C.surfB;

  function trendFor(bk: BookmakerOdds | null, t: OddType): OddTrend {
    if (!bk || !prevSnap?.[bk.slug]) return 'same';
    return getOddTrend(prevSnap[bk.slug][t], bk[t] as number);
  }

  function OddBox({ bk, type }: { bk: BookmakerOdds | null; type: OddType }) {
    if (!bk) return <div style={{ flex: 1, height: 62, borderRadius: 8, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)' }} />;
    const val   = bk[type] as number;
    const pa    = isBkPA(bk);
    const trend = trendFor(bk, type);
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2, height: 62, borderRadius: 8, padding: '0 4px',
        ...(pa ? { background: 'rgba(63,255,33,.07)', border: '1px solid rgba(63,255,33,.22)' }
               : { background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span className={isFlash ? 'odd-pop' : ''} style={{ fontSize: 16, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: pa ? C.green : C.t1 }}>
            {val > 1 ? val.toFixed(2) : '—'}
          </span>
          {trend !== 'same' && <TrendArrow trend={trend} />}
        </div>
        <span style={{ fontSize: 10, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', padding: '0 2px', textAlign: 'center' }}>
          {bk.name}
        </span>
        {pa && (
          <Tip text="Casa com Pagamento Antecipado — paga antes do resultado.">
            <span style={{ fontSize: 9, fontWeight: 900, borderRadius: 3, padding: '0 3px', background: C.greenDim, color: C.green, border: `1px solid ${C.greenB}`, cursor: 'default' }}>PA</span>
          </Tip>
        )}
      </div>
    );
  }

  // Todas as casas para o painel expandido
  const comPa  = ev.bookmakers.filter(b => isBkPA(b));
  const semPa  = ev.bookmakers.filter(b => !isBkPA(b));
  const allBks = [...comPa, ...semPa];

  return (
    <div
      className={isFlash ? 'row-flash' : ''}
      style={{ overflow: 'hidden', borderRadius: 16, border: `1px solid ${borderCol}`, background: `${C.surf}dd`, transition: 'border-color .3s', boxShadow: isSure ? `0 4px 24px rgba(63,255,33,.06)` : '0 4px 20px rgba(0,0,0,.5)' }}>
      <div style={{ height: 2, background: mgn !== null ? `linear-gradient(90deg,${marginColor(mgn)} 0%,${marginColor(mgn)}33 50%,transparent 100%)` : `linear-gradient(90deg,rgba(255,255,255,.08) 0%,transparent 100%)` }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px 10px' }}>
        {hasDg && <ScoreRing score={dgInfo!.dg_score} classification={dgInfo!.dg_classification} />}
        {!hasDg && (
          <Tip text="Número de casas disponíveis para este jogo.">
            <div style={{ width: 56, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', cursor: 'default' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.t3 }}>{ev.bookmakers.length}</span>
            </div>
          </Tip>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, marginBottom: 3 }}>
            {hasDg && dgCol && dgRgb2 && (
              <Tip text={`Classificação DG: ${dgInfo!.dg_classification}. O algoritmo Duplo Green avaliou este jogo como oportunidade de ${dgInfo!.dg_classification === 'ALTA' ? 'alto' : 'médio'} potencial.`}>
                <span style={{ fontSize: 10, fontWeight: 900, borderRadius: 99, padding: '1px 6px', background: `rgba(${dgRgb2},.12)`, color: dgCol, border: `1px solid rgba(${dgRgb2},.3)`, cursor: 'default' }}>
                  {dgInfo!.dg_classification}
                </span>
              </Tip>
            )}
            {paCnt >= 2 && (
              <Tip text="Ambos os lados (Casa e Fora) têm a melhor odd em casas com Pagamento Antecipado — situação ideal para Duplo Green.">
                <span style={{ fontSize: 10, fontWeight: 900, borderRadius: 99, padding: '1px 6px', background: C.greenDim, color: C.green, border: `1px solid ${C.greenB}`, cursor: 'default' }}>PA×2</span>
              </Tip>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0', minWidth: 0 }}>
              <TeamLogo name={ev.home_team} size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {decodeTeamName(ev.home_team)}
              <span style={{ color: C.t3, fontWeight: 500 }}> x </span>
              {decodeTeamName(ev.away_team)}
              <TeamLogo name={ev.away_team} size={14} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: C.t3 }}>
              {ev.league_name} · {fmtTime(ev.start_time)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {mgn !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <Tip text="Margem: soma das probabilidades implícitas menos 1. Negativa = surebet (lucro garantido). Quanto menor, mais justo o mercado.">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', cursor: 'default' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, lineHeight: 1 }}>MARGEM</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: marginColor(mgn), lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                    {isSure ? `+${Math.abs(mgn).toFixed(2)}%` : `${mgn.toFixed(1)}%`}
                  </span>
                </div>
              </Tip>
              {hasDg && dgInfo!.dg_profit_pct != null && (
                <Tip text="DG Profit: percentual de lucro estimado pelo Duplo Green Engine caso a oportunidade seja aproveitada corretamente.">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: 4, cursor: 'default' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, lineHeight: 1 }}>DG PROFIT</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: C.green, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                      +{dgInfo!.dg_profit_pct.toFixed(2)}%
                    </span>
                  </div>
                </Tip>
              )}
            </div>
          )}
          <button onClick={e => { e.stopPropagation(); onToggleFav(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: isFav ? C.purple : C.t3 }}>
            <Star size={14} style={{ fill: isFav ? C.purple : 'none' }} />
          </button>
        </div>
      </div>

      {/* Odds boxes (melhores) */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px' }}>
        <OddBox bk={bkH} type="home" />
        <OddBox bk={bkD} type="draw" />
        <OddBox bk={bkA} type="away" />
      </div>

      {/* Painel expandido — todas as casas */}
      {expanded && (
        <div className="card-expanded-rows" style={{ borderTop: `1px solid ${C.surfB}`, padding: '0 16px 12px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.t3, margin: '10px 0 8px' }}>Todas as {ev.bookmakers.length} casas</p>
          {allBks.map((bk, i) => {
            const pa     = isBkPA(bk);
            const hTrend = prevSnap?.[bk.slug] ? getOddTrend(prevSnap[bk.slug].home, bk.home) : 'same' as OddTrend;
            const dTrend = prevSnap?.[bk.slug] ? getOddTrend(prevSnap[bk.slug].draw, bk.draw) : 'same' as OddTrend;
            const aTrend = prevSnap?.[bk.slug] ? getOddTrend(prevSnap[bk.slug].away, bk.away) : 'same' as OddTrend;
            return (
              <div key={bk.slug} style={{
                display: 'grid', gridTemplateColumns: '1fr 52px 52px 52px', alignItems: 'center', gap: 6,
                padding: '7px 0', borderTop: i > 0 ? `1px solid rgba(255,255,255,.04)` : undefined,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {bk.url
                    ? <a href={bk.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: C.t2, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bk.name}</a>
                    : <span style={{ fontSize: 12, fontWeight: 600, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bk.name}</span>
                  }
                  {pa && <Tip text="Casa com Pagamento Antecipado."><span style={{ fontSize: 9, fontWeight: 900, borderRadius: 3, padding: '0 3px', background: C.amberDim, color: C.amber, border: `1px solid ${C.amberB}`, cursor: 'default', flexShrink: 0 }}>PA</span></Tip>}
                </div>
                {([['home', hTrend], ['draw', dTrend], ['away', aTrend]] as [OddType, OddTrend][]).map(([t, trend]) => {
                  const val = bk[t] as number;
                  return (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, height: 36, borderRadius: 6, ...(pa ? { background: 'rgba(63,255,33,.06)', border: '1px solid rgba(63,255,33,.18)' } : { background: 'rgba(255,255,255,.03)', border: `1px solid rgba(255,255,255,.07)` }) }}>
                      <span style={{ fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: pa ? C.green : val > 1 ? C.t1 : C.t3 }}>{val > 1 ? val.toFixed(2) : '—'}</span>
                      {trend !== 'same' && <TrendArrow trend={trend} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: `1px solid ${C.surfB}` }}>
        <button onClick={() => setExpanded(e => !e)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 8px', background: expanded ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.02)', borderRight: `1px solid ${C.surfB}`, borderLeft: 'none', borderTop: 'none', borderBottom: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: expanded ? C.t1 : C.t2 }}>
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {expanded ? 'Recolher' : `${ev.bookmakers.length} casas`}
        </button>
        <button onClick={onSelect}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 8px', background: 'rgba(255,255,255,.02)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.t2 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.05)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.02)'; }}>
          <Zap size={11} style={{ color: C.green }} />
          Calcular
        </button>
      </div>
    </div>
  );
}

// ─── EventOddsPanel ───────────────────────────────────────────────────────────
function EventOddsPanel({ event, onBack, onRefresh, dgInfo, prevSnap }: {
  event: OddsSummary; onBack: () => void; onRefresh: () => void; dgInfo?: DGInfo | null;
  prevSnap?: OddSnapshot;
}) {
  const [slots, setSlots]       = useState<(CalcSlot|null)[]>([null, null, null]);
  const [calcFill, setCalcFill] = useState<{ odds: string[]; houses: string[]; urls: string[] } | null>(null);

  useEffect(() => {
    const active = slots.filter(Boolean) as CalcSlot[];
    if (!active.length) { setCalcFill(null); return; }
    setCalcFill({ odds: slots.map(s => s ? String(s.value) : ''), houses: slots.map(s => s ? s.bk.name : ''), urls: slots.map(s => s ? (s.bk.url ?? '') : '') });
  }, [slots]);

  useEffect(() => {
    const pick = (type: OddType): CalcSlot | null => {
      let best: BookmakerOdds | null = null; let bestV = 0;
      for (const bk of event.bookmakers) { const v = bk[type] as number; if (v > bestV) { bestV = v; best = bk; } }
      if (!best || bestV <= 1) return null;
      return { bk: best, type, value: bestV };
    };
    setSlots([pick('home'), pick('draw'), pick('away')]);
  }, [event.match_id]); // eslint-disable-line

  function handleOddClick(bk: BookmakerOdds, type: OddType, value: number) {
    if (value <= 1) return;
    const ti = type === 'home' ? 0 : type === 'draw' ? 1 : 2;
    setSlots(prev => {
      const ei = prev.findIndex(s => s?.bk.slug === bk.slug && s?.type === type);
      if (ei >= 0) { const n = [...prev]; n[ei] = null; return n; }
      const n = [...prev]; n[ti] = { bk, type, value }; return n;
    });
  }

  const comPa      = event.bookmakers.filter(b => b.is_pa === true);
  const semPa      = event.bookmakers.filter(b => b.is_pa !== true);
  const active     = slots.filter(Boolean) as CalcSlot[];
  const eventName  = `${event.home_team} x ${event.away_team}`;
  const dgRgb2     = dgInfo ? dgRGB(dgInfo.dg_classification) : null;
  const dgCol2     = dgInfo ? dgColor(dgInfo.dg_classification) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, padding: '12px 16px', background: `linear-gradient(135deg,${C.purpleDim} 0%,${C.surf}ee 60%)`, border: `1px solid ${C.purpleB}`, boxShadow: '0 4px 32px rgba(0,0,0,.5)' }}>
        <button onClick={onBack} style={{ display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: C.purpleDim, border: `1px solid ${C.purpleB}`, color: C.purple, cursor: 'pointer', flexShrink: 0 }}>
          <ChevronLeft size={15} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 900, color: C.t1 }}>{eventName}</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{event.league_name} · {fmtTime(event.start_time)}</div>
        </div>
        {dgInfo && dgRgb2 && dgCol2 && (
          <Tip text={`Score DG: ${dgInfo.dg_score}. DG Profit estimado: ${dgInfo.dg_profit_pct != null ? '+' + dgInfo.dg_profit_pct.toFixed(2) + '%' : '—'}. Classificação: ${dgInfo.dg_classification}.`}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: 10, padding: '6px 12px', background: `rgba(${dgRgb2},.1)`, border: `1px solid rgba(${dgRgb2},.3)`, flexShrink: 0, cursor: 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Zap size={9} style={{ color: dgCol2 }} />
                <span style={{ fontSize: 18, fontWeight: 900, color: dgCol2 }}>{dgInfo.dg_score ?? '—'}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase' as const, color: `rgba(${dgRgb2},.5)` }}>DG score</span>
              {dgInfo.dg_profit_pct != null && (
                <span style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: dgInfo.dg_profit_pct >= 0 ? C.green : C.red }}>
                  {dgInfo.dg_profit_pct >= 0 ? '+' : ''}{dgInfo.dg_profit_pct.toFixed(1)}%
                </span>
              )}
            </div>
          </Tip>
        )}
        <button onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '6px 12px', fontSize: 11, fontWeight: 700, background: C.purpleDim, color: C.purple, border: `1px solid ${C.purpleB}`, cursor: 'pointer', flexShrink: 0 }}>
          <RefreshCw size={11} /> Atualizar
        </button>
      </div>

      <div style={{ overflow: 'hidden', borderRadius: 16, background: `${C.surf}cc`, border: `1px solid ${active.length > 0 ? C.greenB : C.surfB}` }}>
        <div style={{ height: 2, background: active.length > 0 ? `linear-gradient(90deg,${C.green} 0%,${C.green}33 60%,transparent 100%)` : `linear-gradient(90deg,rgba(255,255,255,.06) 0%,transparent 100%)` }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${C.surfB}` }}>
          <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: C.t3 }}>Duplo Green</span>
          <div style={{ display: 'flex', flex: 1, flexWrap: 'wrap', gap: 8 }}>
            {slots.map((slot, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 600, background: slot ? `${SLOT_COLORS[i]}12` : 'rgba(255,255,255,.03)', border: `1px solid ${slot ? SLOT_COLORS[i] + '40' : 'rgba(255,255,255,.06)'}` }}>
                <span style={{ color: SLOT_COLORS[i], opacity: slot ? 1 : .3, fontSize: 11 }}>{SLOT_LABELS[i]}</span>
                {slot ? (
                  <>
                    <span style={{ color: C.t2 }}>{slot.bk.name}</span>
                    <span style={{ color: SLOT_COLORS[i], fontWeight: 900 }}>{slot.value.toFixed(2)}</span>
                    <span style={{ color: 'rgba(255,255,255,.45)', fontSize: 11 }}>({slot.type === 'home' ? '1' : slot.type === 'draw' ? 'X' : '2'})</span>
                    <button onClick={() => setSlots(prev => { const n = [...prev]; n[i] = null; return n; })} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.45)', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
                  </>
                ) : <span style={{ color: 'rgba(255,255,255,.45)', fontSize: 11 }}>vazio</span>}
              </div>
            ))}
          </div>
          {active.length > 0 && (
            <button onClick={() => setSlots([null, null, null])} style={{ borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, color: C.t3, border: '1px solid rgba(255,255,255,.1)', background: 'none', cursor: 'pointer' }}>Limpar</button>
          )}
        </div>
        <div style={{ padding: 16 }}>
          <SurebetCalc selectedEvent={{ name: eventName, start_utc: event.start_time }} externalFill={calcFill} defaultNumOutcomes={3} hideNumOutcomes hideFormula accent={dgInfo ? C.green : '#4DA6FF'} initialOpType="duplo_green" />
        </div>
      </div>

      <p style={{ fontSize: 11, color: C.t3, paddingLeft: 4 }}>Clique em qualquer odd para adicionar à calculadora · max 3 slots</p>
      <OddsSection label="Com Pagamento Antecipado (PA)" bks={comPa} accent={C.amber} slots={slots} onOddClick={handleOddClick} prevSnap={prevSnap} />
      <OddsSection label="Sem Pagamento Antecipado" bks={semPa} accent={C.purple} slots={slots} onOddClick={handleOddClick} prevSnap={prevSnap} />
    </div>
  );
}

// ─── LeagueFilterModal ────────────────────────────────────────────────────────
function LeagueFilterModal({ leagues, selected, onChange, onClose }: {
  leagues: string[]; selected: Set<string>; onChange: (n: Set<string>) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(() => selected.size === 0 ? new Set(leagues) : new Set(selected));
  const toggle = (lg: string) => setDraft(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); return n; });
  const allSel = draft.size === leagues.length;
  const sorted = [...leagues].sort((a, b) => {
    const aBr = a.toLowerCase().includes('brasil') || a.toLowerCase().includes('série');
    const bBr = b.toLowerCase().includes('brasil') || b.toLowerCase().includes('série');
    if (aBr && !bBr) return -1; if (!aBr && bBr) return 1; return a.localeCompare(b);
  });
  function confirm() { onChange(allSel ? new Set() : new Set(draft)); onClose(); }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: `1px solid ${C.surfB}`, borderRadius: 18, boxShadow: '0 28px 80px rgba(0,0,0,.8)', width: 560, maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: `1px solid ${C.surfB}` }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={16} style={{ color: C.green }} />
              <h3 style={{ fontSize: 17, fontWeight: 900, color: C.t1, margin: 0 }}>Campeonatos</h3>
            </div>
            <p style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>Selecione os campeonatos que deseja ver.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
            {sorted.map(lg => {
              const sel = draft.has(lg);
              return (
                <button key={lg} type="button" onClick={() => toggle(lg)} style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, padding: '10px 12px', textAlign: 'left', background: sel ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.03)', border: `1px solid ${sel ? C.greenB : C.surfB}`, cursor: 'pointer' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: sel ? C.green : 'rgba(255,255,255,.06)', border: `1.5px solid ${sel ? C.green : 'rgba(255,255,255,.15)'}` }}>
                    {sel && <Check size={10} color="#060A07" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? C.t1 : C.t2 }}>{lg}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderTop: `1px solid ${C.surfB}` }}>
          <button onClick={() => setDraft(new Set(leagues))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.t3, textDecoration: 'underline', padding: 0 }}>Marcar todas</button>
          <button onClick={() => setDraft(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.t3, textDecoration: 'underline', padding: 0 }}>Limpar</button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.t3 }}>{draft.size} de {leagues.length}</span>
          <button onClick={confirm} style={{ borderRadius: 10, padding: '8px 20px', fontSize: 13, fontWeight: 900, background: C.green, color: '#060A07', border: 'none', cursor: 'pointer' }}>Confirmar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonList({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === 'card') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse" style={{ borderRadius: 16, overflow: 'hidden', background: C.surf, border: `1px solid ${C.surfB}`, opacity: 1 - i * 0.12 }}>
            <div style={{ height: 2, background: 'rgba(255,255,255,.06)' }} />
            <div style={{ display: 'flex', gap: 12, padding: '14px 16px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,.07)', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 14, borderRadius: 4, background: 'rgba(255,255,255,.08)', width: '70%' }} />
                <div style={{ height: 10, borderRadius: 4, background: 'rgba(255,255,255,.04)', width: '45%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px' }}>
              {[0,1,2].map(j => <div key={j} style={{ flex: 1, height: 62, borderRadius: 8, background: 'rgba(255,255,255,.04)' }} />)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse" style={{ borderRadius: 16, overflow: 'hidden', background: C.surf, border: `1px solid ${C.surfB}`, opacity: 1 - i * 0.18 }}>
          <div style={{ height: 2, background: 'rgba(255,255,255,.06)' }} />
          <div style={{ padding: '10px 16px', display: 'flex', gap: 12, borderBottom: `1px solid ${C.surfB}` }}>
            <div style={{ width: 60, height: 10, borderRadius: 4, background: 'rgba(255,255,255,.08)' }} />
            <div style={{ flex: 1, height: 10, borderRadius: 4, background: 'rgba(255,255,255,.04)' }} />
          </div>
          {[0,1,2].map(j => (
            <div key={j} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderTop: j > 0 ? `1px solid ${C.surfB}` : undefined }}>
              <div style={{ width: 44, height: 36, borderRadius: 6, background: 'rgba(255,255,255,.06)' }} />
              <div style={{ flex: 1, height: 32, borderRadius: 6, background: 'rgba(255,255,255,.04)' }} />
              <div style={{ width: 60, height: 48, borderRadius: 8, background: 'rgba(63,255,33,.04)' }} />
              <div style={{ width: 60, height: 48, borderRadius: 8, background: 'rgba(255,255,255,.04)' }} />
              <div style={{ width: 60, height: 48, borderRadius: 8, background: 'rgba(63,255,33,.04)' }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BuscarOddsPage() {
  const today = todayBRT();

  // ── Persistent preferences ─────────────────────────────────────────────────
  const [viewMode, setViewModeRaw] = useState<ViewMode>(() => lsGet('suredge_view', 'table') as ViewMode);
  const [sortBy,   setSortByRaw]   = useState<SortBy>(() => lsGet('suredge_sort', 'padrao') as SortBy);
  const setViewMode = (v: ViewMode) => { setViewModeRaw(v); lsSet('suredge_view', v); };
  const setSortBy   = (v: SortBy)   => { setSortByRaw(v);   lsSet('suredge_sort', v); };

  // ── UI state ───────────────────────────────────────────────────────────────
  const [tab,             setTab]             = useState<'odds'|'dg'>('odds');
  const [selectedEvent,   setSelectedEvent]   = useState<OddsSummary | null>(null);
  const [paFilter,        setPaFilter]        = useState<PAFilter>('ALL');
  const [leagueFav,       setLeagueFav]       = useState<Set<string>>(() => new Set(lsGet<string[]>('suredge_fav_leagues', [])));
  const [matchFav,        setMatchFav]        = useState<Set<string>>(() => new Set(lsGet<string[]>('suredge_fav_matches', [])));
  const [leagueCollapsed, setLeagueCollapsed] = useState<Set<string>>(() => new Set(lsGet<string[]>('suredge_collapsed', [])));
  const [leagueFilter,    setLeagueFilter]    = useState<Set<string>>(new Set());
  const [leagueModalOpen, setLeagueModalOpen] = useState(false);
  const [searchQ,         setSearchQ]         = useState('');
  const [dgMap,           setDgMap]           = useState<Map<string, DGInfo>>(new Map());
  const [showTutorial,    setShowTutorial]    = useState(false);
  const [tick,            setTick]            = useState(0);
  const [syncMetrics,     setSyncMetrics]     = useState<(SyncMetrics & { since_seconds: number }) | null>(null);

  // ── Odds trend: snapshot das odds anteriores ────────────────────────────────
  // matchId → { slugCasa → { home, draw, away } }
  const [oddsPrevSnap, setOddsPrevSnap] = useState<Map<string, OddSnapshot>>(new Map());


  // ── Sync Bridge metrics ────────────────────────────────────────────────────
  const loadSyncMetrics = useCallback(async () => {
    try {
      const res  = await fetch('/api/sync/metrics');
      const data = await res.json() as SyncMetrics & { ok: boolean; since_seconds: number };
      if (data.ok) setSyncMetrics(data);
    } catch { /* silencia */ }
  }, []);
  useEffect(() => {
    loadSyncMetrics();
    const id = setInterval(loadSyncMetrics, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadSyncMetrics]);

  // ── SSE ────────────────────────────────────────────────────────────────────
  const { odds: rawOdds, loading, error: oddsError, connected, lastUpdate, recentlyUpdated } = useOdds();
  const allOdds  = rawOdds as unknown as OddsSummary[];
  const fetchErr = oddsError ?? '';

  // Quando uma partida é atualizada via SSE, salva snapshot das odds anteriores
  useEffect(() => {
    if (!recentlyUpdated.size) return;
    setOddsPrevSnap(prevMap => {
      const next = new Map(prevMap);
      for (const matchId of recentlyUpdated) {
        const ev = allOdds.find(e => e.match_id === matchId);
        if (!ev) continue;
        const snap: OddSnapshot = {};
        for (const bk of ev.bookmakers) {
          snap[bk.slug] = { home: bk.home, draw: bk.draw, away: bk.away };
        }
        next.set(matchId, snap);
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentlyUpdated]);

  // Tick for "updated X ago"
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 10_000); return () => clearInterval(id); }, []);
  void tick;

  // ── DG map ─────────────────────────────────────────────────────────────────
  const loadDGMap = useCallback(async () => {
    try {
      const res  = await fetch('/api/dg/opportunities?limit=500');
      const data = await res.json() as { ok: boolean; results?: Array<{ match_id: string; dg_score: number | null; dg_classification: string | null; dg_profit_pct: number | null }> };
      if (!data.ok || !data.results) return;
      const map = new Map<string, DGInfo>();
      for (const r of data.results) {
        const ex = map.get(r.match_id);
        if (!ex || (r.dg_score ?? 0) > (ex.dg_score ?? 0))
          map.set(r.match_id, { dg_score: r.dg_score, dg_classification: r.dg_classification, dg_profit_pct: r.dg_profit_pct });
      }
      setDgMap(map);
    } catch { /* silencia */ }
  }, []);
  useEffect(() => { loadDGMap(); }, [loadDGMap]);

  // ── Persist favorites / collapsed ─────────────────────────────────────────
  const toggleLeagueFav = (lg: string) => {
    setLeagueFav(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); lsSet('suredge_fav_leagues', [...n]); return n; });
  };
  const toggleMatchFav = (id: string) => {
    setMatchFav(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); lsSet('suredge_fav_matches', [...n]); return n; });
  };
  const toggleCollapse = (lg: string) => {
    setLeagueCollapsed(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); lsSet('suredge_collapsed', [...n]); return n; });
  };

  // ── Status counts ──────────────────────────────────────────────────────────
  const GAME_MS = 110 * 60 * 1000;
  const { liveCount, todayCount, futureCount } = useMemo(() => {
    const now = Date.now();
    let live = 0, todayCnt = 0, future = 0;
    for (const ev of allOdds) {
      if (isExcluded(ev.league_name ?? '')) continue;
      const t = new Date(ev.start_time).getTime();
      if (t < now && t + GAME_MS > now) live++;
      else if (dateBRT(ev.start_time) === today && t >= now) todayCnt++;
      else if (dateBRT(ev.start_time) > today) future++;
    }
    return { liveCount: live, todayCount: todayCnt, futureCount: future };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOdds, today]);

  // ── Leagues available ──────────────────────────────────────────────────────
  const allLeagues = useMemo(
    () => [...new Set(allOdds.filter(e => !isExcluded(e.league_name)).map(e => e.league_name))].sort(),
    [allOdds],
  );

  // ── Filtered + sorted ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = Date.now();
    const isPlaceholder = (name: string) => {
      const n = name.trim();
      // códigos brutos da bookmaker (W73, RU101, 2E, 3CDFGH)
      if (/^(\d+)[A-Z]+(?:\s*\([^)]+\))?$/.test(n) || /^W\d+$/.test(n) || /^RU\d+$/.test(n)) return true;
      // nomes em português que indicam time ainda não definido
      const pt = n.toLowerCase();
      return pt.startsWith('vencedor') || pt.startsWith('perdedor') || pt.startsWith('segundo do') ||
             pt.startsWith('terceiro') || pt.startsWith('winner') || pt.startsWith('loser') ||
             pt.startsWith('runner') || pt.includes('a definir') || pt.includes('tbd');
    };
    let evs = allOdds
      .filter(ev => !isExcluded(ev.league_name ?? ''))
      .filter(ev => { try { return new Date(ev.start_time).getTime() + GAME_MS > now; } catch { return true; } })
      .filter(ev => !isPlaceholder(ev.home_team) && !isPlaceholder(ev.away_team))
      .filter(ev => leagueFilter.size === 0 || leagueFilter.has(ev.league_name))
      .filter(ev => {
        if (paFilter === 'AMBOS_PA') return paSideCount(ev) >= 2;
        if (paFilter === 'APENAS_PA') return paSideCount(ev) > 0;
        return true;
      });
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      evs = evs.filter(ev => ev.home_team.toLowerCase().includes(q) || ev.away_team.toLowerCase().includes(q) || ev.league_name.toLowerCase().includes(q));
    }
    return evs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOdds, leagueFilter, paFilter, searchQ]);

  const cntAll      = filtered.length;
  const cntAmbosPA  = useMemo(() => filtered.filter(ev => paSideCount(ev) >= 2).length, [filtered]);
  const cntApenasPA = useMemo(() => filtered.filter(ev => paSideCount(ev) > 0).length,  [filtered]);
  const hasFilter   = paFilter !== 'ALL' || leagueFilter.size > 0 || searchQ.trim().length > 0;

  // ── Grouped by league ──────────────────────────────────────────────────────
  const byLeague = useMemo(() => {
    const map = new Map<string, OddsSummary[]>();
    for (const ev of filtered) {
      const key = ev.league_name || 'Outros';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries())
      .map(([lg, evs]) => [lg, sortMatches(evs, sortBy, dgMap)] as [string, OddsSummary[]])
      .sort((a, b) => {
        const aFav = leagueFav.has(a[0]), bFav = leagueFav.has(b[0]);
        if (aFav !== bFav) return aFav ? -1 : 1;
        // Ligas com jogos hoje aparecem antes de ligas apenas com futuros
        const aToday = a[1].some(ev => dateBRT(ev.start_time) === today);
        const bToday = b[1].some(ev => dateBRT(ev.start_time) === today);
        if (aToday !== bToday) return aToday ? -1 : 1;
        const aBr = a[0].toLowerCase().includes('brasil') || a[0].toLowerCase().includes('série');
        const bBr = b[0].toLowerCase().includes('brasil') || b[0].toLowerCase().includes('série');
        if (aBr && !bBr) return -1; if (!aBr && bBr) return 1;
        return a[0].localeCompare(b[0]);
      });
  }, [filtered, sortBy, dgMap, leagueFav]);

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selectedEvent) {
    return (
      <>
        <GlobalStyles />
        <EventOddsPanel
          event={selectedEvent}
          onBack={() => setSelectedEvent(null)}
          onRefresh={loadDGMap}
          dgInfo={dgMap.get(selectedEvent.match_id) ?? null}
          prevSnap={oddsPrevSnap.get(selectedEvent.match_id)}
        />
      </>
    );
  }

  const leagueLabel  = leagueFilter.size > 0 && leagueFilter.size < allLeagues.length ? `${leagueFilter.size} campeonatos` : 'Campeonatos';
  const leagueActive = leagueFilter.size > 0 && leagueFilter.size < allLeagues.length;

  return (
    <>
      <GlobalStyles />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: 980, margin: '0 auto' }}>

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', color: C.t1, margin: 0 }}>Buscar Odds</h1>
            <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
              {loading
                ? 'Conectando…'
                : <><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? C.green : C.red, display: 'inline-block', boxShadow: connected ? `0 0 6px ${C.green}` : 'none' }} />{connected ? 'ao vivo' : 'reconectando'}</span> · {allLeagues.length} campeonatos · atualizado há {secsAgo(lastUpdate || Date.now())}</>}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setShowTutorial(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 99, background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.22)', color: C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <PlayCircle size={13} /><span>Tutorial</span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,.03)', border: `1px solid ${C.surfB}` }}>
              {([
                { key: 'odds' as const, icon: <Zap size={12} />,       label: 'Odds',            col: '#94a3b8', bg: 'rgba(99,102,241,.1)' },
                { key: 'dg'   as const, icon: <TrendingUp size={12} />, label: 'Oportunidades DG', col: C.green,  bg: C.greenDim },
              ]).map((t, i) => (
                <React.Fragment key={t.key}>
                  {i > 0 && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,.07)' }} />}
                  <button onClick={() => setTab(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, background: tab === t.key ? t.bg : 'transparent', color: tab === t.key ? t.col : C.t3, border: 'none', cursor: 'pointer', transition: 'background .15s' }}>
                    {t.icon}{t.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <button onClick={loadDGMap} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '7px 12px', fontSize: 11, fontWeight: 600, background: `${C.surf}cc`, border: `1px solid ${C.surfB}`, color: C.t3, cursor: 'pointer', opacity: loading ? .4 : 1 }}>
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /><span>Atualizar DG</span>
            </button>
          </div>
        </div>

        {tab === 'dg' && <DGOpportunitiesSection />}

        {tab === 'odds' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ── Sync Bridge metrics bar ──────────────────────────────────── */}
            {syncMetrics && (() => {
              const sec    = syncMetrics.since_seconds;
              const stale  = sec > 7200;
              const warn   = sec > 1800;
              const dot    = stale ? C.red : warn ? C.amber : C.green;
              const dotRgb = stale ? '248,113,113' : warn ? '245,158,11' : '63,255,33';
              const sinceStr = sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}min` : `${Math.floor(sec / 3600)}h`;
              const hasAll = syncMetrics.total_matches != null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '7px 14px', borderRadius: 10, background: `rgba(${dotRgb},.04)`, border: `1px solid rgba(${dotRgb},.14)`, fontSize: 11, fontWeight: 700, color: C.t3 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, boxShadow: `0 0 5px ${dot}88`, flexShrink: 0 }} />
                  <span style={{ color: C.t2 }}>Sync Bridge</span>
                  <span style={{ color: 'rgba(255,255,255,.12)' }}>·</span>
                  {hasAll && <><span><span style={{ color: C.t1 }}>{syncMetrics.total_matches}</span> jogos</span><span style={{ color: 'rgba(255,255,255,.12)' }}>·</span></>}
                  <span><span style={{ color: C.t1 }}>{(syncMetrics.total_odds ?? 0).toLocaleString('pt-BR')}</span> odds</span>
                  <span style={{ color: 'rgba(255,255,255,.12)' }}>·</span>
                  <span><span style={{ color: C.green }}>1x2</span> {(syncMetrics.market_1x2 ?? 0).toLocaleString('pt-BR')}</span>
                  <span style={{ color: 'rgba(255,255,255,.12)' }}>·</span>
                  <span><span style={{ color: C.purple }}>PA</span> {(syncMetrics.market_pa ?? 0).toLocaleString('pt-BR')}</span>
                  {hasAll && syncMetrics.avg_bookmakers != null && (
                    <><span style={{ color: 'rgba(255,255,255,.12)' }}>·</span><span>~<span style={{ color: C.t1 }}>{syncMetrics.avg_bookmakers}</span> casas/jogo</span></>
                  )}
                  <span style={{ color: 'rgba(255,255,255,.12)' }}>·</span>
                  <Tip text={`Último dado sincronizado via extensão há ${sinceStr}. ${stale ? 'Dados desatualizados — recarregue a página do DuploGreen.' : warn ? 'Abra ou recarregue o DuploGreen para atualizar.' : 'Sync recente.'}`}>
                    <span style={{ color: dot, cursor: 'default' }}>sincronizado há {sinceStr}</span>
                  </Tip>
                  <button onClick={loadSyncMetrics} style={{ marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: 4, color: C.t3, fontSize: 10, fontWeight: 900 }} title="Atualizar métricas">⟲</button>
                </div>
              );
            })()}

            {/* ── Filter bar ──────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 14, background: `${C.surf}ee`, border: `1px solid ${C.surfB}`, boxShadow: '0 2px 12px rgba(0,0,0,.3)', position: 'sticky', top: 0, zIndex: 40 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.t3, pointerEvents: 'none' }} />
                <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar time ou liga…"
                  style={{ height: 34, paddingLeft: 30, paddingRight: 10, borderRadius: 8, background: 'rgba(255,255,255,.05)', border: `1px solid ${C.surfB}`, color: C.t1, fontSize: 12, outline: 'none', width: 180 }} />
              </div>

              <button onClick={() => setLeagueModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, background: leagueActive ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.05)', border: `1px solid ${leagueActive ? C.greenB : C.surfB}`, color: leagueActive ? C.green : C.t2, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Trophy size={11} />{leagueLabel}
                {leagueActive && <span style={{ fontSize: 10, fontWeight: 900, borderRadius: 99, padding: '0 5px', background: 'rgba(63,255,33,.18)', color: C.green }}>{leagueFilter.size}/{allLeagues.length}</span>}
                <ChevronDown size={10} style={{ opacity: .5 }} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderRadius: 8, padding: 3, background: 'rgba(255,255,255,.03)', border: `1px solid ${C.surfB}` }}>
                {([
                  ['ALL',       'Todos',      cntAll,      C.t2,   '255,255,255'] as const,
                  ['AMBOS_PA',  'PA 2 lados', cntAmbosPA,  C.green,'63,255,33'  ] as const,
                  ['APENAS_PA', 'Algum PA',   cntApenasPA, C.amber,'245,158,11' ] as const,
                ]).map(([v, label, cnt, col, rgb]) => {
                  const active = paFilter === v;
                  return (
                    <Tip key={v} text={
                      v === 'ALL'       ? 'Todos os jogos disponíveis, sem filtro de PA.' :
                      v === 'AMBOS_PA'  ? 'Apenas jogos onde AMBOS os lados (Casa e Fora) têm a melhor odd em casas com Pagamento Antecipado. Ideal para Duplo Green.' :
                                          'Jogos onde pelo menos UM lado tem odd melhor em casa de Pagamento Antecipado.'
                    }>
                      <button onClick={() => setPaFilter(v as PAFilter)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: active ? `rgba(${rgb},.14)` : 'transparent', color: active ? col : C.t3, border: active ? `1px solid rgba(${rgb},.35)` : '1px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {label}
                        <span style={{ fontSize: 10, fontWeight: 900, borderRadius: 99, padding: '0 4px', background: active ? `rgba(${rgb},.18)` : 'rgba(255,255,255,.06)', color: active ? col : C.t3 }}>{cnt}</span>
                      </button>
                    </Tip>
                  );
                })}
              </div>

              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={{ height: 34, padding: '0 10px', borderRadius: 8, background: 'rgba(255,255,255,.05)', border: `1px solid ${C.surfB}`, color: C.t2, fontSize: 12, cursor: 'pointer', outline: 'none' }}>
                <option value="padrao">Ordenar: Horário</option>
                <option value="maior_lucro">Maior Lucro</option>
                <option value="menor_lucro">Menor Lucro</option>
                <option value="dg_score">Score DG</option>
              </select>

              {hasFilter && (
                <button onClick={() => { setPaFilter('ALL'); setLeagueFilter(new Set()); setSearchQ(''); }} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 34, padding: '0 10px', borderRadius: 8, color: C.red, background: C.redDim, border: '1px solid rgba(248,113,113,.2)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  <X size={10} />Limpar
                </button>
              )}

              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.t3, whiteSpace: 'nowrap' }}>{filtered.length} de {allOdds.filter(e => !isExcluded(e.league_name)).length} jogos</span>

              <div style={{ display: 'flex', alignItems: 'center', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.surfB}` }}>
                <Tip text="Modo tabela: visão compacta com todos os jogos em lista.">
                  <button onClick={() => setViewMode('table')} title="Tabela" style={{ display: 'flex', height: 34, width: 34, alignItems: 'center', justifyContent: 'center', background: viewMode === 'table' ? 'rgba(255,255,255,.1)' : 'transparent', border: 'none', borderRight: `1px solid ${C.surfB}`, cursor: 'pointer', color: viewMode === 'table' ? C.t1 : C.t3 }}>
                    <List size={14} />
                  </button>
                </Tip>
                <Tip text="Modo cartão: visualização expandida com ScoreRing DG, odds destacadas e painel por jogo.">
                  <button onClick={() => setViewMode('card')} title="Cartões" style={{ display: 'flex', height: 34, width: 34, alignItems: 'center', justifyContent: 'center', background: viewMode === 'card' ? 'rgba(255,255,255,.1)' : 'transparent', border: 'none', cursor: 'pointer', color: viewMode === 'card' ? C.t1 : C.t3 }}>
                    <LayoutGrid size={14} />
                  </button>
                </Tip>
              </div>
            </div>

            {/* ── Status row ──────────────────────────────────────────────── */}
            {!loading && allOdds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {liveCount > 0 && (
                  <Tip text="Jogos que já começaram e ainda estão em andamento (estimativa de 110 min de duração).">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '3px 10px', background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)', color: C.red, cursor: 'default' }}>
                      <Radio size={10} /> {liveCount} ao vivo
                    </span>
                  </Tip>
                )}
                {todayCount > 0 && (
                  <Tip text="Jogos programados para hoje que ainda não começaram.">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '3px 10px', background: 'rgba(63,255,33,.06)', border: `1px solid ${C.greenB}`, color: C.green, cursor: 'default' }}>
                      <Clock size={10} /> {todayCount} hoje
                    </span>
                  </Tip>
                )}
                {futureCount > 0 && (
                  <Tip text="Jogos programados para os próximos dias.">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '3px 10px', background: 'rgba(255,255,255,.04)', border: `1px solid ${C.surfB}`, color: C.t3, cursor: 'default' }}>
                      {futureCount} futuros
                    </span>
                  </Tip>
                )}
              </div>
            )}

            {fetchErr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: '12px 16px', background: C.redDim, border: '1px solid rgba(248,113,113,.25)', color: C.red, fontSize: 13 }}>
                {fetchErr}
                <button onClick={() => window.location.reload()} style={{ marginLeft: 'auto', fontSize: 12, color: C.purple, background: 'none', border: 'none', cursor: 'pointer' }}>Tentar novamente</button>
              </div>
            )}

            {loading && <SkeletonList viewMode={viewMode} />}

            {!loading && !fetchErr && filtered.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: 12, color: C.t3 }}>
                <ScanSearch size={36} style={{ opacity: .2 }} />
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Nenhum jogo encontrado</p>
                {hasFilter && (
                  <button onClick={() => { setPaFilter('ALL'); setLeagueFilter(new Set()); setSearchQ(''); }} style={{ borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 700, color: C.green, background: C.greenDim, border: `1px solid ${C.greenB}`, cursor: 'pointer' }}>Limpar filtros</button>
                )}
              </div>
            )}

            {leagueModalOpen && (
              <LeagueFilterModal leagues={allLeagues} selected={leagueFilter} onChange={setLeagueFilter} onClose={() => setLeagueModalOpen(false)} />
            )}

            {/* ── Card view ───────────────────────────────────────────────── */}
            {!loading && viewMode === 'card' && byLeague.map(([league, evs]) => {
              const isFav       = leagueFav.has(league);
              const isCollapsed = leagueCollapsed.has(league);
              return (
                <div key={league}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', marginBottom: isCollapsed ? 0 : 10 }}>
                    <button onClick={() => toggleCollapse(league)} style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: isFav ? C.green : 'rgba(63,255,33,.4)', flexShrink: 0, boxShadow: isFav ? `0 0 6px ${C.green}` : 'none' }} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: isFav ? C.green : C.t1 }}>{league}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '1px 7px', background: 'rgba(255,255,255,.06)', color: C.t3, border: `1px solid ${C.surfB}` }}>{evs.length}</span>
                      <ChevronDown size={12} style={{ color: C.t3, transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .2s' }} />
                    </button>
                    <button onClick={() => toggleLeagueFav(league)} style={{ background: isFav ? C.greenDim : 'rgba(255,255,255,.03)', border: `1px solid ${isFav ? C.greenB : C.surfB}`, borderRadius: 8, padding: '4px 6px', cursor: 'pointer' }}>
                      <Star size={12} style={{ color: isFav ? C.green : C.t3, fill: isFav ? C.green : 'none' }} />
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 14, marginBottom: 20 }}>
                      {evs.map(ev => (
                        <MatchCard
                          key={ev.match_id}
                          ev={ev}
                          dgInfo={dgMap.get(ev.match_id) ?? null}
                          isFlash={recentlyUpdated.has(ev.match_id)}
                          isFav={matchFav.has(ev.match_id)}
                          onSelect={() => setSelectedEvent(ev)}
                          onToggleFav={() => toggleMatchFav(ev.match_id)}
                          prevSnap={oddsPrevSnap.get(ev.match_id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Table view ──────────────────────────────────────────────── */}
            {!loading && viewMode === 'table' && byLeague.map(([league, evs]) => {
              const isFav       = leagueFav.has(league);
              const isCollapsed = leagueCollapsed.has(league);
              const dateGroups: Array<{ date: string; isToday: boolean; label: string; events: OddsSummary[] }> = [];
              for (const ev of evs) {
                const d    = dateBRT(ev.start_time);
                const last = dateGroups[dateGroups.length - 1];
                if (!last || last.date !== d) dateGroups.push({ date: d, isToday: d === today, label: weekdayLabel(ev.start_time, today), events: [ev] });
                else last.events.push(ev);
              }

              return (
                <div key={league} style={{ overflow: 'hidden', borderRadius: 16, background: `${C.surf}cc`, border: `1px solid ${isFav ? C.greenB : C.surfB}`, boxShadow: isFav ? `0 4px 24px rgba(0,0,0,.4),0 0 16px rgba(63,255,33,.05)` : '0 4px 20px rgba(0,0,0,.4)', marginBottom: 4 }}>
                  <div style={{ height: 2, background: isFav ? `linear-gradient(90deg,${C.green} 0%,${C.green}44 55%,transparent 100%)` : `linear-gradient(90deg,rgba(63,255,33,.35) 0%,rgba(63,255,33,.08) 55%,transparent 100%)` }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: isFav ? 'rgba(63,255,33,.06)' : 'rgba(255,255,255,.016)', borderBottom: isCollapsed ? 'none' : `1px solid ${C.surfB}` }}>
                    <button onClick={() => toggleCollapse(league)} style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isFav ? C.green : 'rgba(63,255,33,.45)', boxShadow: isFav ? `0 0 6px ${C.green}` : 'none' }} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: isFav ? C.green : C.t1 }}>{league}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '1px 7px', background: 'rgba(255,255,255,.06)', color: C.t3, border: `1px solid ${C.surfB}` }}>{evs.length}</span>
                      <ChevronDown size={13} style={{ color: C.t3, transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .2s ease' }} />
                    </button>
                    <button onClick={() => toggleLeagueFav(league)} style={{ marginLeft: 8, display: 'flex', height: 28, width: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: isFav ? C.greenDim : 'rgba(255,255,255,.03)', border: `1px solid ${isFav ? C.greenB : C.surfB}`, cursor: 'pointer' }}>
                      <Star size={12} style={{ color: isFav ? C.green : C.t3, fill: isFav ? C.green : 'none' }} />
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div>
                      {dateGroups.map(group => (
                        <React.Fragment key={group.date}>
                          {dateGroups.length > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 20px', borderTop: `1px solid ${C.surfB}`, background: group.isToday ? 'rgba(63,255,33,.04)' : 'rgba(255,255,255,.01)' }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: group.isToday ? C.green : C.t3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{group.label}</span>
                              <div style={{ flex: 1, height: 1, background: group.isToday ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.04)' }} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.t3 }}>{group.events.length}</span>
                            </div>
                          )}
                          {group.events.map((ev, idx) => {
                            const mgn     = calcMargin(ev.bookmakers);
                            const isSure  = mgn !== null && mgn < 0;
                            const bkH     = bestBk(ev.bookmakers, 'home');
                            const bkD     = bestBk(ev.bookmakers, 'draw');
                            const bkA     = bestBk(ev.bookmakers, 'away');
                            const bestD   = bestVal(ev.bookmakers, 'draw');
                            const bestH   = bestVal(ev.bookmakers, 'home');
                            const bestAw  = bestVal(ev.bookmakers, 'away');
                            const drawIsTop = bestD > 0 && bestD >= bestH && bestD >= bestAw;
                            const drawPA  = bkD && isBkPA(bkD) && drawIsTop ? true : (bkD ? false : undefined);
                            const dg      = dgMap.get(ev.match_id);
                            const dgRgb2  = dg ? dgRGB(dg.dg_classification) : null;
                            const dgCol2  = dg ? dgColor(dg.dg_classification) : null;
                            const started = new Date(ev.start_time).getTime() < Date.now();
                            const paCnt   = paSideCount(ev);
                            const isFlash  = recentlyUpdated.has(ev.match_id);
                            const isMFav   = matchFav.has(ev.match_id);
                            const snap     = oddsPrevSnap.get(ev.match_id);

                            function trendBk(bk: BookmakerOdds | null, t: OddType): OddTrend {
                              if (!bk || !snap?.[bk.slug]) return 'same';
                              return getOddTrend(snap[bk.slug][t], bk[t] as number);
                            }

                            return (
                              <div key={ev.match_id} className={isFlash ? 'row-flash' : ''} style={{ borderTop: idx > 0 || dateGroups.length > 1 ? `1px solid ${C.surfB}` : undefined }}>
                                <button type="button" onClick={() => setSelectedEvent(ev)} style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                  {/* Desktop */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px 70px 70px', alignItems: 'center', gap: 12, padding: '12px 16px 12px 20px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: started ? C.amber : group.isToday ? C.green : C.t2 }}>{fmtTime(ev.start_time)}</span>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: started ? `${C.amber}88` : group.isToday ? C.t3 : `${C.amber}99` }}>{started ? 'Em andamento' : group.isToday ? 'Hoje' : fmtDateShort(ev.start_time)}</span>
                                      {mgn !== null && (
                                        <Tip text={`Margem de mercado: ${mgn.toFixed(2)}%. ${isSure ? 'Margem negativa — possível surebet (lucro garantido independente do resultado).' : 'Quanto menor a margem, mais justas são as odds.'}`}>
                                          <span style={{ fontSize: 11, fontWeight: 900, color: marginColor(mgn), background: marginBg(mgn), border: `1px solid ${marginColor(mgn)}33`, borderRadius: 4, padding: '1px 5px', display: 'inline-block', alignSelf: 'flex-start', fontVariantNumeric: 'tabular-nums', cursor: 'default' }}>
                                            {isSure ? `+${Math.abs(mgn).toFixed(2)}%` : `${mgn.toFixed(1)}%`}
                                          </span>
                                        </Tip>
                                      )}
                                    </div>
                                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
                                        <TeamLogo name={ev.home_team} size={14} />
                                        <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, color: C.t1, margin: 0 }}>{decodeTeamName(ev.home_team)}</p>
                                      </div>
                                        {dg && dgRgb2 && dgCol2 && (
                                          <Tip text={`Score DG: ${dg.dg_score}. Classificação: ${dg.dg_classification}. Profit estimado: ${dg.dg_profit_pct != null ? '+' + dg.dg_profit_pct.toFixed(2) + '%' : '—'}.`}>
                                            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, borderRadius: 4, padding: '1px 5px', fontSize: 11, fontWeight: 900, background: `rgba(${dgRgb2},.1)`, color: dgCol2, border: `1px solid rgba(${dgRgb2},.25)`, cursor: 'default' }}>
                                              <Zap size={7} />{dg.dg_score}
                                            </span>
                                          </Tip>
                                        )}
                                        {paCnt >= 2 && (
                                          <Tip text="Ambos os lados têm a melhor odd em casas com Pagamento Antecipado.">
                                            <span style={{ fontSize: 11, fontWeight: 900, borderRadius: 4, padding: '1px 4px', background: C.greenDim, color: C.green, border: `1px solid ${C.greenB}`, flexShrink: 0, cursor: 'default' }}>PA×2</span>
                                          </Tip>
                                        )}
                                        {paCnt === 1 && (
                                          <Tip text="Um dos lados tem a melhor odd em casa com Pagamento Antecipado.">
                                            <span style={{ fontSize: 11, fontWeight: 900, borderRadius: 4, padding: '1px 4px', background: 'rgba(63,255,33,.05)', color: `${C.green}99`, border: '1px solid rgba(63,255,33,.18)', flexShrink: 0, cursor: 'default' }}>PA</span>
                                          </Tip>
                                        )}
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                                        <TeamLogo name={ev.away_team} size={14} />
                                        <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500, color: C.t2, margin: 0 }}>{decodeTeamName(ev.away_team)}</p>
                                      </div>
                                      <p style={{ fontSize: 11, color: C.t3, margin: 0 }}>{ev.bookmakers.length} casas{isMFav ? ' · ⭐' : ''}</p>
                                    </div>
                                    <BestOddCell bk={bkH} type="home" flash={isFlash} trend={trendBk(bkH, 'home')} />
                                    <BestOddCell bk={bkD} type="draw" showPaBadge={drawPA ?? undefined} flash={isFlash} trend={trendBk(bkD, 'draw')} />
                                    <BestOddCell bk={bkA} type="away" flash={isFlash} trend={trendBk(bkA, 'away')} />
                                  </div>
                                  {/* Mobile */}
                                  <div className="flex items-center gap-3 px-4 py-3 md:hidden">
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44, flexShrink: 0 }}>
                                      <span style={{ fontSize: 13, fontWeight: 900, color: started ? C.amber : group.isToday ? C.green : C.t2 }}>{fmtTime(ev.start_time)}</span>
                                      {mgn !== null && <span style={{ fontSize: 11, fontWeight: 700, color: marginColor(mgn) }}>{isSure ? `+${Math.abs(mgn).toFixed(1)}%` : `${mgn.toFixed(1)}%`}</span>}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: C.t1, margin: 0 }}>{ev.home_team} x {ev.away_team}</p>
                                      <p style={{ fontSize: 11, color: C.t3, margin: '2px 0 0' }}>{ev.bookmakers.length} casas{paCnt > 0 ? ` · PA×${paCnt}` : ''}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                      {([bkH, bkD, bkA] as const).map((bk, ki) => {
                                        const type = (['home','draw','away'] as const)[ki];
                                        if (!bk) return <div key={ki} style={{ width: 36, height: 36, borderRadius: 6, background: 'rgba(255,255,255,.02)' }} />;
                                        const val  = bk[type] as number;
                                        const pa2  = ki === 1 ? (drawPA ?? isBkPA(bk)) : isBkPA(bk);
                                        const tr   = trendBk(bk, type);
                                        return (
                                          <div key={ki} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 6, ...(pa2 ? { background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.25)' } : { background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }) }}>
                                            <span className={isFlash ? 'odd-pop' : ''} style={{ fontSize: 11, fontWeight: 900, color: pa2 ? C.green : C.t2 }}>{val.toFixed(2)}</span>
                                            {tr !== 'same' && <div style={{ position: 'absolute', bottom: 1, right: 1 }}><TrendArrow trend={tr} /></div>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </button>
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showTutorial && (
        <VideoTutorialModal videoId="w-Mj7WatbPU" title="Como usar o Buscar Odds" description="Aprenda a encontrar as melhores odds e oportunidades DuploGreen no SureEdge." restricted onClose={() => setShowTutorial(false)} />
      )}
    </>
  );
}
