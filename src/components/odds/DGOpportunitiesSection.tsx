'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ExternalLink, RefreshCw, Search, X, SlidersHorizontal, ChevronLeft, ChevronRight, ArrowDown } from 'lucide-react';
import { SurebetCalc } from '@/components/calcalendario/SurebetCalc';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Leg {
  bookmaker:     string;
  bookmakerSlug: string;
  odd:           number;
  outcome:       string;
  matchUrl?:     string | null;
  isPA:          boolean;
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

// ── Célula de leg ─────────────────────────────────────────────────────────────

function LegCell({ leg }: { leg: Leg | undefined }) {
  if (!leg) return (
    <div className="flex justify-center">
      <span style={{ color: 'rgba(255,255,255,.12)', fontSize: 11 }}>—</span>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[15px] font-black tabular-nums" style={{
        color: 'hsl(150 85% 62%)',
        textShadow: '0 0 12px hsl(150 85% 55% / 0.4)',
      }}>
        {leg.odd.toFixed(2)}
      </span>
      <div className="flex items-center gap-1">
        {leg.matchUrl ? (
          <a href={leg.matchUrl} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-[10px] font-medium transition-colors hover:text-cyan-400 truncate max-w-[90px]"
            style={{ color: 'rgba(255,255,255,.4)' }}>
            <ExternalLink size={9} className="shrink-0 opacity-60" />
            <span className="truncate">{leg.bookmaker}</span>
          </a>
        ) : (
          <span className="text-[10px] font-medium truncate max-w-[90px]" style={{ color: 'rgba(255,255,255,.4)' }}>
            {leg.bookmaker}
          </span>
        )}
        {leg.isPA && (
          <span className="shrink-0 rounded px-1 text-[8px] font-bold" style={{
            background: 'rgba(255,159,10,.1)',
            color: 'rgba(255,159,10,.75)',
            border: '1px solid rgba(255,159,10,.2)',
          }}>PA</span>
        )}
      </div>
    </div>
  );
}

// ── Painel de detalhe ─────────────────────────────────────────────────────────

