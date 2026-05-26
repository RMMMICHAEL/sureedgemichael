'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Radio, RefreshCw, PauseCircle, PlayCircle,
  TrendingUp, Filter, Bell, BellOff, ChevronDown,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// ── CSS keyframes ──────────────────────────────────────────────────────────────
const STYLES = `
@keyframes scannerPulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(61,255,143,.4); }
  50%       { opacity: .7; box-shadow: 0 0 0 6px rgba(61,255,143,0); }
}
@keyframes scannerNewBorder {
  0%, 100% { border-color: rgba(61,255,143,.6); }
  50%       { border-color: rgba(61,255,143,.15); }
}
@keyframes scannerFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes liveDot {
  0%, 100% { opacity: 1; }
  50%       { opacity: .25; }
}
`;

// ── Types ──────────────────────────────────────────────────────────────────────
interface Signal {
  id:            string;
  tipo:          string | null;
  jogo:          string | null;
  casa1:         string | null;
  casa2:         string | null;
  casa3:         string | null;
  campeonato:    string | null;
  data_evento:   string | null;
  profit_margin: number;
  is_new:        boolean;
  new_at:        string | null;
  updated_at:    string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function profitColor(p: number) {
  if (p >= 0)  return '#3DFF8F';
  if (p >= -1) return '#FFD60A';
  if (p >= -2) return '#FF9F0A';
  return '#FF6B6B';
}

function profitBg(p: number) {
  if (p >= 0)  return 'rgba(61,255,143,.10)';
  if (p >= -1) return 'rgba(255,214,10,.09)';
  if (p >= -2) return 'rgba(255,159,10,.09)';
  return 'rgba(255,107,107,.09)';
}

function formatProfit(p: number) {
  return (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch { return iso.slice(0, 16).replace('T', ' '); }
}

function formatAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)  return `${s}s atrás`;
  if (s < 3600) return `${Math.floor(s / 60)}m atrás`;
  return `${Math.floor(s / 3600)}h atrás`;
}

// ── Supabase (para pausa do daemon) ───────────────────────────────────────────
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── Componente: chip de casa ──────────────────────────────────────────────────
function CasaChip({ name }: { name: string }) {
  const isPA = name.includes('(PA)') || name.includes('(pa)');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500,
      background: isPA ? 'rgba(255,159,10,.12)' : 'rgba(255,255,255,.07)',
      color: isPA ? '#FF9F0A' : '#CBD5E1',
      border: `1px solid ${isPA ? 'rgba(255,159,10,.25)' : 'rgba(255,255,255,.08)'}`,
      whiteSpace: 'nowrap',
    }}>
      {name}
      {isPA && <span style={{ fontSize: 9, opacity: .8 }}>PA</span>}
    </span>
  );
}

// ── Componente: badge tipo ────────────────────────────────────────────────────
function TipoBadge({ tipo }: { tipo: string | null }) {
  const isDuo = tipo === 'DUO';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700,
      letterSpacing: '.04em', textTransform: 'uppercase',
      background: isDuo ? 'rgba(139,92,246,.18)' : 'rgba(56,189,248,.16)',
      color:      isDuo ? '#A78BFA' : '#38BDF8',
      border: `1px solid ${isDuo ? 'rgba(139,92,246,.3)' : 'rgba(56,189,248,.25)'}`,
    }}>
      {tipo ?? '—'}
    </span>
  );
}

