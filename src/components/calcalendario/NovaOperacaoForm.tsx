'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Leg, ResultType, OpType } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

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
  'Uxbet','Vaidebet','Vbet','Verabet','Vupibet','Wjcasino','Xpbet','Polymarket',
];

const SPORTS = [
  'Futebol','Futebol Americano','Tênis','Basquete','Hockey no Gelo','Vôlei','Baseball',
  'MMA','Rugby','Esports','E-Futebol','Outros',
];

const SB_RESULTS: ResultType[] = ['Pendente','Green','Red','Meio Green','Meio Red','Devolvido','Cashout'];
const DG_RESULTS: ResultType[] = ['Pendente','Green Antecipado','Green','Red','Cashout'];

// ── Styles ────────────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  height: 34, padding: '0 10px', borderRadius: 7,
  background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
  color: '#E2E8F0', fontSize: 13, width: '100%', outline: 'none',
  fontFamily: "'JetBrains Mono', monospace",
};

const SELECT: React.CSSProperties = {
  ...INPUT, cursor: 'pointer',
  background: '#1A2035', border: '1px solid rgba(255,255,255,.14)',
  colorScheme: 'dark' as React.CSSProperties['colorScheme'],
};

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'rgba(148,163,184,.7)',
  display: 'block', marginBottom: 5,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowBRT(): string {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    .slice(0, 16)
    .replace(' ', 'T');
}

function fmtR(v: number): string {
  const s = v < 0 ? '−' : '+';
  const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s} R$ ${abs}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LegDraft {
  ho: string;
  mk: string;
  od: string;
  st: string;
  re: ResultType;
}

interface Props {
  opType: 'surebet' | 'duplo_green';
}

// ── Result badge colour ────────────────────────────────────────────────────────

