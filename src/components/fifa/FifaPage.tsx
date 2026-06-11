'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, TrendingUp, Clock, AlertCircle, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { SurebetEvent, Surebet, SurebetLeg } from '@/app/api/surebet/scan/route';

const ADMIN_EMAIL = 'michael.martins.trader@gmail.com';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) { return n.toFixed(d); }

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    });
  } catch { return '--'; }
}

function profitColor(p: number): string {
  if (p >= 3) return '#3fff21';
  if (p >= 1) return '#ffd600';
  return '#3fff21';
}

// ── SurebetCard ───────────────────────────────────────────────────────────────

function LegRow({ leg, label, pColor }: { leg: SurebetLeg; label: string; pColor: string }) {
  const outcomeLabel = leg.outcome === '1X' ? 'Chance Dupla 1X'
    : leg.outcome === 'X2' ? 'Chance Dupla X2'
    : leg.outcome === '12' ? 'Chance Dupla 12'
    : leg.outcome === '1'  ? 'Casa vence (1)'
    : leg.outcome === 'X'  ? 'Empate (X)'
    : leg.outcome === '2'  ? 'Fora vence (2)'
    : leg.outcome;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderRadius: 8,
      background: 'rgba(255,255,255,.03)',
      border: '1px solid rgba(255,255,255,.07)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {label} · {leg.bookmaker.name}
          {leg.isPa && (
            <span style={{
              marginLeft: 5, fontSize: 11, padding: '1px 5px', borderRadius: 4,
              background: 'rgba(255,159,10,.15)', color: '#FF9F0A',
              border: '1px solid rgba(255,159,10,.3)',
            }}>PA</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--t)', fontWeight: 600, marginTop: 2 }}>
          {outcomeLabel}
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
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 8,
          background: 'rgba(63,255,33,.08)',
          border: '1px solid rgba(63,255,33,.18)',
          color: 'var(--g)', flexShrink: 0, textDecoration: 'none',
        }}
      >
        <ExternalLink size={12} />
      </a>
    </div>
  );
}

