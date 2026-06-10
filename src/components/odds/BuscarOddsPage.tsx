'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  X, ScanSearch, ChevronLeft, ChevronRight, ExternalLink,
  ArrowDown, RefreshCw, Zap, TrendingUp, ChevronDown, Star, Check,
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
  is_pa?: boolean | null;
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

type PAFilter = 'ALL' | 'AMBOS_PA' | 'UM_PA';
type SortBy   = 'maior_lucro' | 'menor_lucro' | 'padrao';

// ─── Set expandido de casas com Pagamento Antecipado ─────────────────────────
// Fonte: lista do concorrente + casas conhecidas via Altenar/Bwin
const PA_SET = new Set([
  // Por nome normalizado (sem espaços/traços/pontos, lowercase)
  'betano','bet365','betfair','kto','superbet','vivasorte','betao',
  '7games','betesporte','novibet','estrelabet','esportivabet','jogodeouro',
  '7k','bet7k','versusbet','meridianbet','betmgm','betsson','betvip',
  'br4bet','br4','esportesdasorte','vaidebet','pixbet','sportingbet',
  'apostabeat','apostabet','lotogreen','betpix365','betpix','f12',
  'vupibet','vupibr','vupi','sortenabet','sorte','brasilbet',
  'esportivabr','estrelabeat','betnacional','pixbetsports',
  'betnow','sportbr','betbr','apostaganha',
]);

/**
 * Normaliza o slug para comparação: lowercase, sem espaços/traços/pontos/números.
 * Exemplo: "Estrela-Bet" → "estrelabet"  |  "br4bet" → "brbet" → na verdade mantemos dígitos
 */
function normSlug(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.]/g, '');
}

function isPa(slug: string): boolean {
  if (!slug) return false;
  const n = normSlug(slug);
  // Correspondência exata ou substring
  if (PA_SET.has(n)) return true;
  for (const pa of PA_SET) {
    if (n.includes(pa) || pa.includes(n)) return true;
    // Prefixo de 6 chars (evita falsos positivos curtos)
    const prefix = Math.min(n.length, pa.length, 6);
    if (prefix >= 4 && n.slice(0, prefix) === pa.slice(0, prefix)) return true;
  }
  return false;
}

function isBkPA(bk: BookmakerOdds): boolean {
  // is_pa explícito (do banco) tem prioridade
  if (bk.is_pa === true)  return true;
  if (bk.is_pa === false) return false;
  // Fallback: deriva do slug
  return isPa(bk.slug);
}

/** Quantas casas PA distintas têm odds válidas (>1) no evento */
function paBkCount(ev: OddsSummary): number {
  const seen = new Set<string>();
  let cnt = 0;
  for (const b of ev.bookmakers) {
    if (!seen.has(b.slug) && isBkPA(b) && (b.home > 1 || b.draw > 1 || b.away > 1)) {
      seen.add(b.slug);
      cnt++;
    }
  }
  return cnt;
}

// ─── Ligas excluídas (virtuais / e-sports) ───────────────────────────────────

const EXCL = ['e-futebol','e-soccer','esoccer','virtual','efootball','cyber','esport','h2h'];
function isExcluded(n: string): boolean { const s = n.toLowerCase(); return EXCL.some(e => s.includes(e)); }

// ─── Helpers de data / hora ───────────────────────────────────────────────────

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
  const tomorrow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tStr = `${tomorrow.getFullYear()}-${p2(tomorrow.getMonth()+1)}-${p2(tomorrow.getDate())}`;
  if (d === tStr) return 'Amanhã';
  return fmtDateShort(utc);
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

// ─── Margem ───────────────────────────────────────────────────────────────────

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

// ─── Calculadora ─────────────────────────────────────────────────────────────

type OddType = 'home' | 'draw' | 'away';
interface CalcSlot { bk: BookmakerOdds; type: OddType; value: number }
const SLOT_COLORS = ['#00e676', '#4DA6FF', '#FF9F0A'];
const SLOT_LABELS = ['1ª', '2ª', '3ª'];

