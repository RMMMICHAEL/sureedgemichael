'use client';

import { useState, useEffect, useMemo } from 'react';
import { Gift, ChevronRight, ExternalLink, RefreshCw, Search, AlertCircle, Zap } from 'lucide-react';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CoverBet {
  outcome:        'home' | 'draw' | 'away';
  bookmaker_slug: string;
  bookmaker_name: string;
  odd:            number;
  stake_per_100:  number;
  is_pa:          boolean;
  url:            string | null;
}

interface FreebetOpportunity {
  match_id:           string;
  home_team:          string;
  away_team:          string;
  league_name:        string;
  start_time:         string | null;
  freebet_outcome:    'home' | 'draw' | 'away';
  freebet_odd:        number;
  freebet_url:        string | null;
  covers:             CoverBet[];
  conversion_pct:     number;
  profit_per_100:     number;
  cover_cost_per_100: number;
  source?:            'odds' | 'dg';
  dg_score?:          number | null;
  dg_classification?: string | null;
}

interface BookmakerOption {
  slug: string;
  name: string;
}

interface ApiResponse {
  ok:                   boolean;
  bookmaker:            string;
  date:                 string;
  total_events:         number;
  total_opportunities:  number;
  bookmakers_available: BookmakerOption[];
  results:              FreebetOpportunity[];
  error?:               string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(utc: string | null): string {
  if (!utc) return '—';
  try { return new Date(utc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  catch { return utc; }
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const OUTCOME_LABEL: Record<string, string> = { home: 'Casa', draw: 'Empate', away: 'Fora' };
const OUTCOME_ABBR:  Record<string, string> = { home: '1', draw: 'X', away: '2' };

// ── Componente principal ──────────────────────────────────────────────────────

export function FreebetConverterPage() {
  const [bookmakers, setBookmakers]   = useState<BookmakerOption[]>([]);
  const [selected,   setSelected]     = useState<string>('');
  const [amount,     setAmount]       = useState<number>(100);
  const [results,    setResults]      = useState<FreebetOpportunity[]>([]);
  const [loading,    setLoading]      = useState(false);
  const [loaded,     setLoaded]       = useState(false);
  const [error,      setError]        = useState('');
  const [search,     setSearch]       = useState('');
  const [expanded,   setExpanded]     = useState<string | null>(null);

  // Carrega lista de casas disponíveis ao montar
  useEffect(() => {
    fetch('/api/dg/freebet-calc?bookmaker=__list__')
      .then(r => r.json())
      .then((d: ApiResponse) => {
        if (d.bookmakers_available?.length) {
          const sorted = [...d.bookmakers_available].sort((a, b) =>
            a.name.localeCompare(b.name, 'pt-BR')
          );
          setBookmakers(sorted);
        }
      })
      .catch(() => {});
  }, []);

  async function buscar() {
    if (!selected) return;
    setLoading(true);
    setError('');
    setLoaded(false);
    setExpanded(null);
    try {
      const res  = await fetch(`/api/dg/freebet-calc?bookmaker=${encodeURIComponent(selected)}`);
      const data = await res.json() as ApiResponse;
      if (!data.ok) throw new Error(data.error ?? 'Erro desconhecido');
      setResults(data.results ?? []);
      if (!data.bookmakers_available?.length === false && data.bookmakers_available) {
        const sorted = [...data.bookmakers_available].sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR')
        );
        setBookmakers(sorted);
      }
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar oportunidades');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return results;
    const q = search.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return results.filter(r =>
      r.home_team.toLowerCase().includes(q) ||
      r.away_team.toLowerCase().includes(q) ||
      r.league_name.toLowerCase().includes(q)
    );
  }, [results, search]);

  // Lucro real baseado no amount
  function profit(r: FreebetOpportunity): number {
    return (r.profit_per_100 / 100) * amount;
  }
  function coverCost(r: FreebetOpportunity): number {
    return (r.cover_cost_per_100 / 100) * amount;
  }
  function coverStake(c: CoverBet): number {
    return (c.stake_per_100 / 100) * amount;
  }

  // Cor de conversão
  function convColor(pct: number): string {
    if (pct >= 60) return 'hsl(150 90% 58%)';
    if (pct >= 45) return 'hsl(150 70% 52%)';
    if (pct >= 30) return 'hsl(38 95% 65%)';
    return 'rgba(255,255,255,.5)';
  }

  return (
    <div className="mx-auto flex flex-col gap-5" style={{ maxWidth: 860 }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-base font-black tracking-tight" style={{ color: 'var(--t)' }}>
          Converter Freebet
        </h1>
        <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
          Calcula as melhores coberturas usando as odds importadas do dia
        </p>
      </div>

      {/* ── Painel de configuração ──────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl" style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,.07) 0%, rgba(13,17,23,0.9) 55%)',
        border: '1px solid rgba(99,102,241,.28)',
        boxShadow: '0 4px 28px rgba(0,0,0,.45), 0 0 20px rgba(99,102,241,.05) inset',
      }}>
        {/* Barra topo */}
        <div style={{ height: 2, background: 'linear-gradient(90deg, rgba(99,102,241,.95) 0%, rgba(99,102,241,.35) 45%, transparent 100%)' }} />

        <div className="flex flex-wrap items-end gap-4 px-5 py-4">

          {/* Seleção da casa */}
          <div className="flex flex-col gap-1.5 flex-1" style={{ minWidth: 180 }}>
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.4)' }}>
              Casa com a freebet
            </label>
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="rounded-xl px-3 py-2.5 text-[13px] font-semibold outline-none appearance-none"
              style={{
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.1)',
                color: selected ? 'var(--t)' : 'var(--t3)',
              }}>
              <option value="">Selecionar casa…</option>
              {bookmakers.map(bk => (
                <option key={bk.slug} value={bk.slug}>{bk.name}</option>
              ))}
            </select>
          </div>

          {/* Valor da freebet */}
          <div className="flex flex-col gap-1.5" style={{ minWidth: 140 }}>
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.4)' }}>
              Valor da freebet (R$)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-bold"
                style={{ color: 'rgba(255,255,255,.35)' }}>R$</span>
              <input
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={e => setAmount(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-xl py-2.5 pl-9 pr-3 text-[13px] font-semibold outline-none"
                style={{
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(255,255,255,.1)',
                  color: 'var(--t)',
                }}
              />
            </div>
          </div>

          {/* Botão buscar */}
          <button
            onClick={buscar}
            disabled={!selected || loading}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-black transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-35"
            style={{
              background: 'rgba(99,102,241,.9)',
              color: '#fff',
              boxShadow: '0 4px 20px rgba(99,102,241,.4), 0 1px 0 rgba(255,255,255,.15) inset',
            }}>
            {loading
              ? <RefreshCw size={14} className="animate-spin" />
              : <Gift size={14} />
            }
            {loading ? 'Calculando…' : 'Buscar oportunidades'}
          </button>
        </div>

        {/* Quick amounts */}
        <div className="flex items-center gap-2 border-t px-5 py-3" style={{ borderColor: 'rgba(255,255,255,.05)' }}>
          <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,.25)' }}>Rápido:</span>
          {[25, 50, 100, 200, 500].map(v => (
            <button key={v}
              onClick={() => setAmount(v)}
              className="rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors"
              style={{
                background: amount === v ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${amount === v ? 'rgba(99,102,241,.4)' : 'rgba(255,255,255,.07)'}`,
                color: amount === v ? '#818cf8' : 'rgba(255,255,255,.4)',
              }}>
              R${v}
            </button>
          ))}
        </div>
      </div>

      {/* ── Erro ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.2)', color: '#f87171' }}>
          <AlertCircle size={14} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* ── Resultados ──────────────────────────────────────────────────── */}
      {loaded && (
        <>
          {/* Resumo + busca */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1">
              <p className="text-[13px] font-bold" style={{ color: 'var(--t)' }}>
                {filtered.length} oportunidade{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
                ordenadas por maior % de conversão · freebet de R${fmtBRL(amount)}
              </p>
            </div>
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filtrar jogo ou liga…"
                className="rounded-xl py-2 pl-8 pr-3 text-[12px] outline-none"
                style={{
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(255,255,255,.08)',
                  color: 'var(--t)',
                  width: 200,
                }}
              />
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16" style={{ color: 'var(--t3)' }}>
              <Gift size={32} className="opacity-20" />
              <p className="text-sm font-semibold">Nenhuma oportunidade encontrada</p>
              <p className="text-xs opacity-60">
                {results.length === 0
                  ? 'Importe as odds de hoje pelo painel Admin para gerar resultados.'
                  : 'Tente outro filtro de busca.'}
              </p>
            </div>
          )}

          {/* Cards de oportunidade */}
          <div className="flex flex-col gap-3">
            {filtered.map((r, idx) => {
              const isOpen  = expanded === r.match_id + r.freebet_outcome;
              const lucro   = profit(r);
              const custo   = coverCost(r);

              return (
                <div key={r.match_id + r.freebet_outcome}
                  className="fb-card overflow-hidden rounded-2xl"
                  style={{
                    background: 'rgba(13,17,23,0.8)',
                    border: '1px solid rgba(255,255,255,.08)',
                    boxShadow: '0 4px 20px rgba(0,0,0,.35)',
                  }}>

                  {/* Barra topo colorida por conversão */}
                  <div style={{
                    height: 2,
                    background: `linear-gradient(90deg, ${convColor(r.conversion_pct)} 0%, ${convColor(r.conversion_pct)}33 55%, transparent 100%)`,
                  }} />

                  {/* Linha principal — clique para expandir */}
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : r.match_id + r.freebet_outcome)}
                    className="w-full text-left px-5 py-4"
                    style={{ display: 'block' }}>

                    <div className="flex items-center gap-4 flex-wrap">

                      {/* Ranking */}
                      <span className="shrink-0 text-[11px] font-black tabular-nums" style={{ color: 'rgba(255,255,255,.2)', width: 20 }}>
                        #{idx + 1}
                      </span>

                      {/* Jogo */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[14px] font-black" style={{ color: 'var(--t)' }}>
                          {r.home_team} x {r.away_team}
                        </p>
                        <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
                          {r.league_name} · {fmtTime(r.start_time)}
                        </p>
                      </div>

                      {/* Freebet outcome */}
                      <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{
                        background: 'rgba(99,102,241,.1)',
                        border: '1px solid rgba(99,102,241,.28)',
                      }}>
                        <Gift size={11} style={{ color: '#818cf8' }} />
                        <span className="text-[11px] font-bold" style={{ color: 'rgb(148,163,255)' }}>
                          {OUTCOME_LABEL[r.freebet_outcome]} ({OUTCOME_ABBR[r.freebet_outcome]})
                        </span>
                        <span className="font-mono text-[12px] font-black tabular-nums" style={{ color: 'rgb(196,181,255)' }}>
                          {r.freebet_odd.toFixed(2)}
                        </span>
                      </div>

                      {/* Badge DG */}
                      {r.source === 'dg' && (
                        <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 shrink-0" style={{
                          background: 'rgba(168,85,247,.1)',
                          border: '1px solid rgba(168,85,247,.28)',
                        }}>
                          <Zap size={10} style={{ color: 'rgba(196,157,255,.9)' }} />
                          <span className="text-[10px] font-black" style={{ color: 'rgba(196,157,255,.9)' }}>
                            DG{r.dg_score != null ? ` ${r.dg_score}` : ''}
                          </span>
                          {r.dg_classification && (
                            <span className="text-[9px] font-black" style={{
                              color: r.dg_classification === 'ALTA' ? 'hsl(150 90% 58%)' : r.dg_classification === 'MEDIA' ? 'hsl(38 95% 65%)' : 'rgba(255,255,255,.35)',
                            }}>
                              {r.dg_classification}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Conversão % */}
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-[24px] font-black tabular-nums leading-none" style={{
                          color: convColor(r.conversion_pct),
                          textShadow: `0 0 20px ${convColor(r.conversion_pct)}60`,
                        }}>
                          {r.conversion_pct.toFixed(1)}%
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.25)' }}>
                          conversão
                        </span>
                      </div>

                      {/* Lucro */}
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-[18px] font-black tabular-nums leading-none" style={{
                          color: 'hsl(150 85% 62%)',
                          textShadow: '0 0 14px hsl(150 85% 55%/0.4)',
                        }}>
                          R${fmtBRL(lucro)}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.25)' }}>
                          lucro garantido
                        </span>
                      </div>

                      <ChevronRight size={14} className="shrink-0 transition-transform" style={{
                        color: 'rgba(255,255,255,.25)',
                        transform: isOpen ? 'rotate(90deg)' : 'none',
                      }} />
                    </div>
                  </button>

                  {/* Detalhe expandido */}
                  {isOpen && (
                    <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: 'rgba(255,255,255,.06)' }}>

                      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))' }}>

                        {/* Freebet */}
                        <div className="rounded-xl p-4" style={{
                          background: 'rgba(99,102,241,.06)',
                          border: '1px solid rgba(99,102,241,.2)',
                        }}>
                          <div className="mb-3 flex items-center gap-2">
                            <Gift size={12} style={{ color: '#818cf8' }} />
                            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#818cf8' }}>
                              Freebet — aposta
                            </span>
                          </div>
                          <p className="text-[13px] font-bold" style={{ color: 'var(--t)' }}>
                            {OUTCOME_LABEL[r.freebet_outcome]} ({OUTCOME_ABBR[r.freebet_outcome]})
                          </p>
                          <p className="text-[22px] font-black tabular-nums" style={{ color: '#818cf8' }}>
                            {r.freebet_odd.toFixed(2)}
                          </p>
                          <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,.4)' }}>
                            Stake: R${fmtBRL(amount)} <span style={{ color: 'rgba(255,255,255,.25)' }}>(freebet — não sai do bolso)</span>
                          </p>
                          {r.freebet_url && (
                            <a href={r.freebet_url} target="_blank" rel="noopener noreferrer"
                              className="mt-2 flex items-center gap-1 text-[11px] font-semibold transition-colors hover:text-cyan-400"
                              style={{ color: 'rgba(129,140,248,.7)' }}>
                              <ExternalLink size={10} /> Abrir evento
                            </a>
                          )}
                        </div>

                        {/* Coberturas */}
                        {r.covers.map(c => (
                          <div key={c.outcome} className="rounded-xl p-4" style={{
                            background: c.is_pa ? 'rgba(255,159,10,.05)' : 'rgba(255,255,255,.03)',
                            border: `1px solid ${c.is_pa ? 'rgba(255,159,10,.2)' : 'rgba(255,255,255,.09)'}`,
                          }}>
                            <div className="mb-3 flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-widest" style={{
                                color: c.is_pa ? 'rgba(255,159,10,.8)' : 'rgba(255,255,255,.35)',
                              }}>
                                Cobertura — {OUTCOME_LABEL[c.outcome]}
                              </span>
                              {c.is_pa && (
                                <span className="rounded px-1 text-[8px] font-bold" style={{
                                  background: 'rgba(255,159,10,.12)',
                                  color: 'rgba(255,159,10,.8)',
                                  border: '1px solid rgba(255,159,10,.25)',
                                }}>PA</span>
                              )}
                            </div>
                            <p className="text-[13px] font-bold" style={{ color: 'var(--t)' }}>
                              {c.bookmaker_name}
                            </p>
                            <p className="text-[22px] font-black tabular-nums" style={{ color: 'hsl(150 85% 60%)' }}>
                              {c.odd.toFixed(2)}
                            </p>
                            <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,.4)' }}>
                              Stake: R${fmtBRL(coverStake(c))}
                            </p>
                            {c.url && (
                              <a href={c.url} target="_blank" rel="noopener noreferrer"
                                className="mt-2 flex items-center gap-1 text-[11px] font-semibold transition-colors hover:text-cyan-400"
                                style={{ color: 'rgba(129,140,248,.7)' }}>
                                <ExternalLink size={10} /> Abrir evento
                              </a>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Resumo financeiro */}
                      <div className="mt-4 rounded-xl px-4 py-3 flex flex-wrap gap-5" style={{
                        background: 'rgba(61,255,143,.04)',
                        border: '1px solid rgba(61,255,143,.15)',
                      }}>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.3)' }}>Freebet</p>
                          <p className="text-[15px] font-black" style={{ color: '#818cf8' }}>R${fmtBRL(amount)}</p>
                          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.25)' }}>stake freebet</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.3)' }}>Cobertura</p>
                          <p className="text-[15px] font-black" style={{ color: 'var(--t)' }}>R${fmtBRL(custo)}</p>
                          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.25)' }}>dinheiro real gasto</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.3)' }}>Lucro garantido</p>
                          <p className="text-[15px] font-black" style={{ color: 'hsl(150 85% 60%)', textShadow: '0 0 10px hsl(150 85% 55%/0.3)' }}>
                            R${fmtBRL(lucro)}
                          </p>
                          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.25)' }}>qualquer resultado</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.3)' }}>Conversão</p>
                          <p className="text-[15px] font-black" style={{ color: convColor(r.conversion_pct) }}>
                            {r.conversion_pct.toFixed(2)}%
                          </p>
                          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.25)' }}>da freebet em dinheiro</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Empty state inicial ──────────────────────────────────────────── */}
      {!loaded && !loading && !error && (
        <div className="flex flex-col items-center gap-4 py-20" style={{ color: 'var(--t3)' }}>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.18)' }}>
            <Gift size={28} style={{ color: 'rgba(99,102,241,.6)' }} />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold">Selecione a casa da freebet</p>
            <p className="mt-1 text-xs opacity-60">
              Escolha a casa onde está sua freebet, informe o valor e clique em buscar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