// ── Componente: card de sinal ──────────────────────────────────────────────────
function SignalCard({ signal }: { signal: Signal }) {
  const casas = [signal.casa1, signal.casa2, signal.casa3].filter(Boolean) as string[];
  const profit = signal.profit_margin;

  return (
    <div style={{
      background: 'rgba(255,255,255,.04)',
      border: `1px solid ${signal.is_new ? 'rgba(61,255,143,.45)' : 'rgba(255,255,255,.07)'}`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
      animation: signal.is_new
        ? 'scannerFadeIn .3s ease-out, scannerNewBorder 1.8s ease-in-out 3'
        : 'scannerFadeIn .25s ease-out',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Linha de acento colorida pelo profit */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: profitColor(profit), opacity: profit >= 0 ? .7 : .35,
        borderRadius: '10px 10px 0 0',
      }} />

      {/* Header: jogo + tipo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0', lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {signal.jogo ?? 'Jogo desconhecido'}
          </div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
            {signal.campeonato ?? '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {signal.is_new && (
            <span style={{
              padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
              background: 'rgba(61,255,143,.15)', color: '#3DFF8F',
              border: '1px solid rgba(61,255,143,.3)', letterSpacing: '.04em',
              animation: 'scannerPulse 1.6s ease-in-out infinite',
            }}>
              NOVO
            </span>
          )}
          <TipoBadge tipo={signal.tipo} />
        </div>
      </div>

      {/* Profit */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 6, alignSelf: 'flex-start',
        background: profitBg(profit),
        border: `1px solid ${profitColor(profit)}30`,
      }}>
        <TrendingUp size={12} color={profitColor(profit)} />
        <span style={{ fontSize: 15, fontWeight: 700, color: profitColor(profit), fontVariantNumeric: 'tabular-nums' }}>
          {formatProfit(profit)}
        </span>
      </div>

      {/* Casas */}
      {casas.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {casas.map((c, i) => <CasaChip key={i} name={c} />)}
        </div>
      )}

      {/* Footer: data + atualizado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <span style={{ fontSize: 11, color: '#475569' }}>
          {signal.data_evento ? `⚽ ${formatDate(signal.data_evento)}` : ''}
        </span>
        <span style={{ fontSize: 10, color: '#334155' }}>
          {formatAgo(signal.updated_at)}
        </span>
      </div>
    </div>
  );
}

// ── Componente: filtro de tipo ────────────────────────────────────────────────
function TipoFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { id: '',    label: 'Todos' },
    { id: 'ML',  label: 'ML'   },
    { id: 'DUO', label: 'DUO'  },
  ];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {opts.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: '1px solid',
            background: value === o.id ? 'rgba(255,255,255,.1)' : 'transparent',
            borderColor: value === o.id ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.07)',
            color: value === o.id ? '#E2E8F0' : '#64748B',
            transition: 'all .15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export function ScannerPage() {
  const [signals,     setSignals]     = useState<Signal[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastFetch,   setLastFetch]   = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [beep,        setBeep]        = useState(true);
  const [paused,      setPaused]      = useState(false);
  const [pausing,     setPausing]     = useState(false);

  // Filtros
  const [tipo,      setTipo]      = useState('');
  const [profitMin, setProfitMin] = useState(-2.5);
  const [onlyNew,   setOnlyNew]   = useState(false);

  const prevNewIds = useRef<Set<string>>(new Set());
  const audioCtx   = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Beep ──────────────────────────────────────────────────────────────────────
  const playBeep = useCallback(() => {
    if (!beep) return;
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + .12);
      gain.gain.setValueAtTime(.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + .22);
    } catch { /* contexto de audio não disponível */ }
  }, [beep]);

  // ── Fetch sinais ──────────────────────────────────────────────────────────────
  const fetchSignals = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        profitMin: String(profitMin),
        limit:     '300',
      });
      if (tipo)    qs.set('tipo', tipo);
      if (onlyNew) qs.set('onlyNew', 'true');

      const res = await fetch(`/api/sure/scanner?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { ok: boolean; signals: Signal[]; error?: string };

      if (!json.ok) throw new Error(json.error ?? 'Erro desconhecido');

      const incoming = json.signals as Signal[];

      // Detecta novos sinais para bipe
      const newIds = new Set(incoming.filter(s => s.is_new).map(s => s.id));
      const hasNew = [...newIds].some(id => !prevNewIds.current.has(id));
      if (hasNew) playBeep();
      prevNewIds.current = newIds;

      setSignals(incoming);
      setLastFetch(new Date());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tipo, profitMin, onlyNew, playBeep]);

  // ── Auto-refresh a cada 5s ────────────────────────────────────────────────────
  useEffect(() => {
    fetchSignals();
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchSignals(true), 5_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchSignals, autoRefresh]);

  // ── Pausa / retoma daemon via Supabase ────────────────────────────────────────
  const togglePause = useCallback(async () => {
    setPausing(true);
    try {
      const sb      = getSupabase();
      const newVal  = !paused ? 'true' : 'false';
      await sb.from('app_config').upsert(
        { key: 'scanner_paused', value: newVal, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      setPaused(!paused);
    } catch (e) {
      console.error('togglePause:', e);
    } finally {
      setPausing(false);
    }
  }, [paused]);

  // ── Lê estado de pausa ao montar ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const sb = getSupabase();
        const { data } = await sb.from('app_config').select('value').eq('key', 'scanner_paused').single();
        if (data?.value === 'true') setPaused(true);
      } catch { /* ignora */ }
    })();
  }, []);

  // ── Contadores ────────────────────────────────────────────────────────────────
  const newCount      = signals.filter(s => s.is_new).length;
  const positiveCount = signals.filter(s => s.profit_margin >= 0).length;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>
      <div style={{ padding: '20px 20px 40px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: paused ? '#FF9F0A' : '#3DFF8F',
                animation: paused ? 'none' : 'liveDot 1.4s ease-in-out infinite',
                flexShrink: 0,
              }} />
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>
                Scanner de Alertas
              </h1>
              {paused && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  background: 'rgba(255,159,10,.15)', color: '#FF9F0A',
                  border: '1px solid rgba(255,159,10,.3)',
                }}>
                  PAUSADO
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: '#475569', margin: '4px 0 0 18px' }}>
              {lastFetch
                ? `Atualizado ${formatAgo(lastFetch.toISOString())} · ${signals.length} sinais`
                : 'Carregando sinais...'}
              {newCount > 0 && (
                <span style={{ marginLeft: 8, color: '#3DFF8F', fontWeight: 600 }}>
                  · {newCount} novo{newCount > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>

          {/* Ações */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => fetchSignals()}
              title="Atualizar agora"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                color: '#94A3B8', cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Refresh
            </button>

            <button
              onClick={() => setBeep(v => !v)}
              title={beep ? 'Silenciar alertas' : 'Ativar alertas sonoros'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                background: beep ? 'rgba(61,255,143,.08)' : 'rgba(255,255,255,.05)',
                border: `1px solid ${beep ? 'rgba(61,255,143,.2)' : 'rgba(255,255,255,.08)'}`,
                color: beep ? '#3DFF8F' : '#475569', cursor: 'pointer',
              }}
            >
              {beep ? <Bell size={13} /> : <BellOff size={13} />}
              {beep ? 'Som ativo' : 'Mudo'}
            </button>

            <button
              onClick={togglePause}
              disabled={pausing}
              title={paused ? 'Retomar daemon' : 'Pausar daemon (libera sessão no SuperMonitor)'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                background: paused ? 'rgba(61,255,143,.08)' : 'rgba(255,159,10,.08)',
                border: `1px solid ${paused ? 'rgba(61,255,143,.2)' : 'rgba(255,159,10,.22)'}`,
                color: paused ? '#3DFF8F' : '#FF9F0A',
                cursor: pausing ? 'not-allowed' : 'pointer', opacity: pausing ? .6 : 1,
              }}
            >
              {paused ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
              {paused ? 'Retomar' : 'Pausar daemon'}
            </button>
          </div>
        </div>

        {/* Barra de filtros */}
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
          padding: '12px 14px', borderRadius: 9, marginBottom: 18,
          background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={12} color="#475569" />
            <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>Filtros</span>
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.07)' }} />

          {/* Tipo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>Tipo</span>
            <TipoFilter value={tipo} onChange={setTipo} />
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.07)' }} />

          {/* Profit mín */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>Profit mín.</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[-2.5, -2, -1, -0.5, 0].map(v => (
                <button
                  key={v}
                  onClick={() => setProfitMin(v)}
                  style={{
                    padding: '4px 9px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                    cursor: 'pointer', border: '1px solid',
                    background: profitMin === v ? profitBg(v) : 'transparent',
                    borderColor: profitMin === v ? `${profitColor(v)}40` : 'rgba(255,255,255,.07)',
                    color: profitMin === v ? profitColor(v) : '#475569',
                    transition: 'all .12s',
                  }}
                >
                  {v >= 0 ? '+' : ''}{v}%
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.07)' }} />

          {/* Apenas novos */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <div
              onClick={() => setOnlyNew(v => !v)}
              style={{
                width: 32, height: 17, borderRadius: 9, cursor: 'pointer',
                background: onlyNew ? 'rgba(61,255,143,.35)' : 'rgba(255,255,255,.1)',
                border: `1px solid ${onlyNew ? 'rgba(61,255,143,.4)' : 'rgba(255,255,255,.12)'}`,
                position: 'relative', transition: 'all .15s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2, width: 11, height: 11, borderRadius: '50%',
                background: onlyNew ? '#3DFF8F' : '#475569',
                left: onlyNew ? 18 : 2, transition: 'left .15s, background .15s',
              }} />
            </div>
            <span style={{ fontSize: 11, color: onlyNew ? '#3DFF8F' : '#475569' }}>Só novos</span>
          </label>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <div
                onClick={() => setAutoRefresh(v => !v)}
                style={{
                  width: 32, height: 17, borderRadius: 9, cursor: 'pointer',
                  background: autoRefresh ? 'rgba(56,189,248,.3)' : 'rgba(255,255,255,.1)',
                  border: `1px solid ${autoRefresh ? 'rgba(56,189,248,.4)' : 'rgba(255,255,255,.12)'}`,
                  position: 'relative', transition: 'all .15s',
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, width: 11, height: 11, borderRadius: '50%',
                  background: autoRefresh ? '#38BDF8' : '#475569',
                  left: autoRefresh ? 18 : 2, transition: 'left .15s, background .15s',
                }} />
              </div>
              <span style={{ fontSize: 11, color: autoRefresh ? '#38BDF8' : '#475569' }}>
                Auto (5s)
              </span>
            </label>
          </div>
        </div>

        {/* Stats rápidas */}
        {signals.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Total',    value: signals.length,   color: '#94A3B8' },
              { label: 'Novos',    value: newCount,         color: '#3DFF8F' },
              { label: 'Lucro ≥0', value: positiveCount,   color: '#3DFF8F' },
              { label: 'ML',       value: signals.filter(s => s.tipo === 'ML').length,  color: '#38BDF8' },
              { label: 'DUO',      value: signals.filter(s => s.tipo === 'DUO').length, color: '#A78BFA' },
            ].map(stat => (
              <div key={stat.label} style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12,
                background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)',
                color: '#475569',
              }}>
                <span style={{ color: stat.color, fontWeight: 600 }}>{stat.value}</span>
                {' '}{stat.label}
              </div>
            ))}
          </div>
        )}

        {/* Estado: erro */}
        {error && (
          <div style={{
            padding: '14px 16px', borderRadius: 8, marginBottom: 16,
            background: 'rgba(255,69,58,.08)', border: '1px solid rgba(255,69,58,.2)',
            color: '#FF6B6B', fontSize: 13,
          }}>
            Erro ao buscar sinais: {error}
            {error.includes('daemon') && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#FF9F0A' }}>
                Verifique se o <code style={{ fontFamily: 'monospace' }}>process-queue.mjs</code> está rodando no seu PC.
              </div>
            )}
          </div>
        )}

        {/* Estado: carregando */}
        {loading && signals.length === 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '60px 0', color: '#475569', fontSize: 14,
          }}>
            <Radio size={18} style={{ animation: 'spin 1.5s linear infinite', color: '#3DFF8F' }} />
            Conectando ao scanner...
          </div>
        )}

        {/* Estado: vazio */}
        {!loading && !error && signals.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '60px 20px', gap: 12, color: '#334155',
          }}>
            <Radio size={32} strokeWidth={1.5} />
            <div style={{ fontSize: 15, fontWeight: 500, color: '#475569' }}>Nenhum sinal encontrado</div>
            <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 340 }}>
              {paused
                ? 'O scanner está pausado. Clique em "Retomar" para iniciar a captação.'
                : 'O daemon está buscando sinais. Aguarde ou ajuste os filtros.'}
            </div>
          </div>
        )}

        {/* Grid de sinais */}
        {signals.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 10,
          }}>
            {signals.map(s => <SignalCard key={s.id} signal={s} />)}
          </div>
        )}
      </div>
    </>
  );
}
