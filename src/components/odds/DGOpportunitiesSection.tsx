'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, RefreshCw, ChevronLeft, ChevronRight, ArrowDown, ArrowUpDown, Check, X, Trophy } from 'lucide-react';
import { SurebetCalc } from '@/components/calcalendario/SurebetCalc';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Leg {
  bookmaker:     string;
  bookmakerSlug: string;
  odd:           number;
  outcome:       string;
  matchUrl?:     string | null;
  isPA?:         boolean | null;
}

interface DGOpportunity {
  id:                string;
  match_id:          string;
  home_team:         string;
  away_team:         string;
  league:            string | null;
  league_slug:       string | null;
  kickoff:           string | null;
  max_loss_pct:      number | null;
  dg_profit_pct:     number | null;
  dg_score:          number | null;
  dg_classification: string | null;
  legs:              Leg[];
}

type PAFilter = 'ALL' | 'AMBOS_PA' | 'UM_PA';
type SortBy   = 'maior_lucro' | 'menor_lucro' | 'recentes';

const SORT_OPTS: { value: SortBy; label: string }[] = [
  { value: 'maior_lucro', label: 'Maior Lucro DG' },
  { value: 'menor_lucro', label: 'Menor Lucro DG' },
  { value: 'recentes',    label: 'Mais Recentes'  },
];

// ── Casas com PA ─────────────────────────────────────────────────────────────
// Lista expandida — mantida em sincronia com BuscarOddsPage.tsx

const PA_SET_DG = new Set([
  'betano','bet365','betfair','kto','superbet','vivasorte','betao',
  '7games','betesporte','novibet','estrelabet','esportivabet','jogodeouro',
  '7k','bet7k','versusbet','meridianbet','betmgm','betsson','betvip',
  'br4bet','br4','esportesdasorte','vaidebet','pixbet','sportingbet',
  'apostabeat','apostabet','lotogreen','betpix365','betpix','f12',
  'vupibet','vupibr','vupi','sortenabet','sorte','brasilbet',
  'esportivabr','estrelabeat','betnacional','pixbetsports',
  'betnow','sportbr','betbr','apostaganha',
]);

function normSlugDG(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.]/g, '');
}

function isSlugPA(slug: string): boolean {
  if (!slug) return false;
  const n = normSlugDG(slug);
  if (PA_SET_DG.has(n)) return true;
  for (const pa of PA_SET_DG) {
    if (n.includes(pa) || pa.includes(n)) return true;
    const prefix = Math.min(n.length, pa.length, 6);
    if (prefix >= 4 && n.slice(0, prefix) === pa.slice(0, prefix)) return true;
  }
  return false;
}