function DGDetailPanel({
  matchOpportunities,
  onBack,
}: {
  matchOpportunities: DGOpportunity[];
  onBack: () => void;
}) {
  // Score é a métrica primária — sort padrão por score
  const [sortCol, setSortCol]       = useState<'score' | 'profit' | 'home' | 'draw' | 'away'>('score');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // calcKey força re-mount do calc-reveal a cada nova seleção
  const [calcKey, setCalcKey]       = useState(0);
  const [calcFill, setCalcFill]     = useState<{ odds: string[]; houses: string[]; urls: string[] } | null>(null);
  const calcRef = useRef<HTMLDivElement>(null);

  const o   = matchOpportunities[0];
  const rgb = classRgb(o.dg_classification);
  const col = classColor(o.dg_classification);

  const sorted = useMemo(() => {
    return [...matchOpportunities].sort((a, b) => {
      if (sortCol === 'score')  return (b.dg_score ?? 0) - (a.dg_score ?? 0);
      if (sortCol === 'profit') return (b.dg_profit_pct ?? 0) - (a.dg_profit_pct ?? 0);
      const legA = a.legs.find(l => l.outcome === sortCol);
      const legB = b.legs.find(l => l.outcome === sortCol);
      return (legB?.odd ?? 0) - (legA?.odd ?? 0);
    });
  }, [matchOpportunities, sortCol]);

  function selectOpportunity(opp: DGOpportunity) {
    if (selectedId === opp.id) {
      setSelectedId(null);
      setCalcFill(null);
      return;
    }
    setSelectedId(opp.id);
    const legHome = opp.legs.find(l => l.outcome === 'home');
    const legDraw = opp.legs.find(l => l.outcome === 'draw');
    const legAway = opp.legs.find(l => l.outcome === 'away');
    const legs = [legHome, legDraw, legAway].filter(Boolean) as Leg[];
    if (!legs.length) return;
    setCalcFill({
      odds:   legs.map(l => String(l.odd)),
      houses: legs.map(l => l.bookmaker),
      urls:   legs.map(l => l.matchUrl ?? ''),
    });
    setCalcKey(k => k + 1);
    // Scroll calc into view after state update + animation start
    setTimeout(() => calcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  }

  const cols: { key: typeof sortCol; label: string }[] = [
    { key: 'score',  label: 'Score' },
    { key: 'profit', label: 'Lucro %' },
    { key: 'home',   label: 'Casa (1)' },
    { key: 'draw',   label: 'Empate (X)' },
    { key: 'away',   label: 'Fora (2)' },
  ];

  const hasPA = matchOpportunities.some(op => op.legs.some(l => l.isPA));

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header do evento ────────────────────────────────────────────── */}
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
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--t3)' }}>
            {o.league ?? '—'} · {fmtTime(o.kickoff)}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasPA && (
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{
              background: 'rgba(255,159,10,.1)', color: 'rgba(255,159,10,.8)', border: '1px solid rgba(255,159,10,.2)',
            }}>PA disponível</span>
          )}
          {/* Score — métrica primária no header */}
          <div className="flex flex-col items-center rounded-xl px-3 py-1.5" style={{
            background: `rgba(${rgb},.1)`, border: `1px solid rgba(${rgb},.25)`,
          }}>
            <span className="text-[22px] font-black leading-none tabular-nums" style={{ color: col }}>
              {o.dg_score ?? '—'}
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: `rgba(${rgb},.55)` }}>
              DG score
            </span>
            {o.dg_profit_pct != null && (
              <span className="text-[9px] font-bold tabular-nums mt-0.5" style={{ color: 'hsl(150 85% 58%)' }}>
                {o.dg_profit_pct.toFixed(1)}% lucro
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabela de oportunidades ──────────────────────────────────────── */}
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
              Oportunidades DuploGreen
            </span>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{
              background: `rgba(${rgb},.12)`, color: col, border: `1px solid rgba(${rgb},.25)`,
            }}>
              {matchOpportunities.length} combinação{matchOpportunities.length !== 1 ? 'ões' : ''}
            </span>
          </div>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.25)' }}>
            clique numa linha para calcular
          </p>
        </div>

        {/* Colunas header */}
        <div className="grid items-center gap-2 px-5 py-2.5" style={{
          gridTemplateColumns: '20px 72px 68px 1fr 1fr 1fr',
          background: 'rgba(255,255,255,.015)',
          borderBottom: '1px solid rgba(255,255,255,.05)',
        }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.25)' }}>#</span>
          {cols.map(c => (
            <button key={c.key} type="button" onClick={() => setSortCol(c.key)}
              className="flex items-center justify-center gap-0.5 text-[11px] font-bold transition-colors"
              style={{
                color: sortCol === c.key ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.3)',
                borderBottom: sortCol === c.key ? `2px solid rgba(${rgb},.7)` : '2px solid transparent',
                paddingBottom: 2,
              }}>
              {c.label}
              {sortCol === c.key && <ArrowDown size={9} style={{ marginLeft: 2 }} />}
            </button>
          ))}
        </div>

        {/* Linhas */}
        <div>
          {sorted.map((opp, idx) => {
            const legHome    = opp.legs.find(l => l.outcome === 'home');
            const legDraw    = opp.legs.find(l => l.outcome === 'draw');
            const legAway    = opp.legs.find(l => l.outcome === 'away');
            const isBest     = idx === 0;
            const isSelected = selectedId === opp.id;

            return (
              <button
                key={opp.id}
                type="button"
                onClick={() => selectOpportunity(opp)}
                className="odds-row w-full text-left"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 72px 68px 1fr 1fr 1fr',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '12px 20px',
                  background: isSelected
                    ? `rgba(${rgb},.10)`
                    : isBest
                    ? `rgba(${rgb},.05)`
                    : idx % 2 === 1 ? 'rgba(255,255,255,.012)' : undefined,
                  borderTop: idx > 0 ? '1px solid rgba(255,255,255,.04)' : undefined,
                  borderLeft: isSelected ? `3px solid rgba(${rgb},.7)` : '3px solid transparent',
                } as React.CSSProperties}>

                <span className="text-[11px] font-black tabular-nums" style={{ color: 'rgba(255,255,255,.2)' }}>
                  {idx + 1}
                </span>

                {/* Score — primário, grande */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[18px] font-black leading-none tabular-nums" style={{
                    color: (isBest || isSelected) ? col : 'rgba(255,255,255,.7)',
                    textShadow: (isBest || isSelected) ? `0 0 12px rgba(${rgb},.4)` : 'none',
                  }}>
                    {opp.dg_score ?? '—'}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-black uppercase tracking-wide" style={{ color: `rgba(${rgb},.4)` }}>
                      {opp.dg_classification ?? ''}
                    </span>
                    {isSelected && (
                      <span className="text-[8px] font-black" style={{ color: `rgba(${rgb},.6)` }}>✓</span>
                    )}
                  </div>
                </div>

                {/* Lucro % — secundário */}
                <div className="flex flex-col items-center">
                  <span className="text-[13px] font-black tabular-nums" style={{
                    color: 'hsl(150 85% 60%)',
                    textShadow: '0 0 8px hsl(150 85% 55%/0.3)',
                  }}>
                    {opp.dg_profit_pct?.toFixed(2) ?? '—'}%
                  </span>
                </div>

                <LegCell leg={legHome} />
                <LegCell leg={legDraw} />
                <LegCell leg={legAway} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Calculadora — revela com motion quando linha é selecionada ───── */}
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
              <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: col }}>
                Calculadora
              </span>
            </div>
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,.3)' }}>
              odds pré-carregadas · ajuste livremente
            </span>
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

      <p className="px-1 text-[11px]" style={{ color: 'rgba(255,255,255,.25)' }}>
        👆 Clique numa linha para calcular stakes · clique no nome da casa para abrir na plataforma
      </p>
    </div>
  );
}

