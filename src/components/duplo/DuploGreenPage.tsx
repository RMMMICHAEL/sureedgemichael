'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Zap, RefreshCw, ExternalLink, Filter, X, ChevronDown,
  Loader2, AlertCircle, Copy, Check, Star, SkipForward, SlidersHorizontal,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MLLeg { house: string; pa: boolean; odd: number; url?: string; }

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

// ── Houses ────────────────────────────────────────────────────────────────────

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
@keyframes dg-pulse-dot {
  0%,100% { opacity:1; transform:scale(1); }
  50%      { opacity:.3; transform:scale(.6); }
}
@keyframes dg-spin {
  to { transform:rotate(360deg); }
}
@keyframes dg-slide-in {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes dg-toast-in {
  from { opacity:0; transform:translateX(24px); }
  to   { opacity:1; transform:translateX(0); }
}
@keyframes dg-toast-out {
  from { opacity:1; transform:translateX(0); }
  to   { opacity:0; transform:translateX(24px); }
}
@keyframes dg-new-glow {
  0%   { box-shadow: 0 0 0 0 rgba(63,255,33,.5); }
  60%  { box-shadow: 0 0 0 8px rgba(63,255,33,0); }
  100% { box-shadow: 0 0 0 0 rgba(63,255,33,0); }
}
.dg-row { animation: dg-slide-in .18s ease-out both; }
.dg-row-new { animation: dg-slide-in .18s ease-out both, dg-new-glow 1.4s ease-out .1s 2; }
`;

// ── Utils ─────────────────────────────────────────────────────────────────────

function mlKey(s: MLSignal) { return `ml:${s.event_id}:${s.leg1.house}:${s.leg2.house}`; }

function normHouse(h: string) { return h.toLowerCase().replace(/[\s\-_.]/g, ''); }

function isOs(house: string): boolean {
  const n = normHouse(house);
  return n.endsWith('so') || n.endsWith('os');
}

function fmtTime(utc: string): string {
  if (!utc) return '--:--';
  try {
    return new Date(utc).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    });
  } catch { return '--:--'; }
}

function fmtDate(utc: string): string {
  if (!utc) return '';
  try {
    return new Date(utc).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    }) + ' às ' + fmtTime(utc);
  } catch { return ''; }
}

function timeUntil(utc: string): { label: string; color: string; live?: boolean } {
  const ms = new Date(utc).getTime() - Date.now();
  if (ms < -90 * 60_000) return { label: 'Encerrado', color: 'rgba(255,255,255,.22)' };
  if (ms < 0) return { label: '● AO VIVO', color: '#FF9F0A', live: true };
  const totalSec = Math.floor(ms / 1_000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return { label: `${hrs}h ${mins}m`, color: 'rgba(255,255,255,.4)' };
  }
  return {
    label: `${mins}m ${secs}s`,
    color: mins < 5 ? '#FF9F0A' : mins < 30 ? 'oklch(0.78 0.22 138)' : 'rgba(255,255,255,.5)',
  };
}

function lossColor(pct: number): string {
  if (pct <= 0)  return 'oklch(0.78 0.22 138)';
  if (pct < 1)   return 'oklch(0.82 0.18 120)';
  if (pct < 3)   return 'oklch(0.82 0.2 82)';
  if (pct < 7)   return 'oklch(0.73 0.2 42)';
  return                 'oklch(0.65 0.22 22)';
}

function fmtPct(pct: number): string {
  return `${pct <= 0 ? '+' : '-'}${Math.abs(pct).toFixed(2)}%`;
}

function parseTeams(name: string): [string, string] {
  for (const sep of [' x ', ' X ', ' vs ', ' VS ']) {
    if (name.includes(sep)) {
      const [h = '', a = ''] = name.split(sep);
      return [h.trim(), a.trim()];
    }
  }
  return [name, ''];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PaBadge() {
  return (
    <span style={{
      fontSize: 8.5, fontWeight: 900, letterSpacing: '.5px',
      padding: '1px 4px', borderRadius: 3,
      background: 'rgba(63,255,33,.12)', color: 'oklch(0.78 0.22 138)',
      border: '1px solid rgba(63,255,33,.25)', lineHeight: 1.5, flexShrink: 0,
    }}>PA</span>
  );
}

function OsBadge() {
  return (
    <span style={{
      fontSize: 8.5, fontWeight: 900, letterSpacing: '.5px',
      padding: '1px 4px', borderRadius: 3,
      background: 'rgba(251,191,36,.09)', color: '#fbbf24',
      border: '1px solid rgba(251,191,36,.22)', lineHeight: 1.5, flexShrink: 0,
    }}>OS</span>
  );
}

function LegBlock({
  leg, outcomeLabel, outcomeShort,
}: {
  leg: MLLeg;
  outcomeLabel: string;
  outcomeShort: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(`${leg.house} — ${outcomeLabel} @ ${leg.odd.toFixed(2)}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 5,
      borderRight: '1px solid rgba(255,255,255,.05)',
    }}>
      {/* House name + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: 'oklch(0.78 0.01 250)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {leg.house}
        </span>
        {leg.pa ? <PaBadge /> : isOs(leg.house) ? <OsBadge /> : null}
      </div>

      {/* Odd — primary data point */}
      <span style={{
        fontSize: 22, fontWeight: 900, color: 'oklch(0.96 0.005 250)',
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-1px',
        lineHeight: 1,
      }}>
        {leg.odd.toFixed(2)}
      </span>

      {/* Outcome badge + copy */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {leg.url ? (
          <a
            href={leg.url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 5,
              fontSize: 10.5, fontWeight: 800, letterSpacing: '.2px',
              background: 'rgba(255,159,10,.1)', color: '#FF9F0A',
              border: '1px solid rgba(255,159,10,.25)',
              textDecoration: 'none', whiteSpace: 'nowrap',
              transition: 'background .12s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,159,10,.18)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,159,10,.1)'; }}
          >
            {outcomeShort} <ExternalLink size={8} />
          </a>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 8px', borderRadius: 5,
            fontSize: 10.5, fontWeight: 800, letterSpacing: '.2px',
            background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.45)',
            border: '1px solid rgba(255,255,255,.08)', whiteSpace: 'nowrap',
          }}>
            {outcomeShort}
          </span>
        )}
        <button
          type="button" onClick={handleCopy}
          title="Copiar"
          style={{
            width: 24, height: 24, borderRadius: 5, border: 'none',
            background: copied ? 'rgba(63,255,33,.15)' : 'rgba(255,255,255,.05)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .12s', flexShrink: 0,
          }}
        >
          {copied
            ? <Check size={10} style={{ color: 'oklch(0.78 0.22 138)' }} />
            : <Copy size={10} style={{ color: 'rgba(255,255,255,.3)' }} />}
        </button>
      </div>
    </div>
  );
}

