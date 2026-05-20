'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Zap, RefreshCw, ExternalLink, Filter, X, ChevronDown, ChevronUp,
  TrendingDown, Target, Trophy, Loader2, AlertCircle, Copy, Check,
} from 'lucide-react';

// ── Tipos (espelho do que a API retorna) ───────────────────────────────────────

interface MLLeg {
  house: string;
  pa:    boolean;
  odd:   number;
  url?:  string;
}

interface MLSignal {
  event_id:   string;
  event_name: string;
  league:     string;
  start_utc:  string;
  leg1:       MLLeg;
  legX:       MLLeg;
  leg2:       MLLeg;
  margin:     number;
  loss_pct:   number;
}

interface GolsSignal {
  event_id:     string;
  event_name:   string;
  league:       string;
  start_utc:    string;
  over_house:   string;
  over_pa:      boolean;
  over_line:    number;
  over_odd:     number;
  over_url?:    string;
  under_house:  string;
  under_pa:     boolean;
  under_line:   number;
  under_odd:    number;
  under_url?:   string;
  gap:          number;
  green_goals:  string;
  both_win_pct: number;
  loss_pct:     number;
}

// ── Casas disponíveis ─────────────────────────────────────────────────────────

const ALL_HOUSES = [
  'Alfabet','Betbra','BetfairSB','Tradeball','Betnacional','Betmgm','Betesporte',
  'Esportesdasorte','Sporty','KTO','Vaidebet','Betano','Novibet','Betsson',
  'Bet365','Betsul','Vivasorte','Pixbet','Sportingbet','Superbet','Apostabet',
  'Br4bet','Esportiva','Sortenabet','Estrelabet','Bet7k','Jogodeouro',
  'Versusbet','Apostaganha','7games','Betao','MCgames',
  'BetmgmSO','BetanoSO','EstrelabetSO','StakeSO','NovibetSO',
  'Br4betSO','EsportivaSO','BetssonSO','VersusbetSO',
];

// ── CSS injetado ───────────────────────────────────────────────────────────────

const PAGE_STYLES = `
@keyframes dg-pulse {
  0%,100% { opacity:1; transform:scale(1); }
  50%      { opacity:.45; transform:scale(.75); }
}
@keyframes dg-slide-in {
  from { opacity:0; transform:translateY(6px); }
  to   { opacity:1; transform:translateY(0); }
}
.dg-signal { animation: dg-slide-in .22s ease-out both; }
`;

// ── Utilitários ────────────────────────────────────────────────────────────────

function fmtTime(utc: string) {
  if (!utc) return '--:--';
  try { return new Date(utc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '--:--'; }
}

function lossColor(pct: number): string {
  if (pct <= 0)  return 'var(--g)';
  if (pct < 2)   return '#a3e635';
  if (pct < 5)   return '#fbbf24';
  if (pct < 10)  return '#f97316';
  return '#ef4444';
}

function fmtLoss(pct: number): string {
  return pct <= 0
    ? `+${Math.abs(pct).toFixed(2)}%`
    : `-${pct.toFixed(2)}%`;
}

function parseTeams(name: string): [string, string] {
  const sep = name.includes(' x ') ? ' x ' : name.includes(' X ') ? ' X ' : ' vs ';
  const [h = '', a = ''] = name.split(sep);
  return [h.trim(), a.trim()];
}

function normHouse(h: string): string {
  return h.toLowerCase().replace(/[\s\-_.]/g, '');
}

// ── Componente: chip de casa ───────────────────────────────────────────────────

function HouseChip({ name, active, onToggle }: { name: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.3px',
        border: `1.5px solid ${active ? 'rgba(63,255,33,.5)' : 'rgba(255,255,255,.08)'}`,
        background: active ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.03)',
        color: active ? 'var(--g)' : 'var(--t3)',
        cursor: 'pointer',
        transition: 'all .15s ease',
        lineHeight: 1.8,
      }}
    >
      {name}
    </button>
  );
}

// ── Componente: badge PA ───────────────────────────────────────────────────────

function PaBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '.5px',
      padding: '1px 5px', borderRadius: 4,
      background: 'rgba(63,255,33,.15)', color: 'var(--g)',
      border: '1px solid rgba(63,255,33,.25)',
    }}>PA</span>
  );
}

// ── Componente: botão copiar link ──────────────────────────────────────────────

function CopyLinkBtn({ url }: { url?: string }) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* ignore */ }
  };
  return (
    <button onClick={copy} title="Copiar link" style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: copied ? 'var(--g)' : 'var(--t3)', padding: 2,
      transition: 'color .15s',
    }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

// ── Sinal ML ──────────────────────────────────────────────────────────────────

