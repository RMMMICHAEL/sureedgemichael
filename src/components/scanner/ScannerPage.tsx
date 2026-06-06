'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Radio, RefreshCw, PauseCircle, PlayCircle,
  TrendingUp, Filter, Bell, BellOff, X, ExternalLink, ChevronDown,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { houseFavicon } from '@/lib/bookmakers/logos';
import { SurebetCalc } from '@/components/calcalendario/SurebetCalc';
import { useStore } from '@/store/useStore';
import { isAdminEmail } from '@/lib/supabase/subscription';

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
  from { opacity: 0; transform: translateY(14px) scale(.97); }
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
  raw_data?:     Record<string, unknown> | null;
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

// Casas com URL completa (path específico além do domínio raiz)
const SITE_URL_OVERRIDES: Record<string, string> = {
  'tradeball': 'https://betbra.bet.br/tradeball/dballTradingFeed',
  'betbra':    'https://betbra.bet.br/tradeball/dballTradingFeed',
};

/** Extract a site URL from the favicon helper */
function houseSiteUrl(name: string): string | null {
  const key = name.toLowerCase().replace(/[\s\-_.]/g, '');
  if (SITE_URL_OVERRIDES[key]) return SITE_URL_OVERRIDES[key];

  // Strip PA/variant suffixes antes do lookup de domínio:
  // "Betano (PA)" → "Betano", "Sporty 1UP" → "Sporty", "Sporty 2UP" → "Sporty"
  const baseName = name
    .replace(/\s*\(PA\)/gi, '')
    .replace(/\s+[12]UP$/i, '')
    .trim();

  const favicon = houseFavicon(baseName);
  if (!favicon) return null;
  const match = favicon.match(/domain=(.+)$/);
  // Sem www — vários domínios .bet.br não respondem ao subdomínio www
  return match ? `https://${match[1]}` : null;
}

/** Tenta extrair URL do evento/jogo a partir do raw_data do sinal */
function extractEventUrl(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  // Campos diretos de URL do evento
  for (const key of ['url', 'event_url', 'game_url', 'match_url', 'link', 'event_link', 'match_link']) {
    const v = raw[key];
    if (typeof v === 'string' && v.startsWith('http')) return v;
  }
  // Mapa de URLs por casa — pega o primeiro valor disponível
  for (const key of ['urls', 'bookmaker_urls', 'links']) {
    const obj = raw[key];
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const first = Object.values(obj as Record<string, unknown>)
        .find(v => typeof v === 'string' && (v as string).startsWith('http'));
      if (first) return first as string;
    }
  }
  return null;
}

/**
 * Collect all numeric values in a (possibly nested) object that look like odds.
 * Depth-limited to 3 to avoid circular structures.
 */
function collectOddyNums(
  obj: Record<string, unknown>,
  depth = 0,
): Array<{ key: string; val: number; priority: number }> {
  if (depth > 3) return [];
  const results: Array<{ key: string; val: number; priority: number }> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && v >= 1.01 && v <= 30) {
      // Higher priority for keys that explicitly mention odds/coef/cota
      const p = /odd|cota|coef|kef|rate|price|quote|cotacao|coefficien/i.test(k) ? 2 : 1;
      results.push({ key: k, val: v, priority: p });
    } else if (
      depth < 3 &&
      v !== null && typeof v === 'object' && !Array.isArray(v)
    ) {
      results.push(...collectOddyNums(v as Record<string, unknown>, depth + 1));
    } else if (Array.isArray(v) && depth < 2) {
      (v as unknown[]).forEach((item, i) => {
        if (typeof item === 'number' && item >= 1.01 && item <= 30)
          results.push({ key: `${k}[${i}]`, val: item, priority: 1 });
        else if (item !== null && typeof item === 'object' && !Array.isArray(item))
          results.push(...collectOddyNums(item as Record<string, unknown>, depth + 2));
      });
    }
  }
  return results;
}

/**
 * Try to extract per-casa odds from the raw SuperMonitor signal object.
 * SuperMonitor stores odd values in various shapes — we try many patterns.
 */
