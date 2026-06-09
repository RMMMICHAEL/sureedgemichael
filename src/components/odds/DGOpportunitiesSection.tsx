'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { ExternalLink, RefreshCw, Search, X, SlidersHorizontal, ChevronLeft, ChevronRight, ArrowDown } from 'lucide-react';

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

const OUTCOME_PT: Record<string, string> = {
  home: 'Casa (1)', draw: 'Empate (X)', away: 'Fora (2)',
};

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
  const [sortCol, setSortCol] = useState<'profit' | 'score' | 'home' | 'draw' | 'away'>('profit');

  const o   = matchOpportunities[0];
  const rgb = classRgb(o.dg_classification);
  const col = classColor(o.dg_classification);

  const sorted = useMemo(() => {
    return [...matchOpportunities].sort((a, b) => {
      if (sortCol === 'profit') return (b.dg_profit_pct ?? 0) - (a.dg_profit_pct ?? 0);
      if (sortCol === 'score')  return (b.dg_score ?? 0) - (a.dg_score ?? 0);
      // sort by a specific outcome odd
      const legA = a.legs.find(l => l.outcome === sortCol);
      const legB = b.legs.find(l => l.outcome === sortCol);
      return (legB?.odd ?? 0) - (legA?.odd ?? 0);
    });
  }, [matchOpportunities, sortCol]);

  const cols: { key: typeof sortCol; label: string }[] = [
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
        background: `linear-gradient(135deg, rgba(${rgb},.09) 0%, rgba(13,17,23,0.9) 60%)`,
        border: `1px solid rgba(${rgb},.32)`,
        boxShadow: `0 4px 32px rgba(0,0,0,.5), 0 0 20px rgba(${rgb},.06) inset`,
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
          <div className="flex flex-col items-center rounded-xl px-3 py-1.5" style={{
            background: `rgba(${rgb},.1)`, border: `1px solid rgba(${rgb},.25)`,
          }}>
            <span className="text-[20px] font-black leading-none tabular-nums" style={{ color: col }}>
              {o.dg_score ?? '—'}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: `rgba(${rgb},.6)` }}>score</span>
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
        {/* Barra de acento */}
        <div style={{ height: 2, background: `linear-gradient(90deg, rgba(${rgb},.9) 0%, rgba(${rgb},.3) 60%, transparent 100%)` }} />

        {/* Header da seção */}
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
          <span className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,.3)' }}>
            melhor lucro: {Math.max(...matchOpportunities.map(x => x.dg_profit_pct ?? 0)).toFixed(2)}%
          </span>
        </div>

        {/* Cabeçalho das colunas */}
        <div className="grid items-center gap-3 px-5 py-2.5" style={{
          gridTemplateColumns: '28px 80px 1fr 1fr 1fr',
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
            const legHome = opp.legs.find(l => l.outcome === 'home');
            const legDraw = opp.legs.find(l => l.outcome === 'draw');
            const legAway = opp.legs.find(l => l.outcome === 'away');
            const anyPA   = opp.legs.some(l => l.isPA);
            const isBest  = idx === 0;

            return (
              <div key={opp.id}
                className="odds-row odds-row-in grid items-center gap-3 px-5 py-3"
                style={{
                  gridTemplateColumns: '28px 80px 1fr 1fr 1fr',
                  '--row-i': idx,
                  background: isBest
                    ? `rgba(${rgb},.05)`
                    : idx % 2 === 1 ? 'rgba(255,255,255,.012)' : undefined,
                  borderTop: idx > 0 ? '1px solid rgba(255,255,255,.04)' : undefined,
                } as React.CSSProperties}>

                {/* Rank */}
                <span className="text-[11px] font-black tabular-nums" style={{ color: 'rgba(255,255,255,.2)' }}>
                  {idx + 1}
                </span>

                {/* Lucro + score */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[15px] font-black tabular-nums leading-none" style={{
                    color: isBest ? col : 'hsl(150 85% 60%)',
                    textShadow: isBest ? `0 0 12px rgba(${rgb},.4)` : '0 0 8px hsl(150 85% 55%/0.3)',
                  }}>
                    {opp.dg_profit_pct?.toFixed(2) ?? '—'}%
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-semibold" style={{ color: 'rgba(255,255,255,.25)' }}>
                      score {opp.dg_score ?? '—'}
                    </span>
                    {anyPA && (
                      <span className="rounded px-1 text-[7px] font-bold" style={{
                        background: 'rgba(255,159,10,.1)',
                        color: 'rgba(255,159,10,.7)',
                        border: '1px solid rgba(255,159,10,.18)',
                      }}>PA</span>
                    )}
                  </div>
                </div>

                <LegCell leg={legHome} />
                <LegCell leg={legDraw} />
                <LegCell leg={legAway} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Dica */}
      <p className="px-1 text-[11px]" style={{ color: 'rgba(255,255,255,.25)' }}>
        👆 Clique no nome da casa para abrir o evento direto na plataforma
      </p>
    </div>
  );
}