// ── Lista principal ───────────────────────────────────────────────────────────

type SortBy = 'score' | 'menor_perda' | 'maior_perda' | 'recentes';
type PAFilter = 'ALL' | 'AMBOS_PA' | 'UM_PA' | 'SEM_PA';

export function DGOpportunitiesSection() {
  const [opportunities, setOpportunities] = useState<DGOpportunity[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [search,        setSearch]        = useState('');
  const [classFilter,   setClassFilter]   = useState<'ALL' | 'ALTA' | 'MEDIA' | 'BAIXA'>('ALL');
  const [paFilter,      setPaFilter]      = useState<PAFilter>('ALL');
  const [sortBy,        setSortBy]        = useState<SortBy>('score');
  const [sortOpen,      setSortOpen]      = useState(false);
  const [bkFilter,      setBkFilter]      = useState('');   // bookmaker name filter
  const [bkOpen,        setBkOpen]        = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!sortOpen && !bkOpen) return;
    const close = () => { setSortOpen(false); setBkOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [sortOpen, bkOpen]);

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

  // Todos os bookmakers únicos presentes nas oportunidades
  const allBookmakers = useMemo(() => {
    const set = new Map<string, string>(); // slug → name
    for (const o of opportunities) {
      for (const l of o.legs) {
        if (!set.has(l.bookmakerSlug)) set.set(l.bookmakerSlug, l.bookmaker);
      }
    }
    return Array.from(set.values()).sort();
  }, [opportunities]);

  const filtered = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return opportunities.filter(o => {
      if (classFilter !== 'ALL' && o.dg_classification !== classFilter) return false;

      const paLegs = o.legs.filter(l => l.isPA).length;
      if (paFilter === 'AMBOS_PA' && paLegs < 2)   return false;
      if (paFilter === 'UM_PA'    && paLegs !== 1)  return false;
      if (paFilter === 'SEM_PA'   && paLegs > 0)    return false;

      if (bkFilter) {
        const bkNorm = bkFilter.toLowerCase();
        if (!o.legs.some(l => l.bookmaker.toLowerCase().includes(bkNorm) || l.bookmakerSlug.toLowerCase().includes(bkNorm))) return false;
      }

      if (search.trim()) {
        const q = norm(search);
        return norm(o.home_team).includes(q) || norm(o.away_team).includes(q) || norm(o.league ?? '').includes(q);
      }
      return true;
    });
  }, [opportunities, classFilter, paFilter, bkFilter, search]);

  // Melhor oportunidade por match_id + sort pelo critério selecionado
  const dedupList = useMemo(() => {
    const best = new Map<string, DGOpportunity>();
    for (const o of filtered) {
      const existing = best.get(o.match_id);
      if (!existing || (o.dg_score ?? 0) > (existing.dg_score ?? 0)) {
        best.set(o.match_id, o);
      }
    }
    const list = Array.from(best.values());
    return list.sort((a, b) => {
      if (sortBy === 'score')       return (b.dg_score ?? 0) - (a.dg_score ?? 0);
      if (sortBy === 'menor_perda') return (b.dg_profit_pct ?? -999) - (a.dg_profit_pct ?? -999);
      if (sortBy === 'maior_perda') return (a.dg_profit_pct ?? 999) - (b.dg_profit_pct ?? 999);
      if (sortBy === 'recentes') {
        const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
        const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
        return ta - tb;
      }
      return 0;
    });
  }, [filtered, sortBy]);

  const countAlta  = opportunities.filter(o => o.dg_classification === 'ALTA').length;
  const countMedia = opportunities.filter(o => o.dg_classification === 'MEDIA').length;
  const countBaixa = opportunities.filter(o => o.dg_classification === 'BAIXA').length;

  if (selectedMatchId) {
    const allForMatch = opportunities.filter(o => o.match_id === selectedMatchId);
    if (!allForMatch.length) { setSelectedMatchId(null); return null; }
    return (
      <DGDetailPanel
        matchOpportunities={allForMatch}
        onBack={() => setSelectedMatchId(null)}
      />
    );
  }

  if (loading) return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[72px] rounded-2xl animate-pulse"
          style={{ background: 'rgba(168,85,247,.04)', border: '1px solid rgba(168,85,247,.1)', opacity: 1 - i * 0.12 }} />
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

  if (!loading && opportunities.length === 0) return (
    <div className="flex flex-col items-center gap-3 py-16" style={{ color: 'var(--t3)' }}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'rgba(168,85,247,.08)', border: '1px solid rgba(168,85,247,.15)' }}>
        <SlidersHorizontal size={24} style={{ color: 'rgba(168,85,247,.5)' }} />
      </div>
      <p className="text-sm font-bold">Nenhuma oportunidade importada</p>
      <p className="text-xs opacity-60 text-center max-w-xs">
        Importe o arquivo de oportunidades DuploGreen via painel Admin.
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Classificação */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
          {(['ALL','ALTA','MEDIA','BAIXA'] as const).map(c => {
            const active = classFilter === c;
            const color  = c === 'ALTA' ? '61,255,143' : c === 'MEDIA' ? '255,159,10' : c === 'BAIXA' ? '248,113,113' : '255,255,255';
            const count  = c === 'ALL' ? opportunities.length : c === 'ALTA' ? countAlta : c === 'MEDIA' ? countMedia : countBaixa;
            return (
              <button key={c} onClick={() => setClassFilter(c)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all"
                style={{
                  background: active ? `rgba(${color},.15)` : 'transparent',
                  color:      active ? `rgb(${color})` : 'rgba(255,255,255,.4)',
                  border:     active ? `1px solid rgba(${color},.3)` : '1px solid transparent',
                }}>
                {c === 'ALL' ? 'Todos' : c}
                <span className="rounded-full px-1.5 py-px text-[9px]"
                  style={{ background: `rgba(${color},.12)`, color: `rgb(${color})` }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* PA filter */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
          {([
            ['ALL',      'Todos'],
            ['AMBOS_PA', 'Ambos PA'],
            ['UM_PA',    '1 lado PA'],
            ['SEM_PA',   'Sem PA'],
          ] as [PAFilter, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setPaFilter(v)}
              className="rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all"
              style={{
                background: paFilter === v ? 'rgba(255,159,10,.15)' : 'transparent',
                color:      paFilter === v ? 'rgba(255,159,10,.9)' : 'rgba(255,255,255,.4)',
                border:     paFilter === v ? '1px solid rgba(255,159,10,.3)' : '1px solid transparent',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="relative">
          <button
            onClick={() => { setSortOpen(v => !v); setBkOpen(false); }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-all"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: 'var(--t2)' }}>
            <ArrowDown size={11} />
            {sortBy === 'score'       ? 'Maior DG Score'
            : sortBy === 'menor_perda' ? 'Menor Perda'
            : sortBy === 'maior_perda' ? 'Maior Perda'
            :                            'Mais recentes'}
          </button>
          {sortOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-xl py-1"
              style={{ background: '#111827', border: '1px solid rgba(255,255,255,.1)', minWidth: 170, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }}>
              {([
                ['score',       'Maior DG Score'],
                ['menor_perda', 'Menor Perda'],
                ['maior_perda', 'Maior Perda'],
                ['recentes',    'Mais recentes'],
              ] as [SortBy, string][]).map(([v, label]) => (
                <button key={v}
                  onClick={() => { setSortBy(v); setSortOpen(false); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-[12px] font-semibold transition-colors hover:bg-white/5"
                  style={{ color: sortBy === v ? '#3DFF8F' : 'var(--t2)', background: sortBy === v ? 'rgba(61,255,143,.06)' : 'transparent' }}>
                  {sortBy === v && <span style={{ color: '#3DFF8F', fontSize: 9 }}>✓</span>}
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bookmaker filter */}
        <div className="relative">
          <button
            onClick={() => { setBkOpen(v => !v); setSortOpen(false); }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-all"
            style={{
              background: bkFilter ? 'rgba(77,166,255,.12)' : 'rgba(255,255,255,.04)',
              border: bkFilter ? '1px solid rgba(77,166,255,.3)' : '1px solid rgba(255,255,255,.08)',
              color: bkFilter ? '#4DA6FF' : 'var(--t2)',
            }}>
            <SlidersHorizontal size={11} />
            {bkFilter || 'Casa'}
            {bkFilter && (
              <span onClick={e => { e.stopPropagation(); setBkFilter(''); }}
                style={{ marginLeft: 2, opacity: .7, cursor: 'pointer' }}>×</span>
            )}
          </button>
          {bkOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 overflow-y-auto rounded-xl py-1"
              style={{ background: '#111827', border: '1px solid rgba(255,255,255,.1)', minWidth: 180, maxHeight: 260, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }}>
              <button onClick={() => { setBkFilter(''); setBkOpen(false); }}
                className="flex w-full items-center px-4 py-2.5 text-[12px] font-semibold hover:bg-white/5"
                style={{ color: !bkFilter ? '#3DFF8F' : 'var(--t3)' }}>
                Todas as casas
              </button>
              {allBookmakers.map(bk => (
                <button key={bk}
                  onClick={() => { setBkFilter(bk); setBkOpen(false); }}
                  className="flex w-full items-center px-4 py-2.5 text-[12px] font-semibold hover:bg-white/5"
                  style={{ color: bkFilter === bk ? '#4DA6FF' : 'var(--t2)' }}>
                  {bkFilter === bk && <span style={{ color: '#4DA6FF', fontSize: 9, marginRight: 6 }}>✓</span>}
                  {bk}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar jogo ou liga…"
            className="rounded-xl py-2 pl-8 pr-8 text-[12px] outline-none"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: 'var(--t)', width: 190 }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
              <X size={12} />
            </button>
          )}
        </div>

        <button onClick={() => load()}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition-all hover:opacity-80"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', color: 'var(--t3)' }}>
          <RefreshCw size={11} /> Atualizar
        </button>
      </div>

      {/* Cabeçalho desktop */}
      {dedupList.length > 0 && (
        <div className="hidden md:grid items-center gap-2 px-4 text-[10px] font-black uppercase tracking-widest"
          style={{ gridTemplateColumns: '72px 68px 1fr 88px 100px 100px 100px', color: 'rgba(255,255,255,.25)' }}>
          {/* Score com tooltip */}
          <div className="flex items-center gap-1 group relative cursor-help">
            <span>Score</span>
            <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 9 }}>ⓘ</span>
            <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden group-hover:block w-56 rounded-xl p-3"
              style={{ background: '#111827', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
              <p className="text-[11px] font-semibold leading-relaxed" style={{ color: 'rgba(255,255,255,.7)', textTransform: 'none', letterSpacing: 'normal' }}>
                <strong style={{ color: '#A855F7' }}>DG Score</strong> é a probabilidade do Duplo Green acontecer, calculada pelo algoritmo DuploGreen. Quanto maior, maior a chance do duplo ocorrer. <strong>Não representa lucro.</strong>
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
            <div style={{ height: 2, background: 'linear-gradient(90deg, rgba(129,140,248,.7) 0%, rgba(129,140,248,.2) 50%, transparent 100%)' }} />
            <div className="flex items-center justify-between px-4 py-2.5" style={{
              background: 'linear-gradient(90deg, rgba(129,140,248,.06) 0%, transparent 60%)',
              borderBottom: '1px solid rgba(255,255,255,.05)',
            }}>
              <div className="flex items-center gap-2">
                <div style={{ width: 2, height: 12, borderRadius: 1, background: 'rgba(129,140,248,.6)' }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.5)' }}>
                  {league}
                </span>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                style={{ background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.3)', border: '1px solid rgba(255,255,255,.07)' }}>
                {evs.length}
              </span>
            </div>

            <div>
              {evs.map((o, idx) => {
                const rgb      = classRgb(o.dg_classification);
                const col      = classColor(o.dg_classification);
                const hasPA    = o.legs.some(l => l.isPA);
                const oppCount = filtered.filter(x => x.match_id === o.match_id).length;
                const legHome  = o.legs.find(l => l.outcome === 'home');
                const legDraw  = o.legs.find(l => l.outcome === 'draw');
                const legAway  = o.legs.find(l => l.outcome === 'away');

                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedMatchId(o.match_id)}
                    className="event-row w-full text-left"
                    style={{
                      background: idx % 2 === 1 ? 'rgba(255,255,255,.012)' : undefined,
                      borderTop: idx > 0 ? '1px solid rgba(255,255,255,.04)' : undefined,
                      display: 'block',
                    }}>

                    {/* Desktop */}
                    <div className="hidden md:grid items-center gap-2 px-4 py-3"
                      style={{ gridTemplateColumns: '72px 68px 1fr 88px 100px 100px 100px' }}>

                      {/* Score — probabilidade do duplo, não lucro */}
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[18px] font-black leading-none tabular-nums" style={{ color: col }}>
                          {o.dg_score ?? '—'}
                        </span>
                        <span className="text-[8px] font-black uppercase tracking-wide" style={{ color: `rgba(${rgb},.5)` }}>
                          {o.dg_classification ?? ''}
                        </span>
                        {hasPA && (
                          <span className="rounded px-1 text-[7px] font-bold" style={{
                            background: 'rgba(255,159,10,.1)', color: 'rgba(255,159,10,.8)',
                            border: '1px solid rgba(255,159,10,.2)',
                          }}>PA</span>
                        )}
                      </div>

                      {/* DG Profit % — cor baseada no sinal (positivo=verde, negativo=vermelho) */}
                      {(() => {
                        const pct = o.dg_profit_pct;
                        const pctColor = pct == null ? 'rgba(255,255,255,.3)'
                          : pct >= 0 ? 'hsl(150 85% 60%)' : 'hsl(0 85% 65%)';
                        const loss = o.max_loss_pct;
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[13px] font-black tabular-nums" style={{ color: pctColor }}>
                              {pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                            </span>
                            {loss != null && (
                              <span className="text-[9px] font-bold tabular-nums" style={{ color: 'rgba(248,113,113,.65)' }}>
                                -{Math.abs(loss).toFixed(1)}% perda
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Jogo */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--t)' }}>
                            {o.home_team}
                          </p>
                          {oppCount > 1 && (
                            <span className="shrink-0 rounded px-1 text-[8px] font-bold" style={{
                              background: `rgba(${rgb},.1)`, color: col, border: `1px solid rgba(${rgb},.2)`,
                            }}>+{oppCount - 1}</span>
                          )}
                        </div>
                        <p className="truncate text-[12px]" style={{ color: 'var(--t3)' }}>{o.away_team}</p>
                      </div>

                      <span className="text-[11px] font-bold tabular-nums text-center" style={{ color: 'var(--t3)' }}>
                        {fmtTime(o.kickoff)}
                      </span>

                      <LegCell leg={legHome} />
                      <LegCell leg={legDraw} />
                      <LegCell leg={legAway} />
                    </div>

                    {/* Mobile */}
                    <div className="flex items-center gap-3 px-4 py-3 md:hidden">
                      <div className="flex flex-col items-center shrink-0" style={{ width: 40 }}>
                        <span className="text-[17px] font-black leading-none tabular-nums" style={{ color: col }}>
                          {o.dg_score ?? '—'}
                        </span>
                        <span className="text-[7px] font-black uppercase" style={{ color: `rgba(${rgb},.5)` }}>
                          {o.dg_classification}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--t)' }}>
                          {o.home_team} x {o.away_team}
                        </p>
                        <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
                          {fmtTime(o.kickoff)}
                          {o.dg_profit_pct != null && (
                            <span className="ml-2 font-black" style={{
                              color: o.dg_profit_pct >= 0 ? 'hsl(150 85% 60%)' : 'hsl(0 85% 65%)',
                            }}>
                              {o.dg_profit_pct >= 0 ? '+' : ''}{o.dg_profit_pct.toFixed(1)}%
                            </span>
                          )}
                          {hasPA && <span className="ml-1 font-bold" style={{ color: 'rgba(255,159,10,.7)' }}>· PA</span>}
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
