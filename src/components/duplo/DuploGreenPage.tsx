'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Zap, RefreshCw, ExternalLink, Filter, X, ChevronDown,
  Trophy, Loader2, AlertCircle, Copy, Check, ShieldCheck, Clock,
} from 'lucide-react';

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface MLLeg  { house: string; pa: boolean; odd: number; url?: string; }

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
  _key?:      string;
  _newAt?:    number;
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
  _key?:        string;
  _newAt?:      number;
}

// ── Casas ─────────────────────────────────────────────────────────────────────

const PA_HOUSES = [
  'Alfabet','Betbra','BetfairSB','Tradeball','Betnacional','Betmgm','Betesporte',
  'Esportesdasorte','Sporty','KTO','Vaidebet','Betano','Novibet','Betsson',
  'Bet365','Betsul','Vivasorte','Pixbet','Sportingbet','Superbet','Apostabet',
  'Br4bet','Esportiva','Sortenabet','Estrelabet','Bet7k','Jogodeouro',
  'Versusbet','Apostaganha','7games','Betao','MCgames',
];

const OS_HOUSES = [
  'BetmgmSO','BetanoSO','EstrelabetSO','StakeSO','NovibetSO',
  'Br4betSO','EsportivaSO','BetssonSO','VersusbetSO',
];

const ALL_HOUSES = [...PA_HOUSES, ...OS_HOUSES];

// ── CSS ───────────────────────────────────────────────────────────────────────

const STYLES = `
@keyframes dg-new-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(63,255,33,.45); }
  70%  { box-shadow: 0 0 0 10px rgba(63,255,33,0); }
  100% { box-shadow: 0 0 0 0 rgba(63,255,33,0); }
}
@keyframes dg-slide-up {
  from { opacity:0; transform:translateY(10px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes dg-live {
  0%,100% { opacity:1; transform:scale(1); }
  50%      { opacity:.3; transform:scale(.65); }
}
@keyframes dg-spin {
  to { transform:rotate(360deg); }
}
.dg-card { animation: dg-slide-up .2s ease-out both; }
.dg-card-new {
  animation: dg-slide-up .2s ease-out both, dg-new-pulse 1.2s ease-out 0s 2;
}
`;

// ── Utils ─────────────────────────────────────────────────────────────────────

function mlKey(s: MLSignal)   { return `ml:${s.event_id}:${s.leg1.house}:${s.leg2.house}`; }
function golsKey(s: GolsSignal){ return `g:${s.event_id}:${s.over_house}:${s.under_house}`; }

function fmtTime(utc: string) {
  if (!utc) return '--:--';
  try { return new Date(utc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  catch { return '--:--'; }
}

function parseTeams(name: string): [string, string] {
  for (const sep of [' x ', ' X ', ' vs ', ' VS ']) {
    if (name.includes(sep)) {
      const [h='', a=''] = name.split(sep);
      return [h.trim(), a.trim()];
    }
  }
  return [name, ''];
}

function normHouse(h: string) { return h.toLowerCase().replace(/[\s\-_.]/g, ''); }

// Cor baseada em loss_pct
function lossColor(pct: number): string {
  if (pct <= 0)  return 'oklch(0.78 0.22 138)';  // lima
  if (pct < 1)   return 'oklch(0.82 0.18 120)';  // verde-amarelo
  if (pct < 3)   return 'oklch(0.82 0.2 82)';    // amarelo
  if (pct < 7)   return 'oklch(0.73 0.2 42)';    // laranja
  return 'oklch(0.65 0.22 22)';                   // vermelho
}

function lossLabel(pct: number): string {
  return pct <= 0 ? 'LUCRO' : 'PERDA';
}

function fmtPct(pct: number): string {
  return `${pct <= 0 ? '+' : '-'}${Math.abs(pct).toFixed(2)}%`;
}

// ── Componentes ───────────────────────────────────────────────────────────────

function PaBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 900, letterSpacing: '.6px',
      padding: '1px 5px', borderRadius: 3,
      background: 'rgba(63,255,33,.14)', color: 'oklch(0.78 0.22 138)',
      border: '1px solid rgba(63,255,33,.28)', lineHeight: 1.6,
    }}>PA</span>
  );
}

function OsBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 900, letterSpacing: '.6px',
      padding: '1px 5px', borderRadius: 3,
      background: 'rgba(251,191,36,.1)', color: '#fbbf24',
      border: '1px solid rgba(251,191,36,.25)', lineHeight: 1.6,
    }}>OS</span>
  );
}