function extractOdds(raw: Record<string, unknown> | null | undefined, casaCount: number): string[] {
  const empty = Array.from({ length: casaCount }, () => '');
  if (!raw) return empty;

  // ── Pattern 1: explicit indexed odd field names ───────────────────────────
  // SuperMonitor scanner signals typically name their fields odd1/odd2/odd3
  // matching the casa1/casa2/casa3 convention.
  const FIELD_GROUPS = [
    // index 0 (casa1)
    ['odd1','odd_1','coef1','cota1','coeficiente1','quote1','rate1','price1',
     'coefficient1','kef1','cotacao1','prob1','casa1_odd','casa1odd','bookmaker1_odd','cot1'],
    // index 1 (casa2)
    ['odd2','odd_2','coef2','cota2','coeficiente2','quote2','rate2','price2',
     'coefficient2','kef2','cotacao2','prob2','casa2_odd','casa2odd','bookmaker2_odd','cot2'],
    // index 2 (casa3)
    ['odd3','odd_3','coef3','cota3','coeficiente3','quote3','rate3','price3',
     'coefficient3','kef3','cotacao3','prob3','casa3_odd','casa3odd','bookmaker3_odd','cot3'],
  ];

  const p1result = Array.from({ length: casaCount }, () => '');
  let p1found = 0;
  for (let i = 0; i < casaCount; i++) {
    for (const field of FIELD_GROUPS[i] ?? []) {
      const v = raw[field];
      if (v != null && v !== '' && v !== 0) {
        p1result[i] = String(v);
        p1found++;
        break;
      }
    }
  }
  if (p1found >= 2) return p1result;

  // ── Pattern 2: "odds" key as array ────────────────────────────────────────
  for (const key of ['odds', 'cotas', 'coeficientes', 'cotacoes', 'quotes', 'rates']) {
    const list = raw[key];
    if (Array.isArray(list) && list.length >= 2) {
      const arr = (list as unknown[])
        .slice(0, casaCount)
        .map(o => (typeof o === 'number' ? String(o) : (typeof o === 'string' ? o : '')));
      if (arr.filter(Boolean).length >= 2) return arr.concat(empty.slice(arr.length));
    }
  }

  // ── Pattern 3: "odds" key as object ──────────────────────────────────────
  for (const key of ['odds', 'cotas', 'coeficientes']) {
    const obj = raw[key];
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const vals = Object.values(obj as Record<string, unknown>)
        .filter(v => typeof v === 'number' && (v as number) > 1)
        .slice(0, casaCount)
        .map(String);
      if (vals.length >= 2) return vals.concat(empty.slice(vals.length));
    }
  }

  // ── Pattern 4: objects named per-bookmaker with an odd inside ────────────
  // e.g. raw.bookmaker1 = { odd: 2.15 } or raw.casa1_data = { odd: 2.15 }
  const nestedKeys = [
    ['bookmaker1','bookmaker2','bookmaker3'],
    ['casa1_data','casa2_data','casa3_data'],
    ['market1','market2','market3'],
  ];
  for (const group of nestedKeys) {
    const p4result = Array.from({ length: casaCount }, () => '');
    let p4found = 0;
    for (let i = 0; i < casaCount; i++) {
      const nested = raw[group[i]];
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        for (const field of FIELD_GROUPS[i]) {
          const v = (nested as Record<string, unknown>)[field];
          if (v != null) { p4result[i] = String(v); p4found++; break; }
        }
        if (!p4result[i]) {
          // Any numeric value between 1.01–30
          for (const v of Object.values(nested as Record<string, unknown>)) {
            if (typeof v === 'number' && v >= 1.01 && v <= 30) {
              p4result[i] = String(v); p4found++; break;
            }
          }
        }
      }
    }
    if (p4found >= 2) return p4result;
  }

  // ── Pattern 5: scan ALL numeric values — prefer odd-named keys ───────────
  const all = collectOddyNums(raw);
  const sorted = all.sort((a, b) => b.priority - a.priority);
  if (sorted.length >= 2) {
    const top = sorted.slice(0, casaCount);
    return top.map(x => String(x.val)).concat(empty.slice(top.length));
  }

  return empty;
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

// Detecta se uma casa é PA: "(PA)" explícito ou variantes Sporty 1UP / 2UP
function isCasaPA(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  if (n.includes('(pa)')) return true;
  const norm = n.replace(/[\s\-_.]/g, '');
  return norm === 'sporty1up' || norm === 'sporty2up';
}

