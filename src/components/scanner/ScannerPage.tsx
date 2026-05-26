'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Radio, RefreshCw, PauseCircle, PlayCircle,
  TrendingUp, Filter, Bell, BellOff, X,
  ExternalLink, Calculator, PlusCircle, ChevronDown,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useStore } from '@/store/useStore';
import { houseFavicon } from '@/lib/bookmakers/logos';
import type { Leg } from '@/types';

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
@keyframes modalIn {
  from { opacity: 0; transform: translateY(12px) scale(.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes spin { to { transform: rotate(360deg); } }
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

/** Derive the bookmaker site URL from the favicon helper */
function houseSiteUrl(name: string): string | null {
  const favicon = houseFavicon(name);
  if (!favicon) return null;
  const match = favicon.match(/domain=(.+)$/);
  return match ? `https://www.${match[1]}` : null;
}

/** Surebet/DG calculator: profit% for given odds array */
function calcProfit(odds: number[]): number {
  const valid = odds.filter(o => o > 1);
  if (valid.length < 2) return 0;
  const arb = valid.reduce((acc, o) => acc + 1 / o, 0);
  return (1 / arb - 1) * 100;
}

/** Balanced stake distribution for each leg */
function calcStakes(odds: number[], total: number): number[] {
  const valid = odds.filter(o => o > 1);
  if (valid.length < 2) return odds.map(() => 0);
  const arb = valid.reduce((acc, o) => acc + 1 / o, 0);
  const ret = 1 / arb;
  return odds.map(o => o > 1 ? total * (ret / o) : 0);
}

// ── Supabase (para pausa do daemon) ───────────────────────────────────────────
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function CasaChipSmall({ name }: { name: string }) {
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
    </span>
  );
}

// ── Toggle (reutilizável) ──────────────────────────────────────────────────────
function Toggle({ value, onChange, color = '#3DFF8F', label }: {
  value: boolean; onChange: (v: boolean) => void; color?: string; label: string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 32, height: 17, borderRadius: 9, cursor: 'pointer',
          background: value ? `${color}55` : 'rgba(255,255,255,.1)',
          border: `1px solid ${value ? `${color}66` : 'rgba(255,255,255,.12)'}`,
          position: 'relative', transition: 'all .15s',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, width: 11, height: 11, borderRadius: '50%',
          background: value ? color : '#475569',
          left: value ? 18 : 2, transition: 'left .15s, background .15s',
        }} />
      </div>
      <span style={{ fontSize: 11, color: value ? color : '#475569' }}>{label}</span>
    </label>
  );
}

