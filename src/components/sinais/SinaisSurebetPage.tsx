'use client';

import React, { useState, useMemo } from 'react';
import { RefreshCw, Radio, Clock, TrendingUp, Zap, ExternalLink } from 'lucide-react';
import { useOddsHunter, type OHSurebet, type OHBookmaker } from '@/hooks/useOddsHunter';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  green:    '#3FFF21',
  greenDim: 'rgba(63,255,33,.10)',
  greenB:   'rgba(63,255,33,.25)',
  purple:   '#A78BFA',
  purpleDim:'rgba(167,139,250,.10)',
  amber:    '#f59e0b',
  amberDim: 'rgba(245,158,11,.10)',
  red:      '#f87171',
  surf:     '#0D1117',
  surfB:    '#141D28',
  bg:       '#030507',
  t1:       '#F0F4F8',
  t2:       '#8899AA',
  t3:       '#5A6A7A',
};

type Tab = 'pre' | 'live';

function selLabel(sel: string): string {
  switch (sel) {
    case 'home': return 'Casa';
    case 'away': return 'Fora';
    case 'draw': return 'Empate';
    case '1x':   return '1X';
    case 'x2':   return 'X2';
    case '12':   return '12';
    default:     return sel.toUpperCase();
  }
}

function selColor(sel: string): string {
  if (sel === 'home') return C.green;
  if (sel === 'away') return C.purple;
  if (sel === 'draw') return C.amber;
  return C.t2;
}

function BookmakerRow({ b }: { b: OHBookmaker }) {
  const href = b.anchor ?? undefined;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 0',
      borderBottom: `1px solid rgba(255,255,255,.04)`,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.04em',
        padding: '2px 7px', borderRadius: 4,
        background: 'rgba(255,255,255,.06)',
        color: selColor(b.selection),
        minWidth: 36, textAlign: 'center',
      }}>{selLabel(b.selection)}</span>

      <span style={{ flex: 1, fontSize: 12, color: C.t1, fontWeight: 600 }}>
        {b.house}
      </span>

      <span style={{ fontSize: 11, color: C.t2, marginRight: 4 }}>
        {b.outcome}
      </span>

      <span style={{ fontSize: 14, fontWeight: 800, color: C.green, minWidth: 42, textAlign: 'right' }}>
        {b.odd.toFixed(2)}
      </span>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: C.t3, display: 'flex', marginLeft: 4 }}
          title="Abrir link da casa"
        >
          <ExternalLink size={13} />
        </a>
      ) : (
        <span style={{ width: 17, marginLeft: 4 }} />
      )}
    </div>
  );
}

function SurebetCard({ s }: { s: OHSurebet }) {
  const [open, setOpen] = useState(false);

  const profitColor = s.profit >= 3 ? C.green : s.profit >= 1.5 ? C.amber : C.t2;

  return (
    <div
      style={{
        background: C.surf,
        border: `1px solid rgba(255,255,255,.07)`,
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'border-color .15s',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* Sport badge */}
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
          padding: '2px 7px', borderRadius: 4,
          background: C.greenDim, color: C.green, flexShrink: 0,
        }}>
          {s.sport || 'Esporte'}
        </span>

        {/* Live badge */}
        {s.is_live && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 9, fontWeight: 800, letterSpacing: '.06em',
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(248,113,113,.12)', color: C.red, flexShrink: 0,
          }}>
            <Radio size={8} /> AO VIVO
          </span>
        )}

        {/* Match */}
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.match}
        </span>

        {/* Tournament */}
        <span style={{ fontSize: 10, color: C.t3, flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.tournament}
        </span>

        {/* Profit */}
        <span style={{
          fontSize: 13, fontWeight: 800, color: profitColor,
          flexShrink: 0, minWidth: 52, textAlign: 'right',
        }}>
          +{s.profit.toFixed(2)}%
        </span>
      </button>

      {/* Expanded bookmakers */}
      {open && (
        <div style={{ padding: '0 14px 10px', borderTop: `1px solid rgba(255,255,255,.05)` }}>
          {/* Date/hour */}
          {(s.date || s.hour) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 0 4px', color: C.t3, fontSize: 10 }}>
              <Clock size={11} />
              {s.date} {s.hour}
            </div>
          )}
          {s.bookmakers.map((b, i) => (
            <BookmakerRow key={i} b={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: C.t3 }}>
      <div style={{ marginBottom: 12 }}>
        <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
      </div>
      <p style={{ fontSize: 13 }}>Buscando surebets...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (error) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: C.red }}>
      <p style={{ fontSize: 13 }}>Erro ao conectar: {error}</p>
    </div>
  );
  return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: C.t3 }}>
      <TrendingUp size={28} style={{ marginBottom: 12, opacity: .4 }} />
      <p style={{ fontSize: 13 }}>Nenhuma surebet encontrada no momento.</p>
    </div>
  );
}