// ── Lista principal ───────────────────────────────────────────────────────────

export function DGOpportunitiesSection() {
  const [opportunities, setOpportunities] = useState<DGOpportunity[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [search,        setSearch]        = useState('');
  const [classFilter,   setClassFilter]   = useState<'ALL' | 'ALTA' | 'MEDIA' | 'BAIXA'>('ALL');
  const [paFilter,      setPaFilter]      = useState<'ALL' | 'PA' | 'SEM_PA'>('ALL');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return opportunities.filter(o => {
      if (classFilter !== 'ALL' && o.dg_classification !== classFilter) return false;
      if (paFilter === 'PA'     && !o.legs.some(l => l.isPA)) return false;
      if (paFilter === 'SEM_PA' &&  o.legs.some(l => l.isPA)) return false;
      if (search.trim()) {
        const q = norm(search);
        return norm(o.home_team).includes(q) || norm(o.away_team).includes(q) || norm(o.league ?? '').includes(q);
      }
      return true;
    });
  }, [opportunities, classFilter, paFilter, search]);

  // Um card por match_id — melhor oportunidade de cada jogo
  const dedupList = useMemo(() => {
    const seen = new Set<string>();
    return filtered.filter(o => {
      if (seen.has(o.match_id)) return false;
      seen.add(o.match_id);
      return true;
    });
  }, [filtered]);

  const countAlta  = opportunities.filter(o => o.dg_classification === 'ALTA').length;
  const countMedia = opportunities.filter(o => o.dg_classification === 'MEDIA').length;
  const countBaixa = opportunities.filter(o => o.dg_classification === 'BAIXA').length;

  // ── Detalhe de jogo selecionado ──────────────────────────────────────────────
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

  // ── States especiais ─────────────────────────────────────────────────────────
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

        {/* PA */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
          {([['ALL','Todos'],['PA','Com PA'],['SEM_PA','Sem PA']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setPaFilter(v as typeof paFilter)}
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

        {/* Busca */}
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

      {/* Cabeçalho colunas desktop */}
      {dedupList.length > 0 && (
        <div className="hidden md:grid items-center gap-2 px-4 text-[10px] font-black uppercase tracking-widest"
          style={{ gridTemplateColumns: '44px 1fr 68px 100px 100px 100px', color: 'rgba(255,255,255,.25)' }}>
          <span>Score</span>
          <span>Jogo</span>
          <span className="text-center">Lucro</span>
          <span className="text-center">Casa (1)</span>
          <span className="text-center">Empate (X)</span>
          <span className="text-center">Fora (2)</span>
        </div>
      )}

      {/* ── Eventos agrupados por liga ────────────────────────────────────── */}
      {(() => {
        // Agrupa por liga
        const byLeague = new Map<string, typeof dedupList>();
        for (const o of dedupList) {
          const key = o.league ?? 'Outros';
          if (!byLeague.has(key)) byLeague.set(key, []);
          byLeague.get(key)!.push(o);
        }

        return Array.from(byLeague.entries()).map(([league, evs]) => {
          const leagueRgb = classRgb(evs[0].dg_classification);

          return (
            <div key={league} className="overflow-hidden rounded-2xl" style={{
              background: 'rgba(13,17,23,0.8)',
              border: '1px solid rgba(255,255,255,.08)',
              boxShadow: '0 4px 24px rgba(0,0,0,.42)',
            }}>
              {/* Barra topo — acento violeta DG */}
              <div style={{ height: 2, background: 'linear-gradient(90deg, rgba(168,85,247,.85) 0%, rgba(168,85,247,.3) 40%, transparent 100%)' }} />

              {/* Header liga */}
              <div className="flex items-center justify-between px-4 py-2.5" style={{
                background: 'rgba(168,85,247,.04)',
                borderBottom: '1px solid rgba(255,255,255,.05)',
              }}>
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(196,157,255,.75)' }}>
                  {league}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                  style={{ background: 'rgba(168,85,247,.1)', color: 'rgba(196,157,255,.6)', border: '1px solid rgba(168,85,247,.18)' }}>
                  {evs.length}
                </span>
              </div>

              {/* Linhas */}
              <div>
                {evs.map((o, idx) => {
                  const rgb     = classRgb(o.dg_classification);
                  const col     = classColor(o.dg_classification);
                  const hasPA   = o.legs.some(l => l.isPA);
                  const oppCount = filtered.filter(x => x.match_id === o.match_id).length;
                  const legHome = o.legs.find(l => l.outcome === 'home');
                  const legDraw = o.legs.find(l => l.outcome === 'draw');
                  const legAway = o.legs.find(l => l.outcome === 'away');

                  const isAlta = o.dg_classification === 'ALTA';
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
                        style={{ gridTemplateColumns: '44px 1fr 68px 100px 100px 100px' }}>

                        {/* Score */}
                        <div className="flex flex-col items-center">
                          <span className="text-[18px] font-black leading-none tabular-nums" style={{
                            color: col,
                            textShadow: isAlta ? `0 0 12px rgba(${rgb},.5)` : undefined,
                          }}>
                            {o.dg_score ?? '—'}
                          </span>
                          <span className="mt-0.5 rounded px-1 text-[8px] font-black uppercase tracking-wide" style={{
                            background: `rgba(${rgb},.12)`,
                            color: `rgba(${rgb},.85)`,
                          }}>
                            {o.dg_classification ?? ''}
                          </span>
                        </div>

                        {/* Jogo */}
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--t)' }}>
                            {o.home_team}
                          </p>
                          <p className="truncate text-[12px]" style={{ color: 'var(--t3)' }}>
                            {o.away_team} · {fmtTime(o.kickoff)}
                          </p>
                        </div>

                        {/* Lucro */}
                        <div className="flex flex-col items-center">
                          <span className="text-[17px] font-black tabular-nums" style={{
                            color: 'hsl(150 85% 60%)',
                            textShadow: '0 0 12px hsl(150 85% 55%/0.35)',
                          }}>
                            {o.dg_profit_pct?.toFixed(1) ?? '—'}%
                          </span>
                          <div className="flex items-center gap-1 mt-0.5">
                            {hasPA && (
                              <span className="rounded px-1 py-px text-[8px] font-bold" style={{
                                background: 'rgba(255,159,10,.12)',
                                color: 'rgba(255,159,10,.85)',
                                border: '1px solid rgba(255,159,10,.22)',
                              }}>PA</span>
                            )}
                            {oppCount > 1 && (
                              <span className="text-[8px]" style={{ color: 'rgba(255,255,255,.25)' }}>+{oppCount - 1}</span>
                            )}
                          </div>
                        </div>

                        {/* Legs */}
                        <LegCell leg={legHome} />
                        <LegCell leg={legDraw} />
                        <LegCell leg={legAway} />
                      </div>

                      {/* Mobile */}
                      <div className="flex items-center gap-3 px-4 py-3 md:hidden">
                        <div className="flex flex-col items-center shrink-0" style={{ width: 38 }}>
                          <span className="text-[18px] font-black leading-none tabular-nums" style={{
                            color: col,
                            textShadow: isAlta ? `0 0 10px rgba(${rgb},.45)` : undefined,
                          }}>
                            {o.dg_score ?? '—'}
                          </span>
                          <span className="rounded px-1 text-[7px] font-black uppercase mt-0.5" style={{
                            background: `rgba(${rgb},.12)`,
                            color: `rgba(${rgb},.8)`,
                          }}>
                            {o.dg_classification}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--t)' }}>
                            {o.home_team} x {o.away_team}
                          </p>
                          <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
                            {fmtTime(o.kickoff)}
                            {o.dg_profit_pct !== null && (
                              <span className="ml-2 font-bold" style={{ color: 'hsl(150 85% 60%)' }}>
                                {o.dg_profit_pct.toFixed(1)}%
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
          );
        });
      })()}
    </div>
  );
}