function SurebetCard({ sb }: { sb: Surebet }) {
  const [expanded, setExpanded] = useState(false);
  const pColor = profitColor(sb.profit);
  const hasMixedPa = sb.leg1.isPa !== sb.leg2.isPa;

  return (
    <div style={{
      background: 'rgba(63,255,33,.04)',
      border: `1px solid rgba(63,255,33,.16)`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${pColor}18`, border: `1px solid ${pColor}35`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <TrendingUp size={16} style={{ color: pColor }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', lineHeight: 1.3 }}>
            {sb.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>
              {sb.leg1.bookmaker.name} × {sb.leg2.bookmaker.name}
            </span>
            {hasMixedPa && (
              <span style={{
                fontSize: 11, padding: '1px 5px', borderRadius: 4,
                background: 'rgba(255,159,10,.12)', color: '#FF9F0A',
                border: '1px solid rgba(255,159,10,.25)',
              }}>PA + Normal</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: pColor, lineHeight: 1 }}>
            +{fmt(sb.profit)}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            lucro
          </div>
        </div>
        {expanded
          ? <ChevronUp size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />}
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hasMixedPa && (
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(255,159,10,.06)',
              border: '1px solid rgba(255,159,10,.2)',
              fontSize: 11, color: '#FF9F0A', lineHeight: 1.5,
            }}>
              ⚠️ Uma das odds é PA (Pagamento Antecipado). Verifique se as condições de pagamento são equivalentes antes de apostar.
            </div>
          )}
          <LegRow leg={sb.leg1} label="Aposta 1" pColor={pColor} />
          <LegRow leg={sb.leg2} label="Aposta 2" pColor={pColor} />

          {sb.stakes && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,.02)',
              border: '1px solid rgba(255,255,255,.06)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                Distribuição (banca R$ 100)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: sb.leg1.bookmaker.name, val: `R$ ${fmt(sb.stakes.s1)}` },
                  { label: sb.leg2.bookmaker.name, val: `R$ ${fmt(sb.stakes.s2)}` },
                  { label: 'Lucro garantido',       val: `R$ ${fmt(sb.stakes.profit)}`, highlight: true },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3, lineHeight: 1.2 }}>{item.label}</div>
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

// ── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({ ev }: { ev: SurebetEvent }) {
  const [expanded, setExpanded] = useState(ev.hasSurebet);

  return (
    <div style={{
      background: 'var(--bg2)',
      border: `1px solid ${ev.hasSurebet ? 'rgba(63,255,33,.22)' : 'var(--b)'}`,
      borderRadius: 14, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: ev.hasSurebet ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.04)',
          border: `1px solid ${ev.hasSurebet ? 'rgba(63,255,33,.2)' : 'rgba(255,255,255,.08)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>
          {ev.hasSurebet ? '🎯' : '⚽'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.home}</span>
            <span style={{ color: 'var(--t3)', fontSize: 11, flexShrink: 0 }}>×</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.away}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>{ev.league}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--t3)', opacity: .4 }} />
            <Clock size={10} style={{ color: 'var(--t3)' }} />
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>{timeLabel(ev.startTime)}</span>
          </div>
          {/* Bookmakers disponíveis */}
          <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
            {ev.bookmakers.map(bk => (
              <span key={bk} style={{
                fontSize: 11, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.09)',
                color: 'var(--t3)',
              }}>{bk}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {ev.hasSurebet && (
            <span style={{
              fontSize: 11, fontWeight: 900, padding: '2px 7px', borderRadius: 6,
              background: 'rgba(63,255,33,.12)', color: 'var(--g)',
              border: '1px solid rgba(63,255,33,.25)',
            }}>
              {ev.surebets.length} SUREBET{ev.surebets.length > 1 ? 'S' : ''}
            </span>
          )}
          {ev.hasSurebet && (
            <span style={{ fontSize: 11, fontWeight: 700, color: profitColor(ev.surebets[0]?.profit ?? 0) }}>
              +{fmt(ev.surebets[0]?.profit ?? 0)}%
            </span>
          )}
          {expanded
            ? <ChevronUp size={13} style={{ color: 'var(--t3)' }} />
            : <ChevronDown size={13} style={{ color: 'var(--t3)' }} />}
        </div>
      </button>

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
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function FifaPage() {
  const authEmail = useStore(s => s.authEmail);

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

  const [events,     setEvents]     = useState<SurebetEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'surebet'>('surebet');
  const [paMode,     setPaMode]     = useState<'all' | 'sem_pa'>('sem_pa');
  const [stats,      setStats]      = useState({ total: 0, withSurebet: 0, totalRaw: 0, sources: [] as string[] });
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/surebet/scan?all=1&filter=${filterMode}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      let evs: SurebetEvent[] = data.events ?? [];

      // Filtro PA: remove surebets que envolvem PA + não-PA
      if (paMode === 'sem_pa') {
        evs = evs.map(ev => ({
          ...ev,
          surebets: ev.surebets.filter(sb => sb.leg1.isPa === sb.leg2.isPa),
        })).map(ev => ({ ...ev, hasSurebet: ev.surebets.length > 0 }));

        if (filterMode === 'surebet') {
          evs = evs.filter(ev => ev.hasSurebet);
        }
      }

      setEvents(evs);
      setStats({
        total:       evs.length,
        withSurebet: evs.filter(e => e.hasSurebet).length,
        totalRaw:    data.totalRaw ?? 0,
        sources:     data.sources ?? [],
      });
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [filterMode, paMode]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div style={{ padding: '24px 20px', maxWidth: 800, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(63,255,33,.15), rgba(63,255,33,.05))',
          border: '1px solid rgba(63,255,33,.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0,
        }}>⚽</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--t)', margin: 0, letterSpacing: '-0.03em' }}>
              Surebet Scanner
            </h1>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: 'rgba(63,255,33,.12)', color: 'var(--g)',
              border: '1px solid rgba(63,255,33,.22)',
              textTransform: 'uppercase', letterSpacing: '.08em',
            }}>Admin</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--t3)', margin: '4px 0 0', lineHeight: 1.5 }}>
            {stats.sources.length > 0
              ? stats.sources.join(' · ')
              : 'Bet365 · Betano · Sportingbet · Altenar'}
          </p>
        </div>
        <button
          type="button" onClick={load} disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            borderRadius: 10, border: '1px solid var(--b)',
            background: 'rgba(255,255,255,.04)', color: 'var(--t)',
            fontSize: 12, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? .6 : 1,
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Jogos carregados', val: stats.totalRaw, icon: '⚽' },
          { label: 'Com surebet',      val: stats.withSurebet, icon: '🎯', highlight: true },
          { label: 'Exibindo',         val: stats.total, icon: '📋' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '12px 14px', borderRadius: 12,
            background: s.highlight ? 'rgba(63,255,33,.06)' : 'rgba(255,255,255,.03)',
            border: `1px solid ${s.highlight ? 'rgba(63,255,33,.18)' : 'rgba(255,255,255,.07)'}`,
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.highlight ? 'var(--g)' : 'var(--t)', lineHeight: 1 }}>
              {loading ? '—' : s.val}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--b)' }}>
          {(['surebet', 'all'] as const).map(m => (
            <button key={m} type="button" onClick={() => setFilterMode(m)}
              style={{
                padding: '7px 14px', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                background: filterMode === m ? 'rgba(63,255,33,.12)' : 'transparent',
                color: filterMode === m ? 'var(--g)' : 'var(--t3)',
              }}>
              {m === 'surebet' ? '🎯 Só Surebets' : '📋 Todos'}
            </button>
          ))}
        </div>

        {/* Filtro PA */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--b)' }}>
          {([
            { id: 'sem_pa', label: '🚫 Sem PA misto' },
            { id: 'all',    label: '🟡 Incluir PA' },
          ] as const).map(m => (
            <button key={m.id} type="button" onClick={() => setPaMode(m.id)}
              style={{
                padding: '7px 14px', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                background: paMode === m.id ? 'rgba(255,159,10,.12)' : 'transparent',
                color: paMode === m.id ? '#FF9F0A' : 'var(--t3)',
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {lastUpdate && (
          <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 'auto' }}>
            Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 12,
          background: 'rgba(255,77,109,.07)', border: '1px solid rgba(255,77,109,.2)',
          marginBottom: 16,
        }}>
          <AlertCircle size={16} style={{ color: 'var(--r)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--r)' }}>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              height: 80, borderRadius: 14,
              background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)',
            }} />
          ))}
        </div>
      )}

      {/* Events */}
      {!loading && !error && (
        events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t3)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>
              {filterMode === 'surebet' ? '🔍' : '⚽'}
            </div>
            <div style={{ fontWeight: 700, color: 'var(--t)', marginBottom: 6 }}>
              {filterMode === 'surebet'
                ? 'Nenhuma surebet identificada no momento'
                : 'Nenhum jogo carregado'}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              O scanner atualiza automaticamente a cada 2 minutos.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map(ev => <EventCard key={ev.eventId} ev={ev} />)}
          </div>
        )
      )}

      {/* Info */}
      <div style={{
        marginTop: 24, padding: '14px 16px', borderRadius: 12,
        background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.07)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Como funciona
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { icon: '🎯', text: 'DC 1X + Away: Chance Dupla Casa/Empate em uma casa e resultado Away na outra. Sempre um ganha.' },
            { icon: '🔄', text: 'DC X2 + Casa: Chance Dupla Empate/Away em uma casa e resultado Casa na outra.' },
            { icon: '🟡', text: 'PA (Pagamento Antecipado): odds das casas Altenar são naturalmente maiores. Surebets PA+Normal precisam de verificação extra.' },
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
