'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  calculate,
  getMatrix,
  FORMULA_OPTIONS_2WAY,
  FORMULA_OPTIONS_3WAY,
  type FormulaOption,
} from '@/lib/calc/surebetEngine';
import { useStore } from '@/store/useStore';
import type { Leg, OpType } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number, sign = true): string {
  const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!sign) return `R$ ${abs}`;
  const s = v < 0 ? '−' : '+';
  return `${s} R$ ${abs}`;
}

function fmtUSD(v: number): string {
  return `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nowBRT(): string {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    .slice(0, 16)
    .replace(' ', 'T');
}

const ALL_HOUSES = [
  '7Games','Aposta1','Apostaganha','Apostatudo','Apostefacil','B1bet','B2xbet','Bateubet',
  'Bet365','Bet365Arg','Bet365Pe','Bet4','Bet7k','Betagora','Betaki','Betano','Betao',
  'Betbet','Betboo','Betboom','Betdasorte','Betesporte','Betfair Ex','Betfair SB','Betfast',
  'Betfusion','Betgorillas','Betmgm','Betnacional','Betonline','Betou','Betpark','Betpix365',
  'Betsson','Betsul','Betvip','BetWarrior','Bigbet','Blaze','Bolsadeaposta','Br4bet',
  'Brasildasorte','Bravobet','Brbet','Brx','Bullsbet','Casadeapostas','Cassinopix','Cgc',
  'Donaldbet','Donosdabola','Esporte365','Esportenetbet','Esportenetsp','Esportesdasorte',
  'Esportivabet','Estrelabet','F12bet','Faz1bet','Fortunejack','Fulltbet','Ganheibet',
  'Goldebet','H2bet','Jogodeouro','Jonbet','Kingpanda','KTO','Lancedesorte','Liderbet',
  'Lotogreen','Lottoland','Lottu','Luckbet','Luvabet','Marjosports','Maximabet','Mcgames',
  'Meridian','Milhao','Mma','Multibet','Mystake','Netbet','NoviBet','Oleybet','Onabet',
  'Outrabet','Pagol','Pinnacle','Pinnacle.com','Pixbet','Playbet','R7bet','RealsBet',
  'Reidopitaco','RicoBet','Rivalo','SeguroBet','Seubet','Sortenabet','Sorteonline','Spin',
  'SportingBet','SportyBet','Stake','Startbet','Superbet','Supremabet','Tivobet','Ultrabet',
  'Uxbet','Vaidebet','Vbet','Verabet','Vupibet','Wjcasino','Xpbet',
  'Polymarket',
];

const SPORTS = [
  'Futebol','Futebol Americano','Tênis','Basquete','Hockey no Gelo','Vôlei','Baseball',
  'MMA','Rugby','Esports','E-Futebol','Outros',
];

// ── Inline styles ─────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  height: 34, padding: '0 10px', borderRadius: 7,
  background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
  color: '#E2E8F0', fontSize: 13, width: '100%', outline: 'none',
  fontFamily: "'JetBrains Mono', monospace",
};

const SELECT: React.CSSProperties = {
  ...INPUT,
  cursor: 'pointer',
  background: '#1A2035',
  border: '1px solid rgba(255,255,255,.14)',
  colorScheme: 'dark',
};

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'rgba(148,163,184,.7)',
  display: 'block', marginBottom: 5,
};

// Grid template: Desfecho | PM | Odd/Preço | Stake | D | C | Lucro
const COLS      = '90px 40px 1fr 1fr 36px 36px 100px';
const COLS_MOB  = '70px 1fr 1fr 28px 28px 72px'; // mobile: no PM column

// ── Add-to-panel modal ────────────────────────────────────────────────────────

interface AddToPanelProps {
  numOutcomes: number;
  formulaOpt: FormulaOption;
  effectiveOdds: number[];
  stakes: number[];
  onClose: () => void;
}

function AddToPanelModal({ numOutcomes, formulaOpt, effectiveOdds, stakes, onClose }: AddToPanelProps) {
  const addLeg  = useStore(s => s.addLeg);
  const toastFn = useStore(s => s.toast);

  const [ev,   setEv]   = useState('');
  const [bd,   setBd]   = useState(nowBRT());
  const [sp,   setSp]   = useState('Futebol');
  const [opT,  setOpT]  = useState<OpType>('surebet');
  const [houses, setHouses] = useState<string[]>(Array(numOutcomes).fill(''));

  function setHouse(i: number, val: string) {
    setHouses(prev => prev.map((h, idx) => idx === i ? val : h));
  }

  function save() {
    if (!ev.trim()) { toastFn('Informe o nome do evento', 'wrn'); return; }
    const oid = `op_calc_${Date.now()}`;
    formulaOpt.labels.forEach((label, i) => {
      if (i >= numOutcomes) return;
      const stake = stakes[i] ?? 0;
      if (stake <= 0) return;
      const leg: Leg = {
        id:    `l_calc_${Date.now()}_${i}`,
        oid,
        bd,
        ed:    bd,
        sp,
        ev:    ev.trim(),
        ho:    houses[i] || '',
        mk:    label,
        od:    effectiveOdds[i] ?? 0,
        st:    +stake.toFixed(2),
        re:    'Pendente',
        pc:    0,
        pr:    0,
        fl:    [],
        source:  'manual',
        signal:  'pre',
        opType:  opT,
      };
      addLeg(leg);
    });
    toastFn('Operação adicionada ao painel', 'ok');
    onClose();
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
    backdropFilter: 'blur(6px)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16,
  };

  const card: React.CSSProperties = {
    background: '#111827', border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 16, padding: 24, width: '100%', maxWidth: 480,
    maxHeight: '90vh', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 16,
    colorScheme: 'dark',
  };

  return createPortal(
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#E2E8F0' }}>Adicionar ao Painel</span>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ gridColumn: '1/-1' }}>
            <span style={LABEL}>Evento</span>
            <input style={INPUT} value={ev} onChange={e => setEv(e.target.value)}
              placeholder="Ex: Time A vs Time B" />
          </label>
          <label>
            <span style={LABEL}>Data/Hora</span>
            <input type="datetime-local" style={INPUT} value={bd} onChange={e => setBd(e.target.value)} />
          </label>
          <label>
            <span style={LABEL}>Esporte</span>
            <select style={SELECT} value={sp} onChange={e => setSp(e.target.value)}>
              {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            <span style={LABEL}>Tipo</span>
            <select style={SELECT} value={opT} onChange={e => setOpT(e.target.value as OpType)}>
              <option value="surebet">Surebet</option>
              <option value="delay">Delay</option>
              <option value="duplo_green">Duplo Green</option>
              <option value="outros">Outros</option>
            </select>
          </label>
        </div>

        <div>
          <span style={{ ...LABEL, marginBottom: 8 }}>Casas por desfecho</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {formulaOpt.labels.slice(0, numOutcomes).map((label, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', alignItems: 'center', gap: 8 }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: 'rgba(77,166,255,.12)', color: '#4DA6FF',
                  border: '1px solid rgba(77,166,255,.2)', textAlign: 'center',
                }}>
                  {label}
                </span>
                <select style={SELECT} value={houses[i]} onChange={e => setHouse(i, e.target.value)}>
                  <option value="">Selecionar casa...</option>
                  {ALL_HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{
            flex: 1, height: 40, borderRadius: 9, border: '1px solid rgba(255,255,255,.1)',
            background: 'transparent', color: '#94A3B8', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button onClick={save} style={{
            flex: 2, height: 40, borderRadius: 9, border: 'none',
            background: 'linear-gradient(135deg,#3DFF8F,#00BBFF)',
            color: '#0D1117', fontWeight: 800, fontSize: 13, cursor: 'pointer',
          }}>
            Adicionar ao Painel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Main calculator ───────────────────────────────────────────────────────────

export function SurebetCalc() {
  const [numOutcomes, setNumOutcomes] = useState<2 | 3>(2);
  const [formulaVal,  setFormulaVal]  = useState(0);
  const [odds,        setOdds]        = useState(['2.10', '1.95', '2.80']);
  const [fixedMode,   setFixedMode]   = useState<'sum' | 0 | 1 | 2>('sum');
  const [anchor,      setAnchor]      = useState('200');
  const [distribute,  setDistribute]  = useState([true, true, true]);
  const [roundEnabled, setRoundEnabled] = useState(false);
  const [roundToStr,  setRoundToStr]  = useState('5');
  const [showAdd,     setShowAdd]     = useState(false);

  // Polymarket state
  const [polymarket,  setPolymarket]  = useState([false, false, false]);
  const [quotePrices, setQuotePrices] = useState(['22', '22', '22']);
  const [exchangeRate, setExchangeRate] = useState('5.50');
  const [fetchingRate, setFetchingRate] = useState(false);

  const formulaOptions: FormulaOption[] = numOutcomes === 2
    ? FORMULA_OPTIONS_2WAY
    : FORMULA_OPTIONS_3WAY;

  const safeFormulaVal = useMemo(() => {
    const vals = formulaOptions.map(o => o.value);
    return vals.includes(formulaVal) ? formulaVal : vals[0];
  }, [formulaVal, formulaOptions]);

  const formulaOpt = formulaOptions.find(o => o.value === safeFormulaVal) ?? formulaOptions[0];

  // Effective odds — Polymarket rows use 100/quotePrices[i], others use odds[i]
  const effectiveOdds = useMemo(() => {
    return Array.from({ length: numOutcomes }, (_, i) => {
      if (polymarket[i]) {
        const price = parseFloat(quotePrices[i].replace(',', '.')) || 22;
        if (price <= 0 || price >= 100) return 0;
        return 100 / price;
      }
      return parseFloat(odds[i].replace(',', '.')) || 0;
    });
  }, [odds, polymarket, quotePrices, numOutcomes]);

  const result = useMemo(() => {
    const roundTo = roundEnabled ? (parseFloat(roundToStr) || null) : null;
    const anchorVal = parseFloat(anchor.replace(',', '.')) || 0;
    const dist = distribute.slice(0, numOutcomes);

    // Break-even mode: D=false legs get stake = total/odd (0/0 if that outcome wins)
    // Only applies when fixedMode='sum' (total is the anchor)
    const hasBreakEven = fixedMode === 'sum' && dist.some(d => !d);
    if (!hasBreakEven) {
      return calculate(effectiveOdds, formulaOpt.formula, anchorVal, fixedMode, dist, roundTo);
    }

    const total = anchorVal;
    const stakes: number[] = Array(numOutcomes).fill(0);
    let remaining = total;

    // Step 1: break-even stakes for D=false legs — stake_i = total/odd_i
    for (let i = 0; i < numOutcomes; i++) {
      if (!dist[i] && effectiveOdds[i] > 0) {
        stakes[i] = total / effectiveOdds[i];
        remaining -= stakes[i];
      }
    }

    // Step 2: calculate D=true legs with remaining budget
    if (remaining > 0.01) {
      const sub = calculate(effectiveOdds, formulaOpt.formula, remaining, 'sum', dist, roundTo);
      for (let i = 0; i < numOutcomes; i++) {
        if (dist[i]) stakes[i] = sub.stakes[i] ?? 0;
      }
    }

    // Step 3: compute profits using full stakes
    const matrix = getMatrix(formulaOpt.formula, effectiveOdds);
    const profits = Array(numOutcomes).fill(0).map((_, i) =>
      (matrix[i] ?? []).reduce((sum: number, coeff: number, k: number) => sum + coeff * (stakes[k] ?? 0), 0)
    );

    const totalBet = stakes.reduce((s, v) => s + v, 0);
    const profitLegIdxs = dist.map((d, i) => d ? i : -1).filter(i => i >= 0 && i < numOutcomes);
    const minProfit = profitLegIdxs.length > 0 ? Math.min(...profitLegIdxs.map(i => profits[i])) : 0;
    const profitPct = totalBet > 0.001 ? (minProfit / totalBet) * 100 : 0;
    const margin = profitLegIdxs.reduce((s, i) => s + 1 / (effectiveOdds[i] || 1), 0);

    return { stakes, profits, totalBet, profitPct, margin, isSurebet: minProfit > 1e-6 };
  }, [effectiveOdds, numOutcomes, formulaOpt, anchor, fixedMode, distribute, roundEnabled, roundToStr]);

  // Theoretical % — computed from odds alone (anchor=100, no rounding); immune to stake edits
  const theoreticalPct = useMemo(() => {
    const dist = distribute.slice(0, numOutcomes);
    const hasBreakEven = dist.some(d => !d);
    if (hasBreakEven) return result.profitPct;
    return calculate(effectiveOdds, formulaOpt.formula, 100, 'sum', dist, null).profitPct;
  }, [effectiveOdds, numOutcomes, formulaOpt, distribute, result.profitPct]);

  // Polymarket per-row calculations
  const pmCalcs = useMemo(() => {
    const cambio = parseFloat(exchangeRate.replace(',', '.')) || 5.5;
    return Array.from({ length: numOutcomes }, (_, i) => {
      if (!polymarket[i]) return null;
      const pricePerCota = parseFloat(quotePrices[i].replace(',', '.')) || 22;
      if (pricePerCota <= 0 || pricePerCota >= 100) return null;
      const oddEquiv = 100 / pricePerCota;
      const stakeInBRL = result.stakes[i] ?? 0;
      const retornoAlvoBRL = stakeInBRL * oddEquiv;
      const retornoAlvoUSD = retornoAlvoBRL / cambio;
      // +3% slippage buffer
      const cotas = Math.ceil(retornoAlvoUSD * 1.03);
      const custoUSD = cotas * (pricePerCota / 100);
      const custoBRL = custoUSD * cambio;
      // Each cota pays $1.00 USD on win
      const retornoUSD = cotas;
      const retornoBRL = cotas * cambio;
      return { oddEquiv, cotas, custoUSD, custoBRL, retornoUSD, retornoBRL };
    });
  }, [polymarket, quotePrices, result.stakes, exchangeRate, numOutcomes]);

  const anyPM = polymarket.slice(0, numOutcomes).some(Boolean);

  async function fetchRate() {
    setFetchingRate(true);
    try {
      const resp = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
      const json = await resp.json();
      const bid = json['USDBRL']?.bid;
      if (bid) setExchangeRate(Number(bid).toFixed(2));
    } catch {
      // silently ignore fetch errors
    }
    setFetchingRate(false);
  }

  function toggleDistribute(i: number) {
    setDistribute(prev => prev.map((d, idx) => idx === i ? !d : d));
  }

  function toggleFixed(i: number | 'sum') {
    if (fixedMode === i) {
      // Deactivate — return to total mode, keep current total as anchor
      const tot = result.totalBet > 0 ? result.totalBet.toFixed(2) : anchor;
      setAnchor(tot);
      setFixedMode('sum');
    } else {
      // Activate — capture current calculated value as anchor
      if (typeof i === 'number') {
        const cur = result.stakes[i] ?? 0;
        if (cur > 0) setAnchor(cur.toFixed(2));
      }
      setFixedMode(i as 'sum' | 0 | 1 | 2);
    }
  }

  function togglePM(i: number) {
    setPolymarket(prev => prev.map((p, idx) => idx === i ? !p : p));
  }

  function setOdd(i: number, val: string) {
    setOdds(prev => prev.map((o, idx) => idx === i ? val : o));
  }

  function setQuotePrice(i: number, val: string) {
    setQuotePrices(prev => prev.map((p, idx) => idx === i ? val : p));
  }

  // Stake cells only update anchor when C is already active for that cell
  function handleStakeInput(i: number | 'sum', val: string) {
    if (fixedMode === i) setAnchor(val);
  }

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 600);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Derived display ────────────────────────────────────────────────────────
  const profitPct    = theoreticalPct;
  const isSurebet    = result.isSurebet || theoreticalPct > 0;
  const profitColor  = isSurebet ? '#3DFF8F' : profitPct < -5 ? '#FF4545' : '#FFBF00';
  const profitBg     = isSurebet ? 'rgba(61,255,143,.1)' : profitPct < -5 ? 'rgba(255,69,69,.1)' : 'rgba(255,191,0,.1)';
  const profitBorder = isSurebet ? 'rgba(61,255,143,.25)' : profitPct < -5 ? 'rgba(255,69,69,.25)' : 'rgba(255,191,0,.25)';

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, colorScheme: 'dark' }}>

      {/* ── Config row ──────────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 12, padding: '14px 16px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14,
      }}>

        {/* 2 Casas / 3 Casas toggle */}
        <div>
          <span style={LABEL}>Nº de Casas</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {([2, 3] as const).map(n => (
              <button key={n} onClick={() => {
                setNumOutcomes(n);
                const opts = n === 2 ? FORMULA_OPTIONS_2WAY : FORMULA_OPTIONS_3WAY;
                setFormulaVal(opts[0].value);
                if (fixedMode !== 'sum' && (fixedMode as number) >= n) setFixedMode('sum');
              }}
                style={{
                  padding: isMobile ? '4px 10px' : '5px 14px',
                  borderRadius: 7, fontSize: isMobile ? 11 : 12, fontWeight: 700, cursor: 'pointer',
                  background: numOutcomes === n ? 'rgba(77,166,255,.18)' : 'rgba(255,255,255,.04)',
                  color: numOutcomes === n ? '#4DA6FF' : '#6B7280',
                  border: `1px solid ${numOutcomes === n ? 'rgba(77,166,255,.3)' : 'rgba(255,255,255,.08)'}`,
                }}>
                {n} Casas
              </button>
            ))}
          </div>
        </div>

        {/* Formula selector */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <span style={LABEL}>Tipo de Entrada</span>
          <select
            style={SELECT}
            value={safeFormulaVal}
            onChange={e => setFormulaVal(Number(e.target.value))}
          >
            {formulaOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.display}</option>
            ))}
          </select>
        </div>

        {/* Exchange rate — shown when any PM row is active */}
        {anyPM && (
          <div>
            <span style={LABEL}>Câmbio USD/BRL</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                style={{ ...INPUT, width: 90 }}
                inputMode="decimal"
                value={exchangeRate}
                onChange={e => setExchangeRate(e.target.value)}
                placeholder="5.50"
              />
              <button
                onClick={fetchRate}
                disabled={fetchingRate}
                title="Buscar câmbio atual (AwesomeAPI)"
                style={{
                  height: 34, padding: '0 10px', borderRadius: 7, cursor: fetchingRate ? 'default' : 'pointer',
                  background: 'rgba(77,166,255,.12)', border: '1px solid rgba(77,166,255,.3)',
                  color: fetchingRate ? '#4B5563' : '#4DA6FF',
                  fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                  opacity: fetchingRate ? 0.6 : 1,
                }}>
                {fetchingRate ? '...' : '↻ Atualizar'}
              </button>
            </div>
          </div>
        )}

        {/* Profit % badge */}
        <div style={{
          padding: '6px 16px', borderRadius: 8,
          background: profitBg, border: `1px solid ${profitBorder}`,
          textAlign: 'center', minWidth: 110,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: profitColor, opacity: .7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isSurebet ? 'Surebet' : 'Lucro'}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 900, color: profitColor,
            fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.2,
          }}>
            {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 12, overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile && !anyPM ? COLS_MOB : COLS,
          gap: isMobile ? 4 : 8, padding: isMobile ? '8px 10px' : '10px 14px',
          background: 'rgba(255,255,255,.03)',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: 'rgba(148,163,184,.6)',
        }}>
          <span>Desfecho</span>
          {(!isMobile || anyPM) && <span style={{ textAlign: 'center', color: anyPM ? '#4DA6FF' : undefined }}>PM</span>}
          <span>{anyPM ? 'Odd / Preço (¢)' : 'Odd'}</span>
          <span>Stake</span>
          <span style={{ textAlign: 'center' }}>D</span>
          <span style={{ textAlign: 'center' }}>C</span>
          <span style={{ textAlign: 'right' }}>Lucro</span>
        </div>

        {/* Rows */}
        {formulaOpt.labels.slice(0, numOutcomes).map((label, i) => {
          const active  = distribute[i] ?? true;
          const isFixed = fixedMode === i;
          const isPM    = polymarket[i];
          const stake   = result.stakes[i] ?? 0;
          const profit  = result.profits[i] ?? 0;
          const profC   = profit >= 0 ? '#3DFF8F' : '#FF4545';
          const pm      = pmCalcs[i];

          // Display value for editable stake cell
          const stakeDisplayVal = isFixed
            ? anchor
            : (stake > 0 ? stake.toFixed(2) : '');

          return (
            <div key={i}>
              {/* Main row */}
              <div style={{
                display: 'grid', gridTemplateColumns: isMobile && !anyPM ? COLS_MOB : COLS,
                gap: isMobile ? 4 : 8, padding: isMobile ? '8px 10px' : '10px 14px',
                borderBottom: isPM && pm ? 'none' : '1px solid rgba(255,255,255,.04)',
                alignItems: 'center',
                background: !active ? 'rgba(255,191,0,.02)' : isPM ? 'rgba(77,166,255,.03)' : 'transparent',
              }}>
                {/* Label */}
                <span style={{
                  padding: '3px 8px', borderRadius: 5, fontSize: 12, fontWeight: 700,
                  background: 'rgba(77,166,255,.1)', color: '#4DA6FF',
                  border: '1px solid rgba(77,166,255,.18)',
                  textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {label}
                </span>

                {/* PM toggle — hidden on mobile unless anyPM */}
                {(!isMobile || anyPM) && (
                  <button
                    onClick={() => togglePM(i)}
                    title={isPM ? 'Desativar Polymarket' : 'Ativar Polymarket para este desfecho'}
                    style={{
                      width: 32, height: 28, borderRadius: 6, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isPM ? 'rgba(77,166,255,.2)' : 'rgba(255,255,255,.04)',
                      border: `1px solid ${isPM ? 'rgba(77,166,255,.5)' : 'rgba(255,255,255,.08)'}`,
                      color: isPM ? '#4DA6FF' : '#4B5563',
                      fontSize: 9, fontWeight: 900, letterSpacing: '0.02em',
                    }}>
                    PM
                  </button>
                )}

                {/* Odd input OR Quote Price input */}
                {isPM ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      style={{ ...INPUT, border: '1px solid rgba(77,166,255,.35)', color: '#4DA6FF' }}
                      inputMode="decimal"
                      value={quotePrices[i] ?? ''}
                      onChange={e => setQuotePrice(i, e.target.value)}
                      placeholder="22"
                      title="Preço da cota em centavos (1–99)"
                    />
                    <span style={{ fontSize: 10, color: 'rgba(148,163,184,.5)', whiteSpace: 'nowrap' }}>¢</span>
                  </div>
                ) : (
                  <input
                    style={INPUT}
                    inputMode="decimal"
                    value={odds[i] ?? ''}
                    onChange={e => setOdd(i, e.target.value)}
                    placeholder="2.00"
                  />
                )}

                {/* Stake — editable only when C is active for this row */}
                <input
                  style={{
                    ...INPUT,
                    border: isFixed
                      ? '1px solid rgba(255,191,0,.4)'
                      : isPM
                        ? '1px solid rgba(77,166,255,.25)'
                        : '1px solid rgba(255,255,255,.1)',
                    color: isFixed ? '#FFBF00' : '#E2E8F0',
                    cursor: isFixed ? 'text' : 'default',
                    opacity: isFixed ? 1 : 0.85,
                  }}
                  inputMode="decimal"
                  readOnly={!isFixed}
                  value={stakeDisplayVal}
                  onChange={e => handleStakeInput(i, e.target.value)}
                  placeholder="0.00"
                />

                {/* D toggle (distribute / break-even) */}
                <button
                  onClick={() => toggleDistribute(i)}
                  title={active ? 'Clique para definir esta aposta como 0/0 (sem lucro)' : 'Aposta em 0/0 — clique para incluir no lucro'}
                  style={{
                    width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? 'rgba(61,255,143,.15)' : 'rgba(255,191,0,.12)',
                    border: `1px solid ${active ? 'rgba(61,255,143,.3)' : 'rgba(255,191,0,.4)'}`,
                    color: active ? '#3DFF8F' : '#FFBF00',
                    fontSize: isMobile ? 10 : 12, fontWeight: 800,
                  }}>
                  {active ? '✓' : '0'}
                </button>

                {/* C toggle — only clicking C allows editing this stake */}
                <button
                  onClick={() => toggleFixed(i)}
                  title={isFixed ? 'Descongelar stake' : 'Congelar: clique para editar este valor'}
                  style={{
                    width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isFixed ? 'rgba(255,191,0,.15)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${isFixed ? 'rgba(255,191,0,.4)' : 'rgba(255,255,255,.08)'}`,
                    color: isFixed ? '#FFBF00' : '#4B5563',
                    fontSize: 11, fontWeight: 900,
                  }}>
                  C
                </button>

                {/* Profit — D=false shows 0/0 indicator */}
                <span style={{
                  textAlign: 'right', fontSize: isMobile ? 11 : 12, fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: !active ? '#FFBF00' : stake > 0 ? profC : '#4B5563',
                }}>
                  {!active
                    ? (stake > 0 ? '0/0' : '—')
                    : stake > 0 ? fmtBRL(profit) : '—'}
                </span>
              </div>

              {/* Polymarket expansion row */}
              {isPM && pm && (
                <div style={{
                  padding: '10px 14px 12px',
                  background: 'rgba(77,166,255,.04)',
                  borderBottom: '1px solid rgba(255,255,255,.04)',
                  borderTop: '1px solid rgba(77,166,255,.1)',
                }}>
                  {/* PM header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 900, textTransform: 'uppercase',
                      letterSpacing: '0.1em', color: '#4DA6FF',
                      background: 'rgba(77,166,255,.12)', padding: '2px 7px',
                      borderRadius: 4, border: '1px solid rgba(77,166,255,.25)',
                    }}>
                      Polymarket
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(148,163,184,.5)' }}>
                      {quotePrices[i]}¢ → Odd {pm.oddEquiv.toFixed(2)} · +3% slippage
                    </span>
                  </div>

                  {/* PM stats */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
                    {[
                      { label: 'Cotas',        value: pm.cotas.toString(),              color: '#E2E8F0' },
                      { label: 'Custo USD',    value: fmtUSD(pm.custoUSD),             color: '#FFBF00' },
                      { label: 'Custo BRL',    value: fmtBRL(pm.custoBRL, false),      color: '#FFBF00' },
                      { label: 'Retorno USD',  value: fmtUSD(pm.retornoUSD),           color: '#3DFF8F' },
                      { label: 'Retorno BRL',  value: fmtBRL(pm.retornoBRL, false),    color: '#3DFF8F' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.06em', color: 'rgba(148,163,184,.5)',
                        }}>
                          {label}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                          color,
                        }}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Total row */}
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile && !anyPM ? COLS_MOB : COLS,
          gap: isMobile ? 4 : 8, padding: isMobile ? '8px 10px' : '10px 14px',
          background: 'rgba(255,255,255,.02)',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'rgba(148,163,184,.5)',
          }}>
            Total
          </span>

          {/* PM col — hidden on mobile unless anyPM */}
          {(!isMobile || anyPM) && <span />}

          {/* Empty (Odd col) */}
          <span />

          {/* Total stake — always editable (it's the main anchor) */}
          <input
            style={{
              ...INPUT,
              border: fixedMode === 'sum'
                ? '1px solid rgba(77,166,255,.4)'
                : '1px solid rgba(255,255,255,.1)',
              color: fixedMode === 'sum' ? '#4DA6FF' : '#E2E8F0',
              fontWeight: 700,
            }}
            inputMode="decimal"
            value={fixedMode === 'sum' ? anchor : (result.totalBet > 0 ? result.totalBet.toFixed(2) : '')}
            onChange={e => handleStakeInput('sum', e.target.value)}
            placeholder="0.00"
          />

          {/* D — empty */}
          <span />

          {/* C for "fix total" */}
          <button
            onClick={() => toggleFixed('sum')}
            title={fixedMode === 'sum' ? 'Total fixado como âncora' : 'Voltar a usar total como âncora'}
            style={{
              width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: fixedMode === 'sum' ? 'rgba(77,166,255,.15)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${fixedMode === 'sum' ? 'rgba(77,166,255,.4)' : 'rgba(255,255,255,.08)'}`,
              color: fixedMode === 'sum' ? '#4DA6FF' : '#4B5563',
              fontSize: 11, fontWeight: 900,
            }}>
            C
          </button>

          {/* Min profit */}
          <span style={{
            textAlign: 'right', fontSize: 12, fontWeight: 800,
            fontFamily: "'JetBrains Mono', monospace",
            color: profitColor,
          }}>
            {result.totalBet > 0
              ? fmtBRL(Math.min(...result.profits.filter((_, i) => i < numOutcomes)))
              : '—'}
          </span>
        </div>
      </div>

      {/* ── Rounding + actions ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>

        {/* Rounding toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <div
            onClick={() => setRoundEnabled(v => !v)}
            style={{
              width: 38, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative',
              background: roundEnabled ? 'rgba(61,255,143,.3)' : 'rgba(255,255,255,.08)',
              border: `1px solid ${roundEnabled ? 'rgba(61,255,143,.4)' : 'rgba(255,255,255,.12)'}`,
              transition: 'all .2s',
            }}>
            <div style={{
              position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
              background: roundEnabled ? '#3DFF8F' : '#4B5563',
              left: roundEnabled ? 18 : 2,
              transition: 'all .2s',
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8' }}>Arredondar</span>
        </label>

        {roundEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>a cada</span>
            <input
              style={{ ...INPUT, width: 80 }}
              inputMode="decimal"
              value={roundToStr}
              onChange={e => setRoundToStr(e.target.value)}
              placeholder="5"
            />
            <span style={{ fontSize: 12, color: '#6B7280' }}>reais</span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Adicionar ao Painel */}
        <button
          onClick={() => setShowAdd(true)}
          disabled={result.totalBet <= 0}
          style={{
            padding: isMobile ? '8px 14px' : '10px 22px',
            borderRadius: 9, border: 'none', cursor: 'pointer',
            background: isSurebet
              ? 'linear-gradient(135deg,#3DFF8F,#00BBFF)'
              : 'rgba(255,255,255,.08)',
            color: isSurebet ? '#0D1117' : '#6B7280',
            fontWeight: 800, fontSize: isMobile ? 12 : 13,
            opacity: result.totalBet <= 0 ? 0.4 : 1,
            whiteSpace: 'nowrap',
          }}>
          {isMobile ? '+ Painel' : '+ Adicionar ao Painel'}
        </button>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'PM',  desc: 'ativa cálculo Polymarket (preço em centavos)' },
          { label: 'D',   desc: 'As apostas onde o lucro será distribuído — desativar deixa a aposta em 0/0 (sem lucro se bater, sem perda)' },
          { label: 'C',   desc: 'Congelar — clique para editar manualmente o valor desta stake; clique novamente para descongelar' },
        ].map(({ label, desc }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#4DA6FF' }}>{label}</span>
            <span style={{ fontSize: 11, color: '#4B5563' }}>— {desc}</span>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddToPanelModal
          numOutcomes={numOutcomes}
          formulaOpt={formulaOpt}
          effectiveOdds={effectiveOdds}
          stakes={result.stakes}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
