'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ExternalLink, RefreshCw, ChevronLeft, ArrowDown, Check, X,
  Trophy, Star, ChevronDown, Zap, ScanSearch,
} from 'lucide-react';
import { SurebetCalc } from '@/components/calcalendario/SurebetCalc';

// ─── Palette (espelha BuscarOddsPage) ────────────────────────────────────────
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
  t1:       '#F0F4F8',
  t2:       '#8899AA',
  t3:       '#7E92A3',
};

// ─── CSS injetado (tooltip — reutiliza o mesmo CSS da BuscarOddsPage se já injetado) ──
const TOOLTIP_CSS = `
.dg-tt { position: relative; display: inline-flex; }
.dg-tt .dg-tip {
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
.dg-tt:hover .dg-tip { opacity: 1; }
.dg-tt .dg-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: rgba(255,255,255,.12);
}
`;

function DGStyles() {
  return <style dangerouslySetInnerHTML={{ __html: TOOLTIP_CSS }} />;
}

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="dg-tt">
      {children}
      <span className="dg-tip">{text}</span>
    </span>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Leg {
  bookmaker: string; bookmakerSlug: string; odd: number;
  outcome: string; matchUrl?: string | null; isPA?: boolean | null;
}
interface DGOpportunity {
  id: string; match_id: string; home_team: string; away_team: string;
  league: string | null; league_slug: string | null; kickoff: string | null;
  max_loss_pct: number | null; dg_profit_pct: number | null;
  dg_score: number | null; dg_classification: string | null;
  legs: Leg[]; pa_sides?: number | null;
}
type PAFilter = 'ALL' | 'UM_PA' | 'AMBOS_PA';
type SortBy   = 'maior_lucro' | 'menor_lucro' | 'recentes';

// ─── localStorage helpers ─────────────────────────────────────────────────────
function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* noop */ }
}

// ─── PA helpers ───────────────────────────────────────────────────────────────
const PA_SET = new Set([
  'betano','bet365','betfair','kto','superbet','vivasorte','betao',
  '7games','betesporte','novibet','estrelabet','esportivabet','jogodeouro',
  '7k','bet7k','versusbet','meridianbet','betmgm','betsson','betvip',
  'br4bet','br4','esportesdasorte','vaidebet','pixbet','sportingbet',
  'apostabeat','apostabet','lotogreen','betpix365','betpix','f12',
  'vupibet','vupibr','vupi','sortenabet','sorte','brasilbet','brasil',
  'esportivabr','estrelabeat','betnacional','pixbetsports',
  'betnow','sportbr','betbr','apostaganha',
  'leon','leonbet',
]);
function normSlug(s: string) { return s.toLowerCase().replace(/[\s\-_.]/g, ''); }
function isSlugPA(slug: string): boolean {
  if (!slug) return false;
  const n = normSlug(slug);
  if (PA_SET.has(n)) return true;
  for (const pa of PA_SET) {
    if (n.includes(pa) || pa.includes(n)) return true;
    const prefix = Math.min(n.length, pa.length, 6);
    if (prefix >= 4 && n.slice(0, prefix) === pa.slice(0, prefix)) return true;
  }
  return false;
}
function isLegPA(leg: Leg): boolean {
  if (leg.isPA === true) return true;
  if (leg.isPA === false) return false;
  return isSlugPA(leg.bookmakerSlug ?? '');
}
function paSides(o: DGOpportunity): number {
  if (o.pa_sides != null) return o.pa_sides;
  return (o.legs.some(l => l.outcome === 'home' && isLegPA(l)) ? 1 : 0) +
         (o.legs.some(l => l.outcome === 'away' && isLegPA(l)) ? 1 : 0);
}

