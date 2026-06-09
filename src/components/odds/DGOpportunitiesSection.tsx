'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { ExternalLink, RefreshCw, Search, X, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';

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

// ── Componente ────────────────────────────────────────────────────────────────

export function DGOpportunitiesSection() {
  const [opportunities, setOpportunities] = useState<DGOpportunity[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [search,        setSearch]        = useState('');
  const [classFilter,   setClassFilter]   = useState<'ALL' | 'ALTA' | 'MEDIA' | 'BAIXA'>('ALL');
  const [paFilter,      setPaFilter]      = useState<'ALL' | 'PA' | 'SEM_PA'>('ALL');
  const [expanded,      setExpanded]      = useState<string | null>(null);

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

  // Dedup: um match_id pode ter múltiplas oportunidades — mantemos todas mas agrupamos
  const filtered = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return opportunities.filter(o => {
      // Filtro de classificação
      if (classFilter !== 'ALL' && o.dg_classification !== classFilter) return false;
      // Filtro PA
      if (paFilter === 'PA' && !o.legs.some(l => l.isPA)) return false;
      if (paFilter === 'SEM_PA' && o.legs.some(l => l.isPA)) return false;
      // Busca texto
      if (search.trim()) {
        const q = norm(search);
        return norm(o.home_team).includes(q) || norm(o.away_team).includes(q) || norm(o.league ?? '').includes(q);
      }
      return true;
    });
  }, [opportunities, classFilter, paFilter, search]);

  const countAlta  = opportunities.filter(o => o.dg_classification === 'ALTA').length;
  const countMedia = opportunities.filter(o => o.dg_classification === 'MEDIA').length;
  const countBaixa = opportunities.filter(o => o.dg_classification === 'BAIXA').length;

  // ── Skeleton ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-20 rounded-2xl animate-pulse"
          style={{ background: 'rgba(168,85,247,.04)', border: '1px solid rgba(168,85,247,.1)', opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );

  // ── Erro ────────────────────────────────────────────────────────────────────
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

  // ── Vazio (sem dados importados) ─────────────────────────────────────────────
  if (!loading && opportunities.length === 0) return (
    <div className="flex flex-col items-center gap-3 py-16" style={{ color: 'var(--t3)' }}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'rgba(168,85,247,.08)', border: '1px solid rgba(168,85,247,.15)' }}>
        <SlidersHorizontal size={24} style={{ color: 'rgba(168,85,247,.5)' }} />
      </div>
      <p className="text-sm font-bold">Nenhuma oportunidade importada</p>
      <p className="text-xs opacity-60 text-center max-w-xs">
        Importe o arquivo de oportunidades DuploGreen (freebet.txt / opportunities.json) via painel Admin.
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Classificação */}
        <div className="flex items-center gap-1.5 rounded-xl p-1" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
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

        {/* PA Filter */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
          {([['ALL', 'Todos'], ['PA', 'Com PA'], ['SEM_PA', 'Sem PA']] as const).map(([v, label]) => (
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
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar jogo ou liga…"
            className="rounded-xl py-2 pl-8 pr-8 text-[12px] outline-none"
            style={{
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
              color: 'var(--t)',
              width: 190,
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Refresh */}
        <button onClick={() => load()} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition-all hover:opacity-80"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', color: 'var(--t3)' }}>
          <RefreshCw size={11} />
          Atualizar
        </button>
      </div>

      {/* Contagem */}
      <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
        {filtered.length} oportunidade{filtered.length !== 1 ? 's' : ''} · ordenadas por score DG
      </p>

      {/* ── Cards de oportunidade ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5">
        {filtered.map((o, idx) => {
          const isOpen = expanded === o.id;
          const rgb    = classRgb(o.dg_classification);
          const col    = classColor(o.dg_classification);
          const hasPA  = o.legs.some(l => l.isPA);

          return (
            <div key={o.id} className="overflow-hidden rounded-2xl" style={{
              background: 'rgba(13,17,23,0.75)',
              border: `1px solid rgba(${rgb},.15)`,
              boxShadow: '0 4px 20px rgba(0,0,0,.3)',
              backdropFilter: 'blur(10px)',
            }}>
              {/* Barra topo */}
              <div style={{ height: 2, background: `linear-gradient(90deg, rgba(${rgb},.8) 0%, rgba(${rgb},.2) 50%, transparent 100%)` }} />

              {/* Linha principal */}
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : o.id)}
                className="w-full text-left px-4 py-3.5"
                style={{ display: 'block' }}>

                <div className="flex items-center gap-3 flex-wrap">
                  {/* Rank */}
                  <span className="shrink-0 text-[11px] font-black tabular-nums w-6 text-center" style={{ color: 'rgba(255,255,255,.18)' }}>
                    #{idx + 1}
                  </span>

                  {/* Score */}
                  <div className="shrink-0 flex flex-col items-center" style={{ width: 40 }}>
                    <span className="text-[18px] font-black leading-none tabular-nums" style={{ color: col }}>
                      {o.dg_score ?? '—'}
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: `rgba(${rgb},.5)` }}>score</span>
                  </div>

                  {/* Jogo + liga */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[13px] font-black" style={{ color: 'var(--t)' }}>
                      {o.home_team} x {o.away_team}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
                      {o.league ?? '—'} · {fmtTime(o.kickoff)}
                    </p>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Classificação */}
                    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{
                      background: `rgba(${rgb},.12)`,
                      color: col,
                      border: `1px solid rgba(${rgb},.25)`,
                    }}>
                      {o.dg_classification ?? '—'}
                    </span>
                    {/* PA badge */}
                    {hasPA && (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{
                        background: 'rgba(255,159,10,.1)',
                        color: 'rgba(255,159,10,.8)',
                        border: '1px solid rgba(255,159,10,.2)',
                      }}>PA</span>
                    )}
                  </div>

                  {/* Profit */}
                  {o.dg_profit_pct !== null && (
                    <div className="shrink-0 text-right">
                      <span className="text-[15px] font-black tabular-nums" style={{
                        color: 'hsl(150 85% 60%)',
                        textShadow: '0 0 10px hsl(150 85% 55%/0.3)',
                      }}>
                        {o.dg_profit_pct.toFixed(1)}%
                      </span>
                      <p className="text-[9px]" style={{ color: 'rgba(255,255,255,.25)' }}>lucro DG</p>
                    </div>
                  )}

                  {/* Chevron */}
                  {isOpen
                    ? <ChevronUp  size={14} className="shrink-0" style={{ color: 'rgba(255,255,255,.25)' }} />
                    : <ChevronDown size={14} className="shrink-0" style={{ color: 'rgba(255,255,255,.25)' }} />
                  }
                </div>
              </button>

              {/* Detalhe expandido */}
              {isOpen && (
                <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: `rgba(${rgb},.1)` }}>

                  {/* Legs */}
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))' }}>
                    {o.legs.map((leg, li) => (
                      <div key={li} className="rounded-xl p-3" style={{
                        background: leg.isPA ? 'rgba(255,159,10,.05)' : 'rgba(255,255,255,.03)',
                        border: `1px solid ${leg.isPA ? 'rgba(255,159,10,.2)' : 'rgba(255,255,255,.08)'}`,
                      }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest"
                            style={{ color: leg.isPA ? 'rgba(255,159,10,.8)' : 'rgba(255,255,255,.4)' }}>
                            {OUTCOME_PT[leg.outcome] ?? leg.outcome}
                          </span>
                          {leg.isPA && (
                            <span className="rounded px-1 text-[8px] font-bold" style={{
                              background: 'rgba(255,159,10,.12)',
                              color: 'rgba(255,159,10,.8)',
                              border: '1px solid rgba(255,159,10,.2)',
                            }}>PA</span>
                          )}
                        </div>
                        <p className="text-[12px] font-bold" style={{ color: 'var(--t)' }}>{leg.bookmaker}</p>
                        <p className="text-[20px] font-black tabular-nums" style={{ color: 'hsl(150 85% 60%)' }}>
                          {leg.odd.toFixed(3)}
                        </p>
                        {leg.matchUrl && (
                          <a href={leg.matchUrl} target="_blank" rel="noopener noreferrer"
                            className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold transition-colors hover:text-cyan-400"
                            style={{ color: 'rgba(129,140,248,.6)' }}>
                            <ExternalLink size={9} /> Abrir
                          </a>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Resumo */}
                  {(o.dg_profit_pct !== null || o.max_loss_pct !== null) && (
                    <div className="mt-3 flex flex-wrap gap-4 rounded-xl px-4 py-3" style={{
                      background: `rgba(${rgb},.04)`,
                      border: `1px solid rgba(${rgb},.12)`,
                    }}>
                      {o.dg_profit_pct !== null && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.3)' }}>Lucro DG</p>
                          <p className="text-[15px] font-black" style={{ color: 'hsl(150 85% 60%)' }}>
                            {o.dg_profit_pct.toFixed(2)}%
                          </p>
                        </div>
                      )}
                      {o.max_loss_pct !== null && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.3)' }}>Perda máx.</p>
                          <p className="text-[15px] font-black" style={{ color: o.max_loss_pct < 0 ? '#f87171' : 'hsl(150 85% 60%)' }}>
                            {o.max_loss_pct.toFixed(2)}%
                          </p>
                        </div>
                      )}
                      {o.dg_score !== null && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.3)' }}>Score DG</p>
                          <p className="text-[15px] font-black" style={{ color: col }}>
                            {o.dg_score}/100
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