// ── Signal row ────────────────────────────────────────────────────────────────

function SignalRow({
  sig, idx, isNew, onSkip, onStar, starred,
}: {
  sig: MLSignal;
  idx: number;
  isNew: boolean;
  onSkip: () => void;
  onStar: () => void;
  starred: boolean;
}) {
  const [home, away] = parseTeams(sig.event_name);
  const color = lossColor(sig.loss_pct);
  const tu = timeUntil(sig.start_utc);
  const delay = `${Math.min(idx, 24) * 18}ms`;

  return (
    <div
      className={isNew ? 'dg-row-new' : 'dg-row'}
      style={{
        animationDelay: delay,
        display: 'flex', alignItems: 'stretch',
        background: 'oklch(0.115 0.006 260)',
        border: `1px solid ${isNew ? 'rgba(63,255,33,.28)' : 'rgba(255,255,255,.07)'}`,
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'border-color .15s',
      }}
      onMouseEnter={e => { if (!isNew) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.13)'; }}
      onMouseLeave={e => { if (!isNew) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.07)'; }}
    >
      {/* ── Zone A: Event info ── */}
      <div style={{
        flex: '0 0 200px', minWidth: 0,
        padding: '14px 16px',
        borderRight: '1px solid rgba(255,255,255,.06)',
        display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center',
      }}>
        {/* Timer */}
        <span style={{
          alignSelf: 'flex-start',
          fontSize: tu.live ? 9 : 10.5, fontWeight: 900,
          padding: '2px 7px', borderRadius: 5,
          background: tu.live ? 'rgba(255,159,10,.12)' : 'rgba(255,255,255,.05)',
          color: tu.color,
          border: `1px solid ${tu.live ? 'rgba(255,159,10,.28)' : 'rgba(255,255,255,.08)'}`,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: tu.live ? '.08em' : '-.01em',
        }}>
          {!tu.live && <span style={{ opacity: .5, marginRight: 2 }}>⏱</span>}
          {tu.label}
        </span>

        {/* Event name */}
        <div style={{ fontSize: 14, fontWeight: 900, color: 'oklch(0.96 0.005 250)', lineHeight: 1.25 }}>
          {home && away ? (
            <>
              {home}
              <span style={{ color: 'rgba(255,255,255,.25)', fontWeight: 400, fontSize: 12, margin: '0 4px' }}>x</span>
              {away}
            </>
          ) : sig.event_name}
        </div>

        {/* League + date */}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.38)', lineHeight: 1.5 }}>
          {sig.league && (
            <span style={{ color: '#FF9F0A', fontWeight: 600 }}>{sig.league}</span>
          )}
          {sig.league && sig.start_utc && <span style={{ margin: '0 4px', opacity: .5 }}>·</span>}
          {sig.start_utc && fmtDate(sig.start_utc)}
        </div>
      </div>

      {/* ── Zone B: Three legs ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        <LegBlock leg={sig.leg1} outcomeLabel="Casa (1)"   outcomeShort="CASA (1)"   />
        <LegBlock leg={sig.legX} outcomeLabel="Empate (X)" outcomeShort="EMPATE (X)" />
        <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {/* Last leg without right border */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span style={{
              fontSize: 12, fontWeight: 700, color: 'oklch(0.78 0.01 250)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {sig.leg2.house}
            </span>
            {sig.leg2.pa ? <PaBadge /> : isOs(sig.leg2.house) ? <OsBadge /> : null}
          </div>
          <span style={{
            fontSize: 22, fontWeight: 900, color: 'oklch(0.96 0.005 250)',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-1px', lineHeight: 1,
          }}>
            {sig.leg2.odd.toFixed(2)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {sig.leg2.url ? (
              <a
                href={sig.leg2.url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 5,
                  fontSize: 10.5, fontWeight: 800,
                  background: 'rgba(255,159,10,.1)', color: '#FF9F0A',
                  border: '1px solid rgba(255,159,10,.25)',
                  textDecoration: 'none', whiteSpace: 'nowrap',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,159,10,.18)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,159,10,.1)'; }}
              >
                FORA (2) <ExternalLink size={8} />
              </a>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '3px 8px', borderRadius: 5,
                fontSize: 10.5, fontWeight: 800,
                background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.45)',
                border: '1px solid rgba(255,255,255,.08)', whiteSpace: 'nowrap',
              }}>
                FORA (2)
              </span>
            )}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                navigator.clipboard.writeText(`${sig.leg2.house} — FORA (2) @ ${sig.leg2.odd.toFixed(2)}`).catch(() => {});
              }}
              style={{
                width: 24, height: 24, borderRadius: 5, border: 'none',
                background: 'rgba(255,255,255,.05)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Copy size={10} style={{ color: 'rgba(255,255,255,.3)' }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Zone C: Profit + actions ── */}
      <div style={{
        flex: '0 0 96px',
        borderLeft: '1px solid rgba(255,255,255,.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '12px 0',
      }}>
        {/* Profit badge */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        }}>
          <span style={{
            fontSize: 15, fontWeight: 900, color,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-.5px',
          }}>
            {fmtPct(sig.loss_pct)}
          </span>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: `${color}99`, letterSpacing: '.5px' }}>
            {sig.loss_pct <= 0 ? 'LUCRO' : 'PERDA'}
          </span>
        </div>

        {/* Action icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button" onClick={e => { e.stopPropagation(); onSkip(); }}
            title="Ignorar"
            style={{
              width: 24, height: 24, borderRadius: 6, border: 'none',
              background: 'rgba(255,255,255,.05)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .12s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.05)'; }}
          >
            <SkipForward size={10} style={{ color: 'rgba(255,255,255,.3)' }} />
          </button>
          <button
            type="button" onClick={e => { e.stopPropagation(); onStar(); }}
            title={starred ? 'Remover favorito' : 'Favoritar'}
            style={{
              width: 24, height: 24, borderRadius: 6, border: 'none',
              background: starred ? 'rgba(251,191,36,.12)' : 'rgba(255,255,255,.05)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .12s',
            }}
          >
            <Star size={10} style={{ color: starred ? '#fbbf24' : 'rgba(255,255,255,.3)', fill: starred ? '#fbbf24' : 'none' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function ProfitToast({ sig, onDismiss }: { sig: MLSignal; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 7200);
    const t2 = setTimeout(onDismiss, 7800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDismiss]);

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      width: 280,
      background: 'oklch(0.14 0.08 138)',
      border: '1px solid rgba(63,255,33,.4)',
      borderRadius: 14,
      padding: '14px 16px',
      boxShadow: '0 12px 40px rgba(0,0,0,.7), 0 0 0 1px rgba(63,255,33,.1)',
      animation: `${leaving ? 'dg-toast-out' : 'dg-toast-in'} .25s ease-out both`,
      cursor: 'pointer',
    }} onClick={onDismiss}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.78 0.22 138)',
          animation: 'dg-pulse-dot 1.2s ease-in-out infinite', flexShrink: 0,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 900, letterSpacing: '.8px',
          color: 'oklch(0.78 0.22 138)',
        }}>SINAL LUCRATIVO DETECTADO!</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'oklch(0.96 0.005 250)', marginBottom: 3 }}>
        {sig.event_name}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 900, color: 'oklch(0.78 0.22 138)',
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-1px',
      }}>
        {fmtPct(sig.loss_pct)}
      </div>
    </div>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────

function FilterPanel({
  disabled, onToggle, onReset, paMode, onPaMode,
}: {
  disabled: Set<string>;
  onToggle: (h: string) => void;
  onReset: () => void;
  paMode: PaMode;
  onPaMode: (m: PaMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: open ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.05)',
          border: `1px solid ${open ? 'rgba(63,255,33,.35)' : 'rgba(255,255,255,.09)'}`,
          color: open ? 'oklch(0.78 0.22 138)' : 'oklch(0.72 0.01 250)',
          cursor: 'pointer', transition: 'all .15s',
        }}
      >
        <Filter size={12} />
        Filtros
        <span style={{
          fontSize: 9.5, fontWeight: 800, padding: '0 6px', borderRadius: 6,
          background: paMode !== 'nenhum' ? 'rgba(63,255,33,.18)' : 'rgba(255,255,255,.08)',
          color: paMode !== 'nenhum' ? 'oklch(0.78 0.22 138)' : 'rgba(255,255,255,.4)',
        }}>
          PA: {paMode === 'ambos' ? '2x' : paMode === 'um' ? '1x' : 'off'}
        </span>
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
          width: 390, padding: 18,
          background: 'oklch(0.12 0.006 260)',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,.75)',
        }}>
          {/* PA Mode segmented control */}
          <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,.07)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.92 0.005 250)', marginBottom: 10 }}>
              Pagamento Antecipado
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['ambos', 'um', 'nenhum'] as const).map(mode => {
                const labels: Record<PaMode, string> = {
                  ambos:  'Dois lados',
                  um:     'Um lado',
                  nenhum: 'Qualquer',
                };
                const active = paMode === mode;
                return (
                  <button key={mode} type="button" onClick={() => onPaMode(mode)} style={{
                    flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11, fontWeight: 700,
                    background: active ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${active ? 'rgba(63,255,33,.32)' : 'rgba(255,255,255,.07)'}`,
                    color: active ? 'oklch(0.78 0.22 138)' : 'rgba(255,255,255,.35)',
                    cursor: 'pointer', transition: 'all .15s',
                  }}>
                    {labels[mode]}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 7, lineHeight: 1.5 }}>
              {paMode === 'ambos'
                ? 'As três pernas precisam ser de casas PA'
                : paMode === 'um'
                ? 'Pelo menos uma perna precisa ser de casa PA'
                : 'Sem filtro de pagamento antecipado'}
            </div>
          </div>

          {/* PA houses */}
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, color: 'oklch(0.78 0.22 138)', letterSpacing: '.8px', display: 'block', marginBottom: 8 }}>
              PAGAMENTO ANTECIPADO
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {PA_HOUSES.map(h => {
                const active = !disabled.has(normHouse(h));
                return (
                  <button key={h} onClick={() => onToggle(normHouse(h))} style={{
                    padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: active ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${active ? 'rgba(63,255,33,.3)' : 'rgba(255,255,255,.07)'}`,
                    color: active ? 'oklch(0.78 0.22 138)' : 'rgba(255,255,255,.3)',
                    cursor: 'pointer', transition: 'all .12s',
                  }}>{h}</button>
                );
              })}
            </div>
          </div>

          {/* OS houses */}
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, color: '#fbbf24', letterSpacing: '.8px', display: 'block', marginBottom: 6 }}>
              ODDS AUMENTADAS (OS)
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {OS_HOUSES.map(h => {
                const active = !disabled.has(normHouse(h));
                return (
                  <button key={h} onClick={() => onToggle(normHouse(h))} style={{
                    padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: active ? 'rgba(251,191,36,.09)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${active ? 'rgba(251,191,36,.28)' : 'rgba(255,255,255,.07)'}`,
                    color: active ? '#fbbf24' : 'rgba(255,255,255,.3)',
                    cursor: 'pointer', transition: 'all .12s',
                  }}>{h}</button>
                );
              })}
            </div>
          </div>

          <button onClick={onReset} style={{
            width: '100%', padding: '7px', borderRadius: 7, fontSize: 11, fontWeight: 700,
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)',
            color: 'rgba(255,255,255,.4)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <X size={11} /> Resetar filtros
          </button>
        </div>
      )}
    </div>
  );
}