// ─── Célula de melhor odd (estilo com badge PA/SO) ───────────────────────────

function BestOddCell({ bk, type }: { bk: BookmakerOdds | null; type: OddType }) {
  if (!bk) return (
    <div className="relative flex h-[52px] w-full items-center justify-center rounded-lg"
      style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)' }}>
      <span style={{ color: 'rgba(255,255,255,.15)', fontSize: 11 }}>—</span>
    </div>
  );
  const val = bk[type] as number;
  const pa  = isBkPA(bk);
  return (
    <div className="relative flex h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-lg transition-opacity hover:opacity-80"
      style={{
        background: `rgba(0,230,118,.06)`,
        border: `1px solid rgba(0,230,118,.22)`,
      }}>
      <span className="tabular-nums text-[15px] font-black" style={{ color: C.green, textShadow: `0 0 10px ${C.green}44` }}>
        {val.toFixed(2)}
      </span>
      <span className="max-w-full truncate px-2 text-[9px]" style={{ color: C.t3 }}>
        {bk.name}
      </span>
      {/* badge PA / SO */}
      <span className="absolute -right-1 -top-1 rounded border px-[3px] py-px text-[7px] font-bold"
        style={pa
          ? { background: C.greenDim, color: C.green,   borderColor: C.greenB }
          : { background: 'rgba(255,255,255,.05)', color: C.t3, borderColor: 'rgba(255,255,255,.14)' }
        }>
        {pa ? 'PA' : 'SO'}
      </span>
    </div>
  );
}

