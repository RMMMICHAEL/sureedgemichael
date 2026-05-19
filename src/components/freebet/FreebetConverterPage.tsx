'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Gift, ChevronRight, ChevronLeft, ExternalLink, X, Loader2, AlertCircle, Search } from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { Leg } from '@/types';

// ── Casas disponíveis ─────────────────────────────────────────────────────────

const BOOKMAKERS = [
  '7games','Alfabet','Apostaganha','Bet365','Bet7k','Betano','Betao',
  'Betesporte','BetfairSB','Betnacional','Betsson','Br4bet','Esportiva',
  'Estrelabet','Jogodeouro','KTO','MCgames','Novibet','Pixbet','Sortenabet',
  'Sportingbet','Sporty','Superbet','Versusbet','Vivasorte',
];

const PA_OPTIONS = [
  { value: 'all',  label: 'Todos'           },
  { value: 'none', label: 'Sem PA'          },
  { value: 'one',  label: 'PA em 1 lado'    },
  { value: 'two',  label: 'PA em 2 lados'   },
];

const QUICK_VALUES = [25, 50, 100, 200, 500];
const QUICK_MIN    = [1.5, 2.0, 2.5, 3.0, 3.5];
const QUICK_MAX    = [5.0, 7.0, 10.0, 15.0, 50.0, 999.99];

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FreebetBet {
  outcome:    string;
  house:      string;
  url?:       string;
  odd:        number;
  stake:      number;
  is_freebet: boolean;
  is_pa:      boolean;
}

interface FreebetResult {
  event_name:        string;
  league:            string;
  event_date?:       string;
  event_url?:        string;
  total_investment:  number;
  conversion_pct:    number;
  profit:            number;
  bets:              FreebetBet[];
}

// ── Utilitários ───────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    });
  } catch { return iso; }
}

/** Normaliza o JSON retornado pelo SuperMonitor em um array de FreebetResult.
 *  Estrutura real da API:
 *  { recommendations: [{ event, freebet, hedges, pa_count, conversion }] }
 *  onde conversion = { conversion_rate, avg_profit, total_hedge_stake, hedge_stakes, ... }
 */