const RE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  Green:             { color: '#3DFF8F', bg: 'rgba(61,255,143,.1)',  border: 'rgba(61,255,143,.25)'  },
  'Green Antecipado':{ color: '#3DFF8F', bg: 'rgba(61,255,143,.1)',  border: 'rgba(61,255,143,.25)'  },
  'Meio Green':      { color: '#A7F3D0', bg: 'rgba(167,243,208,.08)', border: 'rgba(167,243,208,.2)'  },
  Red:               { color: '#FF4545', bg: 'rgba(255,69,69,.1)',    border: 'rgba(255,69,69,.25)'   },
  'Meio Red':        { color: '#FCA5A5', bg: 'rgba(252,165,165,.08)', border: 'rgba(252,165,165,.2)'  },
  Devolvido:         { color: '#94A3B8', bg: 'rgba(148,163,184,.08)', border: 'rgba(148,163,184,.2)'  },
  Cashout:           { color: '#FFBF00', bg: 'rgba(255,191,0,.1)',    border: 'rgba(255,191,0,.25)'   },
  Pendente:          { color: '#94A3B8', bg: 'rgba(148,163,184,.06)', border: 'rgba(148,163,184,.15)' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(148,163,184,.55)' }}>
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", color }}>
        {value}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NovaOperacaoForm({ opType }: Props) {
  const addLeg  = useStore(s => s.addLeg);
  const toast   = useStore(s => s.toast);

  const isSB = opType === 'surebet';
  const isDG = opType === 'duplo_green';

  // Surebet supports 2 or 3 legs; Duplo Green always 2
  const [numLegs, setNumLegs] = useState<2 | 3>(2);
  const activeLegs = isDG ? 2 : numLegs;

  const [ev, setEv]   = useState('');
  const [bd, setBd]   = useState(nowBRT());
  const [sp, setSp]   = useState('Futebol');

  const blank = (): LegDraft => ({ ho: '', mk: '', od: '', st: '', re: 'Pendente' });
  const [legs, setLegs] = useState<LegDraft[]>([blank(), blank(), blank()]);
  const [submitted, setSubmitted] = useState(false);

  function upd(i: number, field: keyof LegDraft, val: string) {
    setLegs(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }

  // ── Profit summary ──────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const rows = legs.slice(0, activeLegs);
    const totalBet = rows.reduce((s, l) => s + (parseFloat(l.st.replace(',', '.')) || 0), 0);
    if (totalBet <= 0) return null;

    const stakes = rows.map(l => parseFloat(l.st.replace(',', '.')) || 0);
    const odds   = rows.map(l => parseFloat(l.od.replace(',', '.')) || 0);

    // Profit if leg i wins (and all others lose): return[i] - sum_others
    const profits = rows.map((_, i) => {
      if (!odds[i] || !stakes[i]) return null;
      return odds[i] * stakes[i] - totalBet;
    });

    const validProfits = profits.filter((p): p is number => p !== null);
    if (!validProfits.length) return null;

    const minProfit = Math.min(...validProfits);
    const maxProfit = Math.max(...validProfits);
    const pct       = (minProfit / totalBet) * 100;

    return { totalBet, profits, minProfit, maxProfit, pct };
  }, [legs, activeLegs]);

  // ── Duplo Green special: scenario matrix ────────────────────────────────────
  const dgScenarios = useMemo(() => {
    if (!isDG || !summary) return null;
    const { profits, totalBet } = summary;
    const [p0, p1] = profits;
    if (p0 == null || p1 == null) return null;

    const ambosGreen = p0 + p1 + totalBet; // net if both win: (od0*st0 + od1*st1) - totalBet
    // Actually: if both win, return = (od0*st0 - totalBet) + (od1*st1) = p0 + od1*st1
    // But duplo green is typically two SEPARATE bets, each returns its own profit if it wins
    // "Ambos Green" = both bets win = sum of individual net profits
    const soL1 = p0;  // only leg 1 wins
    const soL2 = p1;  // only leg 2 wins
    const ambos = p0 + p1 + (parseFloat(legs[0].st.replace(',', '.')) || 0) +
                  (parseFloat(legs[1].st.replace(',', '.')) || 0) - totalBet;
    // Simpler: ambos green = (od0*st0 - st0) + (od1*st1 - st1) = (od0-1)*st0 + (od1-1)*st1
    const od0 = parseFloat(legs[0].od.replace(',', '.')) || 0;
    const od1 = parseFloat(legs[1].od.replace(',', '.')) || 0;
    const st0 = parseFloat(legs[0].st.replace(',', '.')) || 0;
    const st1 = parseFloat(legs[1].st.replace(',', '.')) || 0;
    const ambosNet = (od0 - 1) * st0 + (od1 - 1) * st1;

    return { ambosNet, soL1, soL2 };
  }, [isDG, summary, legs]);

  // ── Register ────────────────────────────────────────────────────────────────

  function handleRegister() {
    setSubmitted(true);
    if (!ev.trim()) { toast('Informe o nome do evento', 'wrn'); return; }

    const oid = `op_form_${Date.now()}`;
    let added = 0;

    legs.slice(0, activeLegs).forEach((l, i) => {
      const st = parseFloat(l.st.replace(',', '.'));
      const od = parseFloat(l.od.replace(',', '.'));
      if (!st || !od) return;

      const legLabels = isSB
        ? (activeLegs === 2 ? ['Casa A', 'Casa B'] : ['Casa A', 'Casa B', 'Casa C'])
        : ['Leg 1', 'Leg 2'];

      const leg: Leg = {
        id:      `l_form_${Date.now()}_${i}`,
        oid,
        bd, ed: bd, sp,
        ev:      ev.trim(),
        ho:      l.ho,
        mk:      l.mk.trim() || legLabels[i],
        od,
        st,
        re:      l.re,
        pc:      0,
        pr:      0,
        fl:      [],
        source:  'manual',
        signal:  'pre',
        opType:  opType as OpType,
      };
      addLeg(leg);
      added++;
    });

    if (added === 0) { toast('Preencha pelo menos uma leg com odd e stake', 'wrn'); return; }

    toast(`${isSB ? 'Surebet' : 'Duplo Green'} registrado com sucesso!`, 'ok');

    // Reset
    setEv('');
    setBd(nowBRT());
    setLegs([blank(), blank(), blank()]);
    setSubmitted(false);
  }

  // ── Leg labels / accent colour ───────────────────────────────────────────────

  const legColor   = isSB ? '#4DA6FF' : '#3DFF8F';
  const legBg      = isSB ? 'rgba(77,166,255,.1)'  : 'rgba(61,255,143,.1)';
  const legBorder  = isSB ? 'rgba(77,166,255,.22)' : 'rgba(61,255,143,.22)';
  const btnGradient = isSB
    ? 'linear-gradient(135deg,#3DFF8F,#00BBFF)'
    : 'linear-gradient(135deg,#3DFF8F,#FFBF00)';

  const legLabels = isSB
    ? (activeLegs === 2 ? ['Casa A', 'Casa B'] : ['Casa A', 'Casa B', 'Casa C'])
    : ['Leg 1', 'Leg 2'];

  const results = isDG ? DG_RESULTS : SB_RESULTS;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, colorScheme: 'dark' }}>

      {/* ── Event info card ─────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 14, padding: '16px 18px',
      }}>
        <p style={{ ...LABEL, marginBottom: 12, fontSize: 10, color: 'rgba(148,163,184,.5)' }}>
          Informações do Evento
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 190px 160px', gap: 12, alignItems: 'end' }}>
          <label>
            <span style={LABEL}>Evento *</span>
            <input
              style={{ ...INPUT, borderColor: submitted && !ev.trim() ? 'rgba(255,69,69,.5)' : INPUT.border as string }}
              value={ev}
              onChange={e => setEv(e.target.value)}
              placeholder="Ex: Flamengo vs Palmeiras"
            />
          </label>
          <label>
            <span style={LABEL}>Data / Hora</span>
            <input type="datetime-local" style={INPUT} value={bd} onChange={e => setBd(e.target.value)} />
          </label>
          <label>
            <span style={LABEL}>Esporte</span>
            <select style={SELECT} value={sp} onChange={e => setSp(e.target.value)}>
              {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>

        {/* Surebet: 2/3 leg selector */}
        {isSB && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <span style={{ ...LABEL, marginBottom: 0, color: 'rgba(148,163,184,.5)', fontSize: 10 }}>Nº de casas:</span>
            {([2, 3] as const).map(n => (
              <button key={n} onClick={() => setNumLegs(n)}
                style={{
                  padding: '4px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: numLegs === n ? 'rgba(77,166,255,.18)' : 'rgba(255,255,255,.04)',
                  color:      numLegs === n ? '#4DA6FF' : '#6B7280',
                  border:     `1px solid ${numLegs === n ? 'rgba(77,166,255,.3)' : 'rgba(255,255,255,.08)'}`,
                }}>
                {n} Casas
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Leg cards ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {legs.slice(0, activeLegs).map((leg, i) => {
          const reStyle = RE_STYLE[leg.re] ?? RE_STYLE['Pendente'];
          const profit  = summary?.profits[i];
          const profC   = profit == null ? '#4B5563' : profit >= 0 ? '#3DFF8F' : '#FF4545';

          return (
            <div key={i} style={{
              background: 'rgba(255,255,255,.025)',
              border: `1px solid ${legBorder}`,
              borderRadius: 12, padding: '14px 16px',
              position: 'relative',
            }}>

              {/* Leg header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em',
                  color: legColor, background: legBg, border: `1px solid ${legBorder}`,
                  padding: '3px 12px', borderRadius: 6,
                }}>
                  {legLabels[i]}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Resultado badge */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                    color: reStyle.color, background: reStyle.bg, border: `1px solid ${reStyle.border}`,
                  }}>
                    {leg.re}
                  </span>
                  {/* Live profit */}
                  {profit != null && (
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: profC }}>
                      {fmtR(profit)}
                    </span>
                  )}
                </div>
              </div>

              {/* Fields grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 110px 145px', gap: 10 }}>
                <label>
                  <span style={LABEL}>Casa</span>
                  <select style={SELECT} value={leg.ho} onChange={e => upd(i, 'ho', e.target.value)}>
                    <option value="">Selecionar casa...</option>
                    {ALL_HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>

                <label>
                  <span style={LABEL}>Mercado / Desfecho</span>
                  <input
                    style={INPUT}
                    value={leg.mk}
                    onChange={e => upd(i, 'mk', e.target.value)}
                    placeholder="Ex: 1X2 Visitante"
                  />
                </label>

                <label>
                  <span style={LABEL}>Odd</span>
                  <input
                    style={INPUT}
                    inputMode="decimal"
                    value={leg.od}
                    onChange={e => upd(i, 'od', e.target.value)}
                    placeholder="2.00"
                  />
                </label>

                <label>
                  <span style={LABEL}>Stake (R$)</span>
                  <input
                    style={INPUT}
                    inputMode="decimal"
                    value={leg.st}
                    onChange={e => upd(i, 'st', e.target.value)}
                    placeholder="100.00"
                  />
                </label>

                <label>
                  <span style={LABEL}>Resultado</span>
                  <select style={SELECT} value={leg.re} onChange={e => upd(i, 're', e.target.value as ResultType)}>
                    {results.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Summary + register ──────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 14, padding: '16px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 20, flexWrap: 'wrap',
      }}>

        {summary ? (
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <StatChip
              label="Total apostado"
              value={`R$ ${summary.totalBet.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              color="#E2E8F0"
            />

            {isSB && (
              <>
                <StatChip
                  label="Lucro mín garantido"
                  value={`${summary.minProfit >= 0 ? '+' : '−'} R$ ${Math.abs(summary.minProfit).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  color={summary.minProfit >= 0 ? '#3DFF8F' : '#FF4545'}
                />
                <StatChip
                  label="% lucro"
                  value={`${summary.pct >= 0 ? '+' : ''}${summary.pct.toFixed(2)}%`}
                  color={summary.pct >= 0 ? '#3DFF8F' : '#FFBF00'}
                />
              </>
            )}

            {isDG && dgScenarios && (
              <>
                <StatChip
                  label="Ambos Green"
                  value={`${dgScenarios.ambosNet >= 0 ? '+' : '−'} R$ ${Math.abs(dgScenarios.ambosNet).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  color={dgScenarios.ambosNet >= 0 ? '#3DFF8F' : '#FF4545'}
                />
                <div>
                  <span style={{ ...LABEL, marginBottom: 4 }}>Se apenas 1 green</span>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[dgScenarios.soL1, dgScenarios.soL2].map((p, idx) => (
                      <span key={idx} style={{
                        fontSize: 13, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace",
                        color: p != null && p >= 0 ? '#FFBF00' : '#FF4545',
                      }}>
                        L{idx + 1}: {p == null ? '—' : fmtR(p)}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: '#4B5563' }}>
            Preencha odds e stakes para ver o resumo
          </span>
        )}

        <button
          onClick={handleRegister}
          style={{
            padding: '12px 28px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: btnGradient,
            color: '#0D1117', fontWeight: 800, fontSize: 13,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
          {isSB ? '+ Registrar Surebet' : '+ Registrar Duplo Green'}
        </button>
      </div>
    </div>
  );
}