function CasaChipSmall({ name }: { name: string }) {
  const isPA = isCasaPA(name);
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

// ── Signal Modal — embeds the full SurebetCalc ────────────────────────────────
function SignalModal({ signal, onClose, onOpenInOdds }: {
  signal: Signal; onClose: () => void; onOpenInOdds: (name: string) => void;
}) {
  // Memoize so references stay stable — prevents SurebetCalc from resetting
  // user-edited odds on every re-render of this modal.
  const casas = useMemo(
    () => [signal.casa1, signal.casa2, signal.casa3].filter(Boolean) as string[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signal.id],
  );

  const externalFill = useMemo(() => {
    const extracted = extractOdds(signal.raw_data, casas.length);
    // Only pass odds that were actually found (non-empty); SurebetCalc keeps
    // existing values for positions we leave empty.
    const cleanedOdds = extracted.map(o => {
      const n = parseFloat(o);
      return !isNaN(n) && n > 1 ? o : '';
    });
    const urls     = casas.map(c => houseSiteUrl(c) ?? '');
    const favicons = casas.map(c => houseFavicon(c) ?? '');
    return { odds: cleanedOdds, houses: casas, urls, favicons };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const selectedEvent = signal.data_evento
    ? { name: signal.jogo ?? '', start_utc: signal.data_evento }
    : signal.jogo
      ? { name: signal.jogo, start_utc: new Date().toISOString() }
      : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: 700,
        background: '#0A1510',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 16, overflow: 'hidden',
        animation: 'modalIn .22s ease-out',
        marginBottom: 24,
      }}>
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{
          padding: '16px 20px 14px',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          background: 'linear-gradient(180deg, rgba(61,255,143,.05) 0%, transparent 100%)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <TipoBadge tipo={signal.tipo} />
              {signal.is_new && (
                <span style={{
                  padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  background: 'rgba(61,255,143,.15)', color: '#3DFF8F',
                  border: '1px solid rgba(61,255,143,.3)', letterSpacing: '.04em',
                  animation: 'scannerPulse 1.6s ease-in-out infinite',
                }}>NOVO</span>
              )}
              {/* Profit badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 10px', borderRadius: 5,
                background: profitBg(signal.profit_margin),
                border: `1px solid ${profitColor(signal.profit_margin)}30`,
              }}>
                <TrendingUp size={11} color={profitColor(signal.profit_margin)} />
                <span style={{ fontSize: 13, fontWeight: 800, color: profitColor(signal.profit_margin), fontVariantNumeric: 'tabular-nums' }}>
                  {formatProfit(signal.profit_margin)}
                </span>
              </div>
            </div>
            {signal.jogo ? (
              <button
                type="button"
                onClick={() => { onClose(); onOpenInOdds(signal.jogo!); }}
                title="Buscar odds deste jogo"
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 16, fontWeight: 700, color: '#818cf8', lineHeight: 1.3,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                {signal.jogo}
                <ExternalLink size={12} style={{ opacity: .7, flexShrink: 0 }} />
              </button>
            ) : (
              <div style={{ fontSize: 16, fontWeight: 700, color: '#F1F5F9', lineHeight: 1.3 }}>
                Jogo desconhecido
              </div>
            )}
            <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
              {signal.campeonato ?? '—'}
              {signal.data_evento ? ` · ⚽ ${formatDate(signal.data_evento)}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 7, border: '1px solid rgba(255,255,255,.1)',
              background: 'rgba(255,255,255,.05)', color: '#475569', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Casa links ───────────────────────────────────────────────── */}
        {casas.length > 0 && (
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255,255,255,.05)',
            display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: '#334155', fontWeight: 600 }}>Abrir:</span>
            {casas.map((casa, i) => {
              const favicon = houseFavicon(casa);
              const siteUrl = houseSiteUrl(casa);
              return siteUrl ? (
                <a
                  key={i}
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                    color: '#94A3B8', textDecoration: 'none',
                    transition: 'border-color .12s, color .12s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = '#E2E8F0';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,.4)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = '#94A3B8';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.1)';
                  }}
                >
                  {favicon && <img src={favicon} alt="" width={13} height={13} style={{ borderRadius: 2 }} />}
                  {casa}
                  <ExternalLink size={10} />
                </a>
              ) : (
                <CasaChipSmall key={i} name={casa} />
              );
            })}
          </div>
        )}

        {/* ── SurebetCalc ──────────────────────────────────────────────── */}
        <div style={{ padding: '16px 20px 24px', colorScheme: 'dark' }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#334155',
            textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12,
          }}>
            Calculadora
          </div>
          <SurebetCalc
            selectedEvent={selectedEvent}
            externalFill={externalFill}
            defaultNumOutcomes={casas.length >= 3 ? 3 : 2}
          />
        </div>
      </div>
    </div>
  );
}