function parseApiResponse(data: unknown): FreebetResult[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;

  // Localiza o array de itens — testa todas as chaves conhecidas
  const arr: unknown[] = Array.isArray(data)            ? data
    : Array.isArray(d.recommendations)  ? d.recommendations as unknown[]
    : Array.isArray(d.results)          ? d.results          as unknown[]
    : Array.isArray(d.data)             ? d.data             as unknown[]
    : Array.isArray(d.events)           ? d.events           as unknown[]
    : [];

  return arr
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const r = item as Record<string, unknown>;

      // ── Estrutura nova: { event, freebet, hedges, conversion } ───────────────
      const ev   = (r.event   as Record<string, unknown> | undefined) ?? {};
      const fb   = (r.freebet as Record<string, unknown> | undefined) ?? {};
      const conv = (r.conversion as Record<string, unknown> | undefined) ?? {};
      const hedgeArr: unknown[] = Array.isArray(r.hedges) ? r.hedges : [];

      // Nomes e metadata do evento
      const home = String(ev.home ?? '');
      const away = String(ev.away ?? '');
      const eventName = home && away
        ? `${home} x ${away}`
        : String(r.event_name ?? r.name ?? home ?? away ?? '');

      const eventUrls = (ev.urls ?? {}) as Record<string, string>;
      const fbHouse   = String(fb.house ?? '');

      // URL do evento — usa a URL da casa freebet ou a primeira disponível
      const eventUrl = eventUrls[fbHouse] ?? Object.values(eventUrls)[0] ?? undefined;

      // ── Apostas ──────────────────────────────────────────────────────────────
      const hedgeStakes: number[] = Array.isArray(conv.hedge_stakes)
        ? (conv.hedge_stakes as unknown[]).map(s => Number(s))
        : [];

      const bets: FreebetBet[] = [];

      // Aposta freebet
      if (fb.house) {
        bets.push({
          outcome:    String(fb.selection ?? fb.outcome ?? ''),
          house:      fbHouse,
          url:        eventUrls[fbHouse] ?? undefined,
          odd:        Number(fb.odd ?? 0),
          stake:      Number(fb.value ?? conv.freebet_value ?? 0),
          is_freebet: true,
          is_pa:      false,
        });
      }

      // Apostas de cobertura (hedges)
      hedgeArr.forEach((h, i) => {
        const hedge = h as Record<string, unknown>;
        bets.push({
          outcome:    String(hedge.selection ?? hedge.outcome ?? ''),
          house:      String(hedge.house ?? ''),
          url:        eventUrls[String(hedge.house ?? '')] ?? undefined,
          odd:        Number(hedge.odd ?? 0),
          stake:      hedgeStakes[i] ?? 0,
          is_freebet: false,
          is_pa:      Boolean(hedge.pa ?? false),
        });
      });

      // Fallback: estrutura legada { bets: [...] }
      if (bets.length === 0 && Array.isArray(r.bets)) {
        for (const b of r.bets as Record<string, unknown>[]) {
          bets.push({
            outcome:    String(b.outcome ?? b.label ?? ''),
            house:      String(b.house   ?? b.bookmaker ?? ''),
            url:        typeof b.url === 'string' ? b.url : undefined,
            odd:        Number(b.odd ?? b.odds ?? 0),
            stake:      Number(b.stake ?? 0),
            is_freebet: Boolean(b.is_freebet ?? b.freebet ?? false),
            is_pa:      Boolean(b.is_pa ?? b.pa ?? false),
          });
        }
      }

      const convRate   = Number(conv.conversion_rate ?? r.conversion_pct ?? 0);
      const avgProfit  = Number(conv.avg_profit      ?? r.profit          ?? 0);
      const totalStake = Number(conv.total_hedge_stake ?? r.total_investment ?? 0);

      return {
        event_name:       eventName,
        league:           String(ev.league ?? r.league ?? r.competition ?? ''),
        event_date:       typeof ev.date        === 'string' ? ev.date
                        : typeof r.event_date   === 'string' ? r.event_date
                        : typeof r.date         === 'string' ? r.date : undefined,
        event_url:        typeof eventUrl === 'string' ? eventUrl : undefined,
        total_investment: totalStake,
        conversion_pct:   convRate,
        profit:           avgProfit,
        bets,
      } as FreebetResult;
    })
    .filter(r => r.event_name && r.bets.length > 0);
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ['Casa', 'Valor', 'Odds', 'Resultados'];

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((label, i) => {
        const idx     = i + 1;
        const done    = step > idx;
        const active  = step === idx;
        const isLast  = i === STEPS.length - 1;
        return (
          <div key={i} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all"
                style={{
                  background: done ? 'var(--g)' : active ? 'rgba(63,255,33,.18)' : 'rgba(255,255,255,.06)',
                  border: `1.5px solid ${done ? 'var(--g)' : active ? 'rgba(63,255,33,.5)' : 'rgba(255,255,255,.1)'}`,
                  color: done ? '#0D1117' : active ? 'var(--g)' : 'var(--t3)',
                }}
              >
                {done ? '✓' : idx}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap hidden sm:block"
                style={{ color: active ? 'var(--g)' : done ? 'rgba(63,255,33,.6)' : 'var(--t3)' }}>
                {label}
              </span>
            </div>
            {!isLast && (
              <div className="flex-1 h-px mx-2 transition-all"
                style={{ background: done ? 'rgba(63,255,33,.4)' : 'rgba(255,255,255,.08)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Casa de aposta ────────────────────────────────────────────────────

function Step1({ selected, onSelect, onNext }: {
  selected: string; onSelect: (h: string) => void; onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-black" style={{ color: 'var(--t)' }}>Em qual casa você tem a Freebet?</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>Selecione a casa onde você recebeu o bônus</p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {BOOKMAKERS.map(h => (
          <button
            key={h}
            type="button"
            onClick={() => onSelect(h)}
            className="rounded-xl px-3 py-3 text-xs font-bold text-center transition-all"
            style={{
              background: selected === h ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.04)',
              border: `1.5px solid ${selected === h ? 'rgba(63,255,33,.45)' : 'rgba(255,255,255,.08)'}`,
              color: selected === h ? 'var(--g)' : 'var(--t3)',
            }}
          >
            {h}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!selected}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all"
          style={{
            background: selected ? 'rgba(63,255,33,.15)' : 'rgba(255,255,255,.04)',
            border: `1px solid ${selected ? 'rgba(63,255,33,.4)' : 'rgba(255,255,255,.08)'}`,
            color: selected ? 'var(--g)' : 'var(--t3)',
            cursor: selected ? 'pointer' : 'not-allowed',
            opacity: selected ? 1 : 0.5,
          }}
        >
          Próximo <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Valor da freebet ──────────────────────────────────────────────────

function Step2({ value, onChange, onBack, onNext }: {
  value: string; onChange: (v: string) => void; onBack: () => void; onNext: () => void;
}) {
  const valid = parseFloat(value) > 0;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-black" style={{ color: 'var(--t)' }}>Qual o valor da sua Freebet?</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>Informe o valor do bônus que você recebeu</p>
      </div>

      <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)' }}>
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--t3)' }}>Valor da Freebet</span>
        <div className="flex items-center rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
          <span className="px-3 py-2.5 text-sm font-black" style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)', borderRight: '1px solid var(--b)' }}>R$</span>
          <input
            type="number"
            min="1"
            step="0.01"
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={e => e.target.select()}
            placeholder="0,00"
            className="flex-1 px-3 py-2.5 text-sm font-bold outline-none"
            style={{ background: 'transparent', color: 'var(--t)', fontFamily: "'JetBrains Mono', monospace" }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_VALUES.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(String(v))}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: value === String(v) ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.05)',
                border: `1px solid ${value === String(v) ? 'rgba(63,255,33,.3)' : 'rgba(255,255,255,.08)'}`,
                color: value === String(v) ? 'var(--g)' : 'var(--t3)',
              }}
            >
              R$ {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t3)', cursor: 'pointer' }}>
          <ChevronLeft size={15} /> Voltar
        </button>
        <button onClick={onNext} disabled={!valid}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all"
          style={{
            background: valid ? 'rgba(63,255,33,.15)' : 'rgba(255,255,255,.04)',
            border: `1px solid ${valid ? 'rgba(63,255,33,.4)' : 'rgba(255,255,255,.08)'}`,
            color: valid ? 'var(--g)' : 'var(--t3)',
            cursor: valid ? 'pointer' : 'not-allowed', opacity: valid ? 1 : 0.5,
          }}>
          Próximo <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Faixa de odds ─────────────────────────────────────────────────────

function Step3({ minOdd, maxOdd, paFilter, onChangeMin, onChangeMax, onChangePa, onBack, onSearch }: {
  minOdd: string; maxOdd: string; paFilter: string;
  onChangeMin: (v: string) => void; onChangeMax: (v: string) => void; onChangePa: (v: string) => void;
  onBack: () => void; onSearch: () => void;
}) {
  const validMin = parseFloat(minOdd) >= 1;
  const validMax = parseFloat(maxOdd) > parseFloat(minOdd);
  const valid = validMin && validMax;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-black" style={{ color: 'var(--t)' }}>Configurar busca</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>Defina a faixa de odds e o filtro de pagamento antecipado</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Odd mínima */}
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)' }}>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--t3)' }}>Odd mínima</span>
          <input
            type="number" step="0.01" min="1" value={minOdd} onChange={e => onChangeMin(e.target.value)}
            onFocus={e => e.target.select()}
            className="rounded-lg px-3 py-2 text-sm font-bold outline-none"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t)', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_MIN.map(v => (
              <button key={v} type="button" onClick={() => onChangeMin(String(v))}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
                style={{
                  background: minOdd === String(v) ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.05)',
                  border: `1px solid ${minOdd === String(v) ? 'rgba(63,255,33,.3)' : 'rgba(255,255,255,.08)'}`,
                  color: minOdd === String(v) ? 'var(--g)' : 'var(--t3)',
                }}>
                {v.toFixed(2)}
              </button>
            ))}
          </div>
        </div>

        {/* Odd máxima */}
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)' }}>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--t3)' }}>Odd máxima</span>
          <input
            type="number" step="0.01" min="1" value={maxOdd} onChange={e => onChangeMax(e.target.value)}
            onFocus={e => e.target.select()}
            className="rounded-lg px-3 py-2 text-sm font-bold outline-none"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t)', fontFamily: "'JetBrains Mono', monospace" }}
          />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_MAX.map(v => (
              <button key={v} type="button" onClick={() => onChangeMax(String(v))}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
                style={{
                  background: maxOdd === String(v) ? 'rgba(77,166,255,.12)' : 'rgba(255,255,255,.05)',
                  border: `1px solid ${maxOdd === String(v) ? 'rgba(77,166,255,.3)' : 'rgba(255,255,255,.08)'}`,
                  color: maxOdd === String(v) ? '#4DA6FF' : 'var(--t3)',
                }}>
                {v === 999.99 ? 'Ilimitado' : v.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PA filter */}
      <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)' }}>
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--t3)' }}>Pagamento Antecipado</span>
        <div className="flex flex-wrap gap-2">
          {PA_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => onChangePa(opt.value)}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all"
              style={{
                background: paFilter === opt.value ? 'rgba(255,159,10,.12)' : 'rgba(255,255,255,.05)',
                border: `1px solid ${paFilter === opt.value ? 'rgba(255,159,10,.4)' : 'rgba(255,255,255,.08)'}`,
                color: paFilter === opt.value ? '#FF9F0A' : 'var(--t3)',
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <button onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t3)', cursor: 'pointer' }}>
          <ChevronLeft size={15} /> Voltar
        </button>
        <button onClick={onSearch} disabled={!valid}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all"
          style={{
            background: valid ? 'linear-gradient(135deg,rgba(63,255,33,.2),rgba(0,187,255,.1))' : 'rgba(255,255,255,.04)',
            border: `1px solid ${valid ? 'rgba(63,255,33,.4)' : 'rgba(255,255,255,.08)'}`,
            color: valid ? 'var(--g)' : 'var(--t3)',
            cursor: valid ? 'pointer' : 'not-allowed', opacity: valid ? 1 : 0.5,
          }}>
          <Search size={14} /> Buscar Conversões
        </button>
      </div>
    </div>
  );
}

