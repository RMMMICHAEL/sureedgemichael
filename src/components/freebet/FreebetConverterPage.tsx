'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Gift, ChevronRight, ChevronLeft, ExternalLink, X,
  Loader2, AlertCircle, Search, Filter, Trophy, SlidersHorizontal,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { Leg } from '@/types';

// ── Casas disponíveis (step 1) ────────────────────────────────────────────────

const BOOKMAKERS = [
  '7Games','Alfabet','Apostabet','Apostaganha','Bet365','Bet365Arg','Bet365Pe',
  'Bet7k','Betano','Betao','Betbra','Betesporte','BetfairSB','BetMGM',
  'Betnacional','Betsson','Betsul','BR4Bet','Esportivabet','Esportedasorte',
  'Estrelabet','JogoDeOuro','KTO','MCGames','Meridianbet','MMABET',
  'NoviBet','Novibet','Pixbet','Sortenabet','Sportingbet','Sporty',
  'Superbet','Tradeball','Vaidebet','Versusbet','Vivasorte',
];

const PA_OPTIONS = [
  { value: 'all',  label: 'Todos'        },
  { value: 'none', label: 'Sem PA'       },
  { value: 'one',  label: 'PA em 1 lado' },
  { value: 'two',  label: 'PA em 2 lados'},
];

const QUICK_VALUES = [25, 50, 100, 200, 500];
const QUICK_MIN    = [1.5, 2.0, 2.5, 3.0, 3.5];
const QUICK_MAX    = [5.0, 7.0, 10.0, 15.0, 50.0, 999.99];

// ── Dados para filtros de campeonato ─────────────────────────────────────────

const LEAGUES_BY_REGION: Record<string, string[]> = {
  'Europa': [
    'Alemanha - Bundesliga 2','Alemanha - Bundesliga','Alemanha - DFB-Pokal',
    'Áustria - Bundesliga','Bélgica - Copa','Bélgica - Pro League',
    'Dinamarca - Superliga','Escócia - Premiership','Espanha - Copa do Rei',
    'Espanha - LaLiga','Espanha - LaLiga 2','França - Copa da França',
    'França - Ligue 1','França - Ligue 2','Holanda - Eredivisie',
    'Inglaterra - EFL Cup','Inglaterra - Championship','Inglaterra - FA Cup',
    'Inglaterra - League One','Inglaterra - League Two','Inglaterra - Premier League',
    'Itália - Coppa Italia','Itália - Serie A','Itália - Serie B',
    'Noruega - Eliteserien','Portugal - Primeira Liga','Portugal - Taça de Portugal',
    'Suécia - Allsvenskan','Suíça - Super League','Turquia - Süper Lig',
    'UEFA - Champions League','UEFA - Conference League','UEFA - Europa League',
    'Europa - Eliminatórias da Copa',
  ],
  'América do Sul': [
    'Argentina - Superliga','Argentina - Copa Argentina','Bolívia - División Profesional',
    'Brasil - Copa do Brasil','Brasil - Serie A','Brasil - Serie B',
    'Equador - Liga Pro Serie A','Sul-Americana','Libertadores',
    'Colômbia - Categoría Primera A','Colômbia - Primera A','Peru - Liga 1',
  ],
  'América do Norte': [
    'Estados Unidos - MLS','México - Liga de Expansion','México - Liga MX',
  ],
  'Ásia': [
    'Arábia Saudita - Saudi Pro League','China - Super League','Japão - J1 League',
  ],
  'Oceania': ['Austrália - A-League'],
  'Mundial': ['FIFA - Copa do Mundo','FIFA - Qualificação Copa','CONMEBOL UEFA - Copa'],
  'Resto do mundo': ['__RESTO_MUNDO__'],
};

const ALL_LEAGUES_FLAT = Object.values(LEAGUES_BY_REGION).flat();
const KNOWN_LEAGUES    = new Set(ALL_LEAGUES_FLAT.filter(l => l !== '__RESTO_MUNDO__'));

// ── Dados para filtros de casa ────────────────────────────────────────────────

const HOUSES_DEFAULT = [
  '7Games','Alfabet','Apostabet','Apostaganha','Betao','Betbra','BetfairSB',
  'BetMGM','Betnacional','Betesporte','Betsson','Bet365','Bet7k','Betano',
  'BR4Bet','Esportivabet','Esportedasorte','Estrelabet','JogoDeOuro','KTO',
  'MCGames','Meridianbet','MMABET','NoviBet','Pixbet','Sortenabet',
  'Sportingbet','Sporty','Superbet','Tradeball','Vaidebet','Versusbet','Vivasorte',
];

const HOUSES_SO = [
  'BetMGMSO','BetanoSO','EstrelabetSO','StakeSO','NovibetSO',
  'BR4BetSO','EsportivaSO','BetssonSO','VersusbetSO','MCGamesSO',
];

const ALL_HOUSES_FLAT = [...new Set([...HOUSES_DEFAULT, ...HOUSES_SO])];

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
  event_name:       string;
  league:           string;
  event_date?:      string;
  event_url?:       string;
  total_investment: number;
  conversion_pct:   number;
  profit:           number;
  bets:             FreebetBet[];
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

