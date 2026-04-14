'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  calculate,
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

// ── Add-to-panel modal ────────────────────────────────────────────────────────

interface AddToPanelProps {
  numOutcomes: number;
  formulaOpt: FormulaOption;
  odds: number[];
  stakes: number[];
  onClose: () => void;
}

function AddToPanelModal({ numOutcomes, formulaOpt, odds, stakes, onClose }: AddToPanelProps) {
  const addLeg    = useStore(s => s.addLeg);
  const toastFn   = useStore(s => s.toast);

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
        od:    odds[i] ?? 0,
        st:    +stake.toFixed(2),
        re:    'Pendente',
        pc:    0,
        pr:    0,
        fl:    [],
        source:  'manual',
        signal:  'pre',
        opType:  opT,
      };
      // pr = calcLegProfit equivalent: (od - 1) * st - sum of other stakes
      // We leave pr=0 here; the store recalculates profits
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

  const formulaOptions: FormulaOption[] = numOutcomes === 2
    ? FORMULA_OPTIONS_2WAY
    : FORMULA_OPTIONS_3WAY;

  // Keep formulaVal in bounds when numOutcomes changes
  const safeFormulaVal = useMemo(() => {
    const vals = formulaOptions.map(o => o.value);
    return vals.includes(formulaVal) ? formulaVal : vals[0];
  }, [formulaVal, formulaOptions]);

  const formulaOpt = formulaOptions.find(o => o.value === safeFormulaVal) ?? formulaOptions[0];

  const result = useMemo(() => {
    const parsedOdds = odds.slice(0, numOutcomes).map(s => parseFloat(s.replace(',', '.')) || 0);
    const roundTo = roundEnabled ? (parseFloat(roundToStr) || null) : null;
    const anchorVal = parseFloat(anchor.replace(',', '.')) || 0;
    const dist = distribute.slice(0, numOutcomes);

    return calculate(
      parsedOdds,
      formulaOpt.formula,
      anchorVal,
      fixedMode,
      dist,
      roundTo,
    );
  }, [odds, numOutcomes, formulaOpt, anchor, fixedMode, distribute, roundEnabled, roundToStr]);

  function toggleDistribute(i: number) {
    setDistribute(prev => prev.map((d, idx) => idx === i ? !d : d));
  }

  function toggleFixed(i: number | 'sum') {
    setFixedMode(prev => (prev === i ? 'sum' : i) as 'sum' | 0 | 1 | 2);
  }

  function setOdd(i: number, val: string) {
    setOdds(prev => prev.map((o, idx) => idx === i ? val : o));
  }

  const parsedOdds = odds.slice(0, numOutcomes).map(s => parseFloat(s.replace(',', '.')) || 0);

  // ── Derived display ───────────────────────────────────────────────────────

  const profitPct     = result.profitPct;
  const isSurebet     = result.isSurebet;
  const profitColor   = isSurebet ? '#3DFF8F' : profitPct < -5 ? '#FF4545' : '#FFBF00';
  const profitBg      = isSurebet ? 'rgba(61,255,143,.1)' : profitPct < -5 ? 'rgba(255,69,69,.1)' : 'rgba(255,191,0,.1)';
  const profitBorder  = isSurebet ? 'rgba(61,255,143,.25)' : profitPct < -5 ? 'rgba(255,69,69,.25)' : 'rgba(255,191,0,.25)';

  // ── Layout ────────────────────────────────────────────────────────────────

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
                // Reset formula to first option of new group
                const opts = n === 2 ? FORMULA_OPTIONS_2WAY : FORMULA_OPTIONS_3WAY;
                setFormulaVal(opts[0].value);
                if (fixedMode !== 'sum' && (fixedMode as number) >= n) setFixedMode('sum');
              }}
                style={{
                  padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
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

        {/* Profit % badge */}
        <div style={{
          padding: '6px 16px', borderRadius: 8,
          background: profitBg, border: `1px solid ${profitBorder}`,
          textAlign: 'center', minWidth: 110,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: profitColor, opacity: .7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isSurebet ? 'Surebet ✓' : 'Lucro'}
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
          display: 'grid',
          gridTemplateColumns: '90px 1fr 1fr 36px 36px 100px',
          gap: 8, padding: '10px 14px',
          background: 'rgba(255,255,255,.03)',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: 'rgba(148,163,184,.6)',
        }}>
          <span>Desfecho</span>
          <span>Odd</span>
          <span>Stake</span>
          <span style={{ textAlign: 'center' }}>D</span>
          <span style={{ textAlign: 'center' }}>C</span>
          <span style={{ textAlign: 'right' }}>Lucro</span>
        </div>

        {/* Rows */}
        {formulaOpt.labels.slice(0, numOutcomes).map((label, i) => {
          const active  = distribute[i] ?? true;
          const isFixed = fixedMode === i;
          const stake   = result.stakes[i] ?? 0;
          const profit  = result.profits[i] ?? 0;
          const profC   = profit >= 0 ? '#3DFF8F' : '#FF4545';

          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 1fr 36px 36px 100px',
              gap: 8, padding: '10px 14px',
              borderBottom: '1px solid rgba(255,255,255,.04)',
              alignItems: 'center',
              opacity: active ? 1 : 0.4,
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

              {/* Odd input */}
              <input
                style={INPUT}
                inputMode="decimal"
                value={odds[i] ?? ''}
                onChange={e => setOdd(i, e.target.value)}
                placeholder="2.00"
              />

              {/* Stake — editable if this is fixed anchor, otherwise auto */}
              {isFixed ? (
                <input
                  style={{ ...INPUT, border: '1px solid rgba(255,191,0,.4)', color: '#FFBF00' }}
                  inputMode="decimal"
                  value={anchor}
                  onChange={e => setAnchor(e.target.value)}
                />
              ) : (
                <div style={{
                  height: 34, display: 'flex', alignItems: 'center', padding: '0 10px',
                  borderRadius: 7, background: 'rgba(255,255,255,.03)',
                  border: '1px solid rgba(255,255,255,.06)',
                  fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                  color: active ? '#CBD5E1' : '#4B5563',
                }}>
                  {active && stake > 0 ? `R$ ${stake.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                </div>
              )}

              {/* D toggle (distribute) */}
              <button
                onClick={() => toggleDistribute(i)}
                title="Distribuir stake neste desfecho"
                style={{
                  width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'rgba(61,255,143,.15)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${active ? 'rgba(61,255,143,.3)' : 'rgba(255,255,255,.08)'}`,
                  color: active ? '#3DFF8F' : '#4B5563',
                  fontSize: 12, fontWeight: 800,
                }}>
                {active ? '✓' : '–'}
              </button>

              {/* C toggle (fix/anchor this leg's stake) */}
              <button
                onClick={() => toggleFixed(i)}
                title={isFixed ? 'Desfixar stake' : 'Fixar stake deste desfecho'}
                style={{
                  width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isFixed ? 'rgba(255,191,0,.15)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${isFixed ? 'rgba(255,191,0,.4)' : 'rgba(255,255,255,.08)'}`,
                  color: isFixed ? '#FFBF00' : '#4B5563',
                  fontSize: 11, fontWeight: 900,
                }}>
                C
              </button>

              {/* Profit */}
              <span style={{
                textAlign: 'right', fontSize: 12, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: active && stake > 0 ? profC : '#4B5563',
              }}>
                {active && stake > 0 ? fmtBRL(profit) : '—'}
              </span>
            </div>
          );
        })}

        {/* Total row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px 1fr 1fr 36px 36px 100px',
          gap: 8, padding: '10px 14px',
          background: 'rgba(255,255,255,.02)',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'rgba(148,163,184,.5)',
          }}>
            Total
          </span>
          <span />

          {/* Total stake input (when fixedMode === 'sum') */}
          {fixedMode === 'sum' ? (
            <input
              style={{ ...INPUT, border: '1px solid rgba(77,166,255,.4)', color: '#4DA6FF' }}
              inputMode="decimal"
              value={anchor}
              onChange={e => setAnchor(e.target.value)}
            />
          ) : (
            <div style={{
              height: 34, display: 'flex', alignItems: 'center', padding: '0 10px',
              borderRadius: 7, background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.06)',
              fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
              color: '#CBD5E1', fontWeight: 700,
            }}>
              {result.totalBet > 0
                ? `R$ ${result.totalBet.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'}
            </div>
          )}

          {/* D — empty */}
          <span />

          {/* C for "fix total" */}
          <button
            onClick={() => toggleFixed('sum')}
            title="Fixar valor total da aposta"
            style={{
              width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
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
            {result.totalBet > 0 ? fmtBRL(Math.min(...result.profits.filter((_, i) => i < numOutcomes))) : '—'}
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
          disabled={!isSurebet && result.totalBet <= 0}
          style={{
            padding: '10px 22px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: isSurebet
              ? 'linear-gradient(135deg,#3DFF8F,#00BBFF)'
              : 'rgba(255,255,255,.08)',
            color: isSurebet ? '#0D1117' : '#6B7280',
            fontWeight: 800, fontSize: 13,
            opacity: result.totalBet <= 0 ? 0.4 : 1,
          }}>
          + Adicionar ao Painel
        </button>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'D = Distribuir', desc: 'inclui este desfecho no cálculo' },
          { label: 'C = Congelar',   desc: 'fixa o valor desta stake como âncora' },
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
          odds={parsedOdds}
          stakes={result.stakes}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