// ── House filter drawer (Casas de Aposta) ─────────────────────────────────────

function HouseCheckboxSection({ title, isOs: isOsGroup, items, disabled, onToggle, onSelectAll, onClear }: {
  title: string;
  isOs: boolean;
  items: string[];
  disabled: Set<string>;
  onToggle: (h: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const accent = isOsGroup ? '#fbbf24' : 'oklch(0.78 0.22 138)';
  const accentBg = isOsGroup ? 'rgba(251,191,36,.09)' : 'rgba(63,255,33,.07)';
  const accentBorder = isOsGroup ? 'rgba(251,191,36,.28)' : 'rgba(63,255,33,.22)';

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,.06)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: accent, letterSpacing: '.06em' }}>{title}</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onSelectAll}
            style={{ fontSize: 10, fontWeight: 700, color: 'oklch(0.78 0.22 138)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Todas
          </button>
          <button type="button" onClick={onClear}
            style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.38)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Limpar
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 5 }}>
        {items.map(h => {
          const active = !disabled.has(normHouse(h));
          return (
            <label key={h} style={{
              display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
              padding: '5px 8px', borderRadius: 7,
              background: active ? accentBg : 'rgba(255,255,255,.03)',
              border: `1px solid ${active ? accentBorder : 'rgba(255,255,255,.06)'}`,
              transition: 'all .15s',
            }}>
              <input type="checkbox" checked={active} onChange={() => onToggle(h)}
                style={{ accentColor: accent, width: 13, height: 13, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600,
                color: active ? (isOsGroup ? '#fde68a' : '#C4FFAE') : '#64748B', lineHeight: 1.3 }}>
                {h}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function HouseFilterDrawer({ disabled, onToggle, onSelectAll, onClear, onClose }: {
  disabled: Set<string>;
  onToggle: (h: string) => void;
  onSelectAll: (group: string[]) => void;
  onClear: (group: string[]) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const activeCount = ALL_HOUSES.length - disabled.size;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
        display: 'flex', justifyContent: 'flex-end',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 520, height: '100%',
        background: '#0D1220', borderLeft: '1px solid rgba(255,255,255,.1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-24px 0 80px rgba(0,0,0,.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={14} style={{ color: 'oklch(0.78 0.22 138)' }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#E2E8F0' }}>Casas de Aposta</span>
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 5,
              background: 'rgba(63,255,33,.1)', color: 'oklch(0.78 0.22 138)',
              border: '1px solid rgba(63,255,33,.2)',
            }}>
              {activeCount} ativas
            </span>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,.07)', border: 'none', borderRadius: 8,
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#94A3B8', cursor: 'pointer',
          }}>
            <X size={15} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <HouseCheckboxSection
            title="Pagamento Antecipado"
            isOs={false}
            items={PA_HOUSES}
            disabled={disabled}
            onToggle={onToggle}
            onSelectAll={() => onSelectAll(PA_HOUSES)}
            onClear={() => onClear(PA_HOUSES)}
          />
          <HouseCheckboxSection
            title="Odds Aumentadas (OS)"
            isOs={true}
            items={OS_HOUSES}
            disabled={disabled}
            onToggle={onToggle}
            onSelectAll={() => onSelectAll(OS_HOUSES)}
            onClear={() => onClear(OS_HOUSES)}
          />
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,.07)', flexShrink: 0,
          display: 'flex', gap: 8,
        }}>
          <button type="button"
            onClick={() => { onSelectAll(ALL_HOUSES); }}
            style={{
              flex: 1, padding: '8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: 'rgba(63,255,33,.07)', border: '1px solid rgba(63,255,33,.2)',
              color: 'oklch(0.78 0.22 138)', cursor: 'pointer',
            }}>
            Selecionar Todas
          </button>
          <button type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)',
              color: 'rgba(255,255,255,.5)', cursor: 'pointer',
            }}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SortOrder = 'melhor' | 'pior' | 'recentes' | 'antigos';
