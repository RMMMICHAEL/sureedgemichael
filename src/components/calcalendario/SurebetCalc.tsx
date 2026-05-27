'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
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

function nowBRT(): string {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    .slice(0, 16)
    .replace(' ', 'T');
}

export const ALL_HOUSES = [
  // números / símbolos
  '1praum','6zbet','7Games','9dbet','9fbet',
  // A
  'Afunbet','Alfabet','Aposta1','Apostabet','Apostaganha','ApostaMax','Apostar','Apostefacil','ApostaTudo','Aviaobet',
  // B
  'B1Bet','B2x','Bateubet',
  'Bet365','Bet365Arg','Bet365Pe','Bet4','Bet7k','Betagora','Betaki','Betano','Betao',
  'Betbet','Betboo','Betboom','Betbra','BetDaSorte','Betesporte',
  'Betfair','BetfairEx','BetfairSB','Betfast','Betfusion','Betbufalos','Betfalcons','Betgorillas',
  'BetMGM','Betnacional','Betonline','Betou','Betpark','Betpix365','Betpontobet','Betsson','Betsul',
  'BetVip','Betwarrior','Betway','Bigbet','Blaze','Bolsadeaposta',
  'BR4Bet','BrasildaSorte','Bravobet','Brbet','BRXBet','Bullsbet',
  // C
  'Casadeapostas','Cassinopix','Cgc',
  // D
  'Donaldbet','Donosdabola',
  // E
  'Esporte365','Esportedasorte','Esportenetbet','Esportenetsp','Esportivabet','Estrelabet',
  // F
  'F12bet','Faz1bet','Fortunejack','Fullbet',
  // G
  'Ganheibet','Geralbet','Goldebet',
  // H
  'H2Bet',
  // I
  'Icebet','Ijogo',
  // J
  'JogoDeOuro','Jogaobet','Jonbet',
  // K
  'Kingpanda','KTO',
  // L
  'Lancedesorte','Liderbet','Lotogreen','Lottoland','Lottu','Luckbet','Luvabet',
  // M
  'Marjosports','Maximabet','MCGames','Meridianbet','Milhao','MMABET','Multbet','Mystake',
  // N
  'Netbet','NoviBet','Nossabet',
  // O
  'Oleybet','Onabet','Outrabet',
  // P
  'Pagol','Pinnacle','Pinnacle.com','Pixbet','Playbet','Polymarket',
  // R
  'R7bet','Realsbet','Reidopitaco','Ricobet','Rivalo',
  // S
  'Segurobet','Seubet','Sortenabet','SorteOnline','Spin',
  'Sportingbet','SportyBet','Sporty','Stake','Starbet','Superbet','Supremabet',
  // T
  'Tivobet','Tradeball',
  // U
  'Ultrabet','UPbet','Uxbet',
  // V
  'Vaidebet','Vbet','Verabet','Versusbet','Vivasorte','Vupi',
  // W–X
  'Wjcasino','Xpbet',
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

// Grid template: Desfecho | COM% | Odd | Stake | D | Freebet | C | Lucro
const COLS          = '90px 96px 1fr 1fr 36px 70px 36px 100px';
const COLS_MOB      = '70px 60px 1fr 1fr 28px 52px 28px 72px';
const COLS_LINKED   = '140px 96px 1fr 1fr 36px 70px 36px 100px';
const COLS_MOB_LINKED = '110px 52px 1fr 1fr 26px 48px 26px 64px';

// ── Add-to-panel modal ────────────────────────────────────────────────────────

interface AddToPanelProps {
  numOutcomes: number;
  formulaOpt: FormulaOption;
  rawOdds: number[];
  commissions: number[];
  stakes: number[];
  onClose: () => void;
  selectedEvent?: { name: string; start_utc: string } | null;
  initialHouses?: string[];
}

function AddToPanelModal({ numOutcomes, formulaOpt, rawOdds, commissions, stakes, onClose, selectedEvent, initialHouses }: AddToPanelProps) {
  const addLeg  = useStore(s => s.addLeg);
  const toastFn = useStore(s => s.toast);
  const allLegs = useStore(s => s.legs);

  // Casas mais usadas pelo usuário — top 8 ordenadas por frequência
  const topHouses = useMemo(() => {
    const freq: Record<string, number> = {};
    allLegs.forEach(l => { if (l.ho) freq[l.ho] = (freq[l.ho] ?? 0) + 1; });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([ho]) => ho);
  }, [allLegs]);

  const restHouses = useMemo(
    () => ALL_HOUSES.filter(h => !topHouses.includes(h)),
    [topHouses]
  );

  const [ev,   setEv]   = useState(selectedEvent?.name ?? '');
  const [bd,   setBd]   = useState(() => {
    if (selectedEvent?.start_utc) {
      try {
        const d = new Date(selectedEvent.start_utc);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16).replace(' ', 'T');
        }
      } catch { /* noop */ }
    }
    return nowBRT();
  });
  const [sp,   setSp]   = useState('Futebol');
  const [opT,  setOpT]  = useState<OpType>('duplo_green');
  const [houses, setHouses] = useState<string[]>(() =>
    Array.from({ length: numOutcomes }, (_, i) => initialHouses?.[i] ?? '')
  );

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
        od:    rawOdds[i] ?? 0,
        cm:    commissions[i] ?? 0,
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
              <option value="duplo_green">Duplo Green</option>
              <option value="surebet">Surebet</option>
              <option value="freebet">Conversão de Freebet</option>
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
                  {topHouses.length > 0 && (
                    <optgroup label="⭐ Mais usadas">
                      {topHouses.map(h => <option key={h} value={h}>{h}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Todas as casas">
                    {restHouses.map(h => <option key={h} value={h}>{h}</option>)}
                  </optgroup>
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

interface SurebetCalcProps {
  selectedEvent?: { name: string; start_utc: string } | null;
  externalFill?: {
    odds: string[];
    houses: string[];
    /** Optional site URLs for each house — renders the label as a clickable link */
    urls?: string[];
    /** Optional favicon URLs for each house */
    favicons?: string[];
  } | null;
  defaultNumOutcomes?: 2 | 3;
}

export function SurebetCalc({ selectedEvent, externalFill, defaultNumOutcomes = 2 }: SurebetCalcProps = {}) {
  const [numOutcomes, setNumOutcomes] = useState<2 | 3>(defaultNumOutcomes);
  const [formulaVal,  setFormulaVal]  = useState(0);
  const [odds,        setOdds]        = useState(['2.10', '1.95', '2.80']);
  const [fixedMode,   setFixedMode]   = useState<'sum' | 0 | 1 | 2>('sum');
  const [anchor,      setAnchor]      = useState('200');
  const [distribute,  setDistribute]  = useState([true, true, true]);
  const [freebet,     setFreebet]     = useState([false, false, false]);
  const [roundEnabled, setRoundEnabled] = useState(false);
  const [roundToStr,  setRoundToStr]  = useState('5');
  const [showAdd,             setShowAdd]             = useState(false);
  const [injectedHouses,     setInjectedHouses]     = useState<string[]>([]);
  const [injectedHouseUrls,  setInjectedHouseUrls]  = useState<string[]>([]);
  const [injectedFavicons,   setInjectedFavicons]   = useState<string[]>([]);

  // Commission per leg (% on winning profit — ex: BetBra = 2.8)
  const [commission, setCommission] = useState(['0', '0', '0']);

  // External fill from BuscarOddsPage / ScannerPage (odd-click or signal fill)
  useEffect(() => {
    if (!externalFill) return;
    // Determine num outcomes from non-empty odds, fallback to array length
    const nonEmpty = externalFill.odds.filter(o => o !== '');
    const n = (nonEmpty.length <= 2 && externalFill.odds.length <= 2 ? 2 : 3) as 2 | 3;
    setNumOutcomes(n);
    const opts = n === 2 ? FORMULA_OPTIONS_2WAY : FORMULA_OPTIONS_3WAY;
    setFormulaVal(opts[0].value);
    setOdds(prev => {
      const next = [...prev];
      externalFill.odds.forEach((o, i) => {
        if (i < 3 && o !== '') next[i] = o; // skip empty — keep existing value
      });
      return next;
    });
    setInjectedHouses(externalFill.houses?.slice(0, n) ?? []);
    setInjectedHouseUrls(externalFill.urls?.slice(0, n) ?? []);
    setInjectedFavicons(externalFill.favicons?.slice(0, n) ?? []);
    setFixedMode('sum');
  }, [externalFill]); // eslint-disable-line react-hooks/exhaustive-deps

  const formulaOptions: FormulaOption[] = numOutcomes === 2
    ? FORMULA_OPTIONS_2WAY
    : FORMULA_OPTIONS_3WAY;

  const safeFormulaVal = useMemo(() => {
    const vals = formulaOptions.map(o => o.value);
    return vals.includes(formulaVal) ? formulaVal : vals[0];
  }, [formulaVal, formulaOptions]);

  const formulaOpt = formulaOptions.find(o => o.value === safeFormulaVal) ?? formulaOptions[0];

  // Effective odds — apply per-leg commission: eff = 1 + (raw − 1) × (1 − comm/100)
  const effectiveOdds = useMemo(() => {
    return Array.from({ length: numOutcomes }, (_, i) => {
      const raw  = parseFloat(odds[i].replace(',', '.')) || 0;
      const comm = parseFloat(commission[i]?.replace(',', '.') || '0') || 0;
      if (comm > 0 && raw > 1) return 1 + (raw - 1) * (1 - comm / 100);
      return raw;
    });
  }, [odds, commission, numOutcomes]);

  const result = useMemo(() => {
    const roundTo = roundEnabled ? (parseFloat(roundToStr) || null) : null;
    const anchorVal = parseFloat(anchor.replace(',', '.')) || 0;
    const dist = distribute.slice(0, numOutcomes);

    // ── Freebet SNR mode ───────────────────────────────────────────────────
    // When any leg is marked freebet: stake is free (SNR — Stake Not Returned).
    // Win: profit = stake × (odd − 1). Loss: no cost (stake was free).
    const hasFB = freebet.slice(0, numOutcomes).some(Boolean);
    if (hasFB) {
      const anchorFBIdx = freebet.findIndex(Boolean);
      const s0 = anchorVal; // value of the freebet
      const od0 = effectiveOdds[anchorFBIdx] ?? 0;
      const stakes: number[] = Array(numOutcomes).fill(0);

      for (let i = 0; i < numOutcomes; i++) {
        if (i === anchorFBIdx) {
          stakes[i] = s0;
        } else if (freebet[i]) {
          // Other freebet legs: equalize with anchor freebet (SNR equal-profit)
          const odi = effectiveOdds[i] ?? 0;
          stakes[i] = (od0 > 1 && odi > 1) ? s0 * (od0 - 1) / (odi - 1) : 0;
        } else {
          // Normal hedge legs: stake derived from freebet SNR formula
          const odi = effectiveOdds[i] ?? 0;
          stakes[i] = (od0 > 1 && odi > 0) ? s0 * (od0 - 1) / odi : 0;
        }
      }

      if (roundTo) {
        for (let i = 0; i < numOutcomes; i++) {
          if (i !== anchorFBIdx) stakes[i] = Math.round(stakes[i] / roundTo) * roundTo;
        }
      }

      const profits: number[] = Array(numOutcomes).fill(0);
      for (let outcome = 0; outcome < numOutcomes; outcome++) {
        let p = 0;
        for (let k = 0; k < numOutcomes; k++) {
          if (k === outcome) {
            // Winning leg: SNR for freebet (odd-1), normal (odd-1) — same net formula
            p += stakes[k] * ((effectiveOdds[k] ?? 0) - 1);
          } else if (!freebet[k]) {
            // Losing normal leg: stake is lost
            p -= stakes[k];
          }
          // Losing freebet leg: no loss (stake was free)
        }
        profits[outcome] = p;
      }

      const totalBet = stakes.reduce((s, v) => s + v, 0);
      // ROI denominator = only real money at risk (non-freebet stakes)
      const realMoney = stakes.reduce((s, v, i) => !freebet[i] ? s + v : s, 0);
      const profitSeq = dist
        .map((d, i) => (d ? profits[i] : undefined))
        .filter((p): p is number => p !== undefined);
      const minProfit = profitSeq.length > 0 ? Math.min(...profitSeq) : 0;
      const base = realMoney > 0.001 ? realMoney : (totalBet > 0.001 ? totalBet : 1);
      const profitPct = (minProfit / base) * 100;

      return { stakes, profits, totalBet, profitPct, margin: 0, isSurebet: minProfit > 0.01 };
    }

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
  }, [effectiveOdds, numOutcomes, formulaOpt, anchor, fixedMode, distribute, freebet, roundEnabled, roundToStr]);

  // Theoretical % — computed from odds alone (anchor=100, no rounding); immune to stake edits
  const theoreticalPct = useMemo(() => {
    const hasFB = freebet.slice(0, numOutcomes).some(Boolean);
    if (hasFB) return result.profitPct; // freebet mode: SNR already accounted for
    const dist = distribute.slice(0, numOutcomes);
    const hasBreakEven = dist.some(d => !d);
    if (hasBreakEven) return result.profitPct;
    return calculate(effectiveOdds, formulaOpt.formula, 100, 'sum', dist, null).profitPct;
  }, [effectiveOdds, numOutcomes, formulaOpt, distribute, freebet, result.profitPct]);

  function setComm(i: number, val: string) {
    setCommission(prev => prev.map((c, idx) => idx === i ? val : c));
  }

  function toggleDistribute(i: number) {
    setDistribute(prev => prev.map((d, idx) => idx === i ? !d : d));
  }

  function toggleFreebet(i: number) {
    setFreebet(prev => {
      const next = prev.map((f, idx) => idx === i ? !f : f);
      const turnedOn = !prev[i];
      if (turnedOn) {
        // Auto-fix this leg so the user can type the freebet value directly
        const cur = result.stakes[i] ?? 0;
        if (cur > 0) setAnchor(cur.toFixed(2));
        setFixedMode(i as 0 | 1 | 2);
      } else if (fixedMode === i) {
        // Return to total-anchor mode
        const tot = result.totalBet > 0 ? result.totalBet.toFixed(2) : anchor;
        setAnchor(tot);
        setFixedMode('sum');
      }
      return next;
    });
  }

  const anyFB = freebet.slice(0, numOutcomes).some(Boolean);

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

  function setOdd(i: number, val: string) {
    setOdds(prev => prev.map((o, idx) => idx === i ? val : o));
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
        {/* eslint-disable-next-line no-nested-ternary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: injectedHouseUrls.some(Boolean)
            ? (isMobile ? COLS_MOB_LINKED : COLS_LINKED)
            : (isMobile ? COLS_MOB : COLS),
          gap: isMobile ? 4 : 8, padding: isMobile ? '8px 10px' : '10px 14px',
          background: 'rgba(255,255,255,.03)',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: 'rgba(148,163,184,.6)',
        }}>
          <span>Casa</span>
          <span style={{ textAlign: 'center' }}>COM%</span>
          <span>Odd</span>
          <span>Stake</span>
          <span style={{ textAlign: 'center' }}>D</span>
          <span style={{ textAlign: 'center', color: anyFB ? '#A855F7' : undefined }}>Freebet</span>
          <span style={{ textAlign: 'center' }}>C</span>
          <span style={{ textAlign: 'right' }}>Lucro</span>
        </div>

        {/* Rows */}
        {formulaOpt.labels.slice(0, numOutcomes).map((label, i) => {
          const active    = distribute[i] ?? true;
          const isFB      = freebet[i] ?? false;
          const isFixed   = fixedMode === i;
          const stake     = result.stakes[i] ?? 0;
          const profit    = result.profits[i] ?? 0;
          const profC     = profit >= 0 ? '#3DFF8F' : '#FF4545';
          const commVal   = parseFloat(commission[i] || '0') || 0;
          const houseName = injectedHouses[i] ?? '';
          const houseUrl  = injectedHouseUrls[i] ?? '';
          const favicon   = injectedFavicons[i] ?? '';
          const hasLink   = !!(houseName && houseUrl);
          const hasLinkedCols = injectedHouseUrls.some(Boolean);

          // Display value for editable stake cell
          const stakeDisplayVal = isFixed
            ? anchor
            : (stake > 0 ? stake.toFixed(2) : '');

          return (
            <div key={i}>
              {/* Main row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: hasLinkedCols
                  ? (isMobile ? COLS_MOB_LINKED : COLS_LINKED)
                  : (isMobile ? COLS_MOB : COLS),
                gap: isMobile ? 4 : 8, padding: isMobile ? '8px 10px' : '10px 14px',
                borderBottom: '1px solid rgba(255,255,255,.04)',
                alignItems: 'center',
                background: isFB ? 'rgba(168,85,247,.025)' : !active ? 'rgba(255,191,0,.02)' : commVal > 0 ? 'rgba(61,255,143,.015)' : 'transparent',
              }}>
                {/* Label / Casa link */}
                {hasLink ? (
                  <a
                    href={houseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Abrir ${houseName}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 8px', borderRadius: 5, fontSize: isMobile ? 10 : 11,
                      fontWeight: 700,
                      background: 'rgba(77,166,255,.1)', color: '#4DA6FF',
                      border: '1px solid rgba(77,166,255,.22)',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: '100%',
                      transition: 'background .12s, border-color .12s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(77,166,255,.2)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(77,166,255,.4)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(77,166,255,.1)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(77,166,255,.22)';
                    }}
                  >
                    {favicon && (
                      <img src={favicon} alt="" width={12} height={12}
                        style={{ borderRadius: 2, flexShrink: 0 }} />
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {houseName}
                    </span>
                    <ExternalLink size={9} style={{ flexShrink: 0, opacity: .7 }} />
                  </a>
                ) : (
                  <span style={{
                    padding: '3px 8px', borderRadius: 5, fontSize: 12, fontWeight: 700,
                    background: 'rgba(77,166,255,.1)', color: '#4DA6FF',
                    border: '1px solid rgba(77,166,255,.18)',
                    textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {houseName || label}
                  </span>
                )}

                {/* COM% — commission input + BetBra preset */}
                {isMobile ? (
                  <input
                    style={{ ...INPUT, height: 28, fontSize: 11, padding: '0 6px', textAlign: 'center' }}
                    inputMode="decimal"
                    value={commission[i] ?? '0'}
                    onChange={e => setComm(i, e.target.value)}
                    placeholder="0"
                    title="Comissão % sobre apostas vencedoras"
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <input
                      style={{ ...INPUT, height: 22, fontSize: 11, padding: '0 6px', textAlign: 'center' }}
                      inputMode="decimal"
                      value={commission[i] ?? '0'}
                      onChange={e => setComm(i, e.target.value)}
                      placeholder="0"
                      title="Comissão % sobre apostas vencedoras"
                    />
                    <button
                      onClick={() => setComm(i, commission[i] === '2.8' ? '0' : '2.8')}
                      title="BetBra — aplica 2.8% de comissão sobre ganhos"
                      style={{
                        height: 18, borderRadius: 4, cursor: 'pointer',
                        background: commission[i] === '2.8' ? 'rgba(61,255,143,.18)' : 'rgba(255,255,255,.04)',
                        border: `1px solid ${commission[i] === '2.8' ? 'rgba(61,255,143,.35)' : 'rgba(255,255,255,.08)'}`,
                        color: commission[i] === '2.8' ? '#3DFF8F' : '#4B5563',
                        fontSize: 8, fontWeight: 900, letterSpacing: '0.04em',
                      }}>
                      BetBra
                    </button>
                  </div>
                )}

                {/* Odd input */}
                <input
                  style={INPUT}
                  inputMode="decimal"
                  value={odds[i] ?? ''}
                  onChange={e => setOdd(i, e.target.value)}
                  placeholder="2.00"
                />

                {/* Stake — sempre editável */}
                <input
                  style={{
                    ...INPUT,
                    border: isFB
                      ? '1px solid rgba(168,85,247,.4)'
                      : isFixed
                        ? '1px solid rgba(255,191,0,.4)'
                        : '1px solid rgba(255,255,255,.1)',
                    color: isFB ? '#A855F7' : isFixed ? '#FFBF00' : '#E2E8F0',
                    cursor: 'text',
                  }}
                  inputMode="decimal"
                  value={stakeDisplayVal}
                  onChange={e => handleStakeInput(i, e.target.value)}
                  onFocus={e => e.target.select()}
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

                {/* Freebet toggle (SNR) */}
                <button
                  onClick={() => toggleFreebet(i)}
                  title={isFB ? 'Desativar freebet — stake real' : 'Ativar Freebet SNR: stake não devolvida se ganhar, sem perda se perder'}
                  style={{
                    width: '100%', height: isMobile ? 24 : 28, borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isFB ? 'rgba(168,85,247,.18)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${isFB ? 'rgba(168,85,247,.5)' : 'rgba(255,255,255,.08)'}`,
                    color: isFB ? '#A855F7' : '#4B5563',
                    fontSize: isMobile ? 8 : 9, fontWeight: 900, letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                  }}>
                  {isMobile ? 'FB' : 'Freebet'}
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

            </div>
          );
        })}

        {/* Total row */}
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? COLS_MOB : COLS,
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

          {/* COM% col placeholder */}
          <span />

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
            onFocus={e => e.target.select()}
            placeholder="0.00"
          />

          {/* D — empty */}
          <span />

          {/* FB — empty */}
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
      <div style={{
        padding: '12px 16px',
        background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {[
          { label: 'COM%',    color: '#FFBF00', desc: 'Comissão sobre apostas vencedoras. Digite o percentual ou clique em "BetBra" para aplicar os 2,8% automaticamente.' },
          { label: 'D',       color: '#3DFF8F', desc: 'Distribui o lucro neste desfecho. Desativar deixa em 0/0 — você cobre o risco sem lucrar se bater.' },
          { label: 'Freebet', color: '#A855F7', desc: 'Freebet SNR: a stake não é devolvida se ganhar e não há perda se perder. Digite o valor da freebet.' },
          { label: 'C',       color: '#4DA6FF', desc: 'Congelar: clique para editar este valor manualmente; clique novamente para liberar o cálculo automático.' },
        ].map(({ label, color, desc }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color, minWidth: 56, flexShrink: 0, paddingTop: 1 }}>{label}</span>
            <span style={{ fontSize: 12, color: 'rgba(148,163,184,.8)', lineHeight: 1.55 }}>{desc}</span>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddToPanelModal
          numOutcomes={numOutcomes}
          formulaOpt={formulaOpt}
          rawOdds={odds.map(o => parseFloat(o.replace(',', '.')) || 0)}
          commissions={commission.map(c => parseFloat(c.replace(',', '.')) || 0)}
          stakes={result.stakes}
          onClose={() => setShowAdd(false)}
          selectedEvent={selectedEvent}
          initialHouses={injectedHouses}
        />
      )}
    </div>
  );
}