function NewBadge() {
  return (
    <span style={{
      fontSize: 8.5, fontWeight: 900, letterSpacing: '.8px',
      padding: '1px 6px', borderRadius: 3,
      background: 'rgba(63,255,33,.25)', color: 'oklch(0.78 0.22 138)',
      border: '1px solid rgba(63,255,33,.4)', lineHeight: 1.6,
    }}>NOVO</span>
  );
}

function CopyBtn({ url }: { url?: string }) {
  const [ok, setOk] = useState(false);
  if (!url) return null;
  return (
    <button
      onClick={async e => { e.stopPropagation(); try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /**/ } }}
      title="Copiar link"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', color: ok ? 'oklch(0.78 0.22 138)' : 'rgba(255,255,255,.3)', transition: 'color .15s', display: 'flex', alignItems: 'center' }}
    >
      {ok ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

// ── Card ML ───────────────────────────────────────────────────────────────────

function MLCard({ sig, idx, isNew }: { sig: MLSignal; idx: number; isNew: boolean }) {
  const [home, away] = parseTeams(sig.event_name);
  const color = lossColor(sig.loss_pct);
  const delay = `${Math.min(idx, 20) * 22}ms`;

  const legs = [
    { leg: sig.leg1, outcome: 'CASA',   label: '1', accent: 'oklch(0.72 0.17 250)' },
    { leg: sig.legX, outcome: 'EMPATE', label: 'X', accent: 'oklch(0.72 0.12 285)' },
    { leg: sig.leg2, outcome: 'FORA',   label: '2', accent: 'oklch(0.72 0.16 170)' },
  ];

  const isOs = (house: string) => {
    const n = normHouse(house);
    return n.endsWith('so') || n.endsWith('os');
  };

  return (
    <div
      className={isNew ? 'dg-card-new' : 'dg-card'}
      style={{
        animationDelay: delay,
        background: `linear-gradient(135deg, rgba(255,255,255,.03) 0%, rgba(255,255,255,.015) 100%)`,
        border: `1px solid ${isNew ? 'rgba(63,255,33,.35)' : 'rgba(255,255,255,.08)'}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: '1px solid rgba(255,255,255,.06)',
      }}>
        {/* Loss badge (left vertical) */}
        <div style={{
          minWidth: 68, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '10px 0',
          background: `${color}14`,
          borderRight: `2px solid ${color}30`,
        }}>
          <span style={{ fontSize: 15, fontWeight: 900, color, fontFamily: 'var(--font-mono,monospace)', letterSpacing: '-.5px', lineHeight: 1 }}>
            {fmtPct(sig.loss_pct)}
          </span>
          <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.8px', color: `${color}bb`, marginTop: 2 }}>
            {lossLabel(sig.loss_pct)}
          </span>
        </div>

        {/* Event info */}
        <div style={{ flex: 1, padding: '10px 13px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            {isNew && <NewBadge />}
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--t1)', lineHeight: 1.25 }}>
              {home && away
                ? <>{home} <span style={{ color: 'rgba(255,255,255,.3)', fontWeight: 400, fontSize: 11 }}>×</span> {away}</>
                : sig.event_name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <Trophy size={9} style={{ color: 'rgba(255,255,255,.3)', flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.38)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {sig.league || '—'}
            </span>
            {sig.start_utc && (
              <>
                <span style={{ color: 'rgba(255,255,255,.18)' }}>·</span>
                <Clock size={9} style={{ color: 'rgba(255,255,255,.3)' }} />
                <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.45)', fontFamily: 'var(--font-mono,monospace)' }}>
                  {fmtTime(sig.start_utc)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Legs ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 0 4px' }}>
        {legs.map(({ leg, outcome, label, accent }, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 0,
            borderBottom: i < 2 ? '1px solid rgba(255,255,255,.04)' : 'none',
          }}>
            {/* Outcome label */}
            <div style={{
              width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '9px 0',
              background: `${accent}12`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: accent, fontFamily: 'var(--font-mono,monospace)' }}>{label}</span>
            </div>

            {/* House + PA/OS */}
            <div style={{ flex: 1, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {leg.house}
              </span>
              {leg.pa ? <PaBadge /> : isOs(leg.house) ? <OsBadge /> : null}
            </div>

            {/* Outcome description */}
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', padding: '0 6px', whiteSpace: 'nowrap' }}>
              {outcome}
            </span>

            {/* Odd */}
            <div style={{
              width: 52, textAlign: 'right', padding: '0 10px 0 0',
              fontSize: 15, fontWeight: 800, color: 'var(--t1)',
              fontFamily: 'var(--font-mono,monospace)', letterSpacing: '-.5px',
            }}>
              {leg.odd.toFixed(2)}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingRight: 8 }}>
              {leg.url && (
                <a href={leg.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', padding: '2px 3px', transition: 'color .15s' }}>
                  <ExternalLink size={10} />
                </a>
              )}
              <CopyBtn url={leg.url} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Card Gols ─────────────────────────────────────────────────────────────────

function GolsCard({ sig, idx, isNew }: { sig: GolsSignal; idx: number; isNew: boolean }) {
  const [home, away] = parseTeams(sig.event_name);
  const color = lossColor(sig.loss_pct);
  const delay = `${Math.min(idx, 20) * 22}ms`;

  const isOs = (house: string) => {
    const n = normHouse(house);
    return n.endsWith('so') || n.endsWith('os');
  };

  const legs = [
    {
      label: `OVER ${sig.over_line}`, house: sig.over_house, pa: sig.over_pa,
      odd: sig.over_odd, url: sig.over_url,
      accent: 'oklch(0.72 0.16 170)',
    },
    {
      label: `UNDER ${sig.under_line}`, house: sig.under_house, pa: sig.under_pa,
      odd: sig.under_odd, url: sig.under_url,
      accent: 'oklch(0.72 0.2 22)',
    },
  ];

  return (
    <div
      className={isNew ? 'dg-card-new' : 'dg-card'}
      style={{
        animationDelay: delay,
        background: `linear-gradient(135deg, rgba(255,255,255,.03) 0%, rgba(255,255,255,.015) 100%)`,
        border: `1px solid ${isNew ? 'rgba(63,255,33,.35)' : 'rgba(255,255,255,.08)'}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        {/* Loss badge */}
        <div style={{
          minWidth: 68, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '10px 0',
          background: `${color}14`,
          borderRight: `2px solid ${color}30`,
        }}>
          <span style={{ fontSize: 15, fontWeight: 900, color, fontFamily: 'var(--font-mono,monospace)', letterSpacing: '-.5px', lineHeight: 1 }}>
            {fmtPct(sig.loss_pct)}
          </span>
          <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.8px', color: `${color}bb`, marginTop: 2 }}>
            {lossLabel(sig.loss_pct)}
          </span>
        </div>

        {/* Event info */}
        <div style={{ flex: 1, padding: '10px 13px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
            {isNew && <NewBadge />}
            {/* Green zone pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 5,
              background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.22)',
            }}>
              <span style={{ fontSize: 11 }}>⚽</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'oklch(0.78 0.22 138)', fontFamily: 'var(--font-mono,monospace)' }}>
                {sig.green_goals}
              </span>
              <span style={{ fontSize: 9.5, color: 'rgba(63,255,33,.7)', fontWeight: 600 }}>gol{parseInt(sig.green_goals) !== 1 ? 's' : ''}</span>
            </div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.3)' }}>
              +{sig.both_win_pct.toFixed(2)}% duplo
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--t1)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {home && away
                ? <>{home} <span style={{ color: 'rgba(255,255,255,.3)', fontWeight: 400, fontSize: 11 }}>×</span> {away}</>
                : sig.event_name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <Trophy size={9} style={{ color: 'rgba(255,255,255,.3)' }} />
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.38)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
              {sig.league || '—'}
            </span>
            {sig.start_utc && <>
              <span style={{ color: 'rgba(255,255,255,.18)' }}>·</span>
              <Clock size={9} style={{ color: 'rgba(255,255,255,.3)' }} />
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.45)', fontFamily: 'var(--font-mono,monospace)' }}>{fmtTime(sig.start_utc)}</span>
            </>}
          </div>
        </div>
      </div>

      {/* ── Legs ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 0 4px' }}>
        {legs.map(({ label, house, pa, odd, url, accent }, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center',
            borderBottom: i === 0 ? '1px solid rgba(255,255,255,.04)' : 'none',
          }}>
            <div style={{
              width: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '9px 6px',
              background: `${accent}10`,
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: '.4px' }}>{label}</span>
            </div>

            <div style={{ flex: 1, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {house}
              </span>
              {pa ? <PaBadge /> : isOs(house) ? <OsBadge /> : null}
            </div>

            <div style={{
              width: 52, textAlign: 'right', padding: '0 10px 0 0',
              fontSize: 15, fontWeight: 800, color: 'var(--t1)',
              fontFamily: 'var(--font-mono,monospace)', letterSpacing: '-.5px',
            }}>
              {odd.toFixed(2)}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingRight: 8 }}>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', padding: '2px 3px' }}>
                  <ExternalLink size={10} />
                </a>
              )}
              <CopyBtn url={url} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Painel de filtros ─────────────────────────────────────────────────────────

function FilterPanel({
  disabled, onToggle, onReset, paOnly, onPaToggle,
}: {
  disabled: Set<string>;
  onToggle: (h: string) => void;
  onReset: () => void;
  paOnly: boolean;
  onPaToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeCount = ALL_HOUSES.length - disabled.size;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700,
          background: open ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.05)',
          border: `1.5px solid ${open ? 'rgba(63,255,33,.4)' : 'rgba(255,255,255,.1)'}`,
          color: open ? 'oklch(0.78 0.22 138)' : 'var(--t2)',
          cursor: 'pointer', transition: 'all .15s ease', letterSpacing: '.2px',
        }}
      >
        <Filter size={13} />
        Filtros
        {disabled.size > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '0 6px', borderRadius: 10,
            background: 'rgba(63,255,33,.2)', color: 'oklch(0.78 0.22 138)',
          }}>{activeCount}</span>
        )}
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
          width: 380, padding: 18,
          background: 'oklch(0.13 0.005 260)',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04)',
        }}>
          {/* PA Only toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16, paddingBottom: 14,
            borderBottom: '1px solid rgba(255,255,255,.07)',
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>Apenas Pagamento Antecipado</div>
              <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2 }}>Filtra casas PA nas pernas 1 e 2</div>
            </div>
            <button
              onClick={onPaToggle}
              style={{
                width: 42, height: 24, borderRadius: 12, border: 'none',
                background: paOnly ? 'oklch(0.78 0.22 138)' : 'rgba(255,255,255,.1)',
                cursor: 'pointer', position: 'relative', transition: 'background .2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: paOnly ? 20 : 3,
                width: 18, height: 18, borderRadius: '50%',
                background: paOnly ? '#0a1f0a' : 'rgba(255,255,255,.4)',
                transition: 'left .2s', display: 'block',
              }} />
            </button>
          </div>

          {/* Casas PA */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'oklch(0.78 0.22 138)', letterSpacing: '.7px' }}>
                PAGAMENTO ANTECIPADO
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {PA_HOUSES.map(h => {
                const active = !disabled.has(normHouse(h));
                return (
                  <button key={h} onClick={() => onToggle(normHouse(h))} style={{
                    padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: active ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${active ? 'rgba(63,255,33,.35)' : 'rgba(255,255,255,.08)'}`,
                    color: active ? 'oklch(0.78 0.22 138)' : 'rgba(255,255,255,.35)',
                    cursor: 'pointer', transition: 'all .12s',
                  }}>{h}</button>
                );
              })}
            </div>
          </div>

          {/* Casas OS */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24', letterSpacing: '.7px' }}>ODDS AUMENTADAS (OS)</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginLeft: 6 }}>Sem pagamento antecipado</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {OS_HOUSES.map(h => {
                const active = !disabled.has(normHouse(h));
                return (
                  <button key={h} onClick={() => onToggle(normHouse(h))} style={{
                    padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: active ? 'rgba(251,191,36,.1)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${active ? 'rgba(251,191,36,.3)' : 'rgba(255,255,255,.08)'}`,
                    color: active ? '#fbbf24' : 'rgba(255,255,255,.35)',
                    cursor: 'pointer', transition: 'all .12s',
                  }}>{h}</button>
                );
              })}
            </div>
          </div>

          <button onClick={() => { onReset(); }} style={{
            width: '100%', padding: '7px', borderRadius: 7, fontSize: 11, fontWeight: 700,
            background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
            color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <X size={11} /> Resetar todos
          </button>
        </div>
      )}
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export function DuploGreenPage() {
  const [tab,      setTab]     = useState<'ml' | 'gols'>('ml');
  const [mlSigs,   setMlSigs]  = useState<MLSignal[]>([]);
  const [golsSigs, setGolsSigs]= useState<GolsSignal[]>([]);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState('');
  const [meta,     setMeta]    = useState({ total: 0, computedAt: '', cacheAgeMin: null as number | null });
  const [disabled, setDisabled]= useState<Set<string>>(new Set());
  const [paOnly,   setPaOnly]  = useState(false);
  const [countdown,setCountdown] = useState(30);

  // Rastreia sinais "novos" desta sessão
  const newKeysRef = useRef<Set<string>>(new Set());
  const prevMlRef  = useRef<Map<string, number>>(new Map()); // key → loss_pct
  const prevGolsRef= useRef<Map<string, number>>(new Map());

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchSignals = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError('');
    setCountdown(30);
    try {
      const res  = await fetch('/api/supermonitor/duplo-green', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disabled_houses: Array.from(disabled),
          pa_only: paOnly,
        }),
      });
      const json = await res.json() as {
        ok: boolean; error?: string;
        ml?: MLSignal[]; gols?: GolsSignal[];
        total_events?: number; computed_at?: string;
        cache_age_min?: number | null;
      };
      if (!json.ok) { setError(json.error ?? 'Erro desconhecido'); return; }

      const nowTs = Date.now();

      // ML: detecta novos ou melhorados
      const incomingMl = (json.ml ?? []).map(s => ({ ...s, _key: mlKey(s) }));
      const nextMlMap  = new Map<string, number>();
      const markedMl   = incomingMl.map(s => {
        nextMlMap.set(s._key!, s.loss_pct);
        const prev = prevMlRef.current.get(s._key!);
        const isNew = prev === undefined || s.loss_pct < prev - 0.01;
        if (isNew) newKeysRef.current.add(s._key!);
        return { ...s, _newAt: isNew ? nowTs : 0 };
      });
      prevMlRef.current = nextMlMap;

      // Gols: detecta novos ou melhorados
      const incomingGols = (json.gols ?? []).map(s => ({ ...s, _key: golsKey(s) }));
      const nextGolsMap  = new Map<string, number>();
      const markedGols   = incomingGols.map(s => {
        nextGolsMap.set(s._key!, s.loss_pct);
        const prev = prevGolsRef.current.get(s._key!);
        const isNew = prev === undefined || s.loss_pct < prev - 0.01;
        if (isNew) newKeysRef.current.add(s._key!);
        return { ...s, _newAt: isNew ? nowTs : 0 };
      });
      prevGolsRef.current = nextGolsMap;

      setMlSigs(markedMl);
      setGolsSigs(markedGols);
      setMeta({
        total: json.total_events ?? 0,
        computedAt: json.computed_at ?? '',
        cacheAgeMin: json.cache_age_min ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(disabled).sort().join(','), paOnly]);

  // Carregamento inicial
  useEffect(() => { fetchSignals(false); }, []); // eslint-disable-line

  // Auto-refresh a cada 30s (incremental)
  useEffect(() => {
    const id = setInterval(() => fetchSignals(true), 30_000);
    return () => clearInterval(id);
  }, [fetchSignals]);

  // Countdown
  useEffect(() => {
    const id = setInterval(() => setCountdown(v => (v <= 1 ? 30 : v - 1)), 1_000);
    return () => clearInterval(id);
  }, []);

  // Recarrega quando filtros mudam
  const filterKey = Array.from(disabled).sort().join(',') + String(paOnly);
  useEffect(() => { fetchSignals(false); }, [filterKey]); // eslint-disable-line

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function toggleHouse(h: string) {
    setDisabled(prev => { const n = new Set(prev); n.has(h) ? n.delete(h) : n.add(h); return n; });
  }

  const now = Date.now();
  const NEW_TTL = 15_000; // badge "NOVO" visível por 15s

  const mlVisible   = mlSigs;
  const golsVisible = golsSigs;

  const lastUpdate = meta.computedAt
    ? new Date(meta.computedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  // Conta sinais com profit (lucro)
  const mlProfit   = useMemo(() => mlSigs.filter(s => s.loss_pct <= 0).length,   [mlSigs]);
  const golsProfit = useMemo(() => golsSigs.filter(s => s.loss_pct <= 0).length, [golsSigs]);

  return (
    <>
      <style>{STYLES}</style>

      <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ══ Header ═══════════════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}>
          {/* Título */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(63,255,33,.2) 0%, rgba(63,255,33,.06) 100%)',
                border: '1px solid rgba(63,255,33,.25)',
                boxShadow: '0 0 20px rgba(63,255,33,.1)',
              }}>
                <Zap size={17} style={{ color: 'oklch(0.78 0.22 138)' }} />
              </div>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--t1)', letterSpacing: '-.4px', margin: 0 }}>
                  Duplo Green
                </h1>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', letterSpacing: '.2px' }}>
                  Futebol · análise em tempo real
                </div>
              </div>
            </div>
          </div>

          {/* Controles direita */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Live indicator + countdown */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                background: loading ? '#fbbf24' : 'oklch(0.78 0.22 138)',
                animation: 'dg-live 1.4s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 11.5, color: 'var(--t3)', fontFamily: 'var(--font-mono,monospace)' }}>
                {loading ? 'carregando…' : `${countdown}s`}
              </span>
            </div>

            {/* Refresh */}
            <button
              onClick={() => fetchSignals(true)}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                background: 'rgba(255,255,255,.05)', border: '1.5px solid rgba(255,255,255,.1)',
                color: 'var(--t2)', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? .5 : 1, transition: 'opacity .15s, background .15s',
                letterSpacing: '.2px',
              }}
            >
              <RefreshCw size={13} style={{ animation: loading ? 'dg-spin 1s linear infinite' : 'none' }} />
              Atualizar
            </button>

            {/* Filtros */}
            <FilterPanel
              disabled={disabled}
              onToggle={toggleHouse}
              onReset={() => setDisabled(new Set())}
              paOnly={paOnly}
              onPaToggle={() => setPaOnly(v => !v)}
            />
          </div>
        </div>

        {/* ══ Status bar ═══════════════════════════════════════════════════════ */}
        {(meta.total > 0 || lastUpdate) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)',
          }}>
            {meta.total > 0 && (
              <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>
                <span style={{ color: 'var(--t2)', fontWeight: 700 }}>{meta.total}</span> eventos analisados
              </span>
            )}
            {lastUpdate && (
              <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>
                Calculado às <span style={{ color: 'var(--t2)', fontFamily: 'var(--font-mono,monospace)' }}>{lastUpdate}</span>
              </span>
            )}
            {meta.cacheAgeMin !== null && meta.cacheAgeMin > 15 && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px',
                padding: '2px 8px', borderRadius: 5,
                background: meta.cacheAgeMin > 60 ? 'rgba(239,68,68,.1)' : 'rgba(251,191,36,.08)',
                border: `1px solid ${meta.cacheAgeMin > 60 ? 'rgba(239,68,68,.25)' : 'rgba(251,191,36,.2)'}`,
                color: meta.cacheAgeMin > 60 ? '#f87171' : '#fbbf24',
              }}>
                ⚠ cache {meta.cacheAgeMin >= 60 ? `${Math.floor(meta.cacheAgeMin/60)}h` : `${meta.cacheAgeMin}m`} atrás
              </span>
            )}
            {paOnly && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px',
                padding: '2px 8px', borderRadius: 5,
                background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.25)',
                color: 'oklch(0.78 0.22 138)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <ShieldCheck size={10} /> Apenas PA ativo
              </span>
            )}
          </div>
        )}

        {/* ══ Tabs ══════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,.04)', borderRadius: 11, border: '1px solid rgba(255,255,255,.07)', overflow: 'hidden', width: 'fit-content' }}>
          {([
            { key: 'ml'   as const, label: 'ML — Pagamento Antecipado', count: mlSigs.length,   profit: mlProfit },
            { key: 'gols' as const, label: 'Gols — Over × Under',        count: golsSigs.length, profit: golsProfit },
          ]).map(({ key, label, count, profit }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              padding: '11px 22px', cursor: 'pointer',
              background: tab === key
                ? 'linear-gradient(135deg, rgba(63,255,33,.1) 0%, rgba(63,255,33,.05) 100%)'
                : 'transparent',
              borderRight: key === 'ml' ? '1px solid rgba(255,255,255,.07)' : 'none',
              border: 'none',
              transition: 'background .15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: tab === key ? 'oklch(0.78 0.22 138)' : 'var(--t2)', letterSpacing: '.1px', transition: 'color .15s' }}>
                  {label}
                </span>
                {count > 0 && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 10,
                    background: tab === key ? 'rgba(63,255,33,.2)' : 'rgba(255,255,255,.09)',
                    color: tab === key ? 'oklch(0.78 0.22 138)' : 'var(--t3)',
                  }}>{count}</span>
                )}
              </div>
              {profit > 0 && (
                <span style={{ fontSize: 10, color: 'oklch(0.78 0.22 138)', marginTop: 2, fontWeight: 700 }}>
                  {profit} com lucro
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══ Legend ════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.3)', fontWeight: 600 }}>Pior cenário:</span>
          {[
            { label: 'Lucro',  color: 'oklch(0.78 0.22 138)' },
            { label: '< 1%',   color: 'oklch(0.82 0.18 120)' },
            { label: '< 3%',   color: 'oklch(0.82 0.2 82)' },
            { label: '< 7%',   color: 'oklch(0.73 0.2 42)' },
            { label: '≥ 7%',   color: 'oklch(0.65 0.22 22)' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.45)' }}>{item.label}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(63,255,33,.25)', border: '1px solid rgba(63,255,33,.5)' }} />
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.45)' }}>Novo / melhorado</span>
          </div>
        </div>

        {/* ══ Grid de sinais ═════════════════════════════════════════════════════ */}

        {/* Estado vazio/loading/erro */}
        {(loading && mlSigs.length === 0 && golsSigs.length === 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '80px 0', color: 'var(--t3)' }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.15)',
            }}>
              <Loader2 size={24} style={{ animation: 'dg-spin 1s linear infinite', color: 'oklch(0.78 0.22 138)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 700 }}>Calculando sinais…</div>
              <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>Varrendo todos os eventos do dia</div>
            </div>
          </div>
        )}

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '16px 18px', borderRadius: 12,
            background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)',
          }}>
            <AlertCircle size={18} style={{ color: '#f87171', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, color: '#f87171', fontWeight: 700 }}>Erro ao carregar</div>
              <div style={{ fontSize: 11.5, color: 'rgba(239,68,68,.7)', marginTop: 2 }}>{error}</div>
            </div>
          </div>
        )}

        {/* ML */}
        {tab === 'ml' && !loading && !error && mlVisible.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '70px 0', color: 'var(--t3)' }}>
            <Zap size={32} style={{ opacity: .2 }} />
            {meta.total === 0
              ? <>
                  <span style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 700 }}>Cache vazio</span>
                  <span style={{ fontSize: 11.5, opacity: .6, textAlign: 'center', maxWidth: 360 }}>Nenhum dado de odds encontrado. Aguarde o renew-cookie.mjs rodar no PC.</span>
                </>
              : <>
                  <span style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 700 }}>Nenhum sinal ML encontrado</span>
                  <span style={{ fontSize: 11.5, opacity: .6, textAlign: 'center', maxWidth: 360 }}>Os {meta.total} eventos analisados não formam arbs 3-vias com as casas selecionadas.</span>
                </>
            }
          </div>
        )}

        {tab === 'ml' && mlVisible.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: 10,
          }}>
            {mlVisible.map((sig, i) => (
              <MLCard
                key={sig._key ?? mlKey(sig)}
                sig={sig}
                idx={i}
                isNew={!!(sig._newAt && now - sig._newAt < NEW_TTL)}
              />
            ))}
          </div>
        )}

        {/* Gols */}
        {tab === 'gols' && !loading && !error && golsVisible.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '70px 0', color: 'var(--t3)' }}>
            <span style={{ fontSize: 32 }}>⚽</span>
            {meta.total === 0
              ? <>
                  <span style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 700 }}>Cache vazio</span>
                  <span style={{ fontSize: 11.5, opacity: .6 }}>Aguarde o renew-cookie.mjs rodar no PC.</span>
                </>
              : <>
                  <span style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 700 }}>Nenhum sinal de Gols encontrado</span>
                  <span style={{ fontSize: 11.5, opacity: .6, textAlign: 'center', maxWidth: 360 }}>Não há pares Over/Under com linhas cruzadas entre casas distintas nos {meta.total} eventos.</span>
                </>
            }
          </div>
        )}

        {tab === 'gols' && golsVisible.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: 10,
          }}>
            {golsVisible.map((sig, i) => (
              <GolsCard
                key={sig._key ?? golsKey(sig)}
                sig={sig}
                idx={i}
                isNew={!!(sig._newAt && now - sig._newAt < NEW_TTL)}
              />
            ))}
          </div>
        )}

      </div>
    </>
  );
}