// ── Freebet Calc Modal ────────────────────────────────────────────────────────

function FreebetCalcModal({ result, freebetHouse, freebetValue, onClose }: {
  result: FreebetResult;
  freebetHouse: string;
  freebetValue: number;
  onClose: () => void;
}) {
  const addLeg  = useStore(s => s.addLeg);
  const toastFn = useStore(s => s.toast);

  const [showPanel, setShowPanel] = useState(false);
  const [evName,    setEvName]    = useState(result.event_name);
  const [evDate,    setEvDate]    = useState(() => {
    if (!result.event_date) return '';
    try {
      return new Date(result.event_date)
        .toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })
        .slice(0, 16)
        .replace(' ', 'T');
    } catch { return ''; }
  });

  // Recalcula stakes proporcionalmente se o usuário mudou o valor
  const scale = useMemo(() => {
    const origFreebet = result.bets.find(b => b.is_freebet);
    if (!origFreebet || !origFreebet.stake || origFreebet.stake <= 0) return 1;
    return freebetValue / origFreebet.stake;
  }, [result, freebetValue]);

  const scaledBets = useMemo(() =>
    result.bets.map(b => ({ ...b, stake: b.stake * scale })),
    [result.bets, scale]
  );

  const totalInvestment = scaledBets.filter(b => !b.is_freebet).reduce((s, b) => s + b.stake, 0);
  const profit          = result.profit * scale;
  const convPct         = result.conversion_pct; // % não muda com escala

  function sendToPanel() {
    if (!evName.trim()) { toastFn('Informe o nome do evento', 'wrn'); return; }
    const oid = `op_fb_${Date.now()}`;
    scaledBets.forEach((b, i) => {
      if (b.stake <= 0) return;
      const leg: Leg = {
        id:     `l_fb_${Date.now()}_${i}`,
        oid,
        bd:     evDate || new Date().toISOString().slice(0, 16).replace('T', 'T'),
        ed:     evDate || new Date().toISOString().slice(0, 16).replace('T', 'T'),
        sp:     'Futebol',
        ev:     evName.trim(),
        ho:     b.house,
        mk:     b.outcome,
        od:     b.odd,
        st:     +b.stake.toFixed(2),
        re:     'Pendente',
        pc:     0,
        pr:     0,
        fl:     [],
        source: 'manual',
        signal: 'pre',
        opType: 'outros',
      };
      addLeg(leg);
    });
    toastFn('Freebet adicionada ao painel!', 'ok');
    onClose();
  }

  const modal = (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
        backdropFilter: 'blur(8px)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#0F1623', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 18, width: '100%', maxWidth: 520,
          maxHeight: '90vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 0,
          boxShadow: '0 24px 80px rgba(0,0,0,.7)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Gift size={14} style={{ color: '#3DFF8F', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: '#3DFF8F', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Conversão de Freebet
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#E2E8F0', lineHeight: 1.3 }}>
              {result.event_name}
            </div>
            {result.league && (
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
                {result.league}{result.event_date ? ` · ${fmtDate(result.event_date)}` : ''}
              </div>
            )}
          </div>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,.07)', border: 'none', borderRadius: 8,
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#94A3B8', cursor: 'pointer', flexShrink: 0, fontSize: 16 }}>
            <X size={14} />
          </button>
        </div>

        {/* Legs */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {scaledBets.map((b, i) => (
            <div key={i} style={{
              borderRadius: 10, padding: '10px 14px',
              background: b.is_freebet ? 'rgba(63,255,33,.06)' : 'rgba(255,255,255,.03)',
              border: `1px solid ${b.is_freebet ? 'rgba(63,255,33,.2)' : 'rgba(255,255,255,.07)'}`,
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {b.is_freebet && (
                    <span style={{ fontSize: 10, fontWeight: 900, color: '#3DFF8F',
                      background: 'rgba(63,255,33,.12)', border: '1px solid rgba(63,255,33,.25)',
                      borderRadius: 4, padding: '1px 6px' }}>🎁 FREEBET</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {b.outcome}
                  </span>
                  {b.is_pa && (
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#FF9F0A',
                      background: 'rgba(255,159,10,.1)', border: '1px solid rgba(255,159,10,.2)',
                      borderRadius: 4, padding: '1px 5px' }}>PA</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {b.url ? (
                    <a href={b.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 13, fontWeight: 800, color: '#818CF8',
                        textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {b.house} <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#E2E8F0' }}>{b.house}</span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>·</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: b.is_freebet ? '#3DFF8F' : '#E2E8F0',
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    {b.odd.toFixed(2)}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: b.is_freebet ? '#3DFF8F' : '#E2E8F0',
                  fontFamily: "'JetBrains Mono', monospace" }}>
                  R$ {fmtBRL(b.stake)}
                </div>
                {b.is_freebet && (
                  <div style={{ fontSize: 10, color: '#3DFF8F', opacity: 0.7 }}>grátis</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{
          margin: '0 20px 16px', borderRadius: 12, padding: '14px 16px',
          background: 'rgba(63,255,33,.05)', border: '1px solid rgba(63,255,33,.15)',
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Investimento</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#E2E8F0', fontFamily: "'JetBrains Mono', monospace" }}>
              R$ {fmtBRL(totalInvestment)}
            </div>
          </div>
          <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,.07)', borderRight: '1px solid rgba(255,255,255,.07)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Conversão</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#3DFF8F', fontFamily: "'JetBrains Mono', monospace" }}>
              {convPct.toFixed(2)}%
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Lucro</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#3DFF8F', fontFamily: "'JetBrains Mono', monospace" }}>
              R$ {fmtBRL(profit)}
            </div>
          </div>
        </div>

        {/* Add to panel form */}
        {showPanel ? (
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Adicionar ao Painel
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Evento</label>
              <input
                value={evName}
                onChange={e => setEvName(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#E2E8F0', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Data / Hora</label>
              <input
                type="datetime-local"
                value={evDate}
                onChange={e => setEvDate(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#E2E8F0', outline: 'none', colorScheme: 'dark' }}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowPanel(false)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)',
                  background: 'transparent', color: '#94A3B8', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={sendToPanel}
                style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg,#3DFF8F,#00BBFF)',
                  color: '#0D1117', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
                Confirmar e Adicionar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)',
                background: 'transparent', color: '#94A3B8', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Fechar
            </button>
            <button onClick={() => setShowPanel(true)}
              style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,rgba(63,255,33,.85),rgba(0,187,255,.7))',
                color: '#0D1117', fontWeight: 900, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Gift size={14} /> Enviar ao Painel
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ result, freebetHouse, freebetValue, onOpen }: {
  result: FreebetResult;
  freebetHouse: string;
  freebetValue: number;
  onOpen: () => void;
}) {
  const scale = useMemo(() => {
    const origFreebet = result.bets.find(b => b.is_freebet);
    if (!origFreebet || !origFreebet.stake || origFreebet.stake <= 0) return 1;
    return freebetValue / origFreebet.stake;
  }, [result, freebetValue]);

  const investment = result.bets.filter(b => !b.is_freebet).reduce((s, b) => s + b.stake * scale, 0);
  const profit     = result.profit * scale;
  const hasBothPA  = result.bets.filter(b => b.is_pa).length >= 2;
  const hasOnePA   = result.bets.some(b => b.is_pa);

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{ border: '1px solid rgba(255,255,255,.07)', background: 'var(--bg2)' }}
    >
      {/* Card header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: 'var(--t3)' }}>{result.league}</span>
              {result.event_date && (
                <span className="text-[10px]" style={{ color: 'var(--t3)', opacity: 0.6 }}>· {fmtDate(result.event_date)}</span>
              )}
              {hasBothPA && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,159,10,.12)', color: '#FF9F0A', border: '1px solid rgba(255,159,10,.2)' }}>PA ×2</span>
              )}
              {!hasBothPA && hasOnePA && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,159,10,.08)', color: '#FF9F0A', border: '1px solid rgba(255,159,10,.15)' }}>PA ×1</span>
              )}
            </div>
            {result.event_url ? (
              <a href={result.event_url} target="_blank" rel="noopener noreferrer"
                className="text-sm font-black flex items-center gap-1.5 hover:underline"
                style={{ color: 'var(--t)' }}>
                {result.event_name} <ExternalLink size={11} style={{ opacity: 0.5 }} />
              </a>
            ) : (
              <div className="text-sm font-black" style={{ color: 'var(--t)' }}>{result.event_name}</div>
            )}
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] font-bold" style={{ color: 'var(--t3)' }}>Investir</div>
            <div className="text-sm font-black" style={{ color: 'var(--t)', fontFamily: "'JetBrains Mono', monospace" }}>
              R$ {fmtBRL(investment)}
            </div>
          </div>
        </div>
      </div>

      {/* Bets */}
      <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {result.bets.map((b, i) => (
          <div key={i} className="flex items-center justify-between gap-3"
            style={{ padding: '7px 10px', borderRadius: 8,
              background: b.is_freebet ? 'rgba(63,255,33,.05)' : 'rgba(255,255,255,.02)',
              border: `1px solid ${b.is_freebet ? 'rgba(63,255,33,.15)' : 'rgba(255,255,255,.05)'}`,
            }}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {b.is_freebet && <Gift size={11} style={{ color: '#3DFF8F', flexShrink: 0 }} />}
              <span className="text-[11px] font-black" style={{ color: b.is_freebet ? '#3DFF8F' : '#94A3B8' }}>
                {b.outcome}
              </span>
              {b.is_pa && (
                <span className="text-[9px] font-black px-1 py-0.5 rounded"
                  style={{ background: 'rgba(255,159,10,.08)', color: '#FF9F0A', border: '1px solid rgba(255,159,10,.15)', flexShrink: 0 }}>PA</span>
              )}
              {b.url ? (
                <a href={b.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-bold truncate flex items-center gap-1"
                  style={{ color: '#818CF8' }}>
                  {b.house} <ExternalLink size={9} style={{ flexShrink: 0 }} />
                </a>
              ) : (
                <span className="text-xs font-bold truncate" style={{ color: 'var(--t)' }}>{b.house}</span>
              )}
              <span className="text-xs font-black shrink-0" style={{ color: b.is_freebet ? '#3DFF8F' : 'var(--t)',
                fontFamily: "'JetBrains Mono', monospace" }}>
                {b.odd.toFixed(2)}
              </span>
            </div>
            <div className="text-xs font-black shrink-0" style={{ color: 'var(--t)',
              fontFamily: "'JetBrains Mono', monospace" }}>
              R$ {fmtBRL(b.stake * scale)}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(255,255,255,.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Conversão</div>
            <div className="text-sm font-black" style={{ color: '#3DFF8F', fontFamily: "'JetBrains Mono', monospace" }}>
              {result.conversion_pct.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Lucro</div>
            <div className="text-sm font-black" style={{ color: '#3DFF8F', fontFamily: "'JetBrains Mono', monospace" }}>
              R$ {fmtBRL(profit)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all"
          style={{
            background: 'rgba(63,255,33,.1)',
            border: '1px solid rgba(63,255,33,.25)',
            color: 'var(--g)',
            cursor: 'pointer',
          }}
        >
          <Gift size={12} /> Preencher calculadora
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function FreebetConverterPage() {
  const [step,         setStep]         = useState(1);
  const [house,        setHouse]        = useState('');
  const [value,        setValue]        = useState('');
  const [minOdd,       setMinOdd]       = useState('1.50');
  const [maxOdd,       setMaxOdd]       = useState('10.00');
  const [paFilter,     setPaFilter]     = useState('all');
  const [results,      setResults]      = useState<FreebetResult[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [modalResult,  setModalResult]  = useState<FreebetResult | null>(null);

  async function search() {
    setLoading(true);
    setError('');
    setResults([]);
    setStep(4);

    try {
      // 1. Enfileira a requisição no daemon local via Supabase
      const postRes  = await fetch('/api/supermonitor/freebet', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          bookmaker: house,
          value:     parseFloat(value),
          min_odd:   parseFloat(minOdd),
          max_odd:   parseFloat(maxOdd),
          pa_filter: paFilter,
        }),
      });
      const postJson = await postRes.json() as { ok: boolean; request_id?: string; error?: string };
      if (!postJson.ok) throw new Error(postJson.error ?? 'Erro ao enfileirar requisição');

      const requestId = postJson.request_id!;

      // 2. Polling até o daemon processar (max 3 min, intervalo 3s)
      const deadline = Date.now() + 3 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000));

        const pollRes  = await fetch(`/api/supermonitor/freebet?request_id=${requestId}`);
        const pollJson = await pollRes.json() as {
          ok: boolean; status?: string; data?: unknown; error_msg?: string; error?: string;
        };

        if (!pollJson.ok) throw new Error(pollJson.error ?? 'Erro ao verificar resultado');

        if (pollJson.status === 'done') {
          const parsed = parseApiResponse(pollJson.data);
          if (parsed.length === 0) {
            setError('Nenhuma conversão encontrada. Tente ajustar a faixa de odds ou o filtro de PA.');
          } else {
            setResults(parsed);
          }
          return;
        }

        if (pollJson.status === 'error') {
          throw new Error(pollJson.error_msg ?? 'Daemon retornou erro ao processar');
        }

        if (pollJson.status === 'timeout') {
          throw new Error('Daemon não respondeu. Verifique se o process-queue.mjs está rodando.');
        }
      }

      throw new Error('Tempo esgotado. Verifique se o daemon está ativo e tente novamente.');
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  const freebetValue = parseFloat(value) || 100;

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--t)' }}>
          Converter Freebet
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
          Extraia o valor de freebets cobrindo outras casas. Lucro garantido independente do resultado.
        </p>
      </div>

      {/* Card container */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <StepBar step={step} />

        {step === 1 && (
          <Step1 selected={house} onSelect={setHouse} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <Step2 value={value} onChange={setValue} onBack={() => setStep(1)} onNext={() => setStep(3)} />
        )}
        {step === 3 && (
          <Step3
            minOdd={minOdd} maxOdd={maxOdd} paFilter={paFilter}
            onChangeMin={setMinOdd} onChangeMax={setMaxOdd} onChangePa={setPaFilter}
            onBack={() => setStep(2)} onSearch={search}
          />
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            {/* Back button */}
            <button
              onClick={() => { setStep(3); setResults([]); setError(''); setLoading(false); }}
              className="flex items-center gap-2 text-xs font-bold self-start px-3 py-1.5 rounded-lg"
              style={{ color: 'var(--t3)', background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', cursor: 'pointer' }}
            >
              <ChevronLeft size={13} /> Nova busca
            </button>

            {/* Context badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-3 py-1 rounded-lg font-bold"
                style={{ background: 'rgba(63,255,33,.08)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.15)' }}>
                🎁 {house}
              </span>
              <span className="text-xs px-3 py-1 rounded-lg font-bold"
                style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
                R$ {fmtBRL(freebetValue)}
              </span>
              <span className="text-xs px-3 py-1 rounded-lg font-bold"
                style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
                Odds {minOdd} – {parseFloat(maxOdd) >= 999 ? '∞' : maxOdd}
              </span>
              <span className="text-xs px-3 py-1 rounded-lg font-bold"
                style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
                {PA_OPTIONS.find(p => p.value === paFilter)?.label ?? 'Todos'}
              </span>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center gap-3 py-16">
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--g)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--t3)' }}>
                  Buscando melhores conversões...
                </span>
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="flex items-start gap-3 rounded-xl p-4"
                style={{ background: 'rgba(255,77,109,.06)', border: '1px solid rgba(255,77,109,.2)' }}>
                <AlertCircle size={15} style={{ color: 'var(--r)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div className="text-sm font-bold" style={{ color: 'var(--r)' }}>Erro na busca</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>{error}</div>
                </div>
              </div>
            )}

            {/* Results */}
            {!loading && results.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
                    {results.length} conversões encontradas
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-bold"
                    style={{ background: 'rgba(63,255,33,.08)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.15)' }}>
                    Ordenado por % conversão
                  </span>
                </div>
                {results.map((r, i) => (
                  <ResultCard
                    key={i}
                    result={r}
                    freebetHouse={house}
                    freebetValue={freebetValue}
                    onOpen={() => setModalResult(r)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Calculator modal */}
      {modalResult && (
        <FreebetCalcModal
          result={modalResult}
          freebetHouse={house}
          freebetValue={freebetValue}
          onClose={() => setModalResult(null)}
        />
      )}
    </div>
  );
}
