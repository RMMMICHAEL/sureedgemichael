'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ScanSearch, ChevronLeft, ChevronRight, ExternalLink,
  ArrowDown, RefreshCw, Zap, TrendingUp, ChevronDown, Star, Check, Trophy,
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

/**
 * Quantos lados (Casa / Fora) têm a sua MELHOR odd vinda de uma casa PA.
 * Retorna 0, 1 ou 2.
 *   2 = PA 2 LADOS: melhor odd de home E melhor odd de away são de casas PA
 *   1 = PA 1 LADO:  só a melhor home OU só a melhor away é de casa PA
 *   0 = ambos os lados têm SO como melhor odd
 *
 * Critério: olha a bestBk() de home e de away — se essa casa é PA, conta.
 * Empate nunca conta no filtro.
 */
function paSideCount(ev: OddsSummary): number {
  const bh = bestBk(ev.bookmakers, 'home');
  const ba = bestBk(ev.bookmakers, 'away');
  return (bh && isBkPA(bh) ? 1 : 0) + (ba && isBkPA(ba) ? 1 : 0);
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
/** Melhor casa com PA para o outcome (home|away). Empate não usa PA filter. */
function bestPaBk(bks: BookmakerOdds[], key: 'home'|'away'): BookmakerOdds | null {
  let best: BookmakerOdds | null = null; let bestV = 0;
  for (const b of bks) {
    if (isBkPA(b)) {
      const v = b[key] as number;
      if (v > bestV && v > 1) { bestV = v; best = b; }
    }
  }
  return best;
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

/**
 * Célula de melhor odd.
 * PA → fundo verde + odds em verde (igual DG Opportunities).
 * SO → fundo neutro + odds em cinza.
 * showPaBadge: override — usado no empate para só mostrar PA se for a maior odd do jogo.
 */
function BestOddCell({ bk, type, showPaBadge }: { bk: BookmakerOdds | null; type: OddType; showPaBadge?: boolean }) {
  if (!bk) return (
    <div className="relative flex h-[52px] w-full items-center justify-center rounded-lg"
      style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)' }}>
      <span style={{ color: 'rgba(255,255,255,.12)', fontSize: 11 }}>—</span>
    </div>
  );
  const val = bk[type] as number;
  const pa  = showPaBadge !== undefined ? showPaBadge : isBkPA(bk);
  return (
    <div className="relative flex h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-lg transition-opacity hover:opacity-80"
      style={pa ? {
        background: 'rgba(0,230,118,.08)',
        border: '1px solid rgba(0,230,118,.28)',
      } : {
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.08)',
      }}>
      <span className="tabular-nums text-[15px] font-black"
        style={{ color: pa ? C.green : C.t2, textShadow: pa ? `0 0 10px ${C.green}33` : 'none' }}>
        {val.toFixed(2)}
      </span>
      <span className="max-w-full truncate px-2 text-[9px]" style={{ color: C.t3 }}>
        {bk.name}
      </span>
      {/* badge PA / SO */}
      <span className="absolute -right-1 -top-1 rounded border px-[3px] py-px text-[7px] font-bold"
        style={pa
          ? { background: C.greenDim, color: C.green, borderColor: C.greenB }
          : { background: 'rgba(255,255,255,.04)', color: C.t3, borderColor: 'rgba(255,255,255,.1)' }
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

  useEffect(() => {
    const active = slots.filter(Boolean) as CalcSlot[];
    if (!active.length) { setCalcFill(null); return; }
    setCalcFill({
      odds:   slots.map(s => s ? String(s.value) : ''),
      houses: slots.map(s => s ? s.bk.name : ''),
      urls:   slots.map(s => s ? (s.bk.url ?? '') : ''),
    });
    // Não faz scroll automático — evita que a tela suba ao clicar nas odds de baixo
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
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.t3 }}>Duplo Green</span>
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
        <div className="p-4">
          <SurebetCalc
            selectedEvent={{ name: eventName, start_utc: event.start_time }}
            externalFill={calcFill}
            defaultNumOutcomes={3}
            hideNumOutcomes
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

// ─── Modal de campeonatos (multi-select) ─────────────────────────────────────

function LeagueFilterModal({
  leagues,
  selected,   // empty Set = todos selecionados
  onChange,
  onClose,
}: {
  leagues:  string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onClose:  () => void;
}) {
  // draft: conjunto dos SELECIONADOS (tudo selecionado = todos os slugs)
  const [draft, setDraft] = useState<Set<string>>(() => {
    // se o pai tem set vazio (= todos), pré-preenche com todos
    return selected.size === 0 ? new Set(leagues) : new Set(selected);
  });

  function toggle(lg: string) {
    setDraft(prev => {
      const n = new Set(prev);
      n.has(lg) ? n.delete(lg) : n.add(lg);
      return n;
    });
  }
  function selectAll()  { setDraft(new Set(leagues)); }
  function clearAll()   { setDraft(new Set()); }

  const allSelected = draft.size === leagues.length;
  const noneSelected = draft.size === 0;

  function confirm() {
    // se todos selecionados → retorna Set vazio (= sem filtro)
    onChange(allSelected ? new Set() : new Set(draft));
    onClose();
  }

  // ordena: Brasil primeiro, depois alfabético
  const sorted = [...leagues].sort((a, b) => {
    const aBr = a.toLowerCase().includes('brasil') || a.toLowerCase().includes('série');
    const bBr = b.toLowerCase().includes('brasil') || b.toLowerCase().includes('série');
    if (aBr && !bBr) return -1;
    if (!aBr && bBr) return 1;
    return a.localeCompare(b);
  });

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0d1117',
        border: `1px solid ${C.surfB}`,
        borderRadius: 18,
        boxShadow: '0 28px 80px rgba(0,0,0,.8)',
        width: 560, maxWidth: '95vw', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4" style={{ borderBottom: `1px solid ${C.surfB}` }}>
          <div>
            <div className="flex items-center gap-2">
              <Trophy size={16} style={{ color: C.green }} />
              <h3 style={{ fontSize: 17, fontWeight: 900, color: C.t1, margin: 0 }}>Campeonatos</h3>
            </div>
            <p style={{ fontSize: 12, color: C.t3, marginTop: 3 }}>Selecione os campeonatos que deseja ver.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4, marginTop: -2 }}>
            <X size={18} />
          </button>
        </div>

        {/* Grid de ligas */}
        <div className="overflow-y-auto flex-1 p-5">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {sorted.map(lg => {
              const sel = draft.has(lg);
              return (
                <button key={lg} type="button" onClick={() => toggle(lg)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all hover:opacity-90"
                  style={{
                    background: sel ? 'rgba(0,230,118,.1)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${sel ? C.greenB : C.surfB}`,
                    cursor: 'pointer',
                  }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: sel ? C.green : 'rgba(255,255,255,.06)',
                    border: `1.5px solid ${sel ? C.green : 'rgba(255,255,255,.15)'}`,
                  }}>
                    {sel && <Check size={10} color="#060A07" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? C.t1 : C.t2 }}>
                    {lg}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4" style={{ borderTop: `1px solid ${C.surfB}` }}>
          <button onClick={selectAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.t3, textDecoration: 'underline', padding: 0 }}>
            Marcar todas
          </button>
          <button onClick={clearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.t3, textDecoration: 'underline', padding: 0 }}>
            Limpar seleção
          </button>
          <span className="flex-1" />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.t3 }}>
            {noneSelected ? '0' : draft.size} de {leagues.length} selecionados
          </span>
          <button onClick={confirm}
            className="rounded-xl px-5 py-2 text-[13px] font-black transition-opacity hover:opacity-90"
            style={{ background: C.green, color: '#060A07' }}>
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
  const [leagueFilter,    setLeagueFilter]   = useState<Set<string>>(new Set()); // empty = todos
  const [leagueModalOpen, setLeagueModalOpen]= useState(false);
  const [lastUpdated,     setLastUpdated]    = useState(Date.now());
  const [tick,            setTick]           = useState(0);
  const [dgMap,           setDgMap]          = useState<Map<string, DGInfo>>(new Map());

  // ── Tick "atualizado há Xs" ─────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  void tick;

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
      // ?all=1 → carrega TODOS os jogos importados (o admin já remove os antigos no import)
      const [dbRes] = await Promise.all([fetch('/api/dg/odds-db?all=1'), loadDGMap()]);
      const dbJson  = await dbRes.json() as { ok: boolean; odds?: OddsSummary[] };
      if (dbJson.ok && (dbJson.odds?.length ?? 0) > 0) {
        setAllOdds(dbJson.odds!);
        setLastUpdated(Date.now());
        return;
      }
      // fallback: endpoint legado (sem DB)
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
  }, [loadDGMap]);

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
      .filter(ev => leagueFilter.size === 0 || leagueFilter.has(ev.league_name))
      .filter(ev => {
        if (paFilter === 'ALL') return true;
        const cnt = paSideCount(ev);
        if (paFilter === 'AMBOS_PA') return cnt >= 2;
        if (paFilter === 'UM_PA')    return cnt === 1;
        return true;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOdds, leagueFilter, paFilter]);

  // contadores p/ chips
  const cntAll   = useMemo(() => allOdds.filter(ev => !isExcluded(ev.league_name ?? '') && (() => { try { return new Date(ev.start_time).getTime() + GAME_DURATION_MS > Date.now(); } catch { return true; } })() && (leagueFilter.size === 0 || leagueFilter.has(ev.league_name))).length, [allOdds, leagueFilter, GAME_DURATION_MS]);
  const cntAmbos = useMemo(() => filtered.filter(ev => paSideCount(ev) >= 2).length, [filtered]);
  const cntUm    = useMemo(() => filtered.filter(ev => paSideCount(ev) === 1).length, [filtered]);

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

  const hasActiveFilter = paFilter !== 'ALL' || leagueFilter.size > 0;

  function toggleFav(lg: string) {
    setLeagueFav(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); return n; });
  }
  function toggleCollapse(lg: string) {
    setLeagueCollapsed(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); return n; });
  }
  function clearFilters() { setPaFilter('ALL'); setLeagueFilter(new Set()); }

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

          {/* Campeonatos — abre modal multi-select */}
          {(() => {
            const active = leagueFilter.size > 0 && leagueFilter.size < allLeagues.length;
            const label  = active ? `${leagueFilter.size} campeonatos` : 'Campeonatos';
            return (
              <button onClick={() => setLeagueModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
                style={{
                  background: active ? 'rgba(0,230,118,.1)' : `${C.surf}cc`,
                  border:     active ? `1px solid ${C.greenB}` : `1px solid ${C.surfB}`,
                  color:      active ? C.green : C.t2,
                }}>
                <Trophy size={11} />
                <span>{label}</span>
                {active && (
                  <span style={{ fontSize: 9, fontWeight: 900, borderRadius: 99, padding: '0 5px', background: 'rgba(0,230,118,.18)', color: C.green }}>
                    {leagueFilter.size}/{allLeagues.length}
                  </span>
                )}
                <ChevronDown size={11} style={{ opacity: .5 }} />
              </button>
            );
          })()}

          {/* Modal campeonatos */}
          {leagueModalOpen && (
            <LeagueFilterModal
              leagues={allLeagues}
              selected={leagueFilter}
              onChange={setLeagueFilter}
              onClose={() => setLeagueModalOpen(false)}
            />
          )}

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

              {/* Linhas dos eventos — agrupadas por data */}
              {!isCollapsed && (() => {
                // Agrupar eventos por data para inserir separadores
                const dateGroups: Array<{ date: string; isToday: boolean; label: string; events: OddsSummary[] }> = [];
                for (const ev of evs) {
                  const d = dateBRT(ev.start_time);
                  const last = dateGroups[dateGroups.length - 1];
                  if (!last || last.date !== d) {
                    dateGroups.push({
                      date: d,
                      isToday: d === today,
                      label: weekdayLabel(ev.start_time, today),
                      events: [ev],
                    });
                  } else {
                    last.events.push(ev);
                  }
                }
                const usePaFilter = paFilter !== 'ALL';
                return (
                  <div>
                    {dateGroups.map((group) => (
                      <React.Fragment key={group.date}>
                        {/* Separador de data — só aparece se a liga tiver jogos em múltiplos dias */}
                        {dateGroups.length > 1 && (
                          <div className="flex items-center gap-2 px-5 py-1.5"
                            style={{
                              borderTop: `1px solid ${C.surfB}`,
                              background: group.isToday
                                ? 'rgba(0,230,118,.04)'
                                : 'rgba(255,255,255,.01)',
                            }}>
                            <span style={{
                              fontSize: 10, fontWeight: 800,
                              color: group.isToday ? C.green : C.t3,
                              letterSpacing: '0.06em', textTransform: 'uppercase',
                            }}>
                              {group.label}
                            </span>
                            {group.isToday && (
                              <span style={{
                                fontSize: 8, fontWeight: 900, borderRadius: 99, padding: '1px 5px',
                                background: C.greenDim, color: C.green, border: `1px solid ${C.greenB}`,
                              }}>AO VIVO HOJE</span>
                            )}
                            <div style={{ flex: 1, height: 1, background: group.isToday ? 'rgba(0,230,118,.12)' : 'rgba(255,255,255,.04)' }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.t3 }}>{group.events.length}</span>
                          </div>
                        )}

                        {group.events.map((ev, idx) => {
                          const mgn     = calcMargin(ev.bookmakers);
                          const isSure  = mgn !== null && mgn < 0;
                          // Quando filtro PA ativo, mostra a melhor odd PA em casa/fora
                          const bkH     = usePaFilter ? bestPaBk(ev.bookmakers, 'home') : bestBk(ev.bookmakers, 'home');
                          const bkD     = bestBk(ev.bookmakers, 'draw');
                          const bkA     = usePaFilter ? bestPaBk(ev.bookmakers, 'away') : bestBk(ev.bookmakers, 'away');
                          // Empate mostra PA só se for a maior odd do jogo
                          const bestH   = bestVal(ev.bookmakers, 'home');
                          const bestD   = bestVal(ev.bookmakers, 'draw');
                          const bestAw  = bestVal(ev.bookmakers, 'away');
                          const drawIsHighest = bestD > 0 && bestD >= bestH && bestD >= bestAw;
                          const drawPaBadge   = bkD && isBkPA(bkD) && drawIsHighest ? true : (bkD ? false : undefined);
                          const dg      = dgMap.get(ev.match_id);
                          const dgRgb2  = dg ? dgRGB(dg.dg_classification) : null;
                          const dgCol2  = dg ? dgColor(dg.dg_classification) : null;
                          const isToday2 = group.isToday;
                          const started  = new Date(ev.start_time).getTime() < Date.now();
                          const paCnt    = paSideCount(ev);
                          // Jogos futuros (não hoje): leve opacidade reduzida para diferenciar
                          const futureOp = !isToday2 && !started ? 0.85 : 1;

                          return (
                            <div key={ev.match_id} className="group relative"
                              style={{
                                borderTop: idx > 0 || dateGroups.length > 1 ? `1px solid ${C.surfB}` : undefined,
                                opacity: futureOp,
                              }}>
                              {/* left accent bar on hover */}
                              <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                                style={{ background: isToday2 ? C.green : C.amber }} />

                              <button type="button" onClick={() => setSelectedEvent(ev)} className="w-full text-left">

                                {/* Desktop — grid: hora | jogo | Casa(1) | Empate | Fora */}
                                <div className="hidden md:grid items-center gap-3 pl-5 pr-4 py-3"
                                  style={{ gridTemplateColumns: '80px 1fr 70px 70px 70px' }}>

                                  {/* Hora + margem */}
                                  <div className="flex flex-col gap-1">
                                    <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: started ? C.amber : isToday2 ? C.green : C.t2 }}>
                                      {fmtTime(ev.start_time)}
                                    </span>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: started ? `${C.amber}88` : isToday2 ? C.t3 : C.amber + '99' }}>
                                      {started ? 'Em andamento' : isToday2 ? 'Hoje' : fmtDateShort(ev.start_time)}
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
                                      <p className="truncate text-[13px] font-bold" style={{ color: C.t1 }}>{ev.home_team}</p>
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
                                    <p className="truncate text-[13px] font-semibold" style={{ color: C.t2 }}>{ev.away_team}</p>
                                    <p className="text-[10px]" style={{ color: C.t3 }}>
                                      {ev.bookmakers.length} casas
                                    </p>
                                  </div>

                                  {/* Odds com badge PA/SO — empate mostra PA só se for a maior odd */}
                                  <BestOddCell bk={bkH} type="home" />
                                  <BestOddCell bk={bkD} type="draw" showPaBadge={drawPaBadge ?? undefined} />
                                  <BestOddCell bk={bkA} type="away" />
                                </div>

                                {/* Mobile */}
                                <div className="flex items-center gap-3 px-4 py-3 md:hidden">
                                  <div className="flex flex-col items-center shrink-0" style={{ width: 44 }}>
                                    <span style={{ fontSize: 13, fontWeight: 900, color: started ? C.amber : isToday2 ? C.green : C.t2 }}>{fmtTime(ev.start_time)}</span>
                                    {mgn !== null && (
                                      <span style={{ fontSize: 9, fontWeight: 700, color: marginColor(mgn) }}>
                                        {isSure ? `+${Math.abs(mgn).toFixed(1)}%` : `${mgn.toFixed(1)}%`}
                                      </span>
                                    )}
                                    {!isToday2 && !started && (
                                      <span style={{ fontSize: 8, color: C.amber + '99', fontWeight: 700 }}>{fmtDateShort(ev.start_time)}</span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="truncate text-[13px] font-semibold" style={{ color: C.t1 }}>{ev.home_team} x {ev.away_team}</p>
                                    <p className="text-[11px]" style={{ color: C.t3 }}>
                                      {ev.bookmakers.length} casas
                                      {paCnt > 0 && <span className="ml-2 font-bold" style={{ color: C.green }}>· PA×{paCnt}</span>}
                                    </p>
                                  </div>
                                  {/* Mini odds mobile — PA verde, SO neutro */}
                                  <div className="flex gap-1 shrink-0">
                                    {([bkH, bkD, bkA] as const).map((bk, ki) => {
                                      const type = (['home','draw','away'] as const)[ki];
                                      if (!bk) return <div key={ki} style={{ width: 36, height: 36, borderRadius: 6, background: 'rgba(255,255,255,.02)' }} />;
                                      const val = bk[type] as number;
                                      const pa2 = ki === 1
                                        ? (drawPaBadge ?? isBkPA(bk))
                                        : isBkPA(bk);
                                      return (
                                        <div key={ki} className="relative flex flex-col items-center justify-center rounded-md"
                                          style={pa2
                                            ? { width: 36, height: 36, background: 'rgba(0,230,118,.08)', border: '1px solid rgba(0,230,118,.25)' }
                                            : { width: 36, height: 36, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
                                          <span style={{ fontSize: 11, fontWeight: 900, color: pa2 ? C.green : C.t2 }}>{val.toFixed(2)}</span>
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
                      </React.Fragment>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })}

      </> /* fim tab odds */}
    </div>
  );
}