// ── Card de sinal ─────────────────────────────────────────────────────────────
function SignalCard({ signal, onClick, onOpenInOdds }: {
  signal: Signal; onClick: () => void; onOpenInOdds: (name: string) => void;
}) {
  const casas     = [signal.casa1, signal.casa2, signal.casa3].filter(Boolean) as string[];
  const profit    = signal.profit_margin;
  const isGreenNew = signal.is_new && profit >= 0;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      style={{
        background: isGreenNew ? 'rgba(61,255,143,.07)' : 'rgba(255,255,255,.04)',
        border: `1px solid ${signal.is_new ? (isGreenNew ? 'rgba(61,255,143,.5)' : 'rgba(61,255,143,.35)') : 'rgba(255,255,255,.07)'}`,
        borderRadius: 10, padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 10,
        animation: signal.is_new
          ? 'scannerFadeIn .3s ease-out, scannerNewBorder 1.8s ease-in-out 3'
          : 'scannerFadeIn .25s ease-out',
        position: 'relative', overflow: 'hidden',
        cursor: 'pointer', transition: 'border-color .15s, background .15s',
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
      {/* Acento de profit */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: profitColor(profit), opacity: profit >= 0 ? .7 : .35,
        borderRadius: '10px 10px 0 0',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {signal.jogo ? (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onOpenInOdds(signal.jogo!); }}
              title="Ver odds deste jogo"
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 14, fontWeight: 600, color: '#818cf8', lineHeight: 1.3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                display: 'flex', alignItems: 'center', gap: 4, maxWidth: '100%',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {signal.jogo}
              </span>
              <ExternalLink size={10} style={{ flexShrink: 0, opacity: .7 }} />
            </button>
          ) : (
            <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0', lineHeight: 1.3,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Jogo desconhecido
            </div>
          )}
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{signal.campeonato ?? '—'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {signal.is_new && (
            <span style={{
              padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
              background: 'rgba(61,255,143,.15)', color: '#3DFF8F',
              border: '1px solid rgba(61,255,143,.3)', letterSpacing: '.04em',
              animation: 'scannerPulse 1.6s ease-in-out infinite',
            }}>NOVO</span>
          )}
          <TipoBadge tipo={signal.tipo} />
        </div>
      </div>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 6, alignSelf: 'flex-start',
        background: profitBg(profit), border: `1px solid ${profitColor(profit)}30`,
      }}>
        <TrendingUp size={12} color={profitColor(profit)} />
        <span style={{ fontSize: 15, fontWeight: 700, color: profitColor(profit), fontVariantNumeric: 'tabular-nums' }}>
          {formatProfit(profit)}
        </span>
      </div>

      {casas.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {casas.map((c, i) => <CasaChipSmall key={i} name={c} />)}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <span style={{ fontSize: 11, color: '#475569' }}>
          {signal.data_evento ? `⚽ ${formatDate(signal.data_evento)}` : ''}
        </span>
        <span style={{ fontSize: 10, color: '#334155' }}>{formatAgo(signal.updated_at)}</span>
      </div>
    </div>
  );
}