function isLegPA(leg: Leg): boolean {
  if (leg.isPA === true)  return true;
  if (leg.isPA === false) return false;
  return isSlugPA(leg.bookmakerSlug ?? '');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(utc: string | null): string {
  if (!utc) return '—';
  try {
    return new Date(utc).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  } catch { return utc; }
}

function classColor(c: string | null): string {
  if (c === 'ALTA')  return 'hsl(150 90% 58%)';
  if (c === 'MEDIA') return 'hsl(38 95% 65%)';
  return 'rgba(255,255,255,.4)';
}
function classRgb(c: string | null): string {
  if (c === 'ALTA')  return '61,255,143';
  if (c === 'MEDIA') return '255,159,10';
  return '129,140,248';
}
function profitColor(pct: number | null): string {
  if (pct == null) return 'rgba(255,255,255,.3)';
  return pct >= 0 ? 'hsl(150 85% 60%)' : 'hsl(0 80% 65%)';
}
function fmtProfit(pct: number | null): string {
  if (pct == null) return '—';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

// ── Célula de leg ─────────────────────────────────────────────────────────────

function LegCell({ leg, highlight }: { leg: Leg | undefined; highlight?: boolean }) {
  if (!leg) return (
    <div className="flex justify-center">
      <span style={{ color: 'rgba(255,255,255,.12)', fontSize: 11 }}>—</span>
    </div>
  );
  const pa = isLegPA(leg);
  return (
    <div className="relative flex h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-lg"
      style={{
        background: pa
          ? 'rgba(61,255,143,.05)'
          : 'rgba(255,255,255,.025)',
        border: pa
          ? '1px solid rgba(61,255,143,.2)'
          : '1px solid rgba(255,255,255,.07)',
      }}>
      <span className="tabular-nums text-[15px] font-black" style={{
        color: pa ? 'hsl(150 85% 62%)' : 'rgba(255,255,255,.75)',
        textShadow: pa ? '0 0 10px hsl(150 85% 55% / 0.35)' : 'none',
      }}>
        {leg.odd.toFixed(2)}
      </span>

      {/* nome da casa + link */}
      {leg.matchUrl ? (
        <a href={leg.matchUrl} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-0.5 transition-colors hover:opacity-80 max-w-full px-1"
          style={{ color: 'rgba(255,255,255,.35)', fontSize: 9 }}>
          <ExternalLink size={8} className="shrink-0 opacity-60" />
          <span className="truncate">{leg.bookmaker}</span>
        </a>
      ) : (
        <span className="max-w-full truncate px-1 text-[9px]"
          style={{ color: pa ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.3)' }}>
          {leg.bookmaker}
        </span>
      )}

      {/* badge PA / SO */}
      <span className="absolute -right-1 -top-1 rounded border px-[3px] py-px text-[7px] font-bold"
        style={pa
          ? { background: 'rgba(61,255,143,.1)',  color: 'rgba(61,255,143,.85)',  borderColor: 'rgba(61,255,143,.25)' }
          : { background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.3)',  borderColor: 'rgba(255,255,255,.12)' }
        }>
        {pa ? 'PA' : 'SO'}
      </span>
    </div>
  );
}

// ── Modal de casas ────────────────────────────────────────────────────────────

interface BkInfo { slug: string; name: string; isPA: boolean; }

/** Deselected = oculto dos resultados (igual ao modal da BuscarOddsPage) */
function BookmakerModal({
  bookmakers,
  deselected,
  onChange,
  onClose,
}: {
  bookmakers: BkInfo[];
  deselected: Set<string>;
  onChange: (next: Set<string>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(new Set(deselected));

  function toggle(slug: string) {
    setDraft(prev => {
      const n = new Set(prev);
      n.has(slug) ? n.delete(slug) : n.add(slug);
      return n;
    });
  }
  function deselectAll() { setDraft(new Set(bookmakers.map(b => b.slug))); }
  function selectAll()   { setDraft(new Set()); }

  const paList    = bookmakers.filter(b => b.isPA);
  const nonPaList = bookmakers.filter(b => !b.isPA);
  const selectedCount = bookmakers.length - draft.size;

  function BkCheck({ bk }: { bk: BkInfo }) {
    const sel = !draft.has(bk.slug);
    return (
      <button type="button" onClick={() => toggle(bk.slug)}
        className="flex items-center gap-2 py-1 text-left transition-opacity hover:opacity-80"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: sel ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.3)' }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: sel ? 'hsl(150 85% 55%)' : 'rgba(255,255,255,.06)',
          border: `1.5px solid ${sel ? 'hsl(150 85% 55%)' : 'rgba(255,255,255,.15)'}`,
        }}>
          {sel && <Check size={11} color="#060A07" strokeWidth={3} />}
        </span>
        <span style={{ fontSize: 13, fontWeight: sel ? 600 : 400 }}>{bk.name}</span>
        {!bk.isPA && (
          <span className="rounded border px-[3px] py-px text-[7px] font-bold"
            style={{ background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.3)', borderColor: 'rgba(255,255,255,.12)' }}>
            SO
          </span>
        )}
      </button>
    );
  }

  function Section({ title, list, accent }: { title: string; list: BkInfo[]; accent: string }) {
    if (!list.length) return null;
    return (
      <div className="mb-4">
        <div className="mb-2.5 flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ width: 3, height: 12, borderRadius: 2, background: accent }} />
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</span>
          <span className="rounded-full px-1.5 py-px text-[9px] font-bold" style={{ background: `${accent}22`, color: accent }}>
            {list.length}
          </span>
        </div>
        <div className="grid gap-y-0.5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {list.map(bk => <BkCheck key={bk.slug} bk={bk} />)}
        </div>
      </div>
    );
  }

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0e131a',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 16,
        boxShadow: '0 24px 80px rgba(0,0,0,.8)',
        width: 680, maxWidth: '95vw', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,.9)', margin: 0 }}>Casas de Apostas</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', padding: '8px 24px 0', margin: 0 }}>
          Desmarque as casas que não utiliza para filtrar oportunidades.
        </p>

        {/* Lista */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          <Section title="Com Pagamento Antecipado (PA)" list={paList} accent="rgba(61,255,143,.85)" />
          <Section title="Sem Pagamento Antecipado" list={nonPaList} accent="rgba(129,140,248,.75)" />
          {!paList.length && !nonPaList.length && (
            <p className="py-8 text-center text-sm" style={{ color: 'rgba(255,255,255,.3)' }}>
              Nenhuma casa encontrada nos dados importados
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.35)' }}>
            {selectedCount} de {bookmakers.length} selecionadas
          </span>
          <div className="flex gap-2">
            <button onClick={draft.size === bookmakers.length ? selectAll : deselectAll}
              className="rounded-xl px-4 py-2 text-[12px] font-bold hover:bg-white/10 transition-colors"
              style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.5)' }}>
              {draft.size === bookmakers.length ? 'Marcar todas' : 'Desmarcar todas'}
            </button>
            <button onClick={() => { onChange(draft); onClose(); }}
              className="rounded-xl px-5 py-2 text-[12px] font-black transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #3DFF8F 0%, #22c55e 100%)', color: '#060A07' }}>
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Painel de detalhe ─────────────────────────────────────────────────────────

function DGDetailPanel({
  matchOpportunities,
  fixedSlugs,
  onBack,
}: {
  matchOpportunities: DGOpportunity[];
  fixedSlugs: Set<string>;
  onBack: () => void;
}) {
  const [sortCol, setSortCol]   = useState<'score' | 'profit' | 'home' | 'draw' | 'away'>('score');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calcKey, setCalcKey]   = useState(0);
  const [calcFill, setCalcFill] = useState<{ odds: string[]; houses: string[]; urls: string[] } | null>(null);
  const calcRef = useRef<HTMLDivElement>(null);

  const o   = matchOpportunities[0];
  const rgb = classRgb(o.dg_classification);
  const col = classColor(o.dg_classification);

  const sorted = useMemo(() => {
    return [...matchOpportunities].sort((a, b) => {
      if (sortCol === 'score')  return (b.dg_score ?? 0) - (a.dg_score ?? 0);
      if (sortCol === 'profit') return (b.dg_profit_pct ?? -999) - (a.dg_profit_pct ?? -999);
      const legA = a.legs.find(l => l.outcome === sortCol);
      const legB = b.legs.find(l => l.outcome === sortCol);
      return (legB?.odd ?? 0) - (legA?.odd ?? 0);
    });
  }, [matchOpportunities, sortCol]);

  function selectOpportunity(opp: DGOpportunity) {
    if (selectedId === opp.id) { setSelectedId(null); setCalcFill(null); return; }
    setSelectedId(opp.id);
    const legs = [
      opp.legs.find(l => l.outcome === 'home'),
      opp.legs.find(l => l.outcome === 'draw'),
      opp.legs.find(l => l.outcome === 'away'),
    ].filter(Boolean) as Leg[];
    if (!legs.length) return;
    setCalcFill({
      odds:   legs.map(l => String(l.odd)),
      houses: legs.map(l => l.bookmaker),
      urls:   legs.map(l => l.matchUrl ?? ''),
    });
    setCalcKey(k => k + 1);
    setTimeout(() => calcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  }

  const cols: { key: typeof sortCol; label: string }[] = [
    { key: 'score',  label: 'Score' },
    { key: 'profit', label: 'DG Profit' },
    { key: 'home',   label: 'Casa (1)' },
    { key: 'draw',   label: 'Empate (X)' },
    { key: 'away',   label: 'Fora (2)' },
  ];

  const hasPA   = matchOpportunities.some(op => op.legs.some(l => isLegPA(l)));
  const totalPA = o.legs.filter(l => isLegPA(l)).length;
  const paLabel = totalPA >= 2 ? 'Ambos PA' : totalPA === 1 ? '1 Lado PA' : '';

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{
        background: 'rgba(13,17,23,0.85)',
        border: `1px solid rgba(${rgb},.25)`,
        borderLeft: `3px solid rgb(${rgb})`,
        boxShadow: `0 4px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(${rgb},.06) inset`,
        backdropFilter: 'blur(20px)',
      }}>
        <button onClick={onBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/10"
          style={{ background: `rgba(${rgb},.1)`, border: `1px solid rgba(${rgb},.2)`, color: `rgb(${rgb})` }}>
          <ChevronLeft size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="truncate text-[15px] font-black tracking-tight" style={{ color: 'var(--t)' }}>
            {o.home_team} x {o.away_team}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: 'var(--t3)' }}>
            <span>{o.league ?? '—'} · {fmtTime(o.kickoff)}</span>
            {hasPA && paLabel && (
              <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{
                background: 'rgba(255,159,10,.1)', color: 'rgba(255,159,10,.8)', border: '1px solid rgba(255,159,10,.2)',
              }}>{paLabel}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center rounded-xl px-3 py-1.5 shrink-0" style={{
          background: `rgba(${rgb},.1)`, border: `1px solid rgba(${rgb},.25)`,
        }}>
          <span className="text-[22px] font-black leading-none tabular-nums" style={{ color: col }}>
            {o.dg_score ?? '—'}
          </span>
          <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: `rgba(${rgb},.55)` }}>
            DG score
          </span>
          {o.dg_profit_pct != null && (
            <span className="text-[9px] font-bold tabular-nums mt-0.5" style={{ color: profitColor(o.dg_profit_pct) }}>
              {fmtProfit(o.dg_profit_pct)}
            </span>
          )}
        </div>
      </div>

      {/* Tabela de combinações */}
      <div className="overflow-hidden rounded-2xl" style={{
        background: `rgba(${rgb},.02)`,
        border: `1px solid rgba(${rgb},.18)`,
        boxShadow: `0 4px 24px rgba(0,0,0,.35), 0 0 0 1px rgba(${rgb},.06) inset`,
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ height: 2, background: `linear-gradient(90deg, rgba(${rgb},.9) 0%, rgba(${rgb},.3) 60%, transparent 100%)` }} />
        <div className="flex items-center justify-between px-5 py-3" style={{
          background: `linear-gradient(90deg, rgba(${rgb},.08) 0%, transparent 70%)`,
          borderBottom: `1px solid rgba(${rgb},.12)`,
        }}>
          <div className="flex items-center gap-2.5">
            <div style={{ width: 3, height: 14, borderRadius: 2, background: `rgb(${rgb})` }} />
            <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: col }}>
              Combinações DuploGreen
            </span>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{
              background: `rgba(${rgb},.12)`, color: col, border: `1px solid rgba(${rgb},.25)`,
            }}>
              {matchOpportunities.length}
            </span>
          </div>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.25)' }}>clique para calcular</p>
        </div>

        {/* Col headers */}
        <div className="grid items-center gap-2 px-5 py-2.5" style={{
          gridTemplateColumns: '20px 72px 68px 1fr 1fr 1fr',
          background: 'rgba(255,255,255,.015)',
          borderBottom: '1px solid rgba(255,255,255,.05)',
        }}>
          <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 10, fontWeight: 700 }}>#</span>
          {cols.map(c => (
            <button key={c.key} type="button" onClick={() => setSortCol(c.key)}
              className="flex items-center justify-center gap-0.5 transition-colors"
              style={{
                fontSize: 11, fontWeight: 700,
                color: sortCol === c.key ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.3)',
                borderBottom: sortCol === c.key ? `2px solid rgba(${rgb},.7)` : '2px solid transparent',
                paddingBottom: 2,
              }}>
              {c.label}
              {sortCol === c.key && <ArrowDown size={9} style={{ marginLeft: 2 }} />}
            </button>
          ))}
        </div>

        <div>
          {sorted.map((opp, idx) => {
            const legHome    = opp.legs.find(l => l.outcome === 'home');
            const legDraw    = opp.legs.find(l => l.outcome === 'draw');
            const legAway    = opp.legs.find(l => l.outcome === 'away');
            const isSelected = selectedId === opp.id;
            const isBest     = idx === 0;
            const hasFixed   = opp.legs.some(l => fixedSlugs.has(l.bookmakerSlug));

            return (
              <button key={opp.id} type="button" onClick={() => selectOpportunity(opp)}
                className="odds-row w-full text-left"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 72px 68px 1fr 1fr 1fr',
                  alignItems: 'center', gap: '0.5rem', padding: '12px 20px',
                  background: isSelected ? `rgba(${rgb},.10)` : isBest ? `rgba(${rgb},.05)` : idx % 2 === 1 ? 'rgba(255,255,255,.012)' : undefined,
                  borderTop: idx > 0 ? '1px solid rgba(255,255,255,.04)' : undefined,
                  borderLeft: isSelected ? `3px solid rgba(${rgb},.7)` : hasFixed ? '3px solid rgba(168,85,247,.5)' : '3px solid transparent',
                } as React.CSSProperties}>
                <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,.2)' }}>{idx + 1}</span>
                <div className="flex flex-col items-center gap-0.5">
                  <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: (isBest || isSelected) ? col : 'rgba(255,255,255,.7)', textShadow: (isBest || isSelected) ? `0 0 12px rgba(${rgb},.4)` : 'none' }}>
                    {opp.dg_score ?? '—'}
                  </span>
                  <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', color: `rgba(${rgb},.4)` }}>
                    {opp.dg_classification ?? ''}
                    {isSelected ? ' ✓' : ''}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span style={{ fontSize: 13, fontWeight: 900, color: profitColor(opp.dg_profit_pct) }}>
                    {fmtProfit(opp.dg_profit_pct)}
                  </span>
                  {opp.max_loss_pct != null && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(248,113,113,.6)' }}>
                      -{Math.abs(opp.max_loss_pct).toFixed(1)}% perda
                    </span>
                  )}
                </div>
                <LegCell leg={legHome} highlight={legHome ? fixedSlugs.has(legHome.bookmakerSlug) : false} />
                <LegCell leg={legDraw} highlight={legDraw ? fixedSlugs.has(legDraw.bookmakerSlug) : false} />
                <LegCell leg={legAway} highlight={legAway ? fixedSlugs.has(legAway.bookmakerSlug) : false} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Calculadora */}
      {calcFill && (
        <div key={calcKey} ref={calcRef} className="calc-reveal overflow-hidden rounded-2xl" style={{
          background: 'rgba(13,17,23,0.75)',
          border: `1px solid rgba(${rgb},.28)`,
          boxShadow: `0 4px 28px rgba(0,0,0,.4), 0 0 20px rgba(${rgb},.05) inset`,
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ height: 2, background: `linear-gradient(90deg, rgba(${rgb},.8) 0%, rgba(${rgb},.2) 60%, transparent 100%)` }} />
          <div className="flex items-center justify-between px-5 py-3" style={{
            background: `linear-gradient(90deg, rgba(${rgb},.07) 0%, transparent 60%)`,
            borderBottom: `1px solid rgba(${rgb},.1)`,
          }}>
            <div className="flex items-center gap-2">
              <div style={{ width: 3, height: 14, borderRadius: 2, background: `rgb(${rgb})` }} />
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: col }}>
                Calculadora
              </span>
            </div>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)' }}>odds pré-carregadas · ajuste livremente</span>
          </div>
          <div className="p-4">
            <SurebetCalc
              selectedEvent={{ name: `${o.home_team} x ${o.away_team}`, start_utc: o.kickoff ?? '' }}
              externalFill={calcFill}
              defaultNumOutcomes={3}
              hideNumOutcomes
              hideFormula
              accent="#3DFF8F"
              initialOpType="duplo_green"
            />
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: 'rgba(255,255,255,.25)', paddingLeft: 4 }}>
        👆 Clique numa linha para calcular stakes · clique no nome da casa para abrir na plataforma
      </p>
    </div>
  );
}