/** Normaliza outcome do inglês/abreviado para PT-BR. */
function normalizeOutcome(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s === 'home' || s === '1' || s === 'casa') return 'Casa';
  if (s === 'draw' || s === 'x' || s === 'empate') return 'Empate';
  if (s === 'away' || s === '2' || s === 'fora') return 'Fora';
  return raw;
}
const OUTCOME_ORDER = ['Casa', 'Empate', 'Fora'];

/** Normaliza o JSON retornado pelo SuperMonitor em um array de FreebetResult. */
function parseApiResponse(data: unknown): FreebetResult[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;

  const arr: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(d.recommendations) ? d.recommendations as unknown[]
    : Array.isArray(d.results)         ? d.results          as unknown[]
    : Array.isArray(d.data)            ? d.data             as unknown[]
    : Array.isArray(d.events)          ? d.events           as unknown[]
    : [];

  return arr
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const r = item as Record<string, unknown>;
      const ev   = (r.event      as Record<string, unknown> | undefined) ?? {};
      const fb   = (r.freebet    as Record<string, unknown> | undefined) ?? {};
      const conv = (r.conversion as Record<string, unknown> | undefined) ?? {};
      const hedgeArr: unknown[] = Array.isArray(r.hedges) ? r.hedges : [];

      const home      = String(ev.home ?? '');
      const away      = String(ev.away ?? '');
      const eventName = home && away
        ? `${home} x ${away}`
        : String(r.event_name ?? r.name ?? home ?? away ?? '');

      const eventUrls = (ev.urls ?? {}) as Record<string, string>;
      const fbHouse   = String(fb.house ?? '');
      const eventUrl  = eventUrls[fbHouse] ?? Object.values(eventUrls)[0] ?? undefined;

      const hedgeStakes: number[] = Array.isArray(conv.hedge_stakes)
        ? (conv.hedge_stakes as unknown[]).map(s => Number(s))
        : [];

      const bets: FreebetBet[] = [];

      if (fb.house) {
        bets.push({
          outcome:    normalizeOutcome(String(fb.selection ?? fb.outcome ?? '')),
          house:      fbHouse,
          url:        eventUrls[fbHouse] ?? undefined,
          odd:        Number(fb.odd ?? 0),
          stake:      Number(fb.value ?? conv.freebet_value ?? 0),
          is_freebet: true,
          is_pa:      false,
        });
      }

      hedgeArr.forEach((h, i) => {
        const hedge = h as Record<string, unknown>;
        bets.push({
          outcome:    normalizeOutcome(String(hedge.selection ?? hedge.outcome ?? '')),
          house:      String(hedge.house ?? ''),
          url:        eventUrls[String(hedge.house ?? '')] ?? undefined,
          odd:        Number(hedge.odd ?? 0),
          stake:      hedgeStakes[i] ?? 0,
          is_freebet: false,
          is_pa:      Boolean(hedge.pa ?? false),
        });
      });

      if (bets.length === 0 && Array.isArray(r.bets)) {
        for (const b of r.bets as Record<string, unknown>[]) {
          bets.push({
            outcome:    normalizeOutcome(String(b.outcome ?? b.label ?? '')),
            house:      String(b.house   ?? b.bookmaker ?? ''),
            url:        typeof b.url === 'string' ? b.url : undefined,
            odd:        Number(b.odd ?? b.odds ?? 0),
            stake:      Number(b.stake ?? 0),
            is_freebet: Boolean(b.is_freebet ?? b.freebet ?? false),
            is_pa:      Boolean(b.is_pa ?? b.pa ?? false),
          });
        }
      }

      // Ordenar apostas: Casa → Empate → Fora
      bets.sort((a, b) => {
        const ia = OUTCOME_ORDER.indexOf(a.outcome);
        const ib = OUTCOME_ORDER.indexOf(b.outcome);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

      const convRate   = Number(conv.conversion_rate ?? r.conversion_pct ?? 0);
      const avgProfit  = Number(conv.avg_profit      ?? r.profit          ?? 0);
      const totalStake = Number(conv.total_hedge_stake ?? r.total_investment ?? 0);

      return {
        event_name:       eventName,
        league:           String(ev.league ?? r.league ?? r.competition ?? ''),
        event_date:       typeof ev.date      === 'string' ? ev.date
                        : typeof r.event_date === 'string' ? r.event_date
                        : typeof r.date       === 'string' ? r.date : undefined,
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
        const idx    = i + 1;
        const done   = step > idx;
        const active = step === idx;
        const isLast = i === STEPS.length - 1;
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
              <span
                className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap hidden sm:block"
                style={{ color: active ? 'var(--g)' : done ? 'rgba(63,255,33,.6)' : 'var(--t3)' }}
              >
                {label}
              </span>
            </div>
            {!isLast && (
              <div
                className="flex-1 h-px mx-2 transition-all"
                style={{ background: done ? 'rgba(63,255,33,.4)' : 'rgba(255,255,255,.08)' }}
              />
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
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {BOOKMAKERS.map(h => (
          <button
            key={h} type="button" onClick={() => onSelect(h)}
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
          type="button" onClick={onNext} disabled={!selected}
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
          <span className="px-3 py-2.5 text-sm font-black"
            style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)', borderRight: '1px solid var(--b)' }}>R$</span>
          <input
            type="number" min="1" step="0.01" value={value}
            onChange={e => onChange(e.target.value)} onFocus={e => e.target.select()}
            placeholder="0,00"
            className="flex-1 px-3 py-2.5 text-sm font-bold outline-none"
            style={{ background: 'transparent', color: 'var(--t)', fontFamily: "'JetBrains Mono', monospace" }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_VALUES.map(v => (
            <button key={v} type="button" onClick={() => onChange(String(v))}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: value === String(v) ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.05)',
                border: `1px solid ${value === String(v) ? 'rgba(63,255,33,.3)' : 'rgba(255,255,255,.08)'}`,
                color: value === String(v) ? 'var(--g)' : 'var(--t3)',
              }}>
              R$ {v}
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
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)' }}>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--t3)' }}>Odd mínima</span>
          <input type="number" step="0.01" min="1" value={minOdd} onChange={e => onChangeMin(e.target.value)}
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
                }}>{v.toFixed(2)}</button>
            ))}
          </div>
        </div>
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)' }}>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--t3)' }}>Odd máxima</span>
          <input type="number" step="0.01" min="1" value={maxOdd} onChange={e => onChangeMax(e.target.value)}
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
                }}>{v === 999.99 ? 'Ilimitado' : v.toFixed(2)}</button>
            ))}
          </div>
        </div>
      </div>
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
              }}>{opt.label}</button>
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
// Fórmula ótima de equilíbrio de lucro:
//   - Freebet (stake = F, odd = o_fb): stake fixo = F
//   - Cada aposta de cobertura k (odd = o_k): stake_k = F * (o_fb - 1) / o_k
//   - Lucro garantido P = F * (o_fb - 1) * (1 - Σ 1/o_k)
// Isso garante lucro igual em qualquer resultado (Casa, Empate, Fora).

