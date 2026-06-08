'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, TrendingUp, Gamepad2, Clock, AlertCircle, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { FifaEvent, Surebet, MarketOdds } from '@/app/api/fifa/odds/route';

const ADMIN_EMAIL = 'michaelrodrifues04@gmail.com';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toFixed(d);
}

function timeLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  } catch {
    return '--';
  }
}

function profitColor(p: number): string {
  if (p >= 3)  return '#3fff21';
  if (p >= 1)  return '#ffd600';
  return '#3fff21';
}

// ── sub-components ────────────────────────────────────────────────────────────

function SurebetCard({ sb }: { sb: Surebet }) {
  const [expanded, setExpanded] = useState(false);
  const pColor = profitColor(sb.profit);

  const bgType: Record<string, string> = {
    dc_1x_2:  'rgba(63,255,33,.05)',
    dc_x2_1:  'rgba(63,255,33,.05)',
    dc_12_x:  'rgba(63,255,33,.05)',
    ou_same:  'rgba(59,130,246,.07)',
    ou_cross: 'rgba(139,92,246,.07)',
  };
  const borderType: Record<string, string> = {
    dc_1x_2:  'rgba(63,255,33,.18)',
    dc_x2_1:  'rgba(63,255,33,.18)',
    dc_12_x:  'rgba(63,255,33,.18)',
    ou_same:  'rgba(59,130,246,.25)',
    ou_cross: 'rgba(139,92,246,.25)',
  };

  function LegRow({ leg, label }: { leg: MarketOdds; label: string }) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,.03)',
          border: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {label} · {leg.bookmaker.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t)', fontWeight: 600, marginTop: 2 }}>
            {leg.type === 'over_under'
              ? `${leg.outcome === 'over' ? 'Over' : 'Under'} ${leg.line}`
              : leg.type === 'double_chance'
                ? `Chance Dupla ${leg.outcome}`
                : `Resultado ${leg.outcome === '1' ? 'Casa' : leg.outcome === 'X' ? 'Empate' : 'Fora'}`
            }
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: pColor, minWidth: 44, textAlign: 'right' }}>
          {fmt(leg.odds)}
        </div>
        <a
          href={leg.bookmaker.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title={`Abrir no ${leg.bookmaker.name}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 8,
            background: 'rgba(63,255,33,.08)',
            border: '1px solid rgba(63,255,33,.18)',
            color: 'var(--g)',
            flexShrink: 0,
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  return (
    <div
      style={{
        background: bgType[sb.type] ?? 'rgba(63,255,33,.05)',
        border: `1px solid ${borderType[sb.type] ?? 'rgba(63,255,33,.18)'}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 36, height: 36, borderRadius: 8,
            background: `${pColor}18`,
            border: `1px solid ${pColor}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <TrendingUp size={16} style={{ color: pColor }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', lineHeight: 1.3 }}>
            {sb.label}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
            {sb.leg1.bookmaker.name} × {sb.leg2.bookmaker.name}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: pColor, lineHeight: 1 }}>
            +{fmt(sb.profit)}%
          </div>
          <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            lucro
          </div>
        </div>
        {expanded ? <ChevronUp size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LegRow leg={sb.leg1} label="Aposta 1" />
          <LegRow leg={sb.leg2} label="Aposta 2" />

          {/* Stakes calculator */}
          {sb.stakes && (
            <div
              style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,.02)',
                border: '1px solid rgba(255,255,255,.06)',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                Distribuição (banca R$ 100)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: `${sb.leg1.bookmaker.name}`, val: `R$ ${fmt(sb.stakes.s1)}` },
                  { label: `${sb.leg2.bookmaker.name}`, val: `R$ ${fmt(sb.stakes.s2)}` },
                  { label: 'Lucro garantido', val: `R$ ${fmt(sb.stakes.profit)}`, highlight: true },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 3, lineHeight: 1.2 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: item.highlight ? pColor : 'var(--t)' }}>
                      {item.val}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({ ev }: { ev: FifaEvent }) {
  const [expanded, setExpanded] = useState(ev.hasSurebet);

  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: `1px solid ${ev.hasSurebet ? 'rgba(63,255,33,.22)' : 'var(--b)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'border-color 200ms',
      }}
    >
      {/* Event header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {/* Game icon */}
        <div
          style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: ev.hasSurebet ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.04)',
            border: `1px solid ${ev.hasSurebet ? 'rgba(63,255,33,.2)' : 'rgba(255,255,255,.08)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}
        >
          {ev.hasSurebet ? '🎯' : '🎮'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="truncate">{ev.home}</span>
            <span style={{ color: 'var(--t3)', fontSize: 11, flexShrink: 0 }}>×</span>
            <span className="truncate">{ev.away}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--t3)' }}>{ev.league}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--t3)', opacity: .4 }} />
            <Clock size={10} style={{ color: 'var(--t3)' }} />
            <span style={{ fontSize: 10, color: 'var(--t3)' }}>{timeLabel(ev.startTime)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {/* Category badge */}
          <span
            style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
              background: 'rgba(255,255,255,.06)',
              color: 'var(--t3)',
              border: '1px solid rgba(255,255,255,.1)',
            }}
          >
            {ev.category}
          </span>

          {/* Duration badge — só quando relevante */}
          {ev.duration !== 'other' && (
            <span
              style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                background: ev.duration === '6min' ? 'rgba(59,130,246,.15)' : 'rgba(139,92,246,.15)',
                color:      ev.duration === '6min' ? '#60a5fa'              : '#a78bfa',
                border: `1px solid ${ev.duration === '6min' ? 'rgba(59,130,246,.3)' : 'rgba(139,92,246,.3)'}`,
              }}
            >
              {ev.duration}
            </span>
          )}

          {/* Surebet badge */}
          {ev.hasSurebet && (
            <span
              style={{
                fontSize: 10, fontWeight: 900, padding: '2px 7px', borderRadius: 6,
                background: 'rgba(63,255,33,.12)',
                color: 'var(--g)',
                border: '1px solid rgba(63,255,33,.25)',
              }}
            >
              {ev.surebets.length} SUREBET{ev.surebets.length > 1 ? 'S' : ''}
            </span>
          )}

          {expanded
            ? <ChevronUp size={13} style={{ color: 'var(--t3)' }} />
            : <ChevronDown size={13} style={{ color: 'var(--t3)' }} />
          }
        </div>
      </button>

      {/* Expanded surebets */}
      {expanded && ev.hasSurebet && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            Surebets identificadas
          </div>
          {ev.surebets.map(sb => (
            <SurebetCard key={sb.id} sb={sb} />
          ))}
        </div>
      )}

      {/* Expanded markets (even without surebet) */}
      {expanded && !ev.hasSurebet && ev.markets.length > 0 && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Mercados disponíveis (Bet365)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ev.markets.slice(0, 12).map((m, i) => (
              <div
                key={i}
                style={{
                  padding: '6px 10px', borderRadius: 8,
                  background: 'rgba(255,255,255,.03)',
                  border: '1px solid rgba(255,255,255,.07)',
                }}
              >
                <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 2 }}>
                  {m.type === 'over_under' ? `${m.outcome === 'over' ? 'Over' : 'Under'} ${m.line}` : m.outcome}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>
                  {fmt(m.odds)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function FifaPage() {
  const authEmail = useStore(s => s.authEmail);

  // Gate: apenas admin
  if (authEmail && authEmail !== ADMIN_EMAIL) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        padding: 40, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'rgba(255,77,109,.07)',
          border: '1px solid rgba(255,77,109,.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={22} style={{ color: 'var(--r)' }} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>
            Acesso Restrito
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', maxWidth: 280, lineHeight: 1.6 }}>
            Esta página está disponível apenas para administradores.
          </div>
        </div>
      </div>
    );
  }

  const [events,     setEvents]     = useState<FifaEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'surebet'>('surebet');
  const [duration,   setDuration]   = useState<'all' | '6' | '8'>('all');
  const [stats,      setStats]      = useState({ total: 0, withSurebet: 0, totalRaw: 0 });
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/fifa/odds?filter=${filterMode}&duration=${duration}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setStats({
        total:       data.total ?? 0,
        withSurebet: data.withSurebet ?? 0,
        totalRaw:    data.totalRaw ?? 0,
      });
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [filterMode, duration]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh a cada 2 minutos
  useEffect(() => {
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div style={{ padding: '24px 20px', maxWidth: 800, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(63,255,33,.15), rgba(63,255,33,.05))',
            border: '1px solid rgba(63,255,33,.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}
        >
          🎮
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--t)', margin: 0, letterSpacing: '-0.03em' }}>
              FIFA E-Sports
            </h1>
            <span
              style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                background: 'rgba(63,255,33,.12)', color: 'var(--g)',
                border: '1px solid rgba(63,255,33,.22)',
                textTransform: 'uppercase', letterSpacing: '.08em',
              }}
            >
              Surebet Scanner
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--t3)', margin: '4px 0 0', lineHeight: 1.5 }}>
            Bet365 · Superbet · Sportingbet — jogos de 6min e 8min
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            borderRadius: 10, border: '1px solid var(--b)',
            background: 'rgba(255,255,255,.04)', color: 'var(--t)',
            fontSize: 12, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? .6 : 1,
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Jogos FIFA hoje', val: stats.totalRaw, icon: '🎮' },
          { label: 'Com surebet',     val: stats.withSurebet, icon: '🎯', highlight: true },
          { label: 'Exibindo',        val: stats.total, icon: '📋' },
        ].map(s => (
          <div
            key={s.label}
            style={{
              padding: '12px 14px', borderRadius: 12,
              background: s.highlight ? 'rgba(63,255,33,.06)' : 'rgba(255,255,255,.03)',
              border: `1px solid ${s.highlight ? 'rgba(63,255,33,.18)' : 'rgba(255,255,255,.07)'}`,
            }}
          >
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.highlight ? 'var(--g)' : 'var(--t)', lineHeight: 1 }}>
              {loading ? '—' : s.val}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Filter mode */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--b)' }}>
          {(['surebet', 'all'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setFilterMode(m)}
              style={{
                padding: '7px 14px', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                background: filterMode === m ? 'rgba(63,255,33,.12)' : 'transparent',
                color: filterMode === m ? 'var(--g)' : 'var(--t3)',
                transition: 'all 150ms',
              }}
            >
              {m === 'surebet' ? '🎯 Só Surebets' : '📋 Todos'}
            </button>
          ))}
        </div>

        {/* Duration filter */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--b)' }}>
          {(['all', '6', '8'] as const).map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              style={{
                padding: '7px 14px', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                background: duration === d ? 'rgba(255,255,255,.08)' : 'transparent',
                color: duration === d ? 'var(--t)' : 'var(--t3)',
                transition: 'all 150ms',
              }}
            >
              {d === 'all' ? 'Todos' : `${d} min`}
            </button>
          ))}
        </div>

        {/* Last update */}
        {lastUpdate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
            <span style={{ fontSize: 10, color: 'var(--t3)' }}>
              Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderRadius: 12,
            background: 'rgba(255,77,109,.07)',
            border: '1px solid rgba(255,77,109,.2)',
            marginBottom: 16,
          }}
        >
          <AlertCircle size={16} style={{ color: 'var(--r)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--r)' }}>{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              style={{
                height: 72, borderRadius: 14,
                background: 'rgba(255,255,255,.03)',
                border: '1px solid var(--b)',
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Events list */}
      {!loading && !error && (
        <>
          {events.length === 0 ? (
            <div
              style={{
                textAlign: 'center', padding: '60px 20px',
                color: 'var(--t3)', fontSize: 14,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>
                {filterMode === 'surebet' ? '🔍' : '🎮'}
              </div>
              <div style={{ fontWeight: 700, color: 'var(--t)', marginBottom: 6 }}>
                {filterMode === 'surebet'
                  ? 'Nenhuma surebet identificada no momento'
                  : 'Nenhum jogo FIFA encontrado'}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                {filterMode === 'surebet'
                  ? 'O scanner verifica automaticamente a cada 2 minutos.'
                  : 'Verifique se a chave da API está configurada e se há jogos disponíveis.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {events.map(ev => (
                <EventCard key={ev.eventId} ev={ev} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Info box */}
      <div
        style={{
          marginTop: 24, padding: '14px 16px', borderRadius: 12,
          background: 'rgba(255,255,255,.02)',
          border: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Como funciona
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { icon: '🎯', text: 'DC 1X + Away (2): Aposte Chance Dupla Home/Empate em uma casa e resultado Away na outra. Sempre um ganha.' },
            { icon: '🔄', text: 'DC X2 + Home (1): Chance Dupla Empate/Away em uma casa e Home na outra.' },
            { icon: '📊', text: 'Over/Under cross-line: Over 4.5 em uma casa + Under 5 na outra. Não existe resultado entre 4.5 e 5 — sempre um ganha.' },
            { icon: '⚠️', text: 'Usar "Criar Aposta" da Bet365 para linhas customizadas (ex: Under 6) quando não disponível diretamente.' },
          ].map(item => (
            <div key={item.icon} style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