// (BookmakerFilterModal removed — filtro de casas não é mais exibido na lista)

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
        boxShadow: `0 4px 24px rgba(0,0,0,.3)`,
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
              style={{ fontSize: 11, fontWeight: 700, color: sortCol === c.key ? C.t1 : C.t3, borderBottom: sortCol === c.key ? `2px solid rgba(${acRgb},.7)` : '2px solid transparent', paddingBottom: 2, background: 'none', border: 'none', cursor: 'pointer' }}>
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
                style={{ gridTemplateColumns: '1fr 72px 72px 72px', background: anySelected ? `rgba(${acRgb},.04)` : idx % 2 === 1 ? 'rgba(255,255,255,.01)' : undefined, borderTop: idx > 0 ? `1px solid rgba(255,255,255,.04)` : undefined }}>
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
            <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', color: `rgba(${dgRgb},.5)` }}>DG score</span>
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
              style={{ color: C.t3, border: '1px solid rgba(255,255,255,.1)', background: 'none', cursor: 'pointer' }}>Limpar</button>
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

  const [tab,             setTab]            = useState<'odds' | 'dg'>('odds');
  const [allOdds,         setAllOdds]        = useState<OddsSummary[]>([]);
  const [loading,         setLoading]        = useState(true);
  const [fetchErr,        setFetchErr]       = useState('');
  const [selectedEvent,   setSelectedEvent]  = useState<OddsSummary | null>(null);
  const [paFilter,        setPaFilter]       = useState<PAFilter>('ALL');
  const [leagueFav,       setLeagueFav]      = useState<Set<string>>(new Set());
  const [leagueCollapsed, setLeagueCollapsed]= useState<Set<string>>(new Set());
  const [leagueFilter,    setLeagueFilter]   = useState('');
  const [leagueOpen,      setLeagueOpen]     = useState(false);
  const [lastUpdated,     setLastUpdated]    = useState(Date.now());
  const [tick,            setTick]           = useState(0);
  const [dgMap,           setDgMap]          = useState<Map<string, DGInfo>>(new Map());

  const leagueRef = useRef<HTMLDivElement>(null);

  // ── Tick "atualizado há Xs" ─────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  // ── Close dropdown on outside click ─────────────────────────────────────────
  useEffect(() => {
    function down(e: MouseEvent) {
      if (leagueOpen && leagueRef.current && !leagueRef.current.contains(e.target as Node)) setLeagueOpen(false);
    }
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [leagueOpen]);

  // ── Carregar DG map ─────────────────────────────────────────────────────────
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

  // ── Ligas disponíveis ────────────────────────────────────────────────────────
  const allLeagues = useMemo(
    () => [...new Set(allOdds.filter(e => !isExcluded(e.league_name)).map(e => e.league_name))].sort(),
    [allOdds],
  );

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const GAME_DURATION_MS = 110 * 60 * 1000;

  const filtered = useMemo(() => {
    return allOdds
      .filter(ev => !isExcluded(ev.league_name ?? ''))
      .filter(ev => { try { return new Date(ev.start_time).getTime() + GAME_DURATION_MS > Date.now(); } catch { return true; } })
      .filter(ev => !leagueFilter || ev.league_name === leagueFilter)
      .filter(ev => {
        if (paFilter === 'ALL') return true;
        const cnt = paBkCount(ev);
        if (paFilter === 'AMBOS_PA') return cnt >= 2;
        if (paFilter === 'UM_PA')    return cnt === 1;
        return true;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOdds, leagueFilter, paFilter]);

  // contadores p/ chips
  const cntAll   = useMemo(() => allOdds.filter(ev => !isExcluded(ev.league_name ?? '') && (() => { try { return new Date(ev.start_time).getTime() + GAME_DURATION_MS > Date.now(); } catch { return true; } })() && (!leagueFilter || ev.league_name === leagueFilter)).length, [allOdds, leagueFilter, GAME_DURATION_MS]);
  const cntAmbos = useMemo(() => filtered.filter(ev => paBkCount(ev) >= 2).length, [filtered]);
  const cntUm    = useMemo(() => filtered.filter(ev => paBkCount(ev) === 1).length, [filtered]);

  // ── Agrupamento por liga ─────────────────────────────────────────────────────
  const byLeague = useMemo(() => {
    const map = new Map<string, OddsSummary[]>();
    for (const ev of filtered) {
      const key = ev.league_name || 'Outros';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    let entries = Array.from(map.entries()).map(([lg, evs]) => {
      const sorted = [...evs].sort((a, b) => a.start_time.localeCompare(b.start_time));
      return [lg, sorted] as [string, OddsSummary[]];
    });
    return entries.sort((a, b) => {
      const aFav = leagueFav.has(a[0]);
      const bFav = leagueFav.has(b[0]);
      if (aFav !== bFav) return aFav ? -1 : 1;
      const aBr = a[0].toLowerCase().includes('brasil') || a[0].toLowerCase().includes('série');
      const bBr = b[0].toLowerCase().includes('brasil') || b[0].toLowerCase().includes('série');
      if (aBr && !bBr) return -1;
      if (!aBr && bBr) return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [filtered, leagueFav]);

  const hasActiveFilter = paFilter !== 'ALL' || !!leagueFilter;

  function toggleFav(lg: string) {
    setLeagueFav(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); return n; });
  }
  function toggleCollapse(lg: string) {
    setLeagueCollapsed(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); return n; });
  }
  function clearFilters() { setPaFilter('ALL'); setLeagueFilter(''); }

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
    <div className="mx-auto flex flex-col gap-4" style={{ maxWidth: 980 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', color: C.t1 }}>Buscar Odds</h1>
          <p style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
            {loading
              ? 'Carregando…'
              : tab === 'odds'
                ? `${allLeagues.length} campeonatos · atualizado há ${secsAgo(lastUpdated)}`
                : 'Oportunidades DuploGreen importadas'}
          </p>
        </div>

        {/* Tab switcher + botão atualizar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.surfB}` }}>
            {([
              { key: 'odds' as const, icon: <Zap size={12} />, label: 'Odds do Dia', color: '#94a3b8', bg: 'rgba(99,102,241,.1)' },
              { key: 'dg'   as const, icon: <TrendingUp size={12} />, label: 'Oportunidades DG', color: C.green, bg: C.greenDim },
            ]).map((t, i) => (
              <React.Fragment key={t.key}>
                {i > 0 && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,.07)' }} />}
                <button onClick={() => setTab(t.key)}
                  className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold transition-all"
                  style={{ background: tab === t.key ? t.bg : 'transparent', color: tab === t.key ? t.color : C.t3 }}>
                  {t.icon} {t.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          <button onClick={() => loadOdds()} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold hover:opacity-80 disabled:opacity-40 transition-opacity"
            style={{ background: `${C.surf}cc`, border: `1px solid ${C.surfB}`, color: C.t3 }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* ── Tab DG ────────────────────────────────────────────────────────── */}
      {tab === 'dg' && <DGOpportunitiesSection />}

      {/* ── Tab Odds ──────────────────────────────────────────────────────── */}
      {tab === 'odds' && <>

        {/* ── Barra de filtros: Campeonatos + PA chips ──────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Campeonatos dropdown */}
          <div className="relative" ref={leagueRef}>
            <button onClick={() => setLeagueOpen(v => !v)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
              style={{
                background: leagueFilter ? 'rgba(0,230,118,.1)' : `${C.surf}cc`,
                border:     leagueFilter ? `1px solid ${C.greenB}` : `1px solid ${C.surfB}`,
                color:      leagueFilter ? C.green : C.t2,
                minWidth: 150,
              }}>
              <TrendingUp size={11} />
              <span className="truncate max-w-[160px]">{leagueFilter || 'Campeonatos'}</span>
              <ChevronDown size={11} style={{ opacity: .5, flexShrink: 0 }} />
            </button>
            {leagueOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 overflow-y-auto rounded-xl py-1"
                style={{ background: '#0e131a', border: `1px solid ${C.surfB}`, minWidth: 240, maxHeight: 300, boxShadow: '0 12px 40px rgba(0,0,0,.7)' }}>
                <button onClick={() => { setLeagueFilter(''); setLeagueOpen(false); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-[12px] font-semibold hover:bg-white/5 text-left"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: !leagueFilter ? C.green : C.t2 }}>
                  {!leagueFilter && <Check size={10} style={{ color: C.green }} />}
                  Todos os campeonatos
                  <span className="ml-auto text-[10px]" style={{ color: C.t3 }}>{cntAll}</span>
                </button>
                <div style={{ height: 1, background: C.surfB, margin: '2px 12px' }} />
                {allLeagues.map(lg => {
                  const cnt = allOdds.filter(ev => ev.league_name === lg).length;
                  return (
                    <button key={lg} onClick={() => { setLeagueFilter(lg); setLeagueOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-[12px] font-semibold hover:bg-white/5 text-left"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: leagueFilter === lg ? C.green : C.t2 }}>
                      {leagueFilter === lg && <Check size={10} style={{ color: C.green }} />}
                      <span className="flex-1 truncate">{lg}</span>
                      <span className="text-[10px]" style={{ color: C.t3 }}>{cnt}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* PA chips */}
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.surfB}` }}>
            {([
              ['ALL',      'Todos',        cntAll,   C.t2,   '255,255,255'] as const,
              ['AMBOS_PA', 'PA 2 LADOS',   cntAmbos, C.green,'0,230,118'  ] as const,
              ['UM_PA',    'PA 1 LADO',    cntUm,    C.amber,'245,158,11' ] as const,
            ]).map(([v, label, cnt, col, rgb]) => {
              const active = paFilter === v;
              return (
                <button key={v} onClick={() => setPaFilter(v as PAFilter)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all"
                  style={{
                    background: active ? `rgba(${rgb},.14)` : 'transparent',
                    color:      active ? col : C.t3,
                    border:     active ? `1px solid rgba(${rgb},.35)` : '1px solid transparent',
                  }}>
                  {label}
                  <span style={{
                    fontSize: 9, fontWeight: 900, borderRadius: 99, padding: '0 4px',
                    background: active ? `rgba(${rgb},.18)` : 'rgba(255,255,255,.06)',
                    color: active ? col : C.t3,
                  }}>
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>

          {hasActiveFilter && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-semibold hover:opacity-80 transition-opacity"
              style={{ color: C.red, background: C.redDim, border: `1px solid rgba(248,113,113,.2)`, cursor: 'pointer' }}>
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
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl animate-pulse"
                style={{ background: C.surf, border: `1px solid ${C.surfB}`, opacity: 1 - i * 0.15 }}>
                <div style={{ height: 2, background: 'rgba(255,255,255,.06)' }} />
                <div className="px-4 py-2.5 flex items-center gap-3">
                  <div style={{ width: 60, height: 10, borderRadius: 4, background: 'rgba(255,255,255,.08)' }} />
                  <div style={{ flex: 1, height: 10, borderRadius: 4, background: 'rgba(255,255,255,.04)' }} />
                </div>
                {[0,1,2].map(j => (
                  <div key={j} className="flex items-center gap-2 px-4 py-3" style={{ borderTop: `1px solid ${C.surfB}` }}>
                    <div style={{ width: 40, height: 32, borderRadius: 6, background: 'rgba(255,255,255,.06)' }} />
                    <div style={{ flex: 1, height: 28, borderRadius: 6, background: 'rgba(255,255,255,.04)' }} />
                    <div style={{ width: 56, height: 48, borderRadius: 8, background: 'rgba(0,230,118,.04)' }} />
                    <div style={{ width: 56, height: 48, borderRadius: 8, background: 'rgba(0,230,118,.04)' }} />
                    <div style={{ width: 56, height: 48, borderRadius: 8, background: 'rgba(0,230,118,.04)' }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Vazio ────────────────────────────────────────────────────────── */}
        {!loading && !fetchErr && filtered.length === 0 && (
          <div className="flex flex-col items-center py-20 gap-3" style={{ color: C.t3 }}>
            <ScanSearch size={36} style={{ opacity: .2 }} />
            <p style={{ fontSize: 14, fontWeight: 600 }}>Nenhum jogo encontrado</p>
            {hasActiveFilter && (
              <button onClick={clearFilters}
                className="rounded-xl px-4 py-2 text-[12px] font-bold hover:opacity-80 transition-opacity"
                style={{ color: C.green, background: C.greenDim, border: `1px solid ${C.greenB}`, cursor: 'pointer' }}>
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* ── Cabeçalho desktop ───────────────────────────────────────────── */}
        {!loading && byLeague.length > 0 && (
          <div className="hidden md:grid items-center gap-3 px-4 pb-1"
            style={{ gridTemplateColumns: '80px 1fr 70px 70px 70px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.t3 }}>
            <span>Hora</span>
            <span>Jogo</span>
            <span className="text-center">Casa (1)</span>
            <span className="text-center">Empate (X)</span>
            <span className="text-center">Fora (2)</span>
          </div>
        )}

        {/* ── Eventos por liga ─────────────────────────────────────────────── */}
        {!loading && byLeague.map(([league, evs]) => {
          const isFav       = leagueFav.has(league);
          const isCollapsed = leagueCollapsed.has(league);

          return (
            <div key={league} className="overflow-hidden rounded-2xl"
              style={{
                background: `${C.surf}cc`,
                border: `1px solid ${isFav ? C.greenB : C.surfB}`,
                boxShadow: isFav
                  ? `0 4px 24px rgba(0,0,0,.4), 0 0 16px rgba(0,230,118,.06)`
                  : '0 4px 20px rgba(0,0,0,.4)',
              }}>

              {/* Barra topo colorida */}
              <div style={{
                height: 2,
                background: isFav
                  ? `linear-gradient(90deg, ${C.green} 0%, ${C.green}44 55%, transparent 100%)`
                  : `linear-gradient(90deg, rgba(0,230,118,.35) 0%, rgba(0,230,118,.08) 55%, transparent 100%)`,
              }} />

              {/* Cabeçalho da liga */}
              <div className="flex items-center justify-between px-4 py-2.5"
                style={{
                  background: isFav ? 'rgba(0,230,118,.06)' : 'rgba(255,255,255,.016)',
                  borderBottom: isCollapsed ? 'none' : `1px solid ${C.surfB}`,
                }}>
                <button onClick={() => toggleCollapse(league)}
                  className="flex flex-1 items-center gap-2.5 text-left hover:opacity-80 transition-opacity"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {/* ícone de liga (bullet colorido) */}
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isFav ? C.green : 'rgba(0,230,118,.45)', boxShadow: isFav ? `0 0 6px ${C.green}` : 'none' }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: isFav ? C.green : C.t1 }}>
                    {league}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '1px 7px',
                    background: 'rgba(255,255,255,.06)', color: C.t3, border: `1px solid ${C.surfB}`,
                  }}>
                    {evs.length}
                  </span>
                  <ChevronDown size={13} style={{
                    color: C.t3,
                    transform: isCollapsed ? 'rotate(-90deg)' : 'none',
                    transition: 'transform .2s ease',
                  }} />
                </button>
                <button onClick={() => toggleFav(league)}
                  className="ml-2 flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                  title={isFav ? 'Remover dos favoritos' : 'Fixar liga no topo'}
                  style={{ background: isFav ? C.greenDim : 'rgba(255,255,255,.03)', border: `1px solid ${isFav ? C.greenB : C.surfB}`, cursor: 'pointer' }}>
                  <Star size={12} style={{ color: isFav ? C.green : C.t3, fill: isFav ? C.green : 'none' }} />
                </button>
              </div>

              {/* Linhas dos eventos */}
              {!isCollapsed && (
                <div>
                  {evs.map((ev, idx) => {
                    const mgn     = calcMargin(ev.bookmakers);
                    const isSure  = mgn !== null && mgn < 0;
                    const bkH     = bestBk(ev.bookmakers, 'home');
                    const bkD     = bestBk(ev.bookmakers, 'draw');
                    const bkA     = bestBk(ev.bookmakers, 'away');
                    const dg      = dgMap.get(ev.match_id);
                    const dgRgb2  = dg ? dgRGB(dg.dg_classification) : null;
                    const dgCol2  = dg ? dgColor(dg.dg_classification) : null;
                    const isToday = dateBRT(ev.start_time) === today;
                    const dayLabel = weekdayLabel(ev.start_time, today);
                    const started  = new Date(ev.start_time).getTime() < Date.now();
                    const paCnt    = paBkCount(ev);

                    return (
                      <div key={ev.match_id} className="group relative"
                        style={{
                          borderTop: idx > 0 ? `1px solid ${C.surfB}` : undefined,
                        }}>
                        {/* left accent bar on hover */}
                        <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          style={{ background: C.green }} />

                        <button type="button" onClick={() => setSelectedEvent(ev)} className="w-full text-left">

                          {/* Desktop — grid: hora | jogo | Casa(1) | Empate | Fora */}
                          <div className="hidden md:grid items-center gap-3 pl-5 pr-4 py-3"
                            style={{ gridTemplateColumns: '80px 1fr 70px 70px 70px' }}>

                            {/* Hora + margem */}
                            <div className="flex flex-col gap-1">
                              <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: started ? C.amber : isToday ? C.green : C.t2 }}>
                                {fmtTime(ev.start_time)}
                              </span>
                              <span style={{ fontSize: 9, fontWeight: 700, color: started ? `${C.amber}88` : C.t3 }}>
                                {started ? 'Em andamento' : dayLabel}
                              </span>
                              {mgn !== null && (
                                <span className="rounded px-1.5 py-px tabular-nums text-center"
                                  style={{ fontSize: 9, fontWeight: 900, color: marginColor(mgn), background: marginBg(mgn), border: `1px solid ${marginColor(mgn)}33`, display: 'inline-block', alignSelf: 'flex-start' }}>
                                  {isSure ? `+${Math.abs(mgn).toFixed(2)}%` : `${mgn.toFixed(1)}%`}
                                </span>
                              )}
                            </div>

                            {/* Jogo */}
                            <div className="min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="truncate text-[13px] font-semibold" style={{ color: C.t1 }}>{ev.home_team}</p>
                                {dg && dgRgb2 && dgCol2 && (
                                  <span className="shrink-0 flex items-center gap-1 rounded px-1.5 py-px"
                                    style={{ fontSize: 8, fontWeight: 900, background: `rgba(${dgRgb2},.1)`, color: dgCol2, border: `1px solid rgba(${dgRgb2},.25)` }}>
                                    <Zap size={7} />{dg.dg_score}
                                  </span>
                                )}
                                {paCnt >= 2 && (
                                  <span style={{ fontSize: 7, fontWeight: 900, borderRadius: 4, padding: '1px 4px', background: C.greenDim, color: C.green, border: `1px solid ${C.greenB}`, flexShrink: 0 }}>
                                    PA×2
                                  </span>
                                )}
                                {paCnt === 1 && (
                                  <span style={{ fontSize: 7, fontWeight: 900, borderRadius: 4, padding: '1px 4px', background: 'rgba(0,230,118,.05)', color: `${C.green}99`, border: 'rgba(0,230,118,.18) 1px solid', flexShrink: 0 }}>
                                    PA
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-[11px]" style={{ color: C.t3 }}>{ev.away_team}</p>
                              <p className="text-[10px]" style={{ color: C.t3 }}>
                                {ev.bookmakers.length} casas
                              </p>
                            </div>

                            {/* Odds com badge PA/SO */}
                            <BestOddCell bk={bkH} type="home" />
                            <BestOddCell bk={bkD} type="draw" />
                            <BestOddCell bk={bkA} type="away" />
                          </div>

                          {/* Mobile */}
                          <div className="flex items-center gap-3 px-4 py-3 md:hidden">
                            <div className="flex flex-col items-center shrink-0" style={{ width: 44 }}>
                              <span style={{ fontSize: 13, fontWeight: 900, color: started ? C.amber : isToday ? C.green : C.t2 }}>{fmtTime(ev.start_time)}</span>
                              {mgn !== null && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: marginColor(mgn) }}>
                                  {isSure ? `+${Math.abs(mgn).toFixed(1)}%` : `${mgn.toFixed(1)}%`}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-[13px] font-semibold" style={{ color: C.t1 }}>{ev.home_team} x {ev.away_team}</p>
                              <p className="text-[11px]" style={{ color: C.t3 }}>
                                {ev.bookmakers.length} casas
                                {paCnt > 0 && <span className="ml-2 font-bold" style={{ color: C.green }}>· PA×{paCnt}</span>}
                              </p>
                            </div>
                            {/* Mini odds mobile */}
                            <div className="flex gap-1 shrink-0">
                              {([bkH, bkD, bkA] as const).map((bk, ki) => {
                                const type = (['home','draw','away'] as const)[ki];
                                if (!bk) return <div key={ki} style={{ width: 36, height: 36, borderRadius: 6, background: 'rgba(255,255,255,.025)' }} />;
                                const val = bk[type] as number;
                                const pa2 = isBkPA(bk);
                                return (
                                  <div key={ki} className="relative flex flex-col items-center justify-center rounded-md"
                                    style={{ width: 36, height: 36, background: 'rgba(0,230,118,.06)', border: '1px solid rgba(0,230,118,.2)' }}>
                                    <span style={{ fontSize: 11, fontWeight: 900, color: C.green }}>{val.toFixed(2)}</span>
                                    {pa2 && <span className="absolute -right-1 -top-1 rounded border px-px text-[6px] font-bold" style={{ background: C.greenDim, color: C.green, borderColor: C.greenB }}>PA</span>}
                                  </div>
                                );
                              })}
                            </div>
                            <ChevronRight size={13} style={{ color: C.t3, opacity: .4, flexShrink: 0 }} />
                          </div>
                        </button>
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