function MLCard({ sig, idx }: { sig: MLSignal; idx: number }) {
  const [home, away] = parseTeams(sig.event_name);
  const color        = lossColor(sig.loss_pct);
  const legs         = [
    { ...sig.leg1, outcome: 'CASA (1)' },
    { ...sig.legX, outcome: 'EMPATE (X)' },
    { ...sig.leg2, outcome: 'FORA (2)' },
  ];

  return (
    <div
      className="dg-signal"
      style={{
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 12,
        padding: '14px 16px',
        animationDelay: `${Math.min(idx, 30) * 18}ms`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.35, wordBreak: 'break-word' }}>
            {home && away ? <>{home} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>×</span> {away}</> : sig.event_name}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
            <Trophy size={9} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sig.league || '—'}</span>
            <span style={{ color: 'var(--t3)', opacity: .6 }}>·</span>
            <span>{fmtTime(sig.start_utc)}</span>
          </div>
        </div>
        {/* Perda / lucro badge */}
        <div style={{
          textAlign: 'center',
          background: `${color}18`,
          border: `1.5px solid ${color}40`,
          borderRadius: 8,
          padding: '5px 12px',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: 'var(--font-mono, monospace)', lineHeight: 1 }}>
            {fmtLoss(sig.loss_pct)}
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 1, letterSpacing: '.3px' }}>
            {sig.loss_pct <= 0 ? 'LUCRO' : 'PERDA'}
          </div>
        </div>
      </div>

      {/* Pernas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {legs.map((leg, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,.04)',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.3px',
              color: i === 0 ? '#60a5fa' : i === 1 ? '#a78bfa' : '#34d399',
              minWidth: 24,
            }}>{['1','X','2'][i]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {leg.house} {leg.pa && <PaBadge />}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>{leg.outcome}</div>
            </div>
            <div style={{
              fontSize: 14, fontWeight: 800, color: 'var(--t1)',
              fontFamily: 'var(--font-mono, monospace)',
              letterSpacing: '-.3px',
            }}>{leg.odd.toFixed(2)}</div>
            {leg.url && (
              <>
                <a href={leg.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--t3)', display: 'flex', alignItems: 'center' }}>
                  <ExternalLink size={11} />
                </a>
                <CopyLinkBtn url={leg.url} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sinal Gols ────────────────────────────────────────────────────────────────

function GolsCard({ sig, idx }: { sig: GolsSignal; idx: number }) {
  const [home, away] = parseTeams(sig.event_name);
  const color        = lossColor(sig.loss_pct);

  return (
    <div
      className="dg-signal"
      style={{
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 12,
        padding: '14px 16px',
        animationDelay: `${Math.min(idx, 30) * 18}ms`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.35, wordBreak: 'break-word' }}>
            {home && away ? <>{home} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>×</span> {away}</> : sig.event_name}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
            <Trophy size={9} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sig.league || '—'}</span>
            <span style={{ color: 'var(--t3)', opacity: .6 }}>·</span>
            <span>{fmtTime(sig.start_utc)}</span>
          </div>
        </div>
        {/* badges direita */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <div style={{
            background: `${color}18`,
            border: `1.5px solid ${color}40`,
            borderRadius: 8, padding: '5px 12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: 'var(--font-mono, monospace)', lineHeight: 1 }}>
              {fmtLoss(sig.loss_pct)}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 1, letterSpacing: '.3px' }}>
              {sig.loss_pct <= 0 ? 'LUCRO' : 'PERDA'}
            </div>
          </div>
          {/* zona verde */}
          <div style={{
            fontSize: 10, color: 'var(--g)', fontWeight: 700, letterSpacing: '.3px',
            background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.2)',
            borderRadius: 6, padding: '2px 8px', textAlign: 'center',
          }}>
            ⚽ {sig.green_goals} {parseInt(sig.green_goals) === 1 ? 'gol' : 'gols'}
          </div>
        </div>
      </div>

      {/* Pernas Over + Under */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          {
            label: `OVER ${sig.over_line}`,
            house: sig.over_house,
            pa:    sig.over_pa,
            odd:   sig.over_odd,
            url:   sig.over_url,
            accent: '#34d399',
          },
          {
            label: `UNDER ${sig.under_line}`,
            house: sig.under_house,
            pa:    sig.under_pa,
            odd:   sig.under_odd,
            url:   sig.under_url,
            accent: '#f87171',
          },
        ].map((leg, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,.04)',
          }}>
            <span style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: '.4px',
              color: leg.accent, minWidth: 48,
            }}>{leg.label}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {leg.house} {leg.pa && <PaBadge />}
              </div>
            </div>
            <div style={{
              fontSize: 14, fontWeight: 800, color: 'var(--t1)',
              fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-.3px',
            }}>{leg.odd.toFixed(2)}</div>
            {leg.url && (
              <>
                <a href={leg.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--t3)', display: 'flex', alignItems: 'center' }}>
                  <ExternalLink size={11} />
                </a>
                <CopyLinkBtn url={leg.url} />
              </>
            )}
          </div>
        ))}
      </div>

      {/* Rodapé: duplo green info */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        padding: '6px 10px', borderRadius: 8,
        background: 'rgba(63,255,33,.05)', border: '1px solid rgba(63,255,33,.12)',
      }}>
        <Zap size={11} style={{ color: 'var(--g)', flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, color: 'var(--t2)' }}>
          Duplo Green se {sig.green_goals} gols •{' '}
          <span style={{ color: 'var(--g)', fontWeight: 700 }}>
            +{sig.both_win_pct.toFixed(2)}%
          </span>{' '}
          de retorno
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)' }}>
          gap {sig.gap.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// ── Filtros de casa ────────────────────────────────────────────────────────────

function HouseFilter({
  disabled,
  onToggle,
  onReset,
}: {
  disabled: Set<string>;
  onToggle: (h: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: disabled.size > 0 ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.05)',
          border: `1.5px solid ${disabled.size > 0 ? 'rgba(63,255,33,.4)' : 'rgba(255,255,255,.1)'}`,
          color: disabled.size > 0 ? 'var(--g)' : 'var(--t2)',
          cursor: 'pointer',
        }}
      >
        <Filter size={13} />
        Casas
        {disabled.size > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: 'center',
            background: 'rgba(63,255,33,.25)', borderRadius: 10,
            padding: '0 5px', color: 'var(--g)',
          }}>{ALL_HOUSES.length - disabled.size}</span>
        )}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 50,
          marginTop: 6, padding: 14,
          background: 'var(--surface, #111)', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.6)',
          minWidth: 320, maxWidth: 420,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', letterSpacing: '.5px' }}>CASAS ATIVAS</span>
            <button onClick={onReset} style={{
              fontSize: 10, color: 'var(--t3)', background: 'none', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <X size={10} /> Resetar
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {ALL_HOUSES.map(h => (
              <HouseChip
                key={h}
                name={h}
                active={!disabled.has(normHouse(h))}
                onToggle={() => onToggle(normHouse(h))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estado de carregamento / erro ─────────────────────────────────────────────

function EmptyState({ loading, error, tab }: { loading: boolean; error: string; tab: string }) {
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 0', color: 'var(--t3)' }}>
      <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--g)' }} />
      <span style={{ fontSize: 13 }}>Calculando sinais…</span>
    </div>
  );
  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '60px 0', color: 'var(--t3)' }}>
      <AlertCircle size={24} style={{ color: '#f87171' }} />
      <span style={{ fontSize: 13 }}>{error}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '60px 0', color: 'var(--t3)' }}>
      <Target size={28} style={{ opacity: .4 }} />
      <span style={{ fontSize: 13 }}>Nenhum sinal de {tab} encontrado ainda.</span>
      <span style={{ fontSize: 11, opacity: .6 }}>Certifique-se de que o cache está atualizado (renew-cookie.mjs rodando no PC).</span>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export function DuploGreenPage() {
  const [tab,           setTab]          = useState<'ml' | 'gols'>('ml');
  const [mlSignals,     setMlSignals]    = useState<MLSignal[]>([]);
  const [golsSignals,   setGolsSignals]  = useState<GolsSignal[]>([]);
  const [loading,       setLoading]      = useState(false);
  const [error,         setError]        = useState('');
  const [computedAt,    setComputedAt]   = useState('');
  const [totalEvents,   setTotalEvents]  = useState(0);
  const [disabledHouses, setDisabledHouses] = useState<Set<string>>(new Set());
  const [countdown,     setCountdown]   = useState(30);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Buscar sinais ────────────────────────────────────────────────────────────

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError('');
    setCountdown(30);
    try {
      const res  = await fetch('/api/supermonitor/duplo-green', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled_houses: Array.from(disabledHouses) }),
      });
      const json = await res.json() as {
        ok: boolean; error?: string;
        ml?: MLSignal[]; gols?: GolsSignal[];
        total_events?: number; computed_at?: string;
      };
      if (!json.ok) { setError(json.error ?? 'Erro desconhecido'); return; }
      setMlSignals(json.ml   ?? []);
      setGolsSignals(json.gols ?? []);
      setTotalEvents(json.total_events ?? 0);
      setComputedAt(json.computed_at ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, [disabledHouses]);

  // ── Auto-refresh a cada 30s ──────────────────────────────────────────────────

  useEffect(() => {
    fetchSignals();
    intervalRef.current = setInterval(fetchSignals, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recarrega quando filtro de casas muda
  const disabledKey = Array.from(disabledHouses).sort().join(',');
  useEffect(() => { fetchSignals(); }, [disabledKey]); // eslint-disable-line

  // Countdown visual
  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown(v => (v <= 1 ? 30 : v - 1)), 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  // ── Toggle casa ──────────────────────────────────────────────────────────────

  function toggleHouse(h: string) {
    setDisabledHouses(prev => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h); else next.add(h);
      return next;
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const mlVisible   = mlSignals;
  const golsVisible = golsSignals;

  const lastUpdate = computedAt
    ? new Date(computedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  return (
    <>
      {/* Estilos injetados */}
      <style>{PAGE_STYLES}</style>

      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(63,255,33,.12)', border: '1px solid rgba(63,255,33,.2)',
              }}>
                <Zap size={16} style={{ color: 'var(--g)' }} />
              </div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-.3px' }}>
                Duplo Green
              </h1>
            </div>
            {totalEvents > 0 && (
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                {totalEvents} eventos analisados
                {lastUpdate && <> · atualizado às <span style={{ color: 'var(--t2)' }}>{lastUpdate}</span></>}
              </div>
            )}
          </div>

          {/* Controles direita */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* countdown */}
            <div style={{
              fontSize: 11, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--g)',
                display: 'inline-block',
                animation: 'dg-pulse 1.4s ease-in-out infinite',
              }} />
              {countdown}s
            </div>

            {/* Botão refresh manual */}
            <button
              onClick={fetchSignals}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'rgba(255,255,255,.05)', border: '1.5px solid rgba(255,255,255,.1)',
                color: 'var(--t2)', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? .5 : 1, transition: 'opacity .15s',
              }}
            >
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
              Atualizar
            </button>

            {/* Filtro casas */}
            <HouseFilter disabled={disabledHouses} onToggle={toggleHouse} onReset={() => setDisabledHouses(new Set())} />
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, padding: '4px', background: 'rgba(255,255,255,.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,.07)', width: 'fit-content' }}>
          {([
            { key: 'ml',   label: 'ML (PA)',       count: mlSignals.length,   desc: '1X2 · casas PA' },
            { key: 'gols', label: 'Gols',           count: golsSignals.length, desc: 'Over × Under' },
          ] as const).map(({ key, label, count, desc }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '8px 20px', borderRadius: 7,
                background: tab === key ? 'rgba(63,255,33,.12)' : 'transparent',
                border: `1.5px solid ${tab === key ? 'rgba(63,255,33,.3)' : 'transparent'}`,
                color: tab === key ? 'var(--g)' : 'var(--t3)',
                cursor: 'pointer', transition: 'all .15s ease', minWidth: 110,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</span>
                {count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, minWidth: 20, textAlign: 'center',
                    background: tab === key ? 'rgba(63,255,33,.25)' : 'rgba(255,255,255,.1)',
                    borderRadius: 10, padding: '0 5px',
                  }}>{count}</span>
                )}
              </div>
              <span style={{ fontSize: 9.5, letterSpacing: '.3px', marginTop: 1 }}>{desc}</span>
            </button>
          ))}
        </div>

        {/* ── Legenda de cores ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>Pior cenário:</span>
          {[
            { label: 'Lucro', color: 'var(--g)' },
            { label: '< 2%',  color: '#a3e635' },
            { label: '< 5%',  color: '#fbbf24' },
            { label: '< 10%', color: '#f97316' },
            { label: '≥ 10%', color: '#ef4444' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
              <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>{item.label}</span>
            </div>
          ))}
          <div style={{
            marginLeft: 'auto', fontSize: 10.5, color: 'var(--t3)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <TrendingDown size={11} />
            Ordenado por menor perda
          </div>
        </div>

        {/* ── Grid de sinais ────────────────────────────────────────────────── */}
        {tab === 'ml' && (
          <>
            {(loading || error || mlVisible.length === 0) ? (
              <EmptyState loading={loading} error={error} tab="ML" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                {mlVisible.map((sig, i) => <MLCard key={`${sig.event_id}-${sig.leg1.house}-${sig.leg2.house}`} sig={sig} idx={i} />)}
              </div>
            )}
          </>
        )}

        {tab === 'gols' && (
          <>
            {(loading || error || golsVisible.length === 0) ? (
              <EmptyState loading={loading} error={error} tab="Gols" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                {golsVisible.map((sig, i) => <GolsCard key={`${sig.event_id}-${sig.over_house}-${sig.under_house}`} sig={sig} idx={i} />)}
              </div>
            )}
          </>
        )}

      </div>
    </>
  );
}