// ── Filtro de tipo ────────────────────────────────────────────────────────────
function TipoFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[{ id: '', label: 'Todos' }, { id: 'ML', label: 'ML' }].map(o => (
        <button
          key={o.id} type="button"
          onClick={() => onChange(o.id)}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: '1px solid',
            background: value === o.id ? 'rgba(255,255,255,.1)' : 'transparent',
            borderColor: value === o.id ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.07)',
            color: value === o.id ? '#E2E8F0' : '#64748B',
            transition: 'all .15s',
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

// ── Filtro de PA ───────────────────────────────────────────────────────────────
type PaFilterVal = 'all' | 'none' | 'one' | 'two';
const PA_FILTER_OPTS: { id: PaFilterVal; label: string }[] = [
  { id: 'all',  label: 'Todos'        },
  { id: 'none', label: 'Sem PA'       },
  { id: 'one',  label: 'PA 1 lado'   },
  { id: 'two',  label: 'PA 2 lados'  },
];

function PaFilter({ value, onChange }: { value: PaFilterVal; onChange: (v: PaFilterVal) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {PA_FILTER_OPTS.map(o => {
        const active = value === o.id;
        const isPA   = o.id !== 'all' && o.id !== 'none';
        return (
          <button
            key={o.id} type="button"
            onClick={() => onChange(o.id)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', border: '1px solid',
              background: active
                ? (isPA ? 'rgba(255,159,10,.14)' : 'rgba(255,255,255,.1)')
                : 'transparent',
              borderColor: active
                ? (isPA ? 'rgba(255,159,10,.35)' : 'rgba(255,255,255,.2)')
                : 'rgba(255,255,255,.07)',
              color: active ? (isPA ? '#FF9F0A' : '#E2E8F0') : '#64748B',
              transition: 'all .15s',
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

// ── Filtro de data (próximas Nh) ──────────────────────────────────────────────
type DateFilterVal = 'all' | '24h' | '48h' | '72h';
const DATE_FILTER_OPTS: { id: DateFilterVal; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: '24h', label: '24h'  },
  { id: '48h', label: '48h'  },
  { id: '72h', label: '72h'  },
];

function DateFilter({ value, onChange }: { value: DateFilterVal; onChange: (v: DateFilterVal) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {DATE_FILTER_OPTS.map(o => (
        <button
          key={o.id} type="button"
          onClick={() => onChange(o.id)}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: '1px solid',
            background: value === o.id ? 'rgba(255,255,255,.1)' : 'transparent',
            borderColor: value === o.id ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.07)',
            color: value === o.id ? '#E2E8F0' : '#64748B',
            transition: 'all .15s',
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

// ── Painel de filtro de casas ─────────────────────────────────────────────────
function CasaFilterPanel({ allCasas, deselected, onChange }: {
  allCasas: string[]; deselected: Set<string>; onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const hiddenCount = deselected.size;

  const toggle = (casa: string) => {
    const next = new Set(deselected);
    if (next.has(casa)) next.delete(casa); else next.add(casa);
    onChange(next);
  };

  return (
    <div style={{
      borderRadius: 9, overflow: 'hidden',
      background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', marginBottom: 10,
    }}>
      <button
        type="button"
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
          }}>{hiddenCount} oculta{hiddenCount > 1 ? 's' : ''}</span>
        )}
        <ChevronDown size={12} color="#475569" style={{
          marginLeft: 'auto', transition: 'transform .18s',
          transform: open ? 'rotate(180deg)' : 'none',
        }} />
      </button>

      {open && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button type="button" onClick={() => onChange(new Set())} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(61,255,143,.1)', border: '1px solid rgba(61,255,143,.22)', color: '#3DFF8F',
            }}>Todas</button>
            <button type="button" onClick={() => onChange(new Set(allCasas))} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#64748B',
            }}>Nenhuma</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {allCasas.map(casa => {
              const active = !deselected.has(casa);
              return (
                <button key={casa} type="button" onClick={() => toggle(casa)} style={{
                  padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', border: '1px solid',
                  background: active ? 'rgba(255,255,255,.08)' : 'transparent',
                  borderColor: active ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)',
                  color: active ? '#CBD5E1' : '#334155',
                  transition: 'all .1s', opacity: active ? 1 : .5,
                  textDecoration: active ? 'none' : 'line-through',
                }}>{casa}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── NOTIF PREF key ────────────────────────────────────────────────────────────
export const SCANNER_NOTIF_KEY = 'scanner-notif-v1';

// ── Componente principal ───────────────────────────────────────────────────────
export function ScannerPage() {
  const authEmail        = useStore(s => s.authEmail);
  const isAdmin          = isAdminEmail(authEmail);
  const setView          = useStore(s => s.setView);
  const setOddsInitQuery = useStore(s => s.setOddsInitQuery);

  const openInOdds = useCallback((gameName: string) => {
    setOddsInitQuery(gameName);
    setView('odds');
  }, [setOddsInitQuery, setView]);

  const [signals,     setSignals]     = useState<Signal[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastFetch,   setLastFetch]   = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [beep,        setBeep]        = useState(true);
  const [paused,      setPaused]      = useState(false);
  const [pausing,     setPausing]     = useState(false);

  // Scanner notifications preference
  const [notifEnabled, setNotifEnabled] = useState(() => {
    try { return localStorage.getItem(SCANNER_NOTIF_KEY) === '1'; } catch { return false; }
  });

  // Modal
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  // Filtros query
  const [tipo,      setTipo]      = useState('');
  const [profitMin, setProfitMin] = useState(-2.5);
  const [onlyNew,   setOnlyNew]   = useState(false);
  const [paFilter,  setPaFilter]  = useState<PaFilterVal>(() => {
    try { return (localStorage.getItem('scanner-pa-filter-v1') as PaFilterVal) || 'all'; } catch { return 'all'; }
  });
  const [dateFilter, setDateFilter] = useState<DateFilterVal>(() => {
    try { return (localStorage.getItem('scanner-date-filter-v1') as DateFilterVal) || 'all'; } catch { return 'all'; }
  });

  // Filtro client-side de casas
  const [deselectedCasas, setDeselectedCasas] = useState<Set<string>>(new Set());

  const prevNewIds  = useRef<Set<string>>(new Set());
  const audioCtx    = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist notif preference
  const toggleNotif = useCallback((v: boolean) => {
    setNotifEnabled(v);
    try { localStorage.setItem(SCANNER_NOTIF_KEY, v ? '1' : '0'); } catch {}
  }, []);

  // Persist PA filter preference
  const changePaFilter = useCallback((v: PaFilterVal) => {
    setPaFilter(v);
    try { localStorage.setItem('scanner-pa-filter-v1', v); } catch {}
  }, []);

  // Persist date filter preference
  const changeDateFilter = useCallback((v: DateFilterVal) => {
    setDateFilter(v);
    try { localStorage.setItem('scanner-date-filter-v1', v); } catch {}
  }, []);

  // Extract unique casas
  const allCasas = useMemo(() => {
    const set = new Set<string>();
    signals.forEach(s => {
      if (s.casa1) set.add(s.casa1);
      if (s.casa2) set.add(s.casa2);
      if (s.casa3) set.add(s.casa3);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [signals]);

  // Apply casa filter + PA filter + hide events that have already started (5-min grace)
  const visibleSignals = useMemo(() => {
    const now = Date.now();
    return signals.filter(s => {
      // Casa filter
      if (deselectedCasas.size > 0) {
        const casas = [s.casa1, s.casa2, s.casa3].filter(Boolean) as string[];
        if (!casas.every(c => !deselectedCasas.has(c))) return false;
      }
      // PA filter
      if (paFilter !== 'all') {
        const casas  = [s.casa1, s.casa2, s.casa3].filter(Boolean) as string[];
        const paCount = casas.filter(isCasaPA).length;
        if (paFilter === 'none' && paCount > 0)  return false;
        if (paFilter === 'one'  && paCount !== 1) return false;
        if (paFilter === 'two'  && paCount < 2)  return false;
      }
      // Date filter — exclude past events (API already does this, belt-and-braces)
      if (s.data_evento) {
        const startMs = new Date(s.data_evento).getTime();
        if (!isNaN(startMs) && startMs < now - 5 * 60 * 1000) return false;
      }
      // Date filter — show only events starting within the next N hours
      if (dateFilter !== 'all' && s.data_evento) {
        const startMs = new Date(s.data_evento).getTime();
        const hoursAhead = (startMs - now) / 3_600_000;
        const maxHours = dateFilter === '24h' ? 24 : dateFilter === '48h' ? 48 : 72;
        if (!isNaN(hoursAhead) && hoursAhead > maxHours) return false;
      }
      return true;
    });
  }, [signals, deselectedCasas, paFilter, dateFilter]);

  // Daemon staleness: warn if newest updated_at is > 3 min ago
  const daemonStale = useMemo(() => {
    if (signals.length === 0) return false;
    const newest = signals.reduce(
      (max, s) => Math.max(max, new Date(s.updated_at).getTime()), 0,
    );
    return Date.now() - newest > 3 * 60 * 1000;
  }, [signals]);

  // Beep
  const playBeep = useCallback(() => {
    if (!beep) return;
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + .12);
      gain.gain.setValueAtTime(.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .22);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + .22);
    } catch { /* noop */ }
  }, [beep]);

  // Fetch
  const fetchSignals = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ profitMin: String(profitMin), limit: '500' });
      if (tipo)    qs.set('tipo', tipo);
      if (onlyNew) qs.set('onlyNew', 'true');

      const res  = await fetch(`/api/sure/scanner?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { ok: boolean; signals: Signal[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro desconhecido');

      const incoming = json.signals as Signal[];
      const newIds = new Set(incoming.filter(s => s.is_new).map(s => s.id));
      const hasNew = [...newIds].some(id => !prevNewIds.current.has(id));
      if (hasNew) playBeep();
      prevNewIds.current = newIds;

      setSignals(incoming);
      setLastFetch(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tipo, profitMin, onlyNew, playBeep]);

  useEffect(() => {
    fetchSignals();
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchSignals(true), 5_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchSignals, autoRefresh]);

  // Pausa daemon
  const togglePause = useCallback(async () => {
    setPausing(true);
    try {
      const sb     = getSupabase();
      const newVal = !paused ? 'true' : 'false';
      await sb.from('app_config').upsert(
        { key: 'scanner_paused', value: newVal, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      setPaused(!paused);
    } catch (e) { console.error('togglePause:', e); }
    finally { setPausing(false); }
  }, [paused]);

  useEffect(() => {
    (async () => {
      try {
        const sb = getSupabase();
        const { data } = await sb.from('app_config').select('value').eq('key', 'scanner_paused').single();
        if (data?.value === 'true') setPaused(true);
      } catch { /* ignora */ }
    })();
  }, []);

  const newCount      = visibleSignals.filter(s => s.is_new).length;
  const positiveCount = visibleSignals.filter(s => s.profit_margin >= 0).length;

  return (
    <>
      <style>{STYLES}</style>

      {/* Modal */}
      {selectedSignal && (
        <SignalModal
          signal={selectedSignal}
          onClose={() => setSelectedSignal(null)}
          onOpenInOdds={openInOdds}
        />
      )}

      <div style={{ padding: '20px 20px 40px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Cabeçalho */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, marginBottom: 20,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: paused ? '#FF9F0A' : '#3DFF8F',
                animation: paused ? 'none' : 'liveDot 1.4s ease-in-out infinite', flexShrink: 0,
              }} />
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>
                Alertas Duplo Green
              </h1>
              {paused && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  background: 'rgba(255,159,10,.15)', color: '#FF9F0A',
                  border: '1px solid rgba(255,159,10,.3)',
                }}>PAUSADO</span>
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

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => fetchSignals()} title="Atualizar agora" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
              color: '#94A3B8', cursor: 'pointer',
            }}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Refresh
            </button>

            <button type="button" onClick={() => setBeep(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
              background: beep ? 'rgba(61,255,143,.08)' : 'rgba(255,255,255,.05)',
              border: `1px solid ${beep ? 'rgba(61,255,143,.2)' : 'rgba(255,255,255,.08)'}`,
              color: beep ? '#3DFF8F' : '#475569', cursor: 'pointer',
            }}>
              {beep ? <Bell size={13} /> : <BellOff size={13} />}
              {beep ? 'Som ativo' : 'Mudo'}
            </button>

            {isAdmin && (
              <button type="button" onClick={togglePause} disabled={pausing} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                background: paused ? 'rgba(61,255,143,.08)' : 'rgba(255,159,10,.08)',
                border: `1px solid ${paused ? 'rgba(61,255,143,.2)' : 'rgba(255,159,10,.22)'}`,
                color: paused ? '#3DFF8F' : '#FF9F0A',
                cursor: pausing ? 'not-allowed' : 'pointer', opacity: pausing ? .6 : 1,
              }}>
                {paused ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                {paused ? 'Retomar' : 'Pausar daemon'}
              </button>
            )}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>Tipo</span>
            <TipoFilter value={tipo} onChange={setTipo} />
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.07)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>PA</span>
            <PaFilter value={paFilter} onChange={changePaFilter} />
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.07)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>Evento em</span>
            <DateFilter value={dateFilter} onChange={changeDateFilter} />
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.07)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>Profit mín.</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[-2.5, -2, -1, -0.5, 0].map(v => (
                <button key={v} type="button" onClick={() => setProfitMin(v)} style={{
                  padding: '4px 9px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', border: '1px solid',
                  background: profitMin === v ? profitBg(v) : 'transparent',
                  borderColor: profitMin === v ? `${profitColor(v)}40` : 'rgba(255,255,255,.07)',
                  color: profitMin === v ? profitColor(v) : '#475569',
                  transition: 'all .12s',
                }}>{v >= 0 ? '+' : ''}{v}%</button>
              ))}
            </div>
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.07)' }} />
          <Toggle value={onlyNew} onChange={setOnlyNew} label="Só novos" />

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Notificações globais */}
            <Toggle
              value={notifEnabled}
              onChange={toggleNotif}
              color="#A78BFA"
              label="Alertas globais"
            />
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.07)' }} />
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

        {/* Stats */}
        {visibleSignals.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'Total',    value: visibleSignals.length,   color: '#94A3B8' },
              { label: 'Novos',    value: newCount,                color: '#3DFF8F' },
              { label: 'Lucro ≥0', value: positiveCount,          color: '#3DFF8F' },
              { label: 'ML',       value: visibleSignals.filter(s => s.tipo === 'ML').length,  color: '#38BDF8' },
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

        {/* Dica */}
        {visibleSignals.length > 0 && (
          <p style={{ fontSize: 11, color: '#334155', marginBottom: 12 }}>
            Clique em qualquer card para abrir a calculadora.
          </p>
        )}

        {/* Daemon offline warning */}
        {daemonStale && !error && (
          <div style={{
            padding: '12px 16px', borderRadius: 8, marginBottom: 12,
            background: 'rgba(255,159,10,.08)', border: '1px solid rgba(255,159,10,.25)',
            color: '#FF9F0A', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              <strong>Daemon inativo</strong> — os sinais não são atualizados há mais de 3 minutos.
              Reinicie o processo <code style={{ background: 'rgba(255,255,255,.07)', padding: '1px 6px', borderRadius: 4 }}>process-queue.mjs</code> no servidor.
            </span>
          </div>
        )}

        {/* Erro */}
        {error && (
          <div style={{
            padding: '14px 16px', borderRadius: 8, marginBottom: 16,
            background: 'rgba(255,69,58,.08)', border: '1px solid rgba(255,69,58,.2)',
            color: '#FF6B6B', fontSize: 13,
          }}>
            Erro ao buscar sinais: {error}
          </div>
        )}

        {/* Carregando */}
        {loading && signals.length === 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '60px 0', color: '#475569', fontSize: 14,
          }}>
            <Radio size={18} style={{ animation: 'spin 1.5s linear infinite', color: '#3DFF8F' }} />
            Conectando ao scanner...
          </div>
        )}

        {/* Vazio */}
        {!loading && !error && visibleSignals.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '60px 20px', gap: 12, color: '#334155',
          }}>
            <Radio size={32} strokeWidth={1.5} />
            <div style={{ fontSize: 15, fontWeight: 500, color: '#475569' }}>Nenhum sinal encontrado</div>
            <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 340 }}>
              {paused
                ? 'Scanner pausado. Clique em "Retomar" para iniciar.'
                : deselectedCasas.size > 0
                  ? 'Todos os sinais foram ocultados pelo filtro de casas.'
                  : 'O daemon está buscando sinais. Aguarde ou ajuste os filtros.'}
            </div>
          </div>
        )}

        {/* Grid */}
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
                onOpenInOdds={openInOdds}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
