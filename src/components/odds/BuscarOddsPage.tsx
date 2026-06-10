'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, ScanSearch, ChevronLeft, ChevronRight, ExternalLink,
  ArrowDown, RefreshCw, Zap, TrendingUp, ChevronDown, Star,
  HelpCircle, ArrowUpDown,
} from 'lucide-react';
import { SurebetCalc } from '@/components/calcalendario/SurebetCalc';
import { DGOpportunitiesSection } from './DGOpportunitiesSection';

// ─── Palette DG ───────────────────────────────────────────────────────────────
const C = {
  green:    '#00e676',
  greenDim: 'rgba(0,230,118,.12)',
  greenB:   'rgba(0,230,118,.3)',
  purple:   '#7c3aed',
  purpleDim:'rgba(124,58,237,.12)',
  purpleB:  'rgba(124,58,237,.3)',
  amber:    '#f59e0b',
  amberDim: 'rgba(245,158,11,.12)',
  amberB:   'rgba(245,158,11,.3)',
  red:      '#f87171',
  redDim:   'rgba(248,113,113,.1)',
  surf:     '#10141a',
  surfB:    '#1a2030',
  bg:       '#080b0f',
  t1:       '#e2e8f0',
  t2:       '#94a3b8',
  t3:       '#64748b',
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BookmakerOdds {
  slug:  string;
  name:  string;
  home:  number;
  draw:  number;
  away:  number;
  url:   string;
  is_pa?: boolean;
}

interface OddsSummary {
  match_id:    string;
  home_team:   string;
  away_team:   string;
  start_time:  string;
  league_name: string;
  league_id:   number;
  bookmakers:  BookmakerOdds[];
}

interface DGInfo {
  dg_score:          number | null;
  dg_classification: string | null;
  dg_profit_pct:     number | null;
}

type PAFilter = 'ALL' | 'AMBOS_PA' | 'UM_PA' | 'SEM_PA';

// ─── Casas com Pagamento Antecipado ──────────────────────────────────────────

const PA_SET = new Set([
  'estrelabet','br4bet','esportivabet','jogodeouro','vaidebet',
  'sortenabet','lotogreen','betpix365','f12','vupibet','vupibr',
  'bet7k','esportesdasorte','apostabet','brasilbet','superbet','sportingbet',
]);

function isPa(slug: string): boolean {
  const n = slug.toLowerCase().replace(/[\s\-_.]/g, '');
  for (const pa of PA_SET) {
    if (n === pa || n.startsWith(pa.slice(0, 5)) || pa.startsWith(n.slice(0, 5))) return true;
  }
  return false;
}

function isBkPA(bk: BookmakerOdds): boolean {
  return bk.is_pa ?? isPa(bk.slug);
}

/** Quantas casas com PA têm odds válidas (>1) no evento */
function paBkCount(ev: OddsSummary): number {
  return ev.bookmakers.filter(b => isBkPA(b) && (b.home > 1 || b.draw > 1 || b.away > 1)).length;
}

// ─── Ligas excluídas ──────────────────────────────────────────────────────────

const EXCL = ['e-futebol','e-soccer','esoccer','futebol virtual','virtual','efootball','cyber','esport','h2h'];
function isExcluded(n: string): boolean { const s = n.toLowerCase(); return EXCL.some(e => s.includes(e)); }

// ─── Helpers de data ──────────────────────────────────────────────────────────

function p2(n: number) { return String(n).padStart(2, '0'); }
function todayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth()+1)}-${p2(d.getUTCDate())}`;
}
function dateBRT(utc: string): string {
  try {
    const d = new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  } catch { return ''; }
}
function fmtTime(utc: string): string {
  try { return new Date(utc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  catch { return utc; }
}
function fmtDate(utc: string): string {
  try { return new Date(utc).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  catch { return utc; }
}
function secsAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min`;
}

// ─── DG helpers ──────────────────────────────────────────────────────────────

function dgColor(c: string | null): string {
  if (c === 'ALTA')  return C.green;
  if (c === 'MEDIA') return C.amber;
  return C.t3;
}
function dgRGB(c: string | null): string {
  if (c === 'ALTA')  return '0,230,118';
  if (c === 'MEDIA') return '245,158,11';
  return '100,116,139';
}

// ─── Cálculo de margem ────────────────────────────────────────────────────────

function bestVal(bks: BookmakerOdds[], key: 'home'|'draw'|'away'): number {
  const vals = bks.map(b => b[key]).filter(v => v > 1);
  return vals.length ? Math.max(...vals) : 0;
}
function bestBk(bks: BookmakerOdds[], key: 'home'|'draw'|'away'): BookmakerOdds | null {
  const v = bestVal(bks, key);
  return bks.find(b => b[key] === v && v > 1) ?? null;
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

// ─── Slots de calculadora ─────────────────────────────────────────────────────

type OddType = 'home' | 'draw' | 'away';
interface CalcSlot { bk: BookmakerOdds; type: OddType; value: number }
const SLOT_COLORS = ['#00e676', '#4DA6FF', '#FF9F0A'];
const SLOT_LABELS = ['1ª', '2ª', '3ª'];

// ─── Célula de melhor odd (lista) ─────────────────────────────────────────────

function BestOddCell({ bk, type }: { bk: BookmakerOdds | null; type: OddType }) {
  if (!bk) return <div className="flex justify-center"><span style={{ color: 'rgba(255,255,255,.1)', fontSize: 11 }}>—</span></div>;
  const val = bk[type] as number;
  const pa  = isBkPA(bk);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[15px] font-black tabular-nums" style={{ color: C.green, textShadow: `0 0 12px ${C.green}44` }}>
        {val.toFixed(2)}
      </span>
      <span className="flex items-center gap-1 text-[10px]" style={{ color: C.t3 }}>
        <span className="truncate max-w-[80px]">{bk.name}</span>
        {pa && (
          <span className="shrink-0 rounded px-1 text-[7px] font-bold"
            style={{ background: C.amberDim, color: C.amber, border: `1px solid ${C.amberB}` }}>PA</span>
        )}
      </span>
    </div>
  );
}