export function SinaisSurebetPage() {
  const { preSurebets, liveSurebets, loading, error, lastUpdate, refresh } = useOddsHunter();
  const [tab, setTab] = useState<Tab>('pre');
  const [minProfit, setMinProfit] = useState(0);
  const [search, setSearch] = useState('');

  const list = tab === 'pre' ? preSurebets : liveSurebets;

  const filtered = useMemo(() => {
    let r = list;
    if (minProfit > 0) r = r.filter(s => s.profit >= minProfit);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(s =>
        s.match.toLowerCase().includes(q) ||
        s.tournament.toLowerCase().includes(q) ||
        s.sport.toLowerCase().includes(q)
      );
    }
    return r;
  }, [list, minProfit, search]);

  const lastStr = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 16px 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 16px' }}>
        <Zap size={18} color={C.green} />
        <h1 style={{ fontSize: 16, fontWeight: 800, color: C.t1, margin: 0 }}>Sinais Surebet</h1>
        <span style={{ flex: 1 }} />
        {lastStr && (
          <span style={{ fontSize: 10, color: C.t3, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} /> {lastStr}
          </span>
        )}
        <button
          onClick={refresh}
          style={{
            background: 'none', border: `1px solid rgba(255,255,255,.1)`,
            borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            color: C.t2, fontSize: 11, fontWeight: 600,
          }}
        >
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {(['pre', 'live'] as Tab[]).map(t => {
          const isOn = tab === t;
          const count = t === 'pre' ? preSurebets.length : liveSurebets.length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 12,
                background: isOn ? C.greenDim : 'transparent',
                color: isOn ? C.green : C.t3,
                outline: isOn ? `1px solid ${C.greenB}` : '1px solid rgba(255,255,255,.06)',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all .15s',
              }}
            >
              {t === 'live' && <Radio size={10} />}
              {t === 'pre' ? 'Pré-live' : 'Ao Vivo'}
              <span style={{
                background: isOn ? C.greenB : 'rgba(255,255,255,.07)',
                borderRadius: 10, padding: '1px 6px', fontSize: 10,
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          type="text"
          placeholder="Buscar partida ou torneio..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, background: C.surf, border: `1px solid rgba(255,255,255,.08)`,
            borderRadius: 7, padding: '7px 12px', color: C.t1, fontSize: 12,
            outline: 'none',
          }}
        />
        <select
          value={minProfit}
          onChange={e => setMinProfit(Number(e.target.value))}
          style={{
            background: C.surf, border: `1px solid rgba(255,255,255,.08)`,
            borderRadius: 7, padding: '7px 10px', color: C.t2, fontSize: 12,
            cursor: 'pointer', outline: 'none',
          }}
        >
          <option value={0}>Lucro mínimo</option>
          <option value={0.5}>≥ 0.5%</option>
          <option value={1}>≥ 1%</option>
          <option value={2}>≥ 2%</option>
          <option value={3}>≥ 3%</option>
          <option value={5}>≥ 5%</option>
        </select>
      </div>

      {/* Results count */}
      {!loading && filtered.length > 0 && (
        <p style={{ fontSize: 11, color: C.t3, marginBottom: 10 }}>
          {filtered.length} surebet{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* List */}
      {filtered.length === 0
        ? <EmptyState loading={loading} error={error} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(s => <SurebetCard key={s.id} s={s} />)}
          </div>
        )
      }

      {/* Source credit */}
      <p style={{ textAlign: 'center', fontSize: 10, color: C.t3, marginTop: 24, opacity: .5 }}>
        Dados via OddsHunter · atualizado a cada 2.5s
      </p>
    </div>
  );
}