// ─── DG color helpers ─────────────────────────────────────────────────────────
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
function profitColor(pct: number | null): string {
  if (pct == null) return C.t3;
  return pct >= 0 ? C.green : C.red;
}
function fmtProfit(pct: number | null): string {
  if (pct == null) return '—';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function fmtTime(utc: string | null): string {
  if (!utc) return '—';
  try {
    return new Date(utc).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  } catch { return utc; }
}
function fmtTimeShort(utc: string | null): string {
  if (!utc) return '—';
  try { return new Date(utc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  catch { return '—'; }
}

// ─── LegCell ─────────────────────────────────────────────────────────────────
function LegCell({ leg }: { leg: Leg | undefined }) {
  if (!leg) return (
    <div style={{ display: 'flex', height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)' }}>
      <span style={{ color: 'rgba(255,255,255,.12)', fontSize: 11 }}>—</span>
    </div>
  );
  const pa = isLegPA(leg);
  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 2, height: 52, borderRadius: 8,
      ...(pa ? { background: 'rgba(63,255,33,.07)', border: '1px solid rgba(63,255,33,.22)' }
             : { background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }),
    }}>
      <span style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: pa ? C.green : C.t2, textShadow: pa ? `0 0 10px rgba(63,255,33,.35)` : 'none' }}>
        {leg.odd.toFixed(2)}
      </span>
      {leg.matchUrl ? (
        <a href={leg.matchUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.t3, textDecoration: 'none', maxWidth: '100%', padding: '0 6px', overflow: 'hidden' }}>
          <ExternalLink size={8} style={{ flexShrink: 0, opacity: .5 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leg.bookmaker}</span>
        </a>
      ) : (
        <span style={{ fontSize: 11, color: C.t3, maxWidth: '100%', padding: '0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leg.bookmaker}</span>
      )}
      <Tip text={pa ? 'Casa com Pagamento Antecipado — paga antes do resultado.' : 'Casa Somente Online — paga após o resultado.'}>
        <span style={{
          position: 'absolute', top: -4, right: -4, borderRadius: 4, padding: '1px 3px',
          fontSize: 10, fontWeight: 700, cursor: 'default',
          ...(pa ? { background: C.greenDim, color: C.green, border: `1px solid ${C.greenB}` }
                 : { background: 'rgba(255,255,255,.04)', color: C.t3, border: '1px solid rgba(255,255,255,.1)' }),
        }}>{pa ? 'PA' : 'SO'}</span>
      </Tip>
    </div>
  );
}

// ─── Modal de casas (bookmaker deselect) ─────────────────────────────────────
interface BkInfo { slug: string; name: string; isPA: boolean; }
function BookmakerModal({ bookmakers, deselected, onChange, onClose }: {
  bookmakers: BkInfo[]; deselected: Set<string>; onChange: (next: Set<string>) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(new Set(deselected));
  const toggle = (slug: string) => setDraft(prev => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  const paList    = bookmakers.filter(b => b.isPA);
  const nonPaList = bookmakers.filter(b => !b.isPA);
  const selectedCount = bookmakers.length - draft.size;

  function Section({ title, list, accent }: { title: string; list: BkInfo[]; accent: string }) {
    if (!list.length) return null;
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${C.surfB}` }}>
          <div style={{ width: 3, height: 12, borderRadius: 2, background: accent, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: accent }}>{title}</span>
          <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '1px 6px', background: `${accent}20`, color: accent }}>{list.length}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
          {list.map(bk => {
            const sel = !draft.has(bk.slug);
            return (
              <button key={bk.slug} type="button" onClick={() => toggle(bk.slug)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', color: sel ? C.t1 : C.t3 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: sel ? C.green : 'rgba(255,255,255,.06)', border: `1.5px solid ${sel ? C.green : 'rgba(255,255,255,.15)'}` }}>
                  {sel && <Check size={10} color="#060A07" strokeWidth={3} />}
                </span>
                <span style={{ fontSize: 12, fontWeight: sel ? 600 : 400 }}>{bk.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: `1px solid ${C.surfB}`, borderRadius: 18, boxShadow: '0 28px 80px rgba(0,0,0,.8)', width: 680, maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: `1px solid ${C.surfB}` }}>
          <h3 style={{ fontSize: 17, fontWeight: 900, color: C.t1, margin: 0 }}>Casas de Apostas</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: C.t3, padding: '8px 24px 0', margin: 0 }}>Desmarque as casas que não utiliza para filtrar oportunidades.</p>
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px' }}>
          <Section title="Com Pagamento Antecipado (PA)" list={paList} accent={C.green} />
          <Section title="Sem Pagamento Antecipado" list={nonPaList} accent={C.purple} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderTop: `1px solid ${C.surfB}` }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.t3 }}>{selectedCount} de {bookmakers.length} selecionadas</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => setDraft(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.t3, textDecoration: 'underline', padding: 0 }}>Marcar todas</button>
          <button onClick={() => setDraft(new Set(bookmakers.map(b => b.slug)))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.t3, textDecoration: 'underline', padding: 0 }}>Desmarcar todas</button>
          <button onClick={() => { onChange(draft); onClose(); }} style={{ borderRadius: 10, padding: '8px 20px', fontSize: 13, fontWeight: 900, background: C.green, color: '#060A07', border: 'none', cursor: 'pointer' }}>Confirmar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Modal campeonatos ────────────────────────────────────────────────────────
function LeagueFilterModal({ leagues, selected, onChange, onClose }: {
  leagues: string[]; selected: Set<string>; onChange: (next: Set<string>) => void; onClose: () => void;
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

// ─── DG Detail Panel ──────────────────────────────────────────────────────────
function DGDetailPanel({ matchOpportunities, onBack }: {
  matchOpportunities: DGOpportunity[]; onBack: () => void;
}) {
  const [sortCol,    setSortCol]    = useState<'score'|'profit'|'home'|'draw'|'away'>('score');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calcKey,    setCalcKey]    = useState(0);
  const [calcFill,   setCalcFill]   = useState<{ odds: string[]; houses: string[]; urls: string[] } | null>(null);
  const calcRef = useRef<HTMLDivElement>(null);

  const o   = matchOpportunities[0];
  const rgb = dgRGB(o.dg_classification);
  const col = dgColor(o.dg_classification);

  const sorted = useMemo(() => [...matchOpportunities].sort((a, b) => {
    if (sortCol === 'score')  return (b.dg_score ?? 0) - (a.dg_score ?? 0);
    if (sortCol === 'profit') return (b.dg_profit_pct ?? -999) - (a.dg_profit_pct ?? -999);
    const lA = a.legs.find(l => l.outcome === sortCol);
    const lB = b.legs.find(l => l.outcome === sortCol);
    return (lB?.odd ?? 0) - (lA?.odd ?? 0);
  }), [matchOpportunities, sortCol]);

  function selectOpp(opp: DGOpportunity) {
    if (selectedId === opp.id) { setSelectedId(null); setCalcFill(null); return; }
    setSelectedId(opp.id);
    const legs = [
      opp.legs.find(l => l.outcome === 'home'),
      opp.legs.find(l => l.outcome === 'draw'),
      opp.legs.find(l => l.outcome === 'away'),
    ].filter(Boolean) as Leg[];
    if (!legs.length) return;
    setCalcFill({ odds: legs.map(l => String(l.odd)), houses: legs.map(l => l.bookmaker), urls: legs.map(l => l.matchUrl ?? '') });
    setCalcKey(k => k + 1);
    setTimeout(() => calcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  }

  const cols: { key: typeof sortCol; label: string }[] = [
    { key: 'score',  label: 'Score'      },
    { key: 'profit', label: 'DG Profit'  },
    { key: 'home',   label: 'Casa (1)'   },
    { key: 'draw',   label: 'Empate (X)' },
    { key: 'away',   label: 'Fora (2)'   },
  ];

  const paLabelStr = paSides(o) >= 2 ? 'Ambos PA' : paSides(o) === 1 ? '1 Lado PA' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, padding: '12px 16px', background: `linear-gradient(135deg,rgba(${rgb},.08) 0%,${C.surf}ee 60%)`, border: `1px solid rgba(${rgb},.25)`, boxShadow: '0 4px 32px rgba(0,0,0,.5)' }}>
        <button onClick={onBack} style={{ display: 'flex', height: 32, width: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: `rgba(${rgb},.1)`, border: `1px solid rgba(${rgb},.2)`, color: col, cursor: 'pointer', flexShrink: 0 }}>
          <ChevronLeft size={15} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 900, color: C.t1 }}>{o.home_team} x {o.away_team}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.t3, marginTop: 2 }}>
            <span>{o.league ?? '—'} · {fmtTime(o.kickoff)}</span>
            {paLabelStr && (
              <span style={{ borderRadius: 99, padding: '1px 7px', fontSize: 11, fontWeight: 700, background: C.amberDim, color: C.amber, border: `1px solid ${C.amberB}` }}>{paLabelStr}</span>
            )}
          </div>
        </div>
        <Tip text={`Score DG: ${o.dg_score}. DG Profit estimado: ${fmtProfit(o.dg_profit_pct)}. Classificação: ${o.dg_classification}.`}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: 10, padding: '6px 12px', background: `rgba(${rgb},.1)`, border: `1px solid rgba(${rgb},.25)`, flexShrink: 0, cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Zap size={9} style={{ color: col }} />
              <span style={{ fontSize: 18, fontWeight: 900, color: col }}>{o.dg_score ?? '—'}</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase' as const, color: `rgba(${rgb},.5)` }}>DG score</span>
            {o.dg_profit_pct != null && (
              <span style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: profitColor(o.dg_profit_pct) }}>{fmtProfit(o.dg_profit_pct)}</span>
            )}
          </div>
        </Tip>
      </div>

      {/* Tabela de combinações */}
      <div style={{ overflow: 'hidden', borderRadius: 16, background: `rgba(${rgb},.02)`, border: `1px solid rgba(${rgb},.18)`, boxShadow: '0 4px 24px rgba(0,0,0,.35)' }}>
        <div style={{ height: 2, background: `linear-gradient(90deg,rgba(${rgb},.9) 0%,rgba(${rgb},.3) 60%,transparent 100%)` }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: `linear-gradient(90deg,rgba(${rgb},.08) 0%,transparent 70%)`, borderBottom: `1px solid rgba(${rgb},.12)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: col, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: col }}>Combinações DuploGreen</span>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '1px 6px', background: `rgba(${rgb},.12)`, color: col, border: `1px solid rgba(${rgb},.25)` }}>{matchOpportunities.length}</span>
          </div>
          <p style={{ fontSize: 11, color: C.t3 }}>clique para calcular</p>
        </div>
        {/* Col headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '20px 72px 68px 1fr 1fr 1fr', alignItems: 'center', gap: 8, padding: '8px 20px', background: 'rgba(255,255,255,.015)', borderBottom: `1px solid rgba(255,255,255,.05)` }}>
          <span style={{ color: C.t3, fontSize: 11, fontWeight: 700 }}>#</span>
          {cols.map(c => (
            <button key={c.key} type="button" onClick={() => setSortCol(c.key)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 11, fontWeight: 700, color: sortCol === c.key ? C.t1 : C.t3, borderBottom: sortCol === c.key ? `2px solid rgba(${rgb},.7)` : '2px solid transparent', paddingBottom: 2, background: 'none', border: 'none', cursor: 'pointer' }}>
              {c.label}{sortCol === c.key && <ArrowDown size={9} style={{ marginLeft: 2 }} />}
            </button>
          ))}
        </div>
        <div>
          {sorted.map((opp, idx) => {
            const legH = opp.legs.find(l => l.outcome === 'home');
            const legD = opp.legs.find(l => l.outcome === 'draw');
            const legA = opp.legs.find(l => l.outcome === 'away');
            const isSel  = selectedId === opp.id;
            const isBest = idx === 0;
            return (
              <button key={opp.id} type="button" onClick={() => selectOpp(opp)} style={{
                display: 'grid', width: '100%', textAlign: 'left',
                gridTemplateColumns: '20px 72px 68px 1fr 1fr 1fr',
                alignItems: 'center', gap: 8, padding: '12px 20px',
                background: isSel ? `rgba(${rgb},.10)` : isBest ? `rgba(${rgb},.05)` : idx % 2 === 1 ? 'rgba(255,255,255,.012)' : undefined,
                borderTop: idx > 0 ? `1px solid rgba(255,255,255,.04)` : undefined,
                boxShadow: isSel ? `inset 0 0 0 1px rgba(${rgb},.35)` : undefined,
                cursor: 'pointer', border: 'none',
              }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: C.t3 }}>{idx + 1}</span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: (isBest || isSel) ? col : C.t2 }}>{opp.dg_score ?? '—'}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, color: `rgba(${rgb},.4)` }}>{opp.dg_classification ?? ''}{isSel ? ' ✓' : ''}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: profitColor(opp.dg_profit_pct) }}>{fmtProfit(opp.dg_profit_pct)}</span>
                  {opp.max_loss_pct != null && <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(248,113,113,.6)' }}>-{Math.abs(opp.max_loss_pct).toFixed(1)}% perda</span>}
                </div>
                <LegCell leg={legH} />
                <LegCell leg={legD} />
                <LegCell leg={legA} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Calculadora */}
      {calcFill && (
        <div key={calcKey} ref={calcRef} style={{ overflow: 'hidden', borderRadius: 16, background: `${C.surf}cc`, border: `1px solid rgba(${rgb},.28)`, boxShadow: `0 4px 28px rgba(0,0,0,.4)` }}>
          <div style={{ height: 2, background: `linear-gradient(90deg,rgba(${rgb},.8) 0%,rgba(${rgb},.2) 60%,transparent 100%)` }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: `linear-gradient(90deg,rgba(${rgb},.07) 0%,transparent 60%)`, borderBottom: `1px solid rgba(${rgb},.1)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: col, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: col }}>Calculadora</span>
            </div>
            <span style={{ fontSize: 11, color: C.t3 }}>odds pré-carregadas · ajuste livremente</span>
          </div>
          <div style={{ padding: 16 }}>
            <SurebetCalc selectedEvent={{ name: `${o.home_team} x ${o.away_team}`, start_utc: o.kickoff ?? '' }} externalFill={calcFill} defaultNumOutcomes={3} hideNumOutcomes hideFormula accent={C.green} initialOpType="duplo_green" />
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: C.t3, paddingLeft: 4 }}>Clique numa linha para calcular stakes · clique no nome da casa para abrir na plataforma</p>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function DGSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse" style={{ borderRadius: 16, overflow: 'hidden', background: C.surf, border: `1px solid ${C.surfB}`, opacity: 1 - i * 0.12 }}>
          <div style={{ height: 2, background: 'rgba(63,255,33,.08)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '72px 68px 1fr 88px 100px 100px 100px', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <div style={{ width: 36, height: 20, borderRadius: 4, background: 'rgba(63,255,33,.1)' }} />
              <div style={{ width: 28, height: 10, borderRadius: 4, background: 'rgba(255,255,255,.05)' }} />
            </div>
            <div style={{ height: 16, borderRadius: 4, background: 'rgba(255,255,255,.06)' }} />
            <div style={{ height: 12, borderRadius: 4, background: 'rgba(255,255,255,.04)' }} />
            <div style={{ height: 10, borderRadius: 4, background: 'rgba(255,255,255,.04)' }} />
            {[0,1,2].map(j => <div key={j} style={{ height: 52, borderRadius: 8, background: j === 0 ? 'rgba(63,255,33,.04)' : 'rgba(255,255,255,.03)' }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function DGOpportunitiesSection() {
  const [opportunities,   setOpportunities]   = useState<DGOpportunity[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [paFilter,        setPaFilter]        = useState<PAFilter>('ALL');
  const [sortBy,          setSortBy]          = useState<SortBy>('maior_lucro');
  const [leagueFilter,    setLeagueFilter]    = useState<Set<string>>(new Set());
  const [leagueModalOpen, setLeagueModalOpen] = useState(false);
  const [bkDeselected,    setBkDeselected]    = useState<Set<string>>(new Set());
  const [bkModalOpen,     setBkModalOpen]     = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // Collapsible + favorite por liga (persistido)
  const [leagueFav,       setLeagueFav]       = useState<Set<string>>(() => new Set(lsGet<string[]>('suredge_dg_fav', [])));
  const [leagueCollapsed, setLeagueCollapsed] = useState<Set<string>>(() => new Set(lsGet<string[]>('suredge_dg_collapsed', [])));

  const toggleLeagueFav = (lg: string) => {
    setLeagueFav(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); lsSet('suredge_dg_fav', [...n]); return n; });
  };
  const toggleCollapse = (lg: string) => {
    setLeagueCollapsed(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); lsSet('suredge_dg_collapsed', [...n]); return n; });
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const res  = await fetch('/api/dg/opportunities?limit=500');
      const data = await res.json() as { ok: boolean; results?: DGOpportunity[]; error?: string };
      if (!data.ok) throw new Error(data.error ?? 'Erro ao carregar');
      setOpportunities(data.results ?? []);
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : 'Erro ao carregar oportunidades');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const allLeagues = useMemo(
    () => [...new Set(opportunities.map(o => o.league ?? 'Outros').filter(Boolean))].sort((a, b) => {
      const aBr = a.toLowerCase().includes('brasil') || a.toLowerCase().includes('série');
      const bBr = b.toLowerCase().includes('brasil') || b.toLowerCase().includes('série');
      if (aBr && !bBr) return -1; if (!aBr && bBr) return 1; return a.localeCompare(b);
    }),
    [opportunities],
  );

  const allBookmakers = useMemo<BkInfo[]>(() => {
    const map = new Map<string, BkInfo>();
    for (const o of opportunities) {
      for (const l of o.legs) {
        if (!map.has(l.bookmakerSlug)) map.set(l.bookmakerSlug, { slug: l.bookmakerSlug, name: l.bookmaker, isPA: isLegPA(l) });
      }
    }
    return Array.from(map.values()).sort((a, b) => { if (a.isPA !== b.isPA) return a.isPA ? -1 : 1; return a.name.localeCompare(b.name); });
  }, [opportunities]);

  const hasAnyDesel = bkDeselected.size > 0;

  const filtered = useMemo(() => opportunities.filter(o => {
    if (leagueFilter.size > 0 && !leagueFilter.has(o.league ?? 'Outros')) return false;
    if (paFilter === 'AMBOS_PA' && paSides(o) < 2)  return false;
    if (paFilter === 'UM_PA'    && paSides(o) !== 1) return false;
    if (hasAnyDesel && !o.legs.some(l => !bkDeselected.has(l.bookmakerSlug))) return false;
    return true;
  }), [opportunities, leagueFilter, paFilter, bkDeselected, hasAnyDesel]);

  const dedupList = useMemo(() => {
    const best = new Map<string, DGOpportunity>();
    for (const o of filtered) {
      const ex = best.get(o.match_id);
      if (!ex || (o.dg_score ?? 0) > (ex.dg_score ?? 0)) best.set(o.match_id, o);
    }
    return Array.from(best.values()).sort((a, b) => {
      if (sortBy === 'maior_lucro') return (b.dg_profit_pct ?? -999) - (a.dg_profit_pct ?? -999);
      if (sortBy === 'menor_lucro') return (a.dg_profit_pct ?? 999)  - (b.dg_profit_pct ?? 999);
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      return ta - tb;
    });
  }, [filtered, sortBy]);

  // Contagens para chips PA
  const cntAll     = opportunities.length;
  const cntAmbosPA = useMemo(() => opportunities.filter(o => paSides(o) >= 2).length, [opportunities]);
  const cntUmPA    = useMemo(() => opportunities.filter(o => paSides(o) === 1).length,  [opportunities]);
  const hasFilter  = paFilter !== 'ALL' || leagueFilter.size > 0 || hasAnyDesel;

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (selectedMatchId) {
    const allForMatch = opportunities.filter(o => o.match_id === selectedMatchId);
    if (!allForMatch.length) { setSelectedMatchId(null); return null; }
    return (
      <>
        <DGStyles />
        <DGDetailPanel matchOpportunities={allForMatch} onBack={() => setSelectedMatchId(null)} />
      </>
    );
  }

  const leagueLabel  = leagueFilter.size > 0 && leagueFilter.size < allLeagues.length ? `${leagueFilter.size} campeonatos` : 'Campeonatos';
  const leagueActive = leagueFilter.size > 0 && leagueFilter.size < allLeagues.length;

  // Agrupar por liga
  const byLeague = useMemo(() => {
    const map = new Map<string, DGOpportunity[]>();
    for (const o of dedupList) {
      const key = o.league ?? 'Outros';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const aFav = leagueFav.has(a), bFav = leagueFav.has(b);
      if (aFav !== bFav) return aFav ? -1 : 1;
      const aBr = a.toLowerCase().includes('brasil') || a.toLowerCase().includes('série');
      const bBr = b.toLowerCase().includes('brasil') || b.toLowerCase().includes('série');
      if (aBr && !bBr) return -1; if (!aBr && bBr) return 1; return a.localeCompare(b);
    });
  }, [dedupList, leagueFav]);

  return (
    <>
      <DGStyles />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── FilterBar sticky ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 14, background: `${C.surf}ee`, border: `1px solid ${C.surfB}`, boxShadow: '0 2px 12px rgba(0,0,0,.3)', position: 'sticky', top: 0, zIndex: 40 }}>

          {/* Campeonatos */}
          <button onClick={() => setLeagueModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, background: leagueActive ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.05)', border: `1px solid ${leagueActive ? C.greenB : C.surfB}`, color: leagueActive ? C.green : C.t2, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Trophy size={11} />{leagueLabel}
            {leagueActive && <span style={{ fontSize: 10, fontWeight: 900, borderRadius: 99, padding: '0 5px', background: 'rgba(63,255,33,.18)', color: C.green }}>{leagueFilter.size}/{allLeagues.length}</span>}
            <ChevronDown size={10} style={{ opacity: .5 }} />
          </button>

          {/* PA chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderRadius: 8, padding: 3, background: 'rgba(255,255,255,.03)', border: `1px solid ${C.surfB}` }}>
            {([
              ['ALL',      'Todos',     cntAll,     C.t2,   '255,255,255'] as const,
              ['AMBOS_PA', 'PA 2 lados',cntAmbosPA, C.green,'63,255,33'  ] as const,
              ['UM_PA',    '1 Lado PA', cntUmPA,    C.amber,'245,158,11' ] as const,
            ]).map(([v, label, cnt, col2, rgb2]) => {
              const active = paFilter === v;
              return (
                <Tip key={v} text={v === 'ALL' ? 'Todas as oportunidades DG.' : v === 'AMBOS_PA' ? 'Ambos os lados (Casa e Fora) têm odd em casas com Pagamento Antecipado.' : 'Apenas um lado tem odd em casa com Pagamento Antecipado.'}>
                  <button onClick={() => setPaFilter(v as PAFilter)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: active ? `rgba(${rgb2},.14)` : 'transparent', color: active ? col2 : C.t3, border: active ? `1px solid rgba(${rgb2},.35)` : '1px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {label}
                    <span style={{ fontSize: 10, fontWeight: 900, borderRadius: 99, padding: '0 4px', background: active ? `rgba(${rgb2},.18)` : 'rgba(255,255,255,.06)', color: active ? col2 : C.t3 }}>{cnt}</span>
                  </button>
                </Tip>
              );
            })}
          </div>

          {/* Casas */}
          <button onClick={() => setBkModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, background: hasAnyDesel ? C.amberDim : 'rgba(255,255,255,.05)', border: `1px solid ${hasAnyDesel ? C.amberB : C.surfB}`, color: hasAnyDesel ? C.amber : C.t2, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <X size={11} style={{ opacity: hasAnyDesel ? 1 : .4 }} />Casas
            {hasAnyDesel && <span style={{ fontSize: 10, fontWeight: 900, borderRadius: 99, padding: '0 4px', background: C.amberDim, color: C.amber }}>-{bkDeselected.size}</span>}
          </button>

          {/* Ordenar */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={{ height: 34, padding: '0 10px', borderRadius: 8, background: 'rgba(255,255,255,.05)', border: `1px solid ${C.surfB}`, color: C.t2, fontSize: 12, cursor: 'pointer', outline: 'none' }}>
            <option value="maior_lucro">Maior Lucro DG</option>
            <option value="menor_lucro">Menor Lucro DG</option>
            <option value="recentes">Mais Recentes</option>
          </select>

          {hasFilter && (
            <button onClick={() => { setPaFilter('ALL'); setBkDeselected(new Set()); setLeagueFilter(new Set()); }} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 34, padding: '0 10px', borderRadius: 8, color: C.red, background: C.redDim, border: '1px solid rgba(248,113,113,.2)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              <X size={10} />Limpar
            </button>
          )}

          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.t3, whiteSpace: 'nowrap' }}>{dedupList.length} oportunidades</span>

          <button onClick={() => load()} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, background: 'rgba(255,255,255,.04)', border: `1px solid ${C.surfB}`, color: C.t3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={11} /> Atualizar
          </button>
        </div>

        {/* Modais */}
        {leagueModalOpen && <LeagueFilterModal leagues={allLeagues} selected={leagueFilter} onChange={setLeagueFilter} onClose={() => setLeagueModalOpen(false)} />}
        {bkModalOpen && <BookmakerModal bookmakers={allBookmakers} deselected={bkDeselected} onChange={setBkDeselected} onClose={() => setBkModalOpen(false)} />}

        {/* Loading */}
        {loading && <DGSkeleton />}

        {/* Error */}
        {!loading && error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: '12px 16px', background: C.redDim, border: '1px solid rgba(248,113,113,.25)', color: C.red, fontSize: 13 }}>
            ⚠ {error}
            <button onClick={() => load()} style={{ marginLeft: 'auto', fontSize: 12, color: C.purple, background: 'none', border: 'none', cursor: 'pointer' }}>Tentar novamente</button>
          </div>
        )}

        {/* Sem dados */}
        {!loading && !error && opportunities.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: 12, color: C.t3 }}>
            <ScanSearch size={36} style={{ opacity: .2 }} />
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Nenhuma oportunidade importada</p>
            <p style={{ fontSize: 12, opacity: .6, textAlign: 'center', maxWidth: 280, margin: 0 }}>Importe o arquivo de oportunidades DuploGreen via painel Admin.</p>
          </div>
        )}

        {/* Sem resultados com filtro */}
        {!loading && !error && opportunities.length > 0 && dedupList.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 12, color: C.t3 }}>
            <ScanSearch size={32} style={{ opacity: .2 }} />
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Nenhuma oportunidade para os filtros</p>
            {hasFilter && (
              <button onClick={() => { setPaFilter('ALL'); setBkDeselected(new Set()); setLeagueFilter(new Set()); }} style={{ borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 700, color: C.green, background: C.greenDim, border: `1px solid ${C.greenB}`, cursor: 'pointer' }}>Limpar filtros</button>
            )}
          </div>
        )}

        {/* ── Cabeçalho de colunas (desktop) ────────────────────────────── */}
        {!loading && byLeague.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '72px 68px 1fr 88px 100px 100px 100px', alignItems: 'center', gap: 8, padding: '0 20px 4px', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.t3 }}>
            <Tip text="DG Score: probabilidade do Duplo Green acontecer (0–100). Não representa lucro.">
              <span style={{ cursor: 'default' }}>Score ⓘ</span>
            </Tip>
            <Tip text="DG Profit: percentual de lucro estimado pelo algoritmo Duplo Green Engine.">
              <span style={{ textAlign: 'center', cursor: 'default' }}>DG Profit ⓘ</span>
            </Tip>
            <span>Jogo</span>
            <span style={{ textAlign: 'center' }}>Hora</span>
            <span style={{ textAlign: 'center' }}>Casa (1)</span>
            <span style={{ textAlign: 'center' }}>Empate (X)</span>
            <span style={{ textAlign: 'center' }}>Fora (2)</span>
          </div>
        )}

        {/* ── Grupos por liga ───────────────────────────────────────────── */}
        {!loading && byLeague.map(([league, evs]) => {
          const isFav       = leagueFav.has(league);
          const isCollapsed = leagueCollapsed.has(league);

          return (
            <div key={league} style={{ overflow: 'hidden', borderRadius: 16, background: `${C.surf}cc`, border: `1px solid ${isFav ? C.greenB : C.surfB}`, boxShadow: isFav ? `0 4px 24px rgba(0,0,0,.4),0 0 16px rgba(63,255,33,.05)` : '0 4px 20px rgba(0,0,0,.4)', marginBottom: 4 }}>
              <div style={{ height: 2, background: isFav ? `linear-gradient(90deg,${C.green} 0%,${C.green}44 55%,transparent 100%)` : `linear-gradient(90deg,rgba(63,255,33,.35) 0%,rgba(63,255,33,.08) 55%,transparent 100%)` }} />

              {/* Liga header */}
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

              {/* Linhas */}
              {!isCollapsed && (
                <div>
                  {evs.map((o, idx) => {
                    const rgb2     = dgRGB(o.dg_classification);
                    const col2     = dgColor(o.dg_classification);
                    const homeIsPA = o.legs.some(l => l.outcome === 'home' && isLegPA(l));
                    const awayIsPA = o.legs.some(l => l.outcome === 'away' && isLegPA(l));
                    const paStr    = (homeIsPA && awayIsPA) ? 'Ambos PA' : '';
                    const oppCount = filtered.filter(x => x.match_id === o.match_id).length;
                    const legH     = o.legs.find(l => l.outcome === 'home');
                    const legD     = o.legs.find(l => l.outcome === 'draw');
                    const legA     = o.legs.find(l => l.outcome === 'away');

                    return (
                      <button key={o.id} type="button" onClick={() => setSelectedMatchId(o.match_id)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: idx % 2 === 1 ? 'rgba(255,255,255,.012)' : undefined, borderTop: idx > 0 ? `1px solid ${C.surfB}` : undefined, border: 'none', cursor: 'pointer' }}>

                        {/* Desktop row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '72px 68px 1fr 88px 100px 100px 100px', alignItems: 'center', gap: 8, padding: '12px 16px 12px 20px' }}>
                          {/* Score */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <Tip text={`Score DG: ${o.dg_score}. Classificação: ${o.dg_classification}. Probabilidade de duplo green.`}>
                              <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: col2, cursor: 'default' }}>{o.dg_score ?? '—'}</span>
                            </Tip>
                            <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, color: `rgba(${rgb2},.5)` }}>{o.dg_classification ?? ''}</span>
                            {paStr && (
                              <Tip text="Ambos os lados têm a melhor odd em casas com Pagamento Antecipado.">
                                <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 4px', background: C.amberDim, color: C.amber, border: `1px solid ${C.amberB}`, cursor: 'default' }}>{paStr}</span>
                              </Tip>
                            )}
                          </div>
                          {/* DG Profit */}
                          <Tip text={`DG Profit estimado: ${fmtProfit(o.dg_profit_pct)}. Perda máxima estimada: ${o.max_loss_pct != null ? '-' + Math.abs(o.max_loss_pct).toFixed(1) + '%' : '—'}.`}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'default' }}>
                              <span style={{ fontSize: 13, fontWeight: 900, color: profitColor(o.dg_profit_pct) }}>{fmtProfit(o.dg_profit_pct)}</span>
                              {o.max_loss_pct != null && <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(248,113,113,.6)' }}>-{Math.abs(o.max_loss_pct).toFixed(1)}% perda</span>}
                            </div>
                          </Tip>
                          {/* Jogo */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, color: C.t1, margin: 0 }}>{o.home_team}</p>
                              {oppCount > 1 && (
                                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '1px 5px', background: `rgba(${rgb2},.1)`, color: col2, border: `1px solid rgba(${rgb2},.2)` }}>+{oppCount - 1}</span>
                              )}
                            </div>
                            <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: C.t3, margin: 0 }}>{o.away_team}</p>
                          </div>
                          {/* Hora */}
                          <span style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: C.t3 }}>{fmtTimeShort(o.kickoff)}</span>
                          <LegCell leg={legH} />
                          <LegCell leg={legD} />
                          <LegCell leg={legA} />
                        </div>

                        {/* Mobile row */}
                        <div className="flex items-center gap-3 px-4 py-3 md:hidden">
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 40 }}>
                            <span style={{ fontSize: 17, fontWeight: 900, lineHeight: 1, color: col2 }}>{o.dg_score ?? '—'}</span>
                            <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, color: `rgba(${rgb2},.5)` }}>{o.dg_classification}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: C.t1, margin: 0 }}>{o.home_team} x {o.away_team}</p>
                            <p style={{ fontSize: 11, color: C.t3, margin: '2px 0 0' }}>
                              {fmtTimeShort(o.kickoff)}
                              {o.dg_profit_pct != null && <span style={{ marginLeft: 6, fontWeight: 900, color: profitColor(o.dg_profit_pct) }}>{fmtProfit(o.dg_profit_pct)}</span>}
                              {paStr && <span style={{ marginLeft: 6, fontWeight: 700, color: C.amber }}>· {paStr}</span>}
                            </p>
                          </div>
                          <ChevronDown size={14} style={{ flexShrink: 0, opacity: .3, color: C.t3, transform: 'rotate(-90deg)' }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