// ── Modal de sinal ─────────────────────────────────────────────────────────────
function SignalModal({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  const bulkAddLegs = useStore(s => s.bulkAddLegs);
  const setView     = useStore(s => s.setView);

  const casas = [signal.casa1, signal.casa2, signal.casa3].filter(Boolean) as string[];
  const [odds,  setOdds]  = useState<number[]>(() => casas.map(() => 1.0));
  const [stake, setStake] = useState(100);
  const [added, setAdded] = useState(false);

  // Initialise odds with neutral values; user can type their actual odds
  const liveProfit = calcProfit(odds);
  const stakes     = calcStakes(odds, stake);
  const totalReturn = stake + stake * (liveProfit / 100);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleAddToPanel() {
    const oid = `dg_${Date.now()}`;
    const bd  = new Date().toISOString().slice(0, 10);
    const ed  = signal.data_evento
      ? new Date(signal.data_evento).toISOString().slice(0, 10)
      : bd;

    const legs: Leg[] = casas.map((casa, i) => ({
      id:     `${oid}_${i}`,
      oid,
      bd,
      ed,
      sp:     'Futebol',
      ev:     signal.jogo ?? 'Jogo desconhecido',
      ho:     casa,
      mk:     signal.tipo === 'DUO' ? 'Duplo Green DUO' : 'Duplo Green ML',
      od:     odds[i] > 1 ? odds[i] : 1.01,
      st:     stakes[i] > 0 ? Math.round(stakes[i] * 100) / 100 : stake / casas.length,
      pc:     liveProfit / casas.length,
      re:     'Pendente',
      pr:     0,
      fl:     [],
      opType: 'duplo_green',
      signal: 'pre',
      source: 'manual',
    }));

    bulkAddLegs(legs);
    setAdded(true);
    setTimeout(() => {
      onClose();
      setView('ops');
    }, 900);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: 560,
        background: '#0F1A14',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 14, overflow: 'hidden',
        animation: 'modalIn .22s ease-out',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 18px 14px',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
          background: 'linear-gradient(180deg, rgba(61,255,143,.05) 0%, transparent 100%)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <TipoBadge tipo={signal.tipo} />
              {signal.is_new && (
                <span style={{
                  padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  background: 'rgba(61,255,143,.15)', color: '#3DFF8F',
                  border: '1px solid rgba(61,255,143,.3)', letterSpacing: '.04em',
                  animation: 'scannerPulse 1.6s ease-in-out infinite',
                }}>NOVO</span>
              )}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#F1F5F9', lineHeight: 1.3 }}>
              {signal.jogo ?? 'Jogo desconhecido'}
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
              {signal.campeonato ?? '—'}
              {signal.data_evento ? ` · ⚽ ${formatDate(signal.data_evento)}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,.1)',
              background: 'rgba(255,255,255,.05)', color: '#475569', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Profit original */}
        <div style={{ padding: '14px 18px 0' }}>
          <div style={{ fontSize: 11, color: '#334155', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Profit original (scanner)
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '6px 14px', borderRadius: 7,
            background: profitBg(signal.profit_margin),
            border: `1px solid ${profitColor(signal.profit_margin)}30`,
          }}>
            <TrendingUp size={13} color={profitColor(signal.profit_margin)} />
            <span style={{ fontSize: 17, fontWeight: 800, color: profitColor(signal.profit_margin), fontVariantNumeric: 'tabular-nums' }}>
              {formatProfit(signal.profit_margin)}
            </span>
          </div>
        </div>

        {/* Casas com odds e links */}
        <div style={{ padding: '14px 18px 0' }}>
          <div style={{ fontSize: 11, color: '#334155', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Casas e Odds
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {casas.map((casa, i) => {
              const favicon = houseFavicon(casa);
              const siteUrl = houseSiteUrl(casa);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(255,255,255,.07)',
                }}>
                  {/* Favicon */}
                  <div style={{
                    width: 22, height: 22, borderRadius: 4, overflow: 'hidden',
                    background: 'rgba(255,255,255,.06)', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {favicon
                      ? <img src={favicon} alt="" width={16} height={16} style={{ objectFit: 'contain' }} />
                      : <span style={{ fontSize: 9, color: '#475569', fontWeight: 700 }}>{casa.slice(0, 2).toUpperCase()}</span>
                    }
                  </div>

                  {/* Nome */}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#CBD5E1', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {casa}
                  </span>

                  {/* Odds input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 10, color: '#475569' }}>Odd:</span>
                    <input
                      type="number"
                      min="1.01"
                      step="0.01"
                      value={odds[i] <= 1 ? '' : odds[i]}
                      placeholder="—"
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setOdds(prev => prev.map((o, idx) => idx === i ? (isNaN(val) ? 1.0 : val) : o));
                      }}
                      style={{
                        width: 70, padding: '4px 8px', borderRadius: 5, fontSize: 13, fontWeight: 700,
                        background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)',
                        color: '#F1F5F9', textAlign: 'right', outline: 'none',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    />
                  </div>

                  {/* Link */}
                  {siteUrl && (
                    <a
                      href={siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Abrir ${casa}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                        background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.18)',
                        color: '#38BDF8', textDecoration: 'none',
                      }}
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Calculadora */}
        <div style={{ padding: '14px 18px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Calculator size={12} color="#475569" />
            <span style={{ fontSize: 11, color: '#334155', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Calculadora
            </span>
          </div>

          {/* Stake total */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#475569' }}>Banca total:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>R$</span>
              <input
                type="number"
                min="1"
                step="10"
                value={stake}
                onChange={e => setStake(Math.max(1, parseFloat(e.target.value) || 100))}
                style={{
                  width: 90, padding: '5px 8px', borderRadius: 5, fontSize: 13, fontWeight: 700,
                  background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)',
                  color: '#F1F5F9', outline: 'none', fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
          </div>

          {/* Distribuição */}
          {odds.some(o => o > 1) && (
            <div style={{
              borderRadius: 8, overflow: 'hidden',
              border: '1px solid rgba(255,255,255,.06)',
              marginBottom: 10,
            }}>
              {/* Cabeçalho tabela */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 80px',
                padding: '6px 12px', fontSize: 10, fontWeight: 700,
                color: '#334155', textTransform: 'uppercase', letterSpacing: '.06em',
                background: 'rgba(255,255,255,.03)',
                borderBottom: '1px solid rgba(255,255,255,.05)',
              }}>
                <span>Casa</span><span style={{ textAlign: 'right' }}>Stake</span><span style={{ textAlign: 'right' }}>Retorno</span>
              </div>
              {casas.map((casa, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 80px',
                  padding: '7px 12px', fontSize: 12,
                  borderBottom: i < casas.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
                  background: 'transparent',
                }}>
                  <span style={{ color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{casa}</span>
                  <span style={{ color: '#E2E8F0', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    R$ {stakes[i].toFixed(2)}
                  </span>
                  <span style={{ color: '#94A3B8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    R$ {(odds[i] > 1 ? stakes[i] * odds[i] : 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Resultado */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderRadius: 8,
            background: liveProfit >= 0 ? 'rgba(61,255,143,.06)' : 'rgba(255,107,107,.06)',
            border: `1px solid ${liveProfit >= 0 ? 'rgba(61,255,143,.15)' : 'rgba(255,107,107,.15)'}`,
          }}>
            <div>
              <div style={{ fontSize: 10, color: '#475569', marginBottom: 2 }}>Retorno esperado</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#E2E8F0', fontVariantNumeric: 'tabular-nums' }}>
                R$ {totalReturn.toFixed(2)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#475569', marginBottom: 2 }}>Lucro</div>
              <div style={{
                fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                color: profitColor(liveProfit),
              }}>
                {formatProfit(liveProfit)}
              </div>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div style={{ padding: '14px 18px 18px', display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.1)', color: '#64748B',
            }}
          >
            Fechar
          </button>
          <button
            onClick={handleAddToPanel}
            disabled={added}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: added ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              background: added ? 'rgba(61,255,143,.15)' : 'rgba(61,255,143,.12)',
              border: `1px solid ${added ? 'rgba(61,255,143,.4)' : 'rgba(61,255,143,.25)'}`,
              color: added ? '#3DFF8F' : '#86EFAC',
              transition: 'all .15s',
            }}
          >
            {added ? (
              <>✓ Adicionado — indo para painel...</>
            ) : (
              <><PlusCircle size={14} /> Adicionar ao painel</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Card de sinal ─────────────────────────────────────────────────────────────
function SignalCard({ signal, onClick }: { signal: Signal; onClick: () => void }) {
  const casas  = [signal.casa1, signal.casa2, signal.casa3].filter(Boolean) as string[];
  const profit = signal.profit_margin;
  const isGreenNew = signal.is_new && profit >= 0;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      style={{
        background: isGreenNew
          ? 'rgba(61,255,143,.07)'
          : 'rgba(255,255,255,.04)',
        border: `1px solid ${signal.is_new ? (isGreenNew ? 'rgba(61,255,143,.5)' : 'rgba(61,255,143,.35)') : 'rgba(255,255,255,.07)'}`,
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 10,
        animation: signal.is_new
          ? 'scannerFadeIn .3s ease-out, scannerNewBorder 1.8s ease-in-out 3'
          : 'scannerFadeIn .25s ease-out',
        position: 'relative', overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color .15s, background .15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor =
          isGreenNew ? 'rgba(61,255,143,.7)' : 'rgba(255,255,255,.16)';
        (e.currentTarget as HTMLElement).style.background =
          isGreenNew ? 'rgba(61,255,143,.10)' : 'rgba(255,255,255,.06)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor =
          signal.is_new ? (isGreenNew ? 'rgba(61,255,143,.5)' : 'rgba(61,255,143,.35)') : 'rgba(255,255,255,.07)';
        (e.currentTarget as HTMLElement).style.background =
          isGreenNew ? 'rgba(61,255,143,.07)' : 'rgba(255,255,255,.04)';
      }}
    >
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
          {casas.map((c, i) => <CasaChipSmall key={i} name={c} />)}
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

// ── Painel de filtro de casas ──────────────────────────────────────────────────
function CasaFilterPanel({
  allCasas,
  deselected,
  onChange,
}: {
  allCasas: string[];
  deselected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const hiddenCount = deselected.size;

  function toggle(casa: string) {
    const next = new Set(deselected);
    if (next.has(casa)) next.delete(casa);
    else next.add(casa);
    onChange(next);
  }

  function selectAll()   { onChange(new Set()); }
  function deselectAll() { onChange(new Set(allCasas)); }

  return (
    <div style={{
      borderRadius: 9, overflow: 'hidden',
      background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
      marginBottom: 10,
    }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', cursor: 'pointer', border: 'none',
          background: 'transparent', textAlign: 'left',
        }}
      >
        <Filter size={12} color="#475569" />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Filtro de Casas</span>
        {hiddenCount > 0 && (
          <span style={{
            padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: 'rgba(255,159,10,.14)', color: '#FF9F0A',
            border: '1px solid rgba(255,159,10,.25)',
          }}>
            {hiddenCount} oculta{hiddenCount > 1 ? 's' : ''}
          </span>
        )}
        <ChevronDown
          size={12}
          color="#475569"
          style={{
            marginLeft: 'auto', transition: 'transform .18s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {open && (
        <div style={{ padding: '0 14px 12px' }}>
          {/* Ações rápidas */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button
              onClick={selectAll}
              style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', background: 'rgba(61,255,143,.1)',
                border: '1px solid rgba(61,255,143,.22)', color: '#3DFF8F',
              }}
            >
              Todas
            </button>
            <button
              onClick={deselectAll}
              style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.1)', color: '#64748B',
              }}
            >
              Nenhuma
            </button>
          </div>

          {/* Grid de chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {allCasas.map(casa => {
              const active = !deselected.has(casa);
              return (
                <button
                  key={casa}
                  onClick={() => toggle(casa)}
                  style={{
                    padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                    cursor: 'pointer', border: '1px solid',
                    background: active ? 'rgba(255,255,255,.08)' : 'transparent',
                    borderColor: active ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)',
                    color: active ? '#CBD5E1' : '#334155',
                    transition: 'all .1s',
                    textDecoration: active ? 'none' : 'line-through',
                    opacity: active ? 1 : .5,
                  }}
                >
                  {casa}
                </button>
              );
            })}
          </div>
        </div>
      )}
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

  // Modal
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  // Filtros de query
  const [tipo,      setTipo]      = useState('');
  const [profitMin, setProfitMin] = useState(-2.5);
  const [onlyNew,   setOnlyNew]   = useState(false);

  // Filtro de casas (client-side)
  // deselectedCasas: conjunto de casas que o usuário OCULTOU
  const [deselectedCasas, setDeselectedCasas] = useState<Set<string>>(new Set());

  const prevNewIds  = useRef<Set<string>>(new Set());
  const audioCtx    = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Extrai todas as casas únicas dos sinais (antes de filtrar) ──────────────
  const allCasas = useMemo(() => {
    const set = new Set<string>();
    signals.forEach(s => {
      if (s.casa1) set.add(s.casa1);
      if (s.casa2) set.add(s.casa2);
      if (s.casa3) set.add(s.casa3);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [signals]);

  // ── Aplica filtro de casas client-side ────────────────────────────────────
  const visibleSignals = useMemo(() => {
    if (deselectedCasas.size === 0) return signals;
    return signals.filter(s => {
      const casas = [s.casa1, s.casa2, s.casa3].filter(Boolean) as string[];
      // Ocultar se TODAS as casas do sinal estão deselected, OU se pelo menos uma está deselected
      // Regra do usuário: "ao desmarcar a casa, aquela casa não vai mais aparecer no site"
      // → ocultar o sinal se QUALQUER uma das suas casas estiver deselected
      return casas.every(c => !deselectedCasas.has(c));
    });
  }, [signals, deselectedCasas]);

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
        limit:     '500',
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
  const newCount      = visibleSignals.filter(s => s.is_new).length;
  const positiveCount = visibleSignals.filter(s => s.profit_margin >= 0).length;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>

      {/* Modal */}
      {selectedSignal && (
        <SignalModal
          signal={selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      )}

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
                Alertas Duplo Green
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
                ? `Atualizado ${formatAgo(lastFetch.toISOString())} · ${visibleSignals.length} sinais`
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
          padding: '12px 14px', borderRadius: 9, marginBottom: 10,
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
          <Toggle value={onlyNew} onChange={setOnlyNew} label="Só novos" />

          <div style={{ marginLeft: 'auto' }}>
            <Toggle value={autoRefresh} onChange={setAutoRefresh} color="#38BDF8" label="Auto (5s)" />
          </div>
        </div>

        {/* Filtro de casas */}
        {allCasas.length > 0 && (
          <CasaFilterPanel
            allCasas={allCasas}
            deselected={deselectedCasas}
            onChange={setDeselectedCasas}
          />
        )}

        {/* Stats rápidas */}
        {visibleSignals.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Total',    value: visibleSignals.length,   color: '#94A3B8' },
              { label: 'Novos',    value: newCount,                color: '#3DFF8F' },
              { label: 'Lucro ≥0', value: positiveCount,          color: '#3DFF8F' },
              { label: 'ML',       value: visibleSignals.filter(s => s.tipo === 'ML').length,  color: '#38BDF8' },
              { label: 'DUO',      value: visibleSignals.filter(s => s.tipo === 'DUO').length, color: '#A78BFA' },
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

        {/* Dica clique */}
        {visibleSignals.length > 0 && (
          <div style={{ fontSize: 11, color: '#334155', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Calculator size={11} />
            Clique em qualquer card para abrir a calculadora e adicionar ao painel.
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
        {!loading && !error && visibleSignals.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '60px 20px', gap: 12, color: '#334155',
          }}>
            <Radio size={32} strokeWidth={1.5} />
            <div style={{ fontSize: 15, fontWeight: 500, color: '#475569' }}>Nenhum sinal encontrado</div>
            <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 340 }}>
              {paused
                ? 'O scanner está pausado. Clique em "Retomar" para iniciar a captação.'
                : deselectedCasas.size > 0
                  ? 'Todos os sinais foram ocultados pelo filtro de casas.'
                  : 'O daemon está buscando sinais. Aguarde ou ajuste os filtros.'}
            </div>
          </div>
        )}

        {/* Grid de sinais */}
        {visibleSignals.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 10,
          }}>
            {visibleSignals.map(s => (
              <SignalCard
                key={s.id}
                signal={s}
                onClick={() => setSelectedSignal(s)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