// ─── Painel de detalhes do evento ─────────────────────────────────────────────

function EventOddsPanel({
  event, onBack, onRefresh, dgInfo,
}: {
  event: OddsSummary; onBack: () => void; onRefresh: () => void; dgInfo?: DGInfo | null;
}) {
  const [slots, setSlots] = useState<(CalcSlot | null)[]>([null, null, null]);
  const [calcFill, setCalcFill] = useState<{ odds: string[]; houses: string[]; urls: string[] } | null>(null);
  const calcRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = slots.filter(Boolean) as CalcSlot[];
    if (!active.length) { setCalcFill(null); return; }
    setCalcFill({
      odds:   slots.map(s => s ? String(s.value) : ''),
      houses: slots.map(s => s ? s.bk.name : ''),
      urls:   slots.map(s => s ? (s.bk.url ?? '') : ''),
    });
    if (active.length === 1) setTimeout(() => calcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  }, [slots]);

  useEffect(() => {
    const pick = (type: OddType): CalcSlot | null => {
      let best: BookmakerOdds | null = null; let bestV = 0;
      for (const bk of event.bookmakers) {
        const v = bk[type] as number;
        if (v > bestV) { bestV = v; best = bk; }
      }
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

  function slotOf(slug: string, type: OddType) { return slots.findIndex(s => s?.bk.slug === slug && s?.type === type); }

  const comPa = event.bookmakers.filter(b => isBkPA(b));
  const semPa = event.bookmakers.filter(b => !isBkPA(b));
  const activeSlots = slots.filter(Boolean) as CalcSlot[];
  const eventName   = `${event.home_team} x ${event.away_team}`;
  const dgRgb = dgInfo ? dgRGB(dgInfo.dg_classification) : null;
  const dgCol = dgInfo ? dgColor(dgInfo.dg_classification) : null;

  function OddBtn({ bk, type, value }: { bk: BookmakerOdds; type: OddType; value: number }) {
    const si = slotOf(bk.slug, type);
    const sel = si >= 0;
    const sc  = SLOT_COLORS[si] ?? SLOT_COLORS[0];
    const bests = {
      home: bestVal(event.bookmakers, 'home'),
      draw: bestVal(event.bookmakers, 'draw'),
      away: bestVal(event.bookmakers, 'away'),
    };
    const isBest = value > 1 && value === bests[type];

    if (value <= 1) return (
      <div className="flex h-10 w-[72px] items-center justify-center rounded-xl"
        style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.04)' }}>
        <span style={{ color: 'rgba(255,255,255,.1)', fontSize: 11 }}>—</span>
      </div>
    );

    const base = sel ? {
      background: `${sc}20`, border: `1px solid ${sc}70`, color: sc,
      boxShadow: `0 0 14px ${sc}30`,
    } : isBest ? {
      background: `${C.green}18`, border: `1px solid ${C.green}55`, color: C.green,
      textShadow: `0 0 10px ${C.green}88`,
    } : {
      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: C.t2,
    };

    return (
      <button type="button" onClick={() => handleOddClick(bk, type, value)}
        className="relative flex h-10 w-[72px] items-center justify-center rounded-xl font-mono text-sm font-bold transition-all hover:opacity-80"
        style={base}>
        {value.toFixed(2)}
        {sel && (
          <span style={{
            position: 'absolute', top: -5, right: -5, width: 15, height: 15,
            borderRadius: '50%', background: sc, color: '#060A07',
            fontSize: 8, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{si + 1}</span>
        )}
      </button>
    );
  }

  function OddsSection({ label, bks, accent }: { label: string; bks: BookmakerOdds[]; accent: string }) {
    const [sortCol, setSortCol] = useState<'home'|'draw'|'away'>('home');
    if (!bks.length) return null;
    const acRgb = accent === C.amber ? '245,158,11' : '124,58,237';
    const sorted = [...bks].sort((a, b) => (b[sortCol] as number) - (a[sortCol] as number));
    const cols: { key: 'home'|'draw'|'away'; label: string }[] = [
      { key: 'home', label: 'Casa (1)' },
      { key: 'draw', label: 'Empate (X)' },
      { key: 'away', label: 'Fora (2)' },
    ];
    return (
      <div className="overflow-hidden rounded-2xl" style={{
        background: `rgba(${acRgb},.03)`,
        border: `1px solid rgba(${acRgb},.2)`,
        boxShadow: `0 4px 24px rgba(0,0,0,.3), 0 0 0 1px rgba(${acRgb},.05) inset`,
      }}>
        <div style={{ height: 2, background: `linear-gradient(90deg, ${accent} 0%, ${accent}44 60%, transparent 100%)` }} />
        <div className="flex items-center gap-2.5 px-5 py-3" style={{ background: `rgba(${acRgb},.07)`, borderBottom: `1px solid rgba(${acRgb},.1)` }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: accent }} />
          <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: accent }}>{label}</span>
          <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 99, padding: '1px 6px', background: `rgba(${acRgb},.12)`, color: accent, border: `1px solid rgba(${acRgb},.25)` }}>
            {bks.length} casas
          </span>
        </div>
        <div className="grid items-center gap-3 px-5 py-2.5" style={{ gridTemplateColumns: '1fr 72px 72px 72px', background: 'rgba(255,255,255,.01)', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.t3 }}>Casa</span>
          {cols.map(c => (
            <button key={c.key} type="button" onClick={() => setSortCol(c.key)}
              className="flex items-center justify-center gap-0.5 transition-colors"
              style={{ fontSize: 11, fontWeight: 700, color: sortCol === c.key ? C.t1 : C.t3, borderBottom: sortCol === c.key ? `2px solid rgba(${acRgb},.7)` : '2px solid transparent', paddingBottom: 2 }}>
              {c.label}{sortCol === c.key && <ArrowDown size={9} style={{ marginLeft: 2 }} />}
            </button>
          ))}
        </div>
        <div>
          {sorted.map((bk, idx) => {
            const anySelected = slots.some(s => s?.bk.slug === bk.slug);
            const pa = isBkPA(bk);
            return (
              <div key={bk.slug} className="grid items-center gap-3 px-5 py-3"
                style={{ gridTemplateColumns: '1fr 72px 72px 72px', background: anySelected ? `rgba(${acRgb},.04)` : idx % 2 === 1 ? 'rgba(255,255,255,.01)' : undefined, borderTop: idx > 0 ? '1px solid rgba(255,255,255,.04)' : undefined }}>
                <div className="flex items-center gap-2 min-w-0">
                  {bk.url ? (
                    <a href={bk.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 truncate transition-colors hover:opacity-80"
                      style={{ fontSize: 13, fontWeight: 600, color: anySelected ? C.t1 : C.t2 }}>
                      <ExternalLink size={10} style={{ opacity: 0.4, flexShrink: 0 }} />
                      <span className="truncate">{bk.name}</span>
                    </a>
                  ) : (
                    <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.t2 }}>{bk.name}</span>
                  )}
                  {pa && <span style={{ fontSize: 8, fontWeight: 700, borderRadius: 4, padding: '1px 4px', background: C.amberDim, color: C.amber, border: `1px solid ${C.amberB}`, flexShrink: 0 }}>PA</span>}
                </div>
                <OddBtn bk={bk} type="home" value={bk.home} />
                <OddBtn bk={bk} type="draw" value={bk.draw} />
                <OddBtn bk={bk} type="away" value={bk.away} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{
        background: `linear-gradient(135deg, ${C.purpleDim} 0%, ${C.surf}ee 60%)`,
        border: `1px solid ${C.purpleB}`,
        boxShadow: `0 4px 32px rgba(0,0,0,.5)`,
        backdropFilter: 'blur(20px)',
      }}>
        <button onClick={onBack} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
          style={{ background: C.purpleDim, border: `1px solid ${C.purpleB}`, color: C.purple }}>
          <ChevronLeft size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="truncate text-[15px] font-black" style={{ color: C.t1 }}>{eventName}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: C.t3 }}>
            {event.league_name} · {fmtTime(event.start_time)}
          </div>
        </div>
        {dgInfo && dgRgb && dgCol && (
          <div className="flex flex-col items-center rounded-xl px-3 py-1.5 shrink-0" style={{ background: `rgba(${dgRgb},.1)`, border: `1px solid rgba(${dgRgb},.3)` }}>
            <div className="flex items-center gap-1">
              <Zap size={9} style={{ color: dgCol }} />
              <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: dgCol }}>{dgInfo.dg_score ?? '—'}</span>
            </div>
            <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: `rgba(${dgRgb},.5)` }}>DG score</span>
            {dgInfo.dg_profit_pct != null && (
              <span style={{ fontSize: 9, fontWeight: 700, marginTop: 2, color: dgInfo.dg_profit_pct >= 0 ? C.green : C.red }}>
                {dgInfo.dg_profit_pct >= 0 ? '+' : ''}{dgInfo.dg_profit_pct.toFixed(1)}%
              </span>
            )}
          </div>
        )}
        <button onClick={onRefresh} className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold hover:opacity-80 transition-all"
          style={{ background: C.purpleDim, color: C.purple, border: `1px solid ${C.purpleB}` }}>
          <RefreshCw size={11} /> Atualizar
        </button>
      </div>

      {/* Calculadora */}
      <div className="overflow-hidden rounded-2xl" style={{
        background: `${C.surf}cc`,
        border: `1px solid ${activeSlots.length > 0 ? C.greenB : C.surfB}`,
        boxShadow: activeSlots.length > 0 ? `0 4px 24px rgba(0,0,0,.3), 0 0 20px ${C.green}08` : '0 4px 24px rgba(0,0,0,.3)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ height: 2, background: activeSlots.length > 0 ? `linear-gradient(90deg, ${C.green} 0%, ${C.green}33 60%, transparent 100%)` : `linear-gradient(90deg, rgba(255,255,255,.06) 0%, transparent 100%)` }} />
        <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${C.surfB}` }}>
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.t3 }}>Calculadora</span>
          <div className="flex flex-1 flex-wrap gap-2">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold"
                style={{ background: slot ? `${SLOT_COLORS[i]}12` : 'rgba(255,255,255,.03)', border: `1px solid ${slot ? SLOT_COLORS[i] + '40' : 'rgba(255,255,255,.06)'}` }}>
                <span style={{ color: SLOT_COLORS[i], opacity: slot ? 1 : .3, fontSize: 9 }}>{SLOT_LABELS[i]}</span>
                {slot ? (
                  <>
                    <span style={{ color: C.t2 }}>{slot.bk.name}</span>
                    <span style={{ color: SLOT_COLORS[i], fontWeight: 900 }}>{slot.value.toFixed(2)}</span>
                    <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 9 }}>({slot.type === 'home' ? '1' : slot.type === 'draw' ? 'X' : '2'})</span>
                    <button onClick={() => setSlots(prev => { const n = [...prev]; n[i] = null; return n; })}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', padding: 0, marginLeft: 2, fontSize: 12, lineHeight: 1 }}>×</button>
                  </>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 9 }}>vazio</span>
                )}
              </div>
            ))}
          </div>
          {activeSlots.length > 0 && (
            <button onClick={() => setSlots([null, null, null])} className="rounded-md px-2 py-1 text-[9px] font-bold hover:bg-white/10"
              style={{ color: C.t3, border: '1px solid rgba(255,255,255,.1)' }}>Limpar</button>
          )}
        </div>
        <div className="p-4" ref={calcRef}>
          <SurebetCalc
            selectedEvent={{ name: eventName, start_utc: event.start_time }}
            externalFill={calcFill}
            defaultNumOutcomes={3}
            hideFormula
            accent={dgInfo ? C.green : '#4DA6FF'}
            initialOpType={dgInfo ? 'duplo_green' : 'surebet'}
          />
        </div>
      </div>

      <p style={{ fontSize: 11, color: C.t3, paddingLeft: 4 }}>
        Clique em qualquer odd para adicionar à calculadora · max 3 slots
      </p>

      <OddsSection label="Com Pagamento Antecipado (PA)" bks={comPa} accent={C.amber} />
      <OddsSection label="Sem Pagamento Antecipado" bks={semPa} accent={C.purple} />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BuscarOddsPage() {
  const today = todayBRT();

  const [tab,              setTab]             = useState<'odds' | 'dg'>('odds');
  const [allOdds,          setAllOdds]         = useState<OddsSummary[]>([]);
  const [loading,          setLoading]         = useState(true);
  const [fetchErr,         setFetchErr]        = useState('');
  const [search,           setSearch]          = useState('');
  const [selectedEvent,    setSelectedEvent]   = useState<OddsSummary | null>(null);
  const [dgOnly,           setDgOnly]          = useState(false);
  const [paFilter,         setPaFilter]        = useState<PAFilter>('ALL');
  const [onlyToday,        setOnlyToday]       = useState(false);
  const [sortByProfit,     setSortByProfit]    = useState(false);
  const [leagueFav,        setLeagueFav]       = useState<Set<string>>(new Set());
  const [leagueCollapsed,  setLeagueCollapsed] = useState<Set<string>>(new Set());
  const [leagueFilter,     setLeagueFilter]    = useState('');
  const [bkFilter,         setBkFilter]        = useState('');
  const [leagueOpen,       setLeagueOpen]      = useState(false);
  const [bkOpen,           setBkOpen]          = useState(false);
  const [lastUpdated,      setLastUpdated]     = useState(Date.now());
  const [tick,             setTick]            = useState(0);

  const leagueRef = useRef<HTMLDivElement>(null);
  const bkRef     = useRef<HTMLDivElement>(null);

  const [dgMap, setDgMap] = useState<Map<string, DGInfo>>(new Map());

  // ── Tick para "atualizado há Xs" ────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  // ── Close dropdowns on outside click ────────────────────────────────────────
  useEffect(() => {
    function down(e: MouseEvent) {
      if (leagueOpen && leagueRef.current && !leagueRef.current.contains(e.target as Node)) setLeagueOpen(false);
      if (bkOpen && bkRef.current && !bkRef.current.contains(e.target as Node)) setBkOpen(false);
    }
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [leagueOpen, bkOpen]);

  // ── Carregar DG map ─────────────────────────────────────────────────────────
  const loadDGMap = useCallback(async () => {
    try {
      const res  = await fetch('/api/dg/opportunities?limit=500');
      const data = await res.json() as { ok: boolean; results?: Array<{ match_id: string; dg_score: number | null; dg_classification: string | null; dg_profit_pct: number | null }> };
      if (!data.ok || !data.results) return;
      const map = new Map<string, DGInfo>();
      for (const r of data.results) {
        const ex = map.get(r.match_id);
        if (!ex || (r.dg_score ?? 0) > (ex.dg_score ?? 0)) map.set(r.match_id, { dg_score: r.dg_score, dg_classification: r.dg_classification, dg_profit_pct: r.dg_profit_pct });
      }
      setDgMap(map);
    } catch { /* silencia */ }
  }, []);

  // ── Carregar odds ───────────────────────────────────────────────────────────
  const loadOdds = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setFetchErr(''); setAllOdds([]); setSelectedEvent(null); }
    try {
      const [dbRes] = await Promise.all([fetch(`/api/dg/odds-db?date=${today}`), loadDGMap()]);
      const dbJson  = await dbRes.json() as { ok: boolean; odds?: OddsSummary[] };
      if (dbJson.ok && (dbJson.odds?.length ?? 0) > 0) {
        setAllOdds(dbJson.odds!);
        setLastUpdated(Date.now());
        return;
      }
      const res  = await fetch('/api/dg/odds');
      const json = await res.json() as { ok: boolean; odds?: OddsSummary[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar odds');
      setAllOdds(json.odds ?? []);
      setLastUpdated(Date.now());
    } catch {
      if (!silent) setFetchErr('Não foi possível carregar as odds.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [today, loadDGMap]);

  useEffect(() => { loadOdds(); }, [loadOdds]);
  useEffect(() => {
    const id = setInterval(() => loadOdds(true), 30_000);
    return () => clearInterval(id);
  }, [loadOdds]);

  // ── Normalizador ────────────────────────────────────────────────────────────
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // ── Dados derivados ─────────────────────────────────────────────────────────
  const allLeagues = useMemo(() => [...new Set(allOdds.filter(e => !isExcluded(e.league_name)).map(e => e.league_name))].sort(), [allOdds]);
  const allBks     = useMemo(() => [...new Set(allOdds.flatMap(e => e.bookmakers.map(b => b.name)))].sort(), [allOdds]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return allOdds
      .filter(ev => !isExcluded(ev.league_name ?? ''))
      .filter(ev => { try { return new Date(ev.start_time).getTime() > now; } catch { return true; } })
      .filter(ev => !dgOnly     || dgMap.has(ev.match_id))
      .filter(ev => !onlyToday  || dateBRT(ev.start_time) === today)
      .filter(ev => !leagueFilter || ev.league_name === leagueFilter)
      .filter(ev => !bkFilter   || ev.bookmakers.some(b => b.name === bkFilter))
      .filter(ev => {
        if (paFilter === 'ALL') return true;
        const cnt = paBkCount(ev);
        if (paFilter === 'AMBOS_PA') return cnt >= 2;
        if (paFilter === 'UM_PA')    return cnt === 1;
        if (paFilter === 'SEM_PA')   return cnt === 0;
        return true;
      })
      .filter(ev => {
        if (!search.trim()) return true;
        const q = norm(search.trim());
        return norm(ev.home_team).includes(q) || norm(ev.away_team).includes(q) || norm(ev.league_name ?? '').includes(q);
      });
  }, [allOdds, dgOnly, onlyToday, today, leagueFilter, bkFilter, paFilter, search, dgMap]);

  // ── Agrupamento por liga ────────────────────────────────────────────────────
  const byLeague = useMemo(() => {
    const map = new Map<string, OddsSummary[]>();
    for (const ev of filtered) {
      const key = ev.league_name || 'Outros';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    let entries = Array.from(map.entries());

    // Sort events within each league
    if (sortByProfit) {
      entries = entries.map(([lg, evs]) => [
        lg,
        [...evs].sort((a, b) => {
          const dA = dgMap.get(a.match_id)?.dg_profit_pct ?? -999;
          const dB = dgMap.get(b.match_id)?.dg_profit_pct ?? -999;
          return dB - dA;
        }),
      ] as [string, OddsSummary[]]);
    }

    // Sort leagues: favoritas primeiro, depois brasileirao, depois ordem cronológica
    return entries.sort((a, b) => {
      const aFav = leagueFav.has(a[0]);
      const bFav = leagueFav.has(b[0]);
      if (aFav !== bFav) return aFav ? -1 : 1;
      const aBr = a[0].toLowerCase().includes('brasil') || a[0].toLowerCase().includes('série');
      const bBr = b[0].toLowerCase().includes('brasil') || b[0].toLowerCase().includes('série');
      if (aBr && !bBr) return -1;
      if (!aBr && bBr) return 1;
      return (a[1][0]?.start_time ?? '').localeCompare(b[1][0]?.start_time ?? '');
    });
  }, [filtered, sortByProfit, leagueFav, dgMap]);

  const dgCount   = useMemo(() => allOdds.filter(ev => !isExcluded(ev.league_name ?? '') && dgMap.has(ev.match_id)).length, [allOdds, dgMap]);
  const cntAmbos  = useMemo(() => filtered.filter(ev => paBkCount(ev) >= 2).length, [filtered]);
  const cntUm     = useMemo(() => filtered.filter(ev => paBkCount(ev) === 1).length, [filtered]);
  const cntSem    = useMemo(() => filtered.filter(ev => paBkCount(ev) === 0).length, [filtered]);

  function toggleFav(lg: string) {
    setLeagueFav(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); return n; });
  }
  function toggleCollapse(lg: string) {
    setLeagueCollapsed(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); return n; });
  }
  function clearFilters() {
    setPaFilter('ALL'); setLeagueFilter(''); setBkFilter(''); setDgOnly(false); setOnlyToday(false); setSearch(''); setSortByProfit(false);
  }

  const hasActiveFilter = paFilter !== 'ALL' || leagueFilter || bkFilter || dgOnly || onlyToday || sortByProfit;

  // ── Modo evento ─────────────────────────────────────────────────────────────
  if (selectedEvent) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <EventOddsPanel
          event={selectedEvent}
          onBack={() => setSelectedEvent(null)}
          onRefresh={() => loadOdds()}
          dgInfo={dgMap.get(selectedEvent.match_id) ?? null}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-col gap-4" style={{ maxWidth: 960 }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', color: C.t1 }}>Buscar Odds</h1>
          <p style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
            {loading
              ? 'Carregando…'
              : tab === 'odds'
                ? `${allLeagues.length} campeonatos monitorados · atualizado há ${secsAgo(lastUpdated)}`
                : 'Oportunidades DuploGreen importadas'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.surfB}` }}>
          {([
            { key: 'odds' as const, icon: <Zap size={12} />, label: 'Odds do Dia',       color: '#94a3b8', bg: 'rgba(99,102,241,.1)'  },
            { key: 'dg'   as const, icon: <TrendingUp size={12} />, label: 'Oportunidades DG', color: C.green,   bg: `${C.greenDim}` },
          ] as const).map((t, i) => (
            <React.Fragment key={t.key}>
              {i > 0 && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,.07)' }} />}
              <button onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold transition-all"
                style={{
                  background: tab === t.key ? t.bg : 'transparent',
                  color:      tab === t.key ? t.color : C.t3,
                }}>
                {t.icon} {t.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Tab DG ──────────────────────────────────────────────────────── */}
      {tab === 'dg' && <DGOpportunitiesSection />}

      {/* ── Tab Odds ─────────────────────────────────────────────────────── */}
      {tab === 'odds' && <>

        {/* ── Filtros linha 1 ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Busca */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.t3 }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar time ou liga..."
              className="w-full rounded-xl py-2 pl-9 pr-8 text-[13px] outline-none"
              style={{ background: `${C.surf}cc`, border: `1px solid ${C.surfB}`, color: C.t1 }} />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3 }}><X size={12} /></button>
            )}
          </div>

          {/* Campeonatos dropdown */}
          <div className="relative" ref={leagueRef}>
            <button onClick={() => { setLeagueOpen(v => !v); setBkOpen(false); }}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
              style={{
                background: leagueFilter ? `${C.purpleDim}` : `${C.surf}cc`,
                border:     leagueFilter ? `1px solid ${C.purpleB}` : `1px solid ${C.surfB}`,
                color:      leagueFilter ? C.purple : C.t2,
              }}>
              <TrendingUp size={11} />
              {leagueFilter ? leagueFilter.slice(0, 18) : 'Campeonatos'}
              <ChevronDown size={11} style={{ opacity: .5 }} />
            </button>
            {leagueOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 overflow-y-auto rounded-xl py-1"
                style={{ background: '#0e131a', border: `1px solid ${C.surfB}`, minWidth: 220, maxHeight: 280, boxShadow: '0 8px 32px rgba(0,0,0,.6)' }}>
                <button onClick={() => { setLeagueFilter(''); setLeagueOpen(false); }}
                  className="flex w-full items-center px-4 py-2.5 text-[12px] font-semibold hover:bg-white/5"
                  style={{ color: !leagueFilter ? C.green : C.t2 }}>
                  {!leagueFilter && <span style={{ fontSize: 9, color: C.green, marginRight: 6 }}>✓</span>}
                  Todos os campeonatos
                </button>
                {allLeagues.map(lg => (
                  <button key={lg} onClick={() => { setLeagueFilter(lg); setLeagueOpen(false); }}
                    className="flex w-full items-center px-4 py-2.5 text-[12px] font-semibold hover:bg-white/5 text-left"
                    style={{ color: leagueFilter === lg ? C.purple : C.t2 }}>
                    {leagueFilter === lg && <span style={{ fontSize: 9, color: C.purple, marginRight: 6 }}>✓</span>}
                    <span className="truncate">{lg}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Casas dropdown */}
          <div className="relative" ref={bkRef}>
            <button onClick={() => { setBkOpen(v => !v); setLeagueOpen(false); }}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
              style={{
                background: bkFilter ? `${C.greenDim}` : `${C.surf}cc`,
                border:     bkFilter ? `1px solid ${C.greenB}` : `1px solid ${C.surfB}`,
                color:      bkFilter ? C.green : C.t2,
              }}>
              <Star size={11} />
              {bkFilter || 'Casas'}
              <ChevronDown size={11} style={{ opacity: .5 }} />
            </button>
            {bkOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 overflow-y-auto rounded-xl py-1"
                style={{ background: '#0e131a', border: `1px solid ${C.surfB}`, minWidth: 180, maxHeight: 260, boxShadow: '0 8px 32px rgba(0,0,0,.6)' }}>
                <button onClick={() => { setBkFilter(''); setBkOpen(false); }}
                  className="flex w-full items-center px-4 py-2.5 text-[12px] font-semibold hover:bg-white/5"
                  style={{ color: !bkFilter ? C.green : C.t2 }}>
                  {!bkFilter && <span style={{ fontSize: 9, color: C.green, marginRight: 6 }}>✓</span>}
                  Todas as casas
                </button>
                {allBks.map(bk => (
                  <button key={bk} onClick={() => { setBkFilter(bk); setBkOpen(false); }}
                    className="flex w-full items-center px-4 py-2.5 text-[12px] font-semibold hover:bg-white/5"
                    style={{ color: bkFilter === bk ? C.green : C.t2 }}>
                    {bkFilter === bk && <span style={{ fontSize: 9, color: C.green, marginRight: 6 }}>✓</span>}
                    {bk}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Apenas hoje */}
          <button onClick={() => setOnlyToday(v => !v)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
            style={{
              background: onlyToday ? 'rgba(99,102,241,.12)' : `${C.surf}cc`,
              border:     onlyToday ? '1px solid rgba(99,102,241,.35)' : `1px solid ${C.surfB}`,
              color:      onlyToday ? '#94a3b8' : C.t3,
            }}>
            Apenas hoje
          </button>

          {/* Só com DG */}
          {dgMap.size > 0 && (
            <button onClick={() => setDgOnly(v => !v)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
              style={{
                background: dgOnly ? C.purpleDim : `${C.surf}cc`,
                border:     dgOnly ? `1px solid ${C.purpleB}` : `1px solid ${C.surfB}`,
                color:      dgOnly ? C.purple : C.t3,
              }}>
              <Zap size={11} /> Só com DG
              <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 99, padding: '0 4px', background: dgOnly ? C.purpleDim : 'rgba(255,255,255,.06)', color: dgOnly ? C.purple : C.t3 }}>
                {dgCount}
              </span>
            </button>
          )}

          <div className="flex-1" />
          <button onClick={() => loadOdds()} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold hover:opacity-80 disabled:opacity-40"
            style={{ background: `${C.surf}cc`, border: `1px solid ${C.surfB}`, color: C.t3 }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {/* ── Filtros linha 2 — PA + Sort ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">

          {/* PA label com tooltip */}
          <div className="group relative flex items-center gap-1">
            <span style={{ fontSize: 11, fontWeight: 700, color: C.t3 }}>Pagamento Antecipado</span>
            <HelpCircle size={12} style={{ color: C.t3, cursor: 'help' }} />
            <div className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden w-64 rounded-xl p-3 group-hover:block"
              style={{ background: '#0e131a', border: `1px solid ${C.surfB}`, boxShadow: '0 8px 24px rgba(0,0,0,.6)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.6, color: C.t2 }}>
                <strong style={{ color: C.amber }}>PA (Pagamento Antecipado)</strong> é quando a casa paga a aposta assim que o resultado parcial é atingido, sem esperar o jogo terminar. Essencial para operações DuploGreen.
              </p>
            </div>
          </div>

          {/* PA chips */}
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.surfB}` }}>
            {([
              ['ALL',      'Todos',               filtered.length,  C.t2,   '255,255,255'],
              ['AMBOS_PA', 'PA nos dois lados',   cntAmbos,         C.green, '0,230,118'],
              ['UM_PA',    'PA de um lado',        cntUm,            C.amber, '245,158,11'],
              ['SEM_PA',   'Sem PA',               cntSem,           C.red,   '248,113,113'],
            ] as [PAFilter, string, number, string, string][]).map(([v, label, cnt, col, rgb]) => {
              const active = paFilter === v;
              return (
                <button key={v} onClick={() => setPaFilter(v)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all"
                  style={{
                    background: active ? `rgba(${rgb},.14)` : 'transparent',
                    color:      active ? col : C.t3,
                    border:     active ? `1px solid rgba(${rgb},.35)` : '1px solid transparent',
                  }}>
                  {label}
                  <span style={{ fontSize: 9, fontWeight: 900, borderRadius: 99, padding: '0 4px', background: active ? `rgba(${rgb},.18)` : 'rgba(255,255,255,.06)', color: active ? col : C.t3 }}>
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sort toggle */}
          <button onClick={() => setSortByProfit(v => !v)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
            style={{
              background: sortByProfit ? C.greenDim : `${C.surf}cc`,
              border:     sortByProfit ? `1px solid ${C.greenB}` : `1px solid ${C.surfB}`,
              color:      sortByProfit ? C.green : C.t3,
            }}>
            <ArrowUpDown size={11} />
            Maior lucro primeiro
          </button>

          {/* Limpar filtros */}
          {hasActiveFilter && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-semibold hover:opacity-80"
              style={{ color: C.red, background: C.redDim, border: `1px solid rgba(248,113,113,.2)` }}>
              <X size={10} /> Limpar
            </button>
          )}
        </div>

        {/* ── Erro ─────────────────────────────────────────────────────────── */}
        {fetchErr && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
            style={{ background: C.redDim, border: `1px solid rgba(248,113,113,.25)`, color: C.red }}>
            {fetchErr}
            <button onClick={() => loadOdds()} className="ml-auto text-xs" style={{ color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer' }}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* ── Skeleton ─────────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse"
                style={{ background: C.surf, border: `1px solid ${C.surfB}`, opacity: 1 - i * 0.1 }} />
            ))}
          </div>
        )}

        {/* ── Vazio ─────────────────────────────────────────────────────────── */}
        {!loading && !fetchErr && filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 gap-3" style={{ color: C.t3 }}>
            <ScanSearch size={32} style={{ opacity: .25 }} />
            <p style={{ fontSize: 14, fontWeight: 600 }}>Nenhum jogo encontrado</p>
            <button onClick={clearFilters} style={{ fontSize: 12, color: C.purple, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Limpar filtros
            </button>
          </div>
        )}

        {/* ── Cabeçalho desktop ────────────────────────────────────────────── */}
        {!loading && byLeague.length > 0 && (
          <div className="hidden md:grid items-center gap-2 px-4"
            style={{ gridTemplateColumns: '80px 1fr 70px 62px 108px 108px 108px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.t3 }}>
            <span>Hora</span>
            <span>Jogo</span>
            <span className="text-center">Margem</span>
            <div className="flex items-center justify-center gap-0.5">
              <span>DG</span>
              <span style={{ fontSize: 8, opacity: .6 }}>score</span>
            </div>
            <span className="text-center">Casa (1)</span>
            <span className="text-center">Empate (X)</span>
            <span className="text-center">Fora (2)</span>
          </div>
        )}

        {/* ── Eventos por liga ─────────────────────────────────────────────── */}
        {!loading && byLeague.map(([league, evs]) => {
          const isFav      = leagueFav.has(league);
          const isCollapsed = leagueCollapsed.has(league);

          return (
            <div key={league} className="overflow-hidden rounded-2xl" style={{
              background: `${C.surf}cc`,
              border: `1px solid ${isFav ? C.greenB : C.surfB}`,
              boxShadow: isFav ? `0 4px 20px rgba(0,0,0,.4), 0 0 12px ${C.green}08` : '0 4px 20px rgba(0,0,0,.4)',
            }}>
              {/* Topo colorido */}
              <div style={{ height: 2, background: isFav ? `linear-gradient(90deg, ${C.green} 0%, ${C.green}33 50%, transparent 100%)` : 'linear-gradient(90deg, rgba(124,58,237,.5) 0%, rgba(124,58,237,.15) 50%, transparent 100%)' }} />

              {/* Cabeçalho da liga — accordion */}
              <div className="flex items-center justify-between px-4 py-2.5"
                style={{ background: isFav ? `${C.greenDim}` : 'rgba(124,58,237,.03)', borderBottom: isCollapsed ? 'none' : `1px solid ${C.surfB}` }}>
                <button onClick={() => toggleCollapse(league)} className="flex flex-1 items-center gap-2.5 text-left hover:opacity-80 transition-opacity">
                  <div style={{ width: 2, height: 12, borderRadius: 1, background: isFav ? C.green : C.purple }} />
                  <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: isFav ? C.green : 'rgba(148,163,255,.8)' }}>
                    {league}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 99, padding: '1px 6px', background: 'rgba(255,255,255,.05)', color: C.t3, border: `1px solid ${C.surfB}` }}>
                    {evs.length}
                  </span>
                  <ChevronDown size={13} style={{ color: C.t3, transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .2s ease' }} />
                </button>
                <button onClick={() => toggleFav(league)}
                  className="ml-2 flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                  title={isFav ? 'Remover dos favoritos' : 'Fixar liga no topo'}
                  style={{ background: isFav ? C.greenDim : 'rgba(255,255,255,.03)', border: `1px solid ${isFav ? C.greenB : C.surfB}` }}>
                  <Star size={12} style={{ color: isFav ? C.green : C.t3, fill: isFav ? C.green : 'none' }} />
                </button>
              </div>

              {/* Linhas dos eventos */}
              {!isCollapsed && (
                <div>
                  {evs.map((ev, idx) => {
                    const mgn    = calcMargin(ev.bookmakers);
                    const isSure = mgn !== null && mgn < 0;
                    const bkH    = bestBk(ev.bookmakers, 'home');
                    const bkD    = bestBk(ev.bookmakers, 'draw');
                    const bkA    = bestBk(ev.bookmakers, 'away');
                    const dg     = dgMap.get(ev.match_id);
                    const dgRgb2 = dg ? dgRGB(dg.dg_classification) : null;
                    const dgCol2 = dg ? dgColor(dg.dg_classification) : null;
                    const isToday = dateBRT(ev.start_time) === today;
                    const hasDGGlow = dg && (dg.dg_score ?? 0) >= 85;
                    const paCnt  = paBkCount(ev);

                    return (
                      <div key={ev.match_id} className="group relative"
                        style={{
                          background: idx % 2 === 1 ? 'rgba(255,255,255,.012)' : undefined,
                          borderTop: idx > 0 ? `1px solid ${C.surfB}` : undefined,
                          borderLeft: hasDGGlow ? `3px solid ${C.green}` : '3px solid transparent',
                          boxShadow: hasDGGlow ? `inset 0 0 20px ${C.green}05` : undefined,
                        }}>
                        <button type="button" onClick={() => setSelectedEvent(ev)} className="w-full text-left">

                          {/* Desktop */}
                          <div className="hidden md:grid items-center gap-2 px-4 py-3"
                            style={{ gridTemplateColumns: '80px 1fr 70px 62px 108px 108px 108px' }}>

                            {/* Data/Hora */}
                            <div className="flex flex-col">
                              <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: isToday ? C.green : C.t2 }}>
                                {fmtTime(ev.start_time)}
                              </span>
                              {!isToday && (
                                <span style={{ fontSize: 9, color: C.t3 }}>{fmtDate(ev.start_time)}</span>
                              )}
                              {isToday && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: `${C.green}88` }}>Hoje</span>
                              )}
                            </div>

                            {/* Jogo */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>
                                  {ev.home_team}
                                </p>
                                {dg && dgRgb2 && dgCol2 && (
                                  <span className="shrink-0 flex items-center gap-1 rounded-md px-1.5 py-px" style={{ fontSize: 8, fontWeight: 900, background: `rgba(${dgRgb2},.1)`, color: dgCol2, border: `1px solid rgba(${dgRgb2},.25)` }}>
                                    <Zap size={7} /> {dg.dg_score}
                                    <sup style={{ fontSize: 6 }}>DG</sup>
                                  </span>
                                )}
                                {paCnt >= 2 && (
                                  <span style={{ fontSize: 7, fontWeight: 900, borderRadius: 4, padding: '1px 4px', background: C.amberDim, color: C.amber, border: `1px solid ${C.amberB}`, flexShrink: 0 }}>
                                    PA×2
                                  </span>
                                )}
                                {paCnt === 1 && (
                                  <span style={{ fontSize: 7, fontWeight: 900, borderRadius: 4, padding: '1px 4px', background: 'rgba(245,158,11,.06)', color: `${C.amber}99`, border: `1px solid rgba(245,158,11,.18)`, flexShrink: 0 }}>
                                    PA
                                  </span>
                                )}
                              </div>
                              <p className="truncate" style={{ fontSize: 12, color: C.t3 }}>{ev.away_team}</p>
                            </div>

                            {/* Margem */}
                            <div className="flex justify-center">
                              {mgn !== null ? (
                                <span className="rounded-md px-2 py-1 tabular-nums" style={{ fontSize: 11, fontWeight: 900, color: marginColor(mgn), background: marginBg(mgn), border: `1px solid ${marginColor(mgn)}33` }}>
                                  {isSure ? `+${Math.abs(mgn).toFixed(2)}%` : `${mgn.toFixed(1)}%`}
                                </span>
                              ) : <span style={{ color: 'rgba(255,255,255,.1)', fontSize: 11 }}>—</span>}
                            </div>

                            {/* DG Score */}
                            <div className="flex justify-center">
                              {dg && dgRgb2 && dgCol2 ? (
                                <div className="flex flex-col items-center">
                                  <span style={{ fontSize: 17, fontWeight: 900, lineHeight: 1, color: dgCol2, textShadow: `0 0 10px rgba(${dgRgb2},.4)` }}>
                                    {dg.dg_score}
                                  </span>
                                  <span style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', color: `rgba(${dgRgb2},.45)` }}>
                                    {dg.dg_classification}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: 'rgba(255,255,255,.1)', fontSize: 11 }}>—</span>
                              )}
                            </div>

                            <BestOddCell bk={bkH} type="home" />
                            <BestOddCell bk={bkD} type="draw" />
                            <BestOddCell bk={bkA} type="away" />
                          </div>

                          {/* Mobile */}
                          <div className="flex items-center gap-3 px-4 py-3 md:hidden">
                            <div className="flex flex-col items-center shrink-0" style={{ width: 42 }}>
                              <span style={{ fontSize: 13, fontWeight: 900, color: isToday ? C.green : C.t2 }}>{fmtTime(ev.start_time)}</span>
                              {dg && (
                                <span style={{ fontSize: 11, fontWeight: 900, lineHeight: 1, color: dg ? dgColor(dg.dg_classification) : C.t3 }}>{dg.dg_score}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>
                                {ev.home_team} x {ev.away_team}
                              </p>
                              <p style={{ fontSize: 11, color: C.t3 }}>
                                {ev.bookmakers.length} casas
                                {mgn !== null && (
                                  <span className="ml-2 font-bold" style={{ color: marginColor(mgn) }}>
                                    {isSure ? `+${Math.abs(mgn).toFixed(2)}%` : `${mgn.toFixed(1)}%`}
                                  </span>
                                )}
                                {paCnt > 0 && <span className="ml-1" style={{ color: C.amber }}>· PA</span>}
                              </p>
                            </div>
                            <ChevronRight size={14} style={{ color: C.t3, opacity: .4, flexShrink: 0 }} />
                          </div>
                        </button>

                        {/* Hover: Ver detalhes */}
                        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 hidden group-hover:flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-opacity duration-150"
                          style={{ background: C.purpleDim, border: `1px solid ${C.purpleB}`, color: C.purple, fontSize: 11, fontWeight: 700 }}>
                          <ChevronRight size={10} /> Ver detalhes
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      </> /* fim tab odds */}
    </div>
  );
}