// ── Cores locais (espelha palette do BuscarOddsPage) ─────────────────────────
const DG_C = {
  green:  '#00e676', greenDim: 'rgba(0,230,118,.12)', greenB: 'rgba(0,230,118,.3)',
  surf: '#10141a', surfB: '#1a2030',
  t1: '#e2e8f0', t2: '#94a3b8', t3: '#64748b',
};

// ── Modal de campeonatos (multi-select) ───────────────────────────────────────

function LeagueFilterModal({
  leagues, selected, onChange, onClose,
}: {
  leagues:  string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onClose:  () => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(() =>
    selected.size === 0 ? new Set(leagues) : new Set(selected),
  );

  function toggle(lg: string) {
    setDraft(prev => { const n = new Set(prev); n.has(lg) ? n.delete(lg) : n.add(lg); return n; });
  }
  const allSelected  = draft.size === leagues.length;

  function confirm() {
    onChange(allSelected ? new Set() : new Set(draft));
    onClose();
  }

  const sorted = [...leagues].sort((a, b) => {
    const aBr = a.toLowerCase().includes('brasil') || a.toLowerCase().includes('série');
    const bBr = b.toLowerCase().includes('brasil') || b.toLowerCase().includes('série');
    if (aBr && !bBr) return -1; if (!aBr && bBr) return 1;
    return a.localeCompare(b);
  });

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0d1117', border: `1px solid ${DG_C.surfB}`,
        borderRadius: 18, boxShadow: '0 28px 80px rgba(0,0,0,.8)',
        width: 560, maxWidth: '95vw', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div className="flex items-start justify-between px-6 pt-5 pb-4" style={{ borderBottom: `1px solid ${DG_C.surfB}` }}>
          <div>
            <div className="flex items-center gap-2">
              <Trophy size={16} style={{ color: DG_C.green }} />
              <h3 style={{ fontSize: 17, fontWeight: 900, color: DG_C.t1, margin: 0 }}>Campeonatos</h3>
            </div>
            <p style={{ fontSize: 12, color: DG_C.t3, marginTop: 3 }}>Selecione os campeonatos que deseja ver.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: DG_C.t3, padding: 4, marginTop: -2 }}>
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {sorted.map(lg => {
              const sel = draft.has(lg);
              return (
                <button key={lg} type="button" onClick={() => toggle(lg)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all hover:opacity-90"
                  style={{
                    background: sel ? 'rgba(0,230,118,.1)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${sel ? DG_C.greenB : DG_C.surfB}`,
                    cursor: 'pointer',
                  }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: sel ? DG_C.green : 'rgba(255,255,255,.06)',
                    border: `1.5px solid ${sel ? DG_C.green : 'rgba(255,255,255,.15)'}`,
                  }}>
                    {sel && <Check size={10} color="#060A07" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? DG_C.t1 : DG_C.t2 }}>
                    {lg}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3 px-6 py-4" style={{ borderTop: `1px solid ${DG_C.surfB}` }}>
          <button onClick={() => setDraft(new Set(leagues))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: DG_C.t3, textDecoration: 'underline', padding: 0 }}>
            Marcar todas
          </button>
          <button onClick={() => setDraft(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: DG_C.t3, textDecoration: 'underline', padding: 0 }}>
            Limpar seleção
          </button>
          <span className="flex-1" />
          <span style={{ fontSize: 12, fontWeight: 700, color: DG_C.t3 }}>
            {draft.size} de {leagues.length} selecionados
          </span>
          <button onClick={confirm}
            className="rounded-xl px-5 py-2 text-[13px] font-black transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #3DFF8F 0%, #22c55e 100%)', color: '#0a1a0f' }}>
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DGOpportunitiesSection() {
  const [opportunities,   setOpportunities]   = useState<DGOpportunity[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [paFilter,        setPaFilter]        = useState<PAFilter>('ALL');
  const [leagueFilter,    setLeagueFilter]    = useState<Set<string>>(new Set()); // empty = todos
  const [leagueModalOpen, setLeagueModalOpen] = useState(false);
  const [sortBy,          setSortBy]          = useState<SortBy>('maior_lucro');
  const [sortOpen,        setSortOpen]        = useState(false);
  const [bkDeselected,    setBkDeselected]    = useState<Set<string>>(new Set());
  const [bkModalOpen,     setBkModalOpen]     = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    function handleDown(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    }
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [sortOpen]);

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

  // Ligas únicas
  const allLeagues = useMemo(
    () => [...new Set(opportunities.map(o => o.league ?? 'Outros').filter(Boolean))].sort((a, b) => {
      const aBr = a.toLowerCase().includes('brasil') || a.toLowerCase().includes('série');
      const bBr = b.toLowerCase().includes('brasil') || b.toLowerCase().includes('série');
      if (aBr && !bBr) return -1; if (!aBr && bBr) return 1;
      return a.localeCompare(b);
    }),
    [opportunities],
  );

  // Bookmakers únicos com metadados
  const allBookmakers = useMemo<BkInfo[]>(() => {
    const map = new Map<string, BkInfo>();
    for (const o of opportunities) {
      for (const l of o.legs) {
        if (!map.has(l.bookmakerSlug)) {
          map.set(l.bookmakerSlug, {
            slug:  l.bookmakerSlug,
            name:  l.bookmaker,
            isPA:  isLegPA(l),
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.isPA !== b.isPA) return a.isPA ? -1 : 1; // PA first
      return a.name.localeCompare(b.name);
    });
  }, [opportunities]);

  const fixedSlugs   = useMemo(() => new Set<string>(), []); // sem fixed no novo modelo
  const hasAnyDesel  = bkDeselected.size > 0;

  // ── Filtro principal ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return opportunities.filter(o => {
      // Liga filter
      if (leagueFilter.size > 0 && !leagueFilter.has(o.league ?? 'Outros')) return false;

      // PA filter
      const paCount = o.legs.filter(l => isLegPA(l)).length;
      if (paFilter === 'AMBOS_PA' && paCount < 2)  return false;
      if (paFilter === 'UM_PA'    && paCount !== 1) return false;

      // Bookmaker deselect: ocultar oportunidades onde TODAS as legs estão desativadas
      if (hasAnyDesel) {
        const hasActive = o.legs.some(l => !bkDeselected.has(l.bookmakerSlug));
        if (!hasActive) return false;
      }

      return true;
    });
  }, [opportunities, leagueFilter, paFilter, bkDeselected, hasAnyDesel]);

  // Melhor por match (maior score), ordenado conforme sortBy
  const dedupList = useMemo(() => {
    const best = new Map<string, DGOpportunity>();
    for (const o of filtered) {
      const ex = best.get(o.match_id);
      if (!ex || (o.dg_score ?? 0) > (ex.dg_score ?? 0)) best.set(o.match_id, o);
    }
    return Array.from(best.values()).sort((a, b) => {
      if (sortBy === 'maior_lucro') return (b.dg_profit_pct ?? -999) - (a.dg_profit_pct ?? -999);
      if (sortBy === 'menor_lucro') return (a.dg_profit_pct ?? 999)  - (b.dg_profit_pct ?? 999);
      if (sortBy === 'recentes') {
        const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
        const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
        return ta - tb;
      }
      return 0;
    });
  }, [filtered, sortBy]);

  // ── Detail view ───────────────────────────────────────────────────────────
  if (selectedMatchId) {
    const allForMatch = opportunities.filter(o => o.match_id === selectedMatchId);
    if (!allForMatch.length) { setSelectedMatchId(null); return null; }
    return (
      <DGDetailPanel
        matchOpportunities={allForMatch}
        fixedSlugs={fixedSlugs}
        onBack={() => setSelectedMatchId(null)}
      />
    );
  }

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[72px] rounded-2xl animate-pulse"
          style={{ background: 'rgba(61,255,143,.04)', border: '1px solid rgba(61,255,143,.08)', opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.2)', color: '#f87171' }}>
      ⚠ {error}
      <button onClick={() => load()} className="ml-auto text-xs"
        style={{ color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer' }}>
        Tentar novamente
      </button>
    </div>
  );

  if (opportunities.length === 0) return (
    <div className="flex flex-col items-center gap-3 py-16" style={{ color: 'var(--t3)' }}>
      <p className="text-sm font-bold">Nenhuma oportunidade importada</p>
      <p className="text-xs opacity-60 text-center max-w-xs">
        Importe o arquivo de oportunidades DuploGreen via painel Admin.
      </p>
    </div>
  );

  // Contagens para badges
  const cntAmbosPa = opportunities.filter(o => o.legs.filter(l => isLegPA(l)).length >= 2).length;
  const cntUmPa    = opportunities.filter(o => o.legs.filter(l => isLegPA(l)).length === 1).length;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Barra de filtros ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Campeonatos — modal multi-select */}
        {(() => {
          const active = leagueFilter.size > 0 && leagueFilter.size < allLeagues.length;
          return (
            <>
              <button onClick={() => setLeagueModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
                style={{
                  background: active ? 'rgba(0,230,118,.1)' : 'rgba(255,255,255,.04)',
                  border:     active ? '1px solid rgba(0,230,118,.3)' : '1px solid rgba(255,255,255,.08)',
                  color:      active ? '#00e676' : 'rgba(255,255,255,.5)',
                }}>
                <Trophy size={11} />
                <span>{active ? `${leagueFilter.size} campeonatos` : 'Campeonatos'}</span>
                {active && (
                  <span style={{ fontSize: 9, fontWeight: 900, borderRadius: 99, padding: '0 5px', background: 'rgba(0,230,118,.18)', color: '#00e676' }}>
                    {leagueFilter.size}/{allLeagues.length}
                  </span>
                )}
              </button>
              {leagueModalOpen && (
                <LeagueFilterModal
                  leagues={allLeagues}
                  selected={leagueFilter}
                  onChange={setLeagueFilter}
                  onClose={() => setLeagueModalOpen(false)}
                />
              )}
            </>
          );
        })()}

        {/* PA filter */}
        <div className="flex items-center gap-1 rounded-xl p-1"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
          {([
            ['ALL',      'Todos',     opportunities.length],
            ['AMBOS_PA', 'Ambos PA',  cntAmbosPa],
            ['UM_PA',    '1 Lado PA', cntUmPa],
          ] as [PAFilter, string, number][]).map(([v, label, cnt]) => {
            const active = paFilter === v;
            return (
              <button key={v} onClick={() => setPaFilter(v)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition-all"
                style={{
                  background: active ? 'rgba(255,159,10,.15)' : 'transparent',
                  color:      active ? 'rgba(255,159,10,.95)' : 'rgba(255,255,255,.45)',
                  border:     active ? '1px solid rgba(255,159,10,.3)' : '1px solid transparent',
                }}>
                {label}
                <span className="rounded-full px-1.5 py-px text-[9px] font-black"
                  style={{ background: active ? 'rgba(255,159,10,.18)' : 'rgba(255,255,255,.07)', color: active ? 'rgba(255,159,10,.9)' : 'rgba(255,255,255,.3)' }}>
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>

        {/* Casas button */}
        <button
          onClick={() => setBkModalOpen(true)}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
          style={{
            background: hasAnyDesel ? 'rgba(245,158,11,.12)' : 'rgba(255,255,255,.04)',
            border:     hasAnyDesel ? '1px solid rgba(245,158,11,.3)' : '1px solid rgba(255,255,255,.08)',
            color:      hasAnyDesel ? '#f59e0b' : 'rgba(255,255,255,.5)',
          }}>
          <X size={12} style={{ opacity: hasAnyDesel ? 1 : 0.5 }} />
          Casas
          {hasAnyDesel && (
            <span className="rounded-full px-1.5 py-px text-[9px] font-black"
              style={{ background: 'rgba(245,158,11,.2)', color: '#f59e0b' }}>
              -{bkDeselected.size}
            </span>
          )}
        </button>

        {/* Sort dropdown */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setSortOpen(v => !v)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-all"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: 'var(--t2)' }}>
            <ArrowUpDown size={12} style={{ color: 'rgba(255,255,255,.4)' }} />
            {SORT_OPTS.find(o => o.value === sortBy)?.label}
          </button>
          {sortOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-xl py-1"
              style={{ background: '#111827', border: '1px solid rgba(255,255,255,.1)', minWidth: 170, boxShadow: '0 8px 32px rgba(0,0,0,.6)' }}>
              {SORT_OPTS.map(opt => (
                <button key={opt.value}
                  onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-[12px] font-semibold transition-colors hover:bg-white/5"
                  style={{ color: sortBy === opt.value ? '#3DFF8F' : 'var(--t2)', background: sortBy === opt.value ? 'rgba(61,255,143,.06)' : 'transparent' }}>
                  {sortBy === opt.value && <span style={{ color: '#3DFF8F', fontSize: 9 }}>✓</span>}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear filtros */}
        {(paFilter !== 'ALL' || hasAnyDesel || leagueFilter.size > 0) && (
          <button onClick={() => { setPaFilter('ALL'); setBkDeselected(new Set()); setLeagueFilter(new Set()); }}
            className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-semibold transition-all hover:opacity-80"
            style={{ color: 'rgba(248,113,113,.7)', background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.15)' }}>
            <X size={10} /> Limpar
          </button>
        )}

        <div className="flex-1" />

        {/* Atualizar */}
        <button onClick={() => load()}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition-all hover:opacity-80"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', color: 'var(--t3)' }}>
          <RefreshCw size={11} /> Atualizar
        </button>
      </div>

      {/* Modal casas */}
      {bkModalOpen && (
        <BookmakerModal
          bookmakers={allBookmakers}
          deselected={bkDeselected}
          onChange={setBkDeselected}
          onClose={() => setBkModalOpen(false)}
        />
      )}

      {/* Cabeçalho colunas desktop */}
      {dedupList.length > 0 && (
        <div className="hidden md:grid items-center gap-2 px-4 text-[10px] font-black uppercase tracking-widest"
          style={{ gridTemplateColumns: '72px 68px 1fr 88px 100px 100px 100px', color: 'rgba(255,255,255,.25)' }}>
          <div className="group relative flex cursor-help items-center gap-1">
            <span>Score</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)' }}>ⓘ</span>
            <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 rounded-xl p-3 group-hover:block"
              style={{ background: '#111827', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.6, color: 'rgba(255,255,255,.7)', textTransform: 'none', letterSpacing: 'normal' }}>
                <strong style={{ color: '#A855F7' }}>DG Score</strong> é a probabilidade do Duplo Green acontecer. Quanto maior, maior a chance do duplo ocorrer. <strong>Não representa lucro.</strong>
              </p>
            </div>
          </div>
          <span className="text-center">DG Profit</span>
          <span>Jogo</span>
          <span className="text-center">Hora</span>
          <span className="text-center">Casa (1)</span>
          <span className="text-center">Empate (X)</span>
          <span className="text-center">Fora (2)</span>
        </div>
      )}

      {/* Nenhum resultado */}
      {dedupList.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10" style={{ color: 'var(--t3)' }}>
          <p className="text-sm font-bold">Nenhum resultado para os filtros</p>
          <button onClick={() => { setPaFilter('ALL'); setBkDeselected(new Set()); setLeagueFilter(new Set()); }}
            className="text-xs underline"
            style={{ color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer' }}>
            Limpar filtros
          </button>
        </div>
      )}

      {/* ── Eventos por liga ─────────────────────────────────────────────── */}
      {(() => {
        const byLeague = new Map<string, typeof dedupList>();
        for (const o of dedupList) {
          const key = o.league ?? 'Outros';
          if (!byLeague.has(key)) byLeague.set(key, []);
          byLeague.get(key)!.push(o);
        }

        return Array.from(byLeague.entries()).map(([league, evs]) => (
          <div key={league} className="overflow-hidden rounded-2xl" style={{
            background: 'rgba(13,17,23,0.75)',
            border: '1px solid rgba(255,255,255,.08)',
            boxShadow: '0 4px 20px rgba(0,0,0,.4), 0 1px 0 rgba(255,255,255,.04) inset',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ height: 2, background: 'linear-gradient(90deg, rgba(61,255,143,.5) 0%, rgba(61,255,143,.15) 50%, transparent 100%)' }} />
            <div className="flex items-center justify-between px-4 py-2.5" style={{
              background: 'linear-gradient(90deg, rgba(61,255,143,.04) 0%, transparent 60%)',
              borderBottom: '1px solid rgba(255,255,255,.05)',
            }}>
              <div className="flex items-center gap-2">
                <div style={{ width: 2, height: 12, borderRadius: 1, background: 'rgba(61,255,143,.5)' }} />
                <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,.5)' }}>
                  {league}
                </span>
              </div>
              <span className="rounded-full px-2 py-0.5" style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.3)', border: '1px solid rgba(255,255,255,.07)' }}>
                {evs.length}
              </span>
            </div>

            <div>
              {evs.map((o, idx) => {
                const rgb       = classRgb(o.dg_classification);
                const col       = classColor(o.dg_classification);
                const paCount   = o.legs.filter(l => isLegPA(l)).length;
                const paLabel   = paCount >= 2 ? 'Ambos PA' : paCount === 1 ? '1 Lado PA' : '';
                const oppCount  = filtered.filter(x => x.match_id === o.match_id).length;
                const hasFixed  = o.legs.some(l => fixedSlugs.has(l.bookmakerSlug));
                const legHome   = o.legs.find(l => l.outcome === 'home');
                const legDraw   = o.legs.find(l => l.outcome === 'draw');
                const legAway   = o.legs.find(l => l.outcome === 'away');

                return (
                  <button key={o.id} type="button" onClick={() => setSelectedMatchId(o.match_id)}
                    className="event-row w-full text-left"
                    style={{
                      background: idx % 2 === 1 ? 'rgba(255,255,255,.012)' : undefined,
                      borderTop: idx > 0 ? '1px solid rgba(255,255,255,.04)' : undefined,
                      borderLeft: hasFixed ? '3px solid rgba(168,85,247,.5)' : '3px solid transparent',
                      display: 'block',
                    }}>

                    {/* Desktop */}
                    <div className="hidden md:grid items-center gap-2 px-4 py-3"
                      style={{ gridTemplateColumns: '72px 68px 1fr 88px 100px 100px 100px' }}>

                      {/* Score + classificação + PA */}
                      <div className="flex flex-col items-center gap-0.5">
                        <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: col }}>
                          {o.dg_score ?? '—'}
                        </span>
                        <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', color: `rgba(${rgb},.5)` }}>
                          {o.dg_classification ?? ''}
                        </span>
                        {paLabel && (
                          <span className="rounded px-1 mt-0.5" style={{ fontSize: 7, fontWeight: 700, background: 'rgba(255,159,10,.1)', color: 'rgba(255,159,10,.8)', border: '1px solid rgba(255,159,10,.2)' }}>
                            {paLabel}
                          </span>
                        )}
                      </div>

                      {/* DG Profit */}
                      <div className="flex flex-col items-center gap-0.5">
                        <span style={{ fontSize: 13, fontWeight: 900, color: profitColor(o.dg_profit_pct) }}>
                          {fmtProfit(o.dg_profit_pct)}
                        </span>
                        {o.max_loss_pct != null && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(248,113,113,.65)' }}>
                            -{Math.abs(o.max_loss_pct).toFixed(1)}% perda
                          </span>
                        )}
                      </div>

                      {/* Jogo */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>
                            {o.home_team}
                          </p>
                          {oppCount > 1 && (
                            <span className="shrink-0 rounded px-1" style={{ fontSize: 8, fontWeight: 700, background: `rgba(${rgb},.1)`, color: col, border: `1px solid rgba(${rgb},.2)` }}>
                              +{oppCount - 1}
                            </span>
                          )}
                        </div>
                        <p className="truncate" style={{ fontSize: 12, color: 'var(--t3)' }}>{o.away_team}</p>
                      </div>

                      <span className="text-center tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)' }}>
                        {fmtTime(o.kickoff)}
                      </span>

                      <LegCell leg={legHome} highlight={legHome ? fixedSlugs.has(legHome.bookmakerSlug) : false} />
                      <LegCell leg={legDraw} highlight={legDraw ? fixedSlugs.has(legDraw.bookmakerSlug) : false} />
                      <LegCell leg={legAway} highlight={legAway ? fixedSlugs.has(legAway.bookmakerSlug) : false} />
                    </div>

                    {/* Mobile */}
                    <div className="flex items-center gap-3 px-4 py-3 md:hidden">
                      <div className="flex flex-col items-center shrink-0" style={{ width: 40 }}>
                        <span style={{ fontSize: 17, fontWeight: 900, lineHeight: 1, color: col }}>
                          {o.dg_score ?? '—'}
                        </span>
                        <span style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', color: `rgba(${rgb},.5)` }}>
                          {o.dg_classification}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>
                          {o.home_team} x {o.away_team}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--t3)' }}>
                          {fmtTime(o.kickoff)}
                          {o.dg_profit_pct != null && (
                            <span className="ml-2 font-black" style={{ color: profitColor(o.dg_profit_pct) }}>
                              {fmtProfit(o.dg_profit_pct)}
                            </span>
                          )}
                          {paLabel && <span className="ml-1 font-bold" style={{ color: 'rgba(255,159,10,.7)' }}>· {paLabel}</span>}
                        </p>
                      </div>
                      <ChevronRight size={14} className="shrink-0 opacity-30" style={{ color: 'var(--t3)' }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ));
      })()}
    </div>
  );
}