type PaMode    = 'ambos' | 'um' | 'nenhum';

export function DuploGreenPage() {
  const [signals,        setSignals]        = useState<MLSignal[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [meta,           setMeta]           = useState({ total: 0, computedAt: '', cacheAgeMin: null as number | null });
  const [disabled,       setDisabled]       = useState<Set<string>>(new Set());
  const [paMode,         setPaMode]         = useState<PaMode>('ambos');
  const [sortOrder,      setSortOrder]      = useState<SortOrder>('melhor');
  const [countdown,      setCountdown]      = useState(30);
  const [toast,          setToast]          = useState<MLSignal | null>(null);
  const [skipped,        setSkipped]        = useState<Set<string>>(new Set());
  const [starred,        setStarred]        = useState<Set<string>>(new Set());
  const [showHousePanel, setShowHousePanel] = useState(false);

  const prevMlRef  = useRef<Map<string, number>>(new Map());
  const toastShown = useRef<Set<string>>(new Set());

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchSignals = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError('');
    setCountdown(30);
    try {
      const res  = await fetch('/api/supermonitor/duplo-green', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled_houses: Array.from(disabled), pa_only: paMode === 'ambos' }),
      });
      const json = await res.json() as {
        ok: boolean; error?: string;
        ml?: MLSignal[];
        total_events?: number; computed_at?: string;
        cache_age_min?: number | null;
      };
      if (!json.ok) { setError(json.error ?? 'Erro desconhecido'); return; }

      const nowTs = Date.now();
      const incoming = (json.ml ?? []).map(s => ({ ...s, _key: mlKey(s) }));
      const nextMap  = new Map<string, number>();

      const marked = incoming.map(s => {
        nextMap.set(s._key!, s.loss_pct);
        const prev = prevMlRef.current.get(s._key!);
        const isNew = prev === undefined || s.loss_pct < prev - 0.01;
        return { ...s, _newAt: isNew ? nowTs : 0 };
      });
      prevMlRef.current = nextMap;

      setSignals(marked);
      setMeta({
        total: json.total_events ?? 0,
        computedAt: json.computed_at ?? '',
        cacheAgeMin: json.cache_age_min ?? null,
      });

      // Show toast for best profitable signal (once per key)
      const bestProfit = marked.find(s => s.loss_pct <= 0 && !toastShown.current.has(s._key!));
      if (bestProfit) {
        toastShown.current.add(bestProfit._key!);
        setToast(bestProfit);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(disabled).sort().join(','), paMode]);

  useEffect(() => { fetchSignals(false); }, []); // eslint-disable-line
  useEffect(() => {
    const id = setInterval(() => fetchSignals(true), 30_000);
    return () => clearInterval(id);
  }, [fetchSignals]);
  useEffect(() => {
    const id = setInterval(() => setCountdown(v => (v <= 1 ? 30 : v - 1)), 1_000);
    return () => clearInterval(id);
  }, []);

  const filterKey = Array.from(disabled).sort().join(',') + paMode;
  useEffect(() => { fetchSignals(false); }, [filterKey]); // eslint-disable-line

  // ── Sorted + filtered signals ─────────────────────────────────────────────

  const now = Date.now();
  const NEW_TTL = 15_000;

  const sorted = useMemo(() => {
    let visible = signals.filter(s => !skipped.has(s._key!));
    // Client-side PA filter (server handles 'ambos' via pa_only=true; 'um' needs client filter)
    if (paMode === 'um') {
      visible = visible.filter(s => s.leg1.pa || s.legX.pa || s.leg2.pa);
    }
    if (sortOrder === 'melhor')   return [...visible].sort((a, b) => a.loss_pct - b.loss_pct);
    if (sortOrder === 'pior')     return [...visible].sort((a, b) => b.loss_pct - a.loss_pct);
    if (sortOrder === 'recentes') return [...visible].sort((a, b) => new Date(b.start_utc).getTime() - new Date(a.start_utc).getTime());
    if (sortOrder === 'antigos')  return [...visible].sort((a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime());
    return visible;
  }, [signals, sortOrder, skipped, paMode]);

  const profitCount = useMemo(() => sorted.filter(s => s.loss_pct <= 0).length, [sorted]);
  const evCount     = useMemo(() => new Set(sorted.map(s => s.event_id)).size, [sorted]);

  const lastUpdate = meta.computedAt
    ? new Date(meta.computedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  return (
    <>
      <style>{STYLES}</style>
      {toast && <ProfitToast sig={toast} onDismiss={() => setToast(null)} />}
      {showHousePanel && (
        <HouseFilterDrawer
          disabled={disabled}
          onToggle={h => setDisabled(prev => { const n = new Set(prev); if (n.has(normHouse(h))) n.delete(normHouse(h)); else n.add(normHouse(h)); return n; })}
          onSelectAll={group => setDisabled(prev => { const n = new Set(prev); group.forEach(h => n.delete(normHouse(h))); return n; })}
          onClear={group => setDisabled(prev => { const n = new Set(prev); group.forEach(h => n.add(normHouse(h))); return n; })}
          onClose={() => setShowHousePanel(false)}
        />
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Zap size={15} style={{ color: 'oklch(0.78 0.22 138)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 900, color: 'oklch(0.96 0.005 250)', letterSpacing: '-.4px', margin: 0 }}>
                Duplo Futebol
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                  background: loading ? '#fbbf24' : 'oklch(0.78 0.22 138)',
                  animation: 'dg-pulse-dot 1.4s ease-in-out infinite',
                }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.38)' }}>
                  {loading ? 'Atualizando…' : 'Conectado · Monitoramento em tempo real ativo'}
                </span>
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {/* Countdown */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 11px', borderRadius: 7,
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: loading ? '#fbbf24' : 'oklch(0.78 0.22 138)',
                animation: 'dg-pulse-dot 1.4s ease-in-out infinite', display: 'inline-block',
              }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', fontFamily: "'JetBrains Mono', monospace" }}>
                {loading ? '…' : `${countdown}s`}
              </span>
            </div>

            <button
              onClick={() => fetchSignals(true)}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)',
                color: 'oklch(0.72 0.01 250)', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? .5 : 1, transition: 'all .15s',
              }}
            >
              <RefreshCw size={12} style={{ animation: loading ? 'dg-spin 1s linear infinite' : 'none' }} />
              Atualizar
            </button>

            {/* Casas de Aposta drawer button */}
            {(() => {
              const houseFilterActive = disabled.size > 0;
              return (
                <button type="button" onClick={() => setShowHousePanel(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: houseFilterActive ? 'rgba(77,166,255,.1)' : 'rgba(255,255,255,.05)',
                    border: `1px solid ${houseFilterActive ? 'rgba(77,166,255,.3)' : 'rgba(255,255,255,.09)'}`,
                    color: houseFilterActive ? '#4DA6FF' : 'oklch(0.72 0.01 250)',
                    cursor: 'pointer', transition: 'all .15s',
                  }}>
                  <SlidersHorizontal size={12} />
                  Casas de Aposta
                  {houseFilterActive && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, padding: '0 5px', borderRadius: 4,
                      background: 'rgba(77,166,255,.2)', color: '#4DA6FF',
                    }}>
                      {ALL_HOUSES.length - disabled.size}
                    </span>
                  )}
                </button>
              );
            })()}

            <FilterPanel
              disabled={disabled}
              onToggle={h => setDisabled(prev => { const n = new Set(prev); n.has(h) ? n.delete(h) : n.add(h); return n; })}
              onReset={() => setDisabled(new Set())}
              paMode={paMode}
              onPaMode={setPaMode}
            />
          </div>
        </div>

        {/* ── Toolbar: counts + sort ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px',
          background: 'oklch(0.115 0.006 260)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10,
        }}>
          {/* Counts */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {loading && signals.length === 0 ? (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Loader2 size={11} style={{ animation: 'dg-spin 1s linear infinite', color: 'oklch(0.78 0.22 138)' }} />
                Escaneando…
              </span>
            ) : (
              <>
                <span style={{ fontSize: 13, color: 'oklch(0.88 0.005 250)' }}>
                  <span style={{ fontWeight: 900, fontFamily: "'JetBrains Mono', monospace" }}>{sorted.length}</span>
                  <span style={{ color: 'rgba(255,255,255,.4)' }}> sinais encontrados</span>
                  {evCount > 0 && (
                    <span style={{ color: 'rgba(255,255,255,.35)' }}> ({evCount} eventos)</span>
                  )}
                </span>
                {profitCount > 0 && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 900, padding: '2px 8px', borderRadius: 5,
                    background: 'rgba(63,255,33,.1)', color: 'oklch(0.78 0.22 138)',
                    border: '1px solid rgba(63,255,33,.22)',
                  }}>
                    {profitCount} com lucro
                  </span>
                )}
                {meta.cacheAgeMin !== null && meta.cacheAgeMin > 15 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                    background: meta.cacheAgeMin > 60 ? 'rgba(239,68,68,.1)' : 'rgba(251,191,36,.07)',
                    border: `1px solid ${meta.cacheAgeMin > 60 ? 'rgba(239,68,68,.22)' : 'rgba(251,191,36,.2)'}`,
                    color: meta.cacheAgeMin > 60 ? '#f87171' : '#fbbf24',
                  }}>
                    ⚠ cache {meta.cacheAgeMin >= 60 ? `${Math.floor(meta.cacheAgeMin / 60)}h` : `${meta.cacheAgeMin}m`} atrás
                  </span>
                )}
                {lastUpdate && (
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,.28)' }}>
                    atualizado às <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{lastUpdate}</span>
                  </span>
                )}
              </>
            )}
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', fontWeight: 600 }}>Ordenar:</span>
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as SortOrder)}
              style={{
                fontSize: 11.5, fontWeight: 700, padding: '5px 9px', borderRadius: 7,
                background: 'rgba(255,255,255,.07)', color: 'oklch(0.82 0.01 250)',
                border: '1px solid rgba(255,255,255,.11)', cursor: 'pointer', outline: 'none',
                appearance: 'none', WebkitAppearance: 'none',
              }}
            >
              <option value="melhor">Maior Lucro</option>
              <option value="pior">Menor Lucro</option>
              <option value="recentes">Mais Recentes</option>
              <option value="antigos">Mais Antigos</option>
            </select>
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && signals.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '80px 0' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 13,
              background: 'rgba(63,255,33,.07)', border: '1px solid rgba(63,255,33,.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Loader2 size={22} style={{ animation: 'dg-spin 1s linear infinite', color: 'oklch(0.78 0.22 138)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.82 0.005 250)' }}>Calculando sinais…</div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.38)', marginTop: 4 }}>Varrendo eventos de futebol do dia</div>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 10,
            background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.18)',
          }}>
            <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, color: '#f87171', fontWeight: 700 }}>Erro ao carregar</div>
              <div style={{ fontSize: 11.5, color: 'rgba(239,68,68,.65)', marginTop: 1 }}>{error}</div>
            </div>
            <button onClick={() => fetchSignals(true)} style={{
              marginLeft: 'auto', padding: '5px 12px', borderRadius: 7,
              background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
              color: '#f87171', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && !error && sorted.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '72px 0' }}>
            <Zap size={30} style={{ color: 'rgba(255,255,255,.12)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.75 0.005 250)' }}>
                {meta.total === 0 ? 'Cache vazio' : 'Nenhum sinal encontrado'}
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.32)', marginTop: 5, maxWidth: 360 }}>
                {meta.total === 0
                  ? 'Nenhuma odd em cache. Aguarde o daemon rodar.'
                  : `${meta.total} eventos analisados não formam arbs 3-vias com as casas selecionadas.`}
              </div>
            </div>
          </div>
        )}

        {/* ── Signal rows ── */}
        {sorted.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map((sig, i) => (
              <SignalRow
                key={sig._key ?? mlKey(sig)}
                sig={sig}
                idx={i}
                isNew={!!(sig._newAt && now - sig._newAt < NEW_TTL)}
                onSkip={() => setSkipped(prev => { const n = new Set(prev); n.add(sig._key!); return n; })}
                onStar={() => setStarred(prev => { const n = new Set(prev); n.has(sig._key!) ? n.delete(sig._key!) : n.add(sig._key!); return n; })}
                starred={starred.has(sig._key!)}
              />
            ))}
          </div>
        )}

      </div>
    </>
  );
}