function FreebetCalcModal({ result, freebetHouse, freebetValue, onClose }: {
  result: FreebetResult; freebetHouse: string; freebetValue: number; onClose: () => void;
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
        .slice(0, 16).replace(' ', 'T');
    } catch { return ''; }
  });

  // Editable odds — initialized from the result (scaled to freebetValue)
  const [editOdds, setEditOdds] = useState<string[]>(() =>
    result.bets.map(b => b.odd.toFixed(2))
  );

  function setOdd(idx: number, val: string) {
    setEditOdds(prev => prev.map((o, i) => (i === idx ? val : o)));
  }

  // Recalculate stakes live using the optimal equalization formula
  const calcBets = useMemo(() => {
    const fbIdx = result.bets.findIndex(b => b.is_freebet);
    const fbOdd = fbIdx >= 0 ? (parseFloat(editOdds[fbIdx]) || 1) : 1;
    const fbNet = freebetValue * (fbOdd - 1); // net freebet win if freebet hits

    return result.bets.map((b, i) => {
      const odd = parseFloat(editOdds[i]) || b.odd;
      const stake = b.is_freebet
        ? freebetValue                           // freebet stake is always fixed
        : (odd > 1 ? fbNet / odd : 0);          // S_k = F*(o_fb-1)/o_k
      return { ...b, odd, stake };
    });
  }, [result.bets, editOdds, freebetValue]);

  const fbOdd           = parseFloat(editOdds[result.bets.findIndex(b => b.is_freebet)] ?? '1') || 1;
  const fbNet           = freebetValue * (fbOdd - 1);
  const coverSum        = calcBets.filter(b => !b.is_freebet).reduce((s, b) => s + b.stake, 0);
  const totalInvestment = coverSum;
  const profit          = fbNet - coverSum;
  const convPct         = freebetValue > 0 ? (profit / freebetValue) * 100 : 0;

  function sendToPanel() {
    if (!evName.trim()) { toastFn('Informe o nome do evento', 'wrn'); return; }
    const oid = `op_fb_${Date.now()}`;
    calcBets.forEach((b, i) => {
      if (b.stake <= 0) return;
      const leg: Leg = {
        id: `l_fb_${Date.now()}_${i}`, oid,
        bd: evDate || new Date().toISOString().slice(0, 16).replace('T', 'T'),
        ed: evDate || new Date().toISOString().slice(0, 16).replace('T', 'T'),
        sp: 'Futebol', ev: evName.trim(), ho: b.house, mk: b.outcome,
        od: b.odd, st: +b.stake.toFixed(2), re: 'Pendente',
        pc: 0, pr: 0, fl: [], source: 'manual', signal: 'pre', opType: 'freebet',
      };
      addLeg(leg);
    });
    toastFn('Freebet adicionada ao painel!', 'ok');
    onClose();
  }

  const INPUT_STYLE = {
    background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 7, padding: '5px 8px', fontSize: 13, fontWeight: 800,
    color: '#E2E8F0', outline: 'none', width: 72, textAlign: 'right' as const,
    fontFamily: "'JetBrains Mono', monospace",
  };

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
        backdropFilter: 'blur(8px)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 18, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,.7)' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,.07)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Gift size={14} style={{ color: '#3DFF8F', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: '#3DFF8F',
                textTransform: 'uppercase', letterSpacing: '0.08em' }}>Calculadora de Freebet</span>
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
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.07)', border: 'none',
            borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#94A3B8', cursor: 'pointer', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        {/* Hint */}
        <div style={{ margin: '12px 20px 0', padding: '8px 12px', borderRadius: 8,
          background: 'rgba(168,85,247,.06)', border: '1px solid rgba(168,85,247,.2)',
          fontSize: 11, color: '#C084FC', lineHeight: 1.5 }}>
          Ajuste as odds se necessário — as stakes são recalculadas automaticamente.
        </div>

        {/* Bet rows com odd editável */}
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Column labels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px 90px',
            gap: 8, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,.05)' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#475569',
              textTransform: 'uppercase', letterSpacing: '0.08em' }}>Casa / Resultado</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#475569',
              textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Odd</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#475569',
              textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Apostar</span>
          </div>

          {calcBets.map((b, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 76px 90px',
              gap: 8, alignItems: 'center', borderRadius: 10, padding: '10px 12px',
              background: b.is_freebet ? 'rgba(63,255,33,.06)' : 'rgba(255,255,255,.03)',
              border: `1px solid ${b.is_freebet ? 'rgba(63,255,33,.2)' : 'rgba(255,255,255,.07)'}` }}>

              {/* Casa + Resultado */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  {b.is_freebet && (
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#3DFF8F',
                      background: 'rgba(63,255,33,.12)', border: '1px solid rgba(63,255,33,.25)',
                      borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>🎁 FB</span>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8',
                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>{b.outcome}</span>
                  {b.is_pa && (
                    <span style={{ fontSize: 8, fontWeight: 900, color: '#FF9F0A',
                      background: 'rgba(255,159,10,.08)', border: '1px solid rgba(255,159,10,.15)',
                      borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>PA</span>
                  )}
                </div>
                {b.url ? (
                  <a href={b.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, fontWeight: 800, color: '#818CF8',
                      textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                    {b.house} <ExternalLink size={9} />
                  </a>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#E2E8F0' }}>{b.house}</span>
                )}
              </div>

              {/* Odd editável */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <input
                  type="number" min="1.01" step="0.01"
                  value={editOdds[i]}
                  onChange={e => setOdd(i, e.target.value)}
                  onFocus={e => e.target.select()}
                  style={{
                    ...INPUT_STYLE,
                    color: b.is_freebet ? '#3DFF8F' : '#E2E8F0',
                    border: `1px solid ${b.is_freebet ? 'rgba(63,255,33,.3)' : 'rgba(255,255,255,.12)'}`,
                  }}
                />
              </div>

              {/* Stake recalculada */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 900,
                  color: b.is_freebet ? '#3DFF8F' : '#E2E8F0',
                  fontFamily: "'JetBrains Mono', monospace" }}>
                  R$&nbsp;{fmtBRL(b.stake)}
                </div>
                {b.is_freebet && (
                  <div style={{ fontSize: 9, color: '#3DFF8F', opacity: 0.7 }}>grátis</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div style={{ margin: '0 20px 16px', borderRadius: 12, padding: '14px 16px',
          background: profit >= 0 ? 'rgba(63,255,33,.05)' : 'rgba(255,80,80,.05)',
          border: `1px solid ${profit >= 0 ? 'rgba(63,255,33,.15)' : 'rgba(255,80,80,.15)'}`,
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { label: 'Investimento', val: `R$ ${fmtBRL(totalInvestment)}`,   color: '#E2E8F0' },
            { label: 'Conversão',    val: `${convPct.toFixed(2)}%`,           color: convPct >= 0 ? '#3DFF8F' : '#FF5050' },
            { label: 'Lucro',        val: `R$ ${fmtBRL(profit)}`,            color: profit  >= 0 ? '#3DFF8F' : '#FF5050' },
          ].map((m, mi) => (
            <div key={mi} style={{ textAlign: 'center',
              borderLeft: mi > 0 ? '1px solid rgba(255,255,255,.07)' : 'none' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: m.color,
                fontFamily: "'JetBrains Mono', monospace" }}>{m.val}</div>
            </div>
          ))}
        </div>

        {/* Panel form or action buttons */}
        {showPanel ? (
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#94A3B8',
              textTransform: 'uppercase', letterSpacing: '0.08em' }}>Adicionar ao Painel</div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#64748B', display: 'block',
                marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Evento</label>
              <input value={evName} onChange={e => setEvName(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
                  padding: '8px 12px', fontSize: 13, color: '#E2E8F0', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#64748B', display: 'block',
                marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Data / Hora</label>
              <input type="datetime-local" value={evDate} onChange={e => setEvDate(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
                  padding: '8px 12px', fontSize: 13, color: '#E2E8F0', outline: 'none', colorScheme: 'dark' }} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowPanel(false)}
                style={{ flex: 1, padding: '10px', borderRadius: 10,
                  border: '1px solid rgba(255,255,255,.1)', background: 'transparent',
                  color: '#94A3B8', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={sendToPanel}
                style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg,#3DFF8F,#00BBFF)',
                  color: '#0D1117', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
                Confirmar e Adicionar</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '10px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,.1)', background: 'transparent',
                color: '#94A3B8', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Fechar</button>
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

function ResultCard({ result, freebetValue, onOpen }: {
  result: FreebetResult; freebetValue: number; onOpen: () => void;
}) {
  const scale = useMemo(() => {
    const orig = result.bets.find(b => b.is_freebet);
    if (!orig || !orig.stake || orig.stake <= 0) return 1;
    return freebetValue / orig.stake;
  }, [result, freebetValue]);

  const investment = result.bets.filter(b => !b.is_freebet).reduce((s, b) => s + b.stake * scale, 0);
  const profit     = result.profit * scale;
  const paCount    = result.bets.filter(b => b.is_pa).length;

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col transition-all hover:translate-y-[-1px]"
      style={{ border: '1px solid rgba(255,255,255,.08)', background: 'var(--bg2)',
        boxShadow: '0 2px 12px rgba(0,0,0,.3)' }}>

      {/* Header: invest + date */}
      <div style={{ padding: '13px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,.05)',
        background: 'rgba(255,255,255,.02)' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* League + date row */}
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {result.league && (
                <div className="flex items-center gap-1">
                  <Trophy size={9} style={{ color: 'var(--t3)', opacity: 0.6 }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider truncate"
                    style={{ color: 'var(--t3)' }}>{result.league}</span>
                </div>
              )}
              {result.event_date && (
                <span className="text-[10px]" style={{ color: 'var(--t3)', opacity: 0.55 }}>
                  · {fmtDate(result.event_date)}
                </span>
              )}
              {paCount >= 2 && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,159,10,.12)', color: '#FF9F0A',
                    border: '1px solid rgba(255,159,10,.2)' }}>PA ×2</span>
              )}
              {paCount === 1 && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,159,10,.08)', color: '#FF9F0A',
                    border: '1px solid rgba(255,159,10,.15)' }}>PA ×1</span>
              )}
            </div>
            {/* Event name */}
            {result.event_url ? (
              <a href={result.event_url} target="_blank" rel="noopener noreferrer"
                className="text-[13px] font-black flex items-center gap-1.5 hover:underline leading-tight"
                style={{ color: 'var(--t)' }}>
                {result.event_name} <ExternalLink size={10} style={{ opacity: 0.45, flexShrink: 0 }} />
              </a>
            ) : (
              <div className="text-[13px] font-black leading-tight" style={{ color: 'var(--t)' }}>
                {result.event_name}
              </div>
            )}
          </div>
          {/* Investment */}
          <div className="text-right shrink-0 ml-2">
            <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
              style={{ color: 'var(--t3)' }}>Investir</div>
            <div className="text-sm font-black"
              style={{ color: 'var(--t)', fontFamily: "'JetBrains Mono', monospace" }}>
              R$&nbsp;{fmtBRL(investment)}
            </div>
          </div>
        </div>
      </div>

      {/* Bet rows */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        {result.bets.map((b, i) => (
          <div key={i}
            className="flex items-center justify-between gap-2"
            style={{ padding: '6px 10px', borderRadius: 8,
              background: b.is_freebet ? 'rgba(63,255,33,.05)' : 'rgba(255,255,255,.02)',
              border: `1px solid ${b.is_freebet ? 'rgba(63,255,33,.18)' : 'rgba(255,255,255,.05)'}` }}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {b.is_freebet
                ? <Gift size={11} style={{ color: '#3DFF8F', flexShrink: 0 }} />
                : <div style={{ width: 11, height: 11, flexShrink: 0 }} />
              }
              <span className="text-[11px] font-bold truncate"
                style={{ color: b.is_freebet ? '#3DFF8F' : '#94A3B8' }}>
                {b.outcome}
              </span>
              {b.is_pa && (
                <span className="text-[8px] font-black px-1 py-0.5 rounded shrink-0"
                  style={{ background: 'rgba(255,159,10,.08)', color: '#FF9F0A',
                    border: '1px solid rgba(255,159,10,.15)' }}>PA</span>
              )}
              {b.url ? (
                <a href={b.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-bold shrink-0 flex items-center gap-1"
                  style={{ color: '#818CF8' }}>
                  {b.house} <ExternalLink size={9} />
                </a>
              ) : (
                <span className="text-xs font-bold shrink-0" style={{ color: 'var(--t)' }}>{b.house}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-black"
                style={{ color: b.is_freebet ? '#3DFF8F' : 'var(--t3)',
                  fontFamily: "'JetBrains Mono', monospace" }}>
                {b.odd.toFixed(2)}
              </span>
              <span className="text-xs font-black"
                style={{ color: 'var(--t)', fontFamily: "'JetBrains Mono', monospace",
                  minWidth: 68, textAlign: 'right' }}>
                R$&nbsp;{fmtBRL(b.stake * scale)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer: conversion + profit + CTA */}
      <div style={{ padding: '10px 14px 13px', borderTop: '1px solid rgba(255,255,255,.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="flex items-center gap-5">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
              style={{ color: 'var(--t3)' }}>Conversão</div>
            <div className="text-base font-black"
              style={{ color: '#3DFF8F', fontFamily: "'JetBrains Mono', monospace" }}>
              {result.conversion_pct.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
              style={{ color: 'var(--t3)' }}>Lucro</div>
            <div className="text-base font-black"
              style={{ color: '#3DFF8F', fontFamily: "'JetBrains Mono', monospace" }}>
              R$&nbsp;{fmtBRL(profit)}
            </div>
          </div>
        </div>
        <button type="button" onClick={onOpen}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all"
          style={{ background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.25)',
            color: 'var(--g)', cursor: 'pointer' }}>
          <Gift size={11} /> Usar
        </button>
      </div>
    </div>
  );
}

// ── Checkbox group section (shared by both filter panels) ─────────────────────

function CheckboxSection({ title, items, selected, onToggle, onSelectAll, onClear }: {
  title: string;
  items: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const displayLabel = (v: string) => v === '__RESTO_MUNDO__' ? 'Resto do mundo' : v;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#E2E8F0', letterSpacing: '0.02em' }}>{title}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onSelectAll}
            style={{ fontSize: 10, fontWeight: 700, color: '#3DFF8F',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Todos
          </button>
          <button type="button" onClick={onClear}
            style={{ fontSize: 10, fontWeight: 700, color: '#64748B',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Limpar
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
        {items.map(v => {
          const checked = selected.has(v);
          return (
            <label key={v}
              style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                padding: '5px 8px', borderRadius: 7,
                background: checked ? 'rgba(63,255,33,.06)' : 'rgba(255,255,255,.03)',
                border: `1px solid ${checked ? 'rgba(63,255,33,.2)' : 'rgba(255,255,255,.06)'}`,
                transition: 'all .15s' }}>
              <input type="checkbox" checked={checked} onChange={() => onToggle(v)}
                style={{ accentColor: '#3DFF8F', width: 13, height: 13, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600,
                color: checked ? '#C4FFAE' : '#94A3B8', lineHeight: 1.3 }}>
                {displayLabel(v)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Side drawer panel (leagues / houses) ─────────────────────────────────────

function FilterDrawer({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9990,
        background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
        display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 520, height: '100%',
        background: '#0D1220', borderLeft: '1px solid rgba(255,255,255,.1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-24px 0 80px rgba(0,0,0,.6)' }}>
        {/* Drawer header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={14} style={{ color: '#3DFF8F' }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#E2E8F0' }}>{title}</span>
          </div>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,.07)', border: 'none', borderRadius: 8,
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#94A3B8', cursor: 'pointer', fontSize: 18 }}>
            <X size={15} />
          </button>
        </div>
        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Filter chips (tiny select dropdowns) ─────────────────────────────────────

function FilterSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: '#64748B' }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600,
          color: '#E2E8F0', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function FreebetConverterPage() {
  // Wizard state
  const [step,        setStep]        = useState(1);
  const [house,       setHouse]       = useState('');
  const [value,       setValue]       = useState('');
  const [minOdd,      setMinOdd]      = useState('1.50');
  const [maxOdd,      setMaxOdd]      = useState('10.00');
  const [paFilter,    setPaFilter]    = useState('all');
  const [results,     setResults]     = useState<FreebetResult[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [modalResult, setModalResult] = useState<FreebetResult | null>(null);

  // Step-4 filter state
  const [fDate,   setFDate]   = useState<'all'|'24h'|'48h'|'72h'|'5d'>('all');
  const [fSort,   setFSort]   = useState<'desc'|'asc'>('desc');
  const [fPA,     setFPA]     = useState<'all'|'none'|'one'|'two'>('all');

  // Selected leagues — start with all selected
  const [selLeagues, setSelLeagues] = useState<Set<string>>(() => new Set(ALL_LEAGUES_FLAT));
  // Selected houses — start with all selected
  const [selHouses,  setSelHouses]  = useState<Set<string>>(() => new Set(ALL_HOUSES_FLAT));

  // Panel visibility
  const [showLeaguePanel, setShowLeaguePanel] = useState(false);
  const [showHousePanel,  setShowHousePanel]  = useState(false);

  // ── League filter helpers ──────────────────────────────────────────────────
  function toggleLeague(v: string) {
    setSelLeagues(prev => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }
  function setLeagueGroup(region: string, on: boolean) {
    const items = LEAGUES_BY_REGION[region] ?? [];
    setSelLeagues(prev => {
      const next = new Set(prev);
      items.forEach(v => on ? next.add(v) : next.delete(v));
      return next;
    });
  }

  // ── House filter helpers ───────────────────────────────────────────────────
  function toggleHouse(v: string) {
    setSelHouses(prev => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }
  function setHouseGroup(group: string[], on: boolean) {
    setSelHouses(prev => {
      const next = new Set(prev);
      group.forEach(v => on ? next.add(v) : next.delete(v));
      return next;
    });
  }

  // ── Filtered + sorted results ─────────────────────────────────────────────
  const filteredResults = useMemo(() => {
    let arr = [...results];

    // Date filter
    if (fDate !== 'all') {
      const now   = Date.now();
      const hours = fDate === '24h' ? 24 : fDate === '48h' ? 48 : fDate === '72h' ? 72 : 5 * 24;
      arr = arr.filter(r => {
        if (!r.event_date) return true;
        const ms   = new Date(r.event_date).getTime();
        const diff = (ms - now) / 3_600_000;
        return diff >= 0 && diff <= hours;
      });
    }

    // PA filter
    if (fPA !== 'all') {
      arr = arr.filter(r => {
        const paBets    = r.bets.filter(b => b.is_pa);
        const n         = paBets.length;
        if (fPA === 'none') return n === 0;
        if (fPA === 'one')  return n === 1;
        if (fPA === 'two') {
          // PA em 2 lados = Casa + Fora com PA (não Casa + Empate)
          if (n < 2) return false;
          const paOutcomes = new Set(paBets.map(b => b.outcome));
          return paOutcomes.has('Casa') && paOutcomes.has('Fora');
        }
        return true;
      });
    }

    // League filter (only if not all selected)
    const allLeaguesSelected = ALL_LEAGUES_FLAT.every(l => selLeagues.has(l));
    if (!allLeaguesSelected) {
      const restSelected = selLeagues.has('__RESTO_MUNDO__');
      arr = arr.filter(r => {
        if (selLeagues.has(r.league)) return true;
        if (restSelected && !KNOWN_LEAGUES.has(r.league)) return true;
        return false;
      });
    }

    // House filter (only if not all selected)
    const allHousesSelected = ALL_HOUSES_FLAT.every(h => selHouses.has(h));
    if (!allHousesSelected) {
      arr = arr.filter(r =>
        r.bets.filter(b => !b.is_freebet).some(b => selHouses.has(b.house))
      );
    }

    // Sort
    arr.sort((a, b) => fSort === 'desc'
      ? b.conversion_pct - a.conversion_pct
      : a.conversion_pct - b.conversion_pct
    );

    return arr;
  }, [results, fDate, fSort, fPA, selLeagues, selHouses]);

  const hiddenCount = results.length - filteredResults.length;

  // ── League / house badge counts ───────────────────────────────────────────
  const leagueFilterActive = !ALL_LEAGUES_FLAT.every(l => selLeagues.has(l));
  const houseFilterActive  = !ALL_HOUSES_FLAT.every(h => selHouses.has(h));

  // ── Search ────────────────────────────────────────────────────────────────
  async function search() {
    setLoading(true);
    setError('');
    setResults([]);
    setStep(4);

    try {
      const postRes  = await fetch('/api/supermonitor/freebet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      const deadline  = Date.now() + 3 * 60 * 1000;

      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 400));
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
        if (pollJson.status === 'error')   throw new Error(pollJson.error_msg ?? 'Daemon retornou erro ao processar');
        if (pollJson.status === 'timeout') throw new Error('Daemon não respondeu. Verifique se o process-queue.mjs está rodando.');
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
    <div className="flex flex-col gap-4 w-full">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--t)' }}>
            Converter Freebet
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
            Extraia o valor de freebets cobrindo outras casas. Lucro garantido independente do resultado.
          </p>
        </div>
      </div>

      {/* Wizard card */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <StepBar step={step} />

        {step === 1 && <Step1 selected={house} onSelect={setHouse} onNext={() => setStep(2)} />}
        {step === 2 && <Step2 value={value} onChange={setValue} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {step === 3 && (
          <Step3
            minOdd={minOdd} maxOdd={maxOdd} paFilter={paFilter}
            onChangeMin={setMinOdd} onChangeMax={setMaxOdd} onChangePa={setPaFilter}
            onBack={() => setStep(2)} onSearch={search}
          />
        )}

        {step === 4 && (
          <div className="flex flex-col gap-5">
            {/* Context summary + back */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => { setStep(3); setResults([]); setError(''); setLoading(false); }}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg"
                  style={{ color: 'var(--t3)', background: 'rgba(255,255,255,.05)',
                    border: '1px solid var(--b)', cursor: 'pointer' }}>
                  <ChevronLeft size={13} /> Nova busca
                </button>
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
                  Odds {minOdd}–{parseFloat(maxOdd) >= 999 ? '∞' : maxOdd}
                </span>
              </div>
            </div>

            {/* ── Filter bar ── */}
            {results.length > 0 && !loading && (
              <div className="rounded-xl p-3 flex flex-wrap items-end gap-3"
                style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>

                {/* Inline selects */}
                <FilterSelect label="Data do evento" value={fDate}
                  options={[
                    { value: 'all', label: 'Todas as datas' },
                    { value: '24h', label: 'Próximas 24h' },
                    { value: '48h', label: 'Próximas 48h' },
                    { value: '72h', label: 'Próximas 72h' },
                    { value: '5d',  label: 'Próximos 5 dias' },
                  ]}
                  onChange={v => setFDate(v as typeof fDate)}
                />
                <FilterSelect label="Ordenar por conversão" value={fSort}
                  options={[
                    { value: 'desc', label: 'Maior → Menor' },
                    { value: 'asc',  label: 'Menor → Maior' },
                  ]}
                  onChange={v => setFSort(v as typeof fSort)}
                />
                <FilterSelect label="Pagamento antecipado" value={fPA}
                  options={PA_OPTIONS}
                  onChange={v => setFPA(v as typeof fPA)}
                />

                {/* Divider */}
                <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,.08)', margin: '0 4px' }} />

                {/* Drawer buttons */}
                <button type="button" onClick={() => setShowLeaguePanel(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: leagueFilterActive ? 'rgba(63,255,33,.1)' : 'rgba(255,255,255,.05)',
                    border: `1px solid ${leagueFilterActive ? 'rgba(63,255,33,.3)' : 'rgba(255,255,255,.08)'}`,
                    color: leagueFilterActive ? 'var(--g)' : 'var(--t3)',
                    cursor: 'pointer',
                  }}>
                  <Trophy size={12} />
                  Campeonatos
                  {leagueFilterActive && (
                    <span style={{ background: 'rgba(63,255,33,.2)', color: 'var(--g)',
                      borderRadius: 4, padding: '0 5px', fontSize: 10, fontWeight: 900 }}>
                      {selLeagues.size}
                    </span>
                  )}
                </button>

                <button type="button" onClick={() => setShowHousePanel(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: houseFilterActive ? 'rgba(77,166,255,.1)' : 'rgba(255,255,255,.05)',
                    border: `1px solid ${houseFilterActive ? 'rgba(77,166,255,.3)' : 'rgba(255,255,255,.08)'}`,
                    color: houseFilterActive ? '#4DA6FF' : 'var(--t3)',
                    cursor: 'pointer',
                  }}>
                  <SlidersHorizontal size={12} />
                  Casas de Aposta
                  {houseFilterActive && (
                    <span style={{ background: 'rgba(77,166,255,.2)', color: '#4DA6FF',
                      borderRadius: 4, padding: '0 5px', fontSize: 10, fontWeight: 900 }}>
                      {selHouses.size}
                    </span>
                  )}
                </button>

                {/* Hidden count */}
                {hiddenCount > 0 && (
                  <span className="text-[11px] font-bold ml-auto"
                    style={{ color: '#64748B' }}>
                    {hiddenCount} oculto{hiddenCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center gap-3 py-20">
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--g)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--t3)' }}>
                  Buscando melhores conversões...
                </span>
                <span className="text-xs" style={{ color: 'var(--t3)', opacity: 0.5 }}>
                  Isso pode levar até 30 segundos
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

            {/* Results grid */}
            {!loading && filteredResults.length > 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
                    {filteredResults.length} conversão{filteredResults.length !== 1 ? 'ões' : ''} encontrada{filteredResults.length !== 1 ? 's' : ''}
                  </span>
                  {results.length !== filteredResults.length && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-bold"
                      style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)',
                        border: '1px solid rgba(255,255,255,.08)' }}>
                      de {results.length} totais
                    </span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-bold"
                    style={{ background: 'rgba(63,255,33,.08)', color: 'var(--g)',
                      border: '1px solid rgba(63,255,33,.15)' }}>
                    {fSort === 'desc' ? 'Maior → menor conversão' : 'Menor → maior conversão'}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredResults.map((r, i) => (
                    <ResultCard
                      key={i}
                      result={r}
                      freebetValue={freebetValue}
                      onOpen={() => setModalResult(r)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* No results after filtering */}
            {!loading && !error && results.length > 0 && filteredResults.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Filter size={24} style={{ color: 'var(--t3)', opacity: 0.4 }} />
                <span className="text-sm font-bold" style={{ color: 'var(--t3)' }}>
                  Nenhum resultado com os filtros atuais
                </span>
                <span className="text-xs" style={{ color: 'var(--t3)', opacity: 0.6 }}>
                  Ajuste os filtros acima para ver mais conversões
                </span>
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

      {/* League filter drawer */}
      {showLeaguePanel && (
        <FilterDrawer title="Filtros de Campeonatos" onClose={() => setShowLeaguePanel(false)}>
          {Object.entries(LEAGUES_BY_REGION).map(([region, leagues]) => (
            <CheckboxSection
              key={region}
              title={region}
              items={leagues}
              selected={selLeagues}
              onToggle={toggleLeague}
              onSelectAll={() => setLeagueGroup(region, true)}
              onClear={() => setLeagueGroup(region, false)}
            />
          ))}
        </FilterDrawer>
      )}

      {/* House filter drawer */}
      {showHousePanel && (
        <FilterDrawer title="Filtros de Casas de Aposta" onClose={() => setShowHousePanel(false)}>
          <CheckboxSection
            title="Casas padrão"
            items={HOUSES_DEFAULT}
            selected={selHouses}
            onToggle={toggleHouse}
            onSelectAll={() => setHouseGroup(HOUSES_DEFAULT, true)}
            onClear={() => setHouseGroup(HOUSES_DEFAULT, false)}
          />
          <CheckboxSection
            title="Casas SO"
            items={HOUSES_SO}
            selected={selHouses}
            onToggle={toggleHouse}
            onSelectAll={() => setHouseGroup(HOUSES_SO, true)}
            onClear={() => setHouseGroup(HOUSES_SO, false)}
          />
        </FilterDrawer>
      )}
    </div>
  );
}
