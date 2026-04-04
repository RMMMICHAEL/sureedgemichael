'use client';

import { useState, useMemo, useEffect } from 'react';
import { useStore }   from '@/store/useStore';
import { Button }     from '@/components/ui/Button';
import { Modal }      from '@/components/ui/Modal';
import { groupLegsIntoOps, calcLegProfit } from '@/lib/finance/calculator';
import { currentMonth } from '@/lib/parsers/dateParser';
import {
  Trash2, Plus, AlertTriangle, Zap, Clock, ChevronDown,
  Pencil, Check, X, Copy, Shuffle,
} from 'lucide-react';
import type { Leg, ResultType, OpType } from '@/types';
import { houseFavicon } from '@/lib/bookmakers/logos';

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
  'Uxbet','Vaidebet','Vbet','Verabet','Vupibet','Wjcasino','Xpbet',
];

const SPORTS = [
  'Futebol','Futebol Americano','Tênis','Basquete','Hockey no Gelo','Vôlei','Vôlei de Praia',
  'Baseball','MMA','Rugby','Críquete','Badminton','Boxe','Ciclismo','Corrida de Cavalos',
  'Dardo','Esports','E-Futebol','E-Basquete','E-CS:GO','E-Dota 2','E-LOL','E-Valorant',
  'Futebol Australiano','Futebol de Salão','Golfe','Handebol','Hóquei em Campo',
  'Lacrosse','Lutas','Motociclismo','Natação','Netball','Padel','Polo Aquático',
  'Remo','Rúgbi a 7','Sinuca/Snooker','Skate','Softbol','Squash','Surfe','Table Tennis',
  'Taekwondo','Tênis de Mesa','Tiro com Arco','Triatlo','UFC','Xadrez','Outros',
];

const RESULTS: ResultType[] = ['Pendente','Green','Red','Meio Green','Meio Red','Devolvido'];

// ── Design tokens ─────────────────────────────────────────────────────────────

/** Brand-specific colours for known bookmakers */
const HOUSE_BRAND: Record<string, { color: string; bg: string; border: string }> = {
  'Bet365':       { color: '#22C55E', bg: 'rgba(34,197,94,.14)',    border: 'rgba(34,197,94,.28)' },
  'Bet365Arg':    { color: '#22C55E', bg: 'rgba(34,197,94,.14)',    border: 'rgba(34,197,94,.28)' },
  'Bet365Pe':     { color: '#22C55E', bg: 'rgba(34,197,94,.14)',    border: 'rgba(34,197,94,.28)' },
  'Betano':       { color: '#FF8C35', bg: 'rgba(255,140,53,.14)',   border: 'rgba(255,140,53,.28)' },
  'Pinnacle':     { color: '#94A3B8', bg: 'rgba(100,116,139,.14)',  border: 'rgba(100,116,139,.28)' },
  'Pinnacle.com': { color: '#94A3B8', bg: 'rgba(100,116,139,.14)',  border: 'rgba(100,116,139,.28)' },
  'KTO':          { color: '#38BDF8', bg: 'rgba(14,165,233,.14)',   border: 'rgba(14,165,233,.28)' },
  'Superbet':     { color: '#F87171', bg: 'rgba(248,113,113,.14)',  border: 'rgba(248,113,113,.28)' },
  'Betsson':      { color: '#FB923C', bg: 'rgba(251,146,60,.14)',   border: 'rgba(251,146,60,.28)' },
  'Pixbet':       { color: '#60A5FA', bg: 'rgba(96,165,250,.14)',   border: 'rgba(96,165,250,.28)' },
  'Betsul':       { color: '#818CF8', bg: 'rgba(129,140,248,.14)',  border: 'rgba(129,140,248,.28)' },
  'Betfair Ex':   { color: '#F59E0B', bg: 'rgba(245,158,11,.14)',   border: 'rgba(245,158,11,.28)' },
  'Betfair SB':   { color: '#F59E0B', bg: 'rgba(245,158,11,.14)',   border: 'rgba(245,158,11,.28)' },
  'Vaidebet':     { color: '#4ADE80', bg: 'rgba(74,222,128,.14)',   border: 'rgba(74,222,128,.28)' },
  'Betnacional':  { color: '#FCD34D', bg: 'rgba(252,211,77,.14)',   border: 'rgba(252,211,77,.28)' },
  'Estrelabet':   { color: '#A78BFA', bg: 'rgba(167,139,250,.14)',  border: 'rgba(167,139,250,.28)' },
  'NoviBet':      { color: '#F472B6', bg: 'rgba(244,114,182,.14)',  border: 'rgba(244,114,182,.28)' },
  'SportingBet':  { color: '#60A5FA', bg: 'rgba(0,82,155,.14)',     border: 'rgba(0,82,155,.28)' },
  'SportyBet':    { color: '#FB923C', bg: 'rgba(251,146,60,.14)',   border: 'rgba(251,146,60,.28)' },
  'RealsBet':     { color: '#34D399', bg: 'rgba(52,211,153,.14)',   border: 'rgba(52,211,153,.28)' },
  'Betpix365':    { color: '#818CF8', bg: 'rgba(129,140,248,.14)',  border: 'rgba(129,140,248,.28)' },
  'Blaze':        { color: '#F97316', bg: 'rgba(249,115,22,.14)',   border: 'rgba(249,115,22,.28)' },
  'Stake':        { color: '#10B981', bg: 'rgba(16,185,129,.14)',   border: 'rgba(16,185,129,.28)' },
  'BetWarrior':   { color: '#FB923C', bg: 'rgba(251,146,60,.14)',   border: 'rgba(251,146,60,.28)' },
  'Betboom':      { color: '#60A5FA', bg: 'rgba(96,165,250,.14)',   border: 'rgba(96,165,250,.28)' },
};

const STATUS_CFG: Record<string, { color: string; bg: string; border: string }> = {
  'Green':      { color: '#00FF88', bg: 'rgba(0,255,136,.08)',    border: 'rgba(0,255,136,.18)' },
  'Red':        { color: '#FF4D4D', bg: 'rgba(255,77,77,.08)',    border: 'rgba(255,77,77,.18)' },
  'Meio Green': { color: '#FFD600', bg: 'rgba(255,214,0,.08)',    border: 'rgba(255,214,0,.18)' },
  'Meio Red':   { color: '#FF8F3D', bg: 'rgba(255,143,61,.08)',   border: 'rgba(255,143,61,.18)' },
  'Devolvido':  { color: '#4DA6FF', bg: 'rgba(77,166,255,.08)',   border: 'rgba(77,166,255,.18)' },
  'Pendente':   { color: 'var(--t3)', bg: 'rgba(0,255,136,.04)', border: 'rgba(0,255,136,.08)' },
};

const OP_TYPE_LABELS: Record<OpType, string> = {
  surebet: 'Surebet', delay: 'Delay', duplo_green: 'Duplo Green', outros: 'Outros',
};

const OP_TYPE_CFG: Record<OpType, { bg: string; color: string; border: string }> = {
  surebet:     { bg: 'rgba(148,163,184,.1)',  color: '#94A3B8', border: 'rgba(148,163,184,.2)' },
  delay:       { bg: 'rgba(77,166,255,.12)',  color: '#4DA6FF', border: 'rgba(77,166,255,.25)' },
  duplo_green: { bg: 'rgba(255,203,47,.12)',  color: '#FFCB2F', border: 'rgba(255,203,47,.25)' },
  outros:      { bg: 'rgba(122,144,176,.08)', color: '#6B7280', border: 'transparent' },
};

// ── Inline style constants ────────────────────────────────────────────────────

const INPUT_S: React.CSSProperties = {
  height: 32, padding: '0 8px', borderRadius: 6,
  background: 'var(--sur)', border: '1px solid var(--b2)',
  color: 'var(--t)', fontSize: 12, width: '100%', outline: 'none',
};
const SELECT_S: React.CSSProperties = {
  ...INPUT_S, background: 'var(--bg3)', cursor: 'pointer',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  const sign = v < 0 ? '−' : '+';
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const [date, time] = iso.split('T');
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y} ${(time || '00:00').slice(0, 5)}`;
}

function sportEmoji(sp: string): string {
  const s = (sp || '').toLowerCase();
  if (s.includes('futebol') || s.includes('soccer'))   return '⚽';
  if (s.includes('tênis')  || s.includes('tenis'))     return '🎾';
  if (s.includes('basquete'))                           return '🏀';
  if (s.includes('hockey'))                             return '🏒';
  if (s.includes('e-') || s.includes('esport'))        return '🎮';
  if (s.includes('volei') || s.includes('vôlei'))      return '🏐';
  if (s.includes('baseball'))                           return '⚾';
  if (s.includes('mma'))                                return '🥊';
  return '🎯';
}

function detectSignal(bd: string, ed: string): 'live' | 'pre' {
  if (!bd || !ed) return 'pre';
  return bd.slice(0, 10) === ed.slice(0, 10) ? 'live' : 'pre';
}

function hBrand(name: string) {
  return HOUSE_BRAND[name] ?? { color: '#6B7280', bg: 'rgba(107,114,128,.12)', border: 'rgba(107,114,128,.2)' };
}

function sCfg(re: string) {
  return STATUS_CFG[re] ?? STATUS_CFG['Pendente'];
}

// ── Micro-components ──────────────────────────────────────────────────────────

/** Brand-coloured house pill with favicon */
function HouseBadge({ name }: { name: string }) {
  const s    = hBrand(name);
  const logo = houseFavicon(name);
  const [imgErr, setImgErr] = useState(false);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap shrink-0"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {logo && !imgErr && (
        <img src={logo} alt="" width={12} height={12} onError={() => setImgErr(true)}
          style={{ borderRadius: 2, objectFit: 'contain', flexShrink: 0 }} />
      )}
      {name || '—'}
    </span>
  );
}

/** Status pill — read-only or editable select */
function StatusPill({
  value, onChange,
}: { value: string; onChange?: (v: ResultType) => void }) {
  const s = sCfg(value);
  if (!onChange) {
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
        style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
      >
        {value}
      </span>
    );
  }
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as ResultType)}
      className="text-xs font-bold rounded-full cursor-pointer"
      style={{
        height: 26, padding: '0 8px',
        background: s.bg, color: s.color,
        border: `1px solid ${s.border}`, outline: 'none',
      }}
    >
      {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}

// ── New Surebet modal (creation only) ─────────────────────────────────────────

interface LegDraft {
  ho: string; mk: string; od: string; st: string; re: ResultType; ed: string;
}
function makeLeg(): LegDraft {
  return { ho: '', mk: '', od: '', st: '', re: 'Pendente', ed: '' };
}

function LegRow({
  n, leg, onChange, onCopyFromPrev, showCopy,
}: {
  n: number; leg: LegDraft; onChange: (l: LegDraft) => void;
  onCopyFromPrev?: () => void; showCopy?: boolean;
}) {
  const set = (k: keyof LegDraft) => (v: string) => onChange({ ...leg, [k]: v });
  const [imgErr, setImgErr] = useState(false);
  const faviconUrl = leg.ho ? houseFavicon(leg.ho) : null;
  return (
    <div className="rounded-xl p-3 flex flex-col gap-2"
      style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {faviconUrl && !imgErr
            ? <img src={faviconUrl} alt="" width={16} height={16} onError={() => setImgErr(true)}
                style={{ borderRadius: 3, objectFit: 'contain', flexShrink: 0 }} />
            : null
          }
          <span className="text-xs font-bold uppercase" style={{ color: leg.ho ? 'var(--t2)' : 'var(--t3)' }}>
            {leg.ho ? leg.ho : `CASA ${n}`}
          </span>
        </div>
        {showCopy && onCopyFromPrev && (
          <button type="button" onClick={onCopyFromPrev}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-slate-400"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
            <Copy size={10} /> Copiar data
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-xs font-bold uppercase text-slate-500">Data do Evento</span>
          <input type="datetime-local" value={leg.ed} onChange={e => set('ed')(e.target.value)}
            className="font-mono" style={INPUT_S} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-slate-500">Casa</span>
          <select value={leg.ho} onChange={e => set('ho')(e.target.value)} style={SELECT_S}>
            <option value="">Qual casa?</option>
            {ALL_HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-slate-500">Mercado</span>
          <input value={leg.mk} onChange={e => set('mk')(e.target.value)}
            placeholder="1X2, Ambos..." style={INPUT_S} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-slate-500">Odd</span>
          <input value={leg.od} onChange={e => set('od')(e.target.value)}
            placeholder="1.85" className="font-mono" style={INPUT_S} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-slate-500">Stake (R$)</span>
          <input value={leg.st} onChange={e => set('st')(e.target.value)}
            placeholder="100,00" className="font-mono" style={INPUT_S} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-slate-500">Resultado</span>
          <select value={leg.re} onChange={e => set('re')(e.target.value as ResultType)} style={SELECT_S}>
            {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

interface OpModalProps { editOid?: string; onClose: () => void; }
function OpModal({ editOid, onClose }: OpModalProps) {
  const addLeg    = useStore(s => s.addLeg);
  const deleteLeg = useStore(s => s.deleteLeg);
  const legs      = useStore(s => s.legs);
  const toastFn   = useStore(s => s.toast);

  const existingLegs = editOid ? legs.filter(l => l.oid === editOid) : [];
  const [sp, setSp]  = useState(existingLegs[0]?.sp ?? 'Futebol');
  const [ev, setEv]  = useState(existingLegs[0]?.ev ?? '');
  const [bd, setBd]  = useState(existingLegs[0]?.bd ?? new Date().toISOString().slice(0, 16));
  const [legDrafts, setLegDrafts] = useState<LegDraft[]>(() =>
    existingLegs.length >= 2
      ? existingLegs.map(l => ({ ho: l.ho, mk: l.mk, od: String(l.od), st: String(l.st), re: l.re, ed: l.ed?.slice(0, 16) ?? '' }))
      : [makeLeg(), makeLeg()]
  );

  function save() {
    if (!ev.trim()) { toastFn('Preencha o evento', 'wrn'); return; }
    if (legDrafts.some(l => !l.ho)) { toastFn('Selecione a casa para cada operação', 'wrn'); return; }
    const oid = editOid ?? `manual_${Date.now()}`;
    if (editOid) existingLegs.forEach(l => deleteLeg(l.id));
    legDrafts.forEach((draft, i) => {
      const edVal = draft.ed || bd;
      const leg: Leg = {
        id: `l_m_${Date.now()}_${i}`, oid, bd, ed: edVal, sp, ev: ev.trim(),
        ho: draft.ho, mk: draft.mk,
        od: parseFloat(draft.od.replace(',', '.')) || 0,
        st: parseFloat(draft.st.replace(',', '.')) || 0,
        re: draft.re, pc: 0, pr: 0, fl: [],
        source: 'manual', signal: detectSignal(bd, edVal), opType: 'surebet',
      };
      leg.pr = calcLegProfit(leg);
      addLeg(leg);
    });
    toastFn(editOid ? 'Operação atualizada' : 'Operação registrada', 'ok');
    onClose();
  }

  return (
    <Modal title={editOid ? 'Editar Surebet' : 'Nova Surebet'} onClose={onClose} size="xl">
      <div className="flex flex-col gap-4">
        {/* Common fields */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase text-slate-500">Esporte</span>
            <select value={sp} onChange={e => setSp(e.target.value)} style={SELECT_S}>
              {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase text-slate-500">Data da Aposta</span>
            <input type="datetime-local" value={bd} onChange={e => setBd(e.target.value)}
              className="font-mono" style={INPUT_S} />
          </label>
          <label className="col-span-2 sm:col-span-1 flex flex-col gap-1">
            <span className="text-xs font-bold uppercase text-slate-500">Evento</span>
            <input value={ev} onChange={e => setEv(e.target.value)}
              placeholder="Ex: Real Madrid vs Barcelona" style={INPUT_S} />
          </label>
        </div>

        <span className="text-xs font-bold uppercase text-slate-500">
          Casas ({legDrafts.length})
        </span>

        {/* First two legs — responsive: stacked on mobile/tablet, side-by-side on large screens */}
        {legDrafts.length >= 2 && (
          <div className="flex flex-col lg:flex-row items-stretch gap-3">
            {/* CASA 1 */}
            <div className="flex-1 min-w-0">
              <LegRow n={1} leg={legDrafts[0]}
                onChange={val => setLegDrafts(prev => prev.map((l, idx) => idx === 0 ? val : l))}
              />
            </div>

            {/* Copy-all button — row on mobile, column on desktop */}
            <div className="flex lg:flex-col items-center justify-center gap-2 lg:gap-1 lg:pt-8 flex-shrink-0">
              <button
                type="button"
                title="Copiar todos os campos de CASA 1 para CASA 2 (exceto Odd e Stake)"
                onClick={() => setLegDrafts(prev => {
                  const src = prev[0];
                  return prev.map((l, idx) => idx === 1
                    ? { ...l, ho: src.ho, mk: src.mk, re: src.re, ed: src.ed }
                    : l
                  );
                })}
                className="flex items-center justify-center gap-2 lg:w-8 lg:h-8 lg:rounded-full rounded-xl px-3 py-1.5 lg:p-0 transition-all duration-200"
                style={{
                  background: 'rgba(63,255,33,.12)',
                  border: '1px solid rgba(63,255,33,.28)',
                  color: '#3FFF21',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(63,255,33,.22)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(63,255,33,.12)'; }}
              >
                <Shuffle size={13} />
                <span className="text-[10px] font-bold uppercase lg:hidden">Copiar CASA 1 → 2</span>
              </button>
              <span className="text-[9px] font-bold uppercase hidden lg:block" style={{ color: 'rgba(63,255,33,.5)' }}>copiar</span>
            </div>

            {/* CASA 2 */}
            <div className="flex-1 min-w-0">
              <LegRow n={2} leg={legDrafts[1]}
                onChange={val => setLegDrafts(prev => prev.map((l, idx) => idx === 1 ? val : l))}
              />
            </div>
          </div>
        )}

        {/* Extra legs stacked */}
        {legDrafts.slice(2).map((leg, extraIdx) => {
          const i = extraIdx + 2;
          return (
            <div key={i} className="relative">
              <LegRow n={i + 1} leg={leg}
                onChange={val => setLegDrafts(prev => prev.map((l, idx) => idx === i ? val : l))}
                showCopy onCopyFromPrev={() =>
                  setLegDrafts(prev => prev.map((l, idx) => idx === i ? { ...l, ed: prev[0].ed } : l))
                }
              />
              <button type="button" onClick={() => setLegDrafts(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute top-3 right-3 w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ color: '#FF4545', background: 'rgba(255,69,69,.12)' }}>
                <Trash2 size={10} />
              </button>
            </div>
          );
        })}

        <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>{editOid ? 'Salvar' : 'Registrar Surebet'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Alt op modal (Delay / Duplo Green / Outros) — simplified profit entry ──────

function AltOpModal({ onClose }: { onClose: () => void }) {
  const addLeg  = useStore(s => s.addLeg);
  const toastFn = useStore(s => s.toast);

  const [ev,     setEv]     = useState('');
  const [bd,     setBd]     = useState(new Date().toISOString().slice(0, 16));
  const opType = 'outros' as const;
  const [profit, setProfit] = useState('');

  function save() {
    const profitVal = parseFloat(profit.replace(',', '.').replace('−', '-'));
    if (isNaN(profitVal)) { toastFn('Informe o lucro/prejuízo', 'wrn'); return; }
    if (!ev.trim())       { toastFn('Preencha a descrição', 'wrn'); return; }

    const oid = `manual_${Date.now()}`;
    const leg: Leg = {
      id: `l_m_${Date.now()}_0`, oid, bd, ed: bd, sp: 'Outros', ev: ev.trim(),
      ho: '', mk: '', od: 0, st: 0, pc: 0, re: profitVal >= 0 ? 'Green' : 'Red',
      pr: profitVal, fl: [], source: 'manual' as const, signal: 'pre' as const,
      opType, manualProfit: profitVal,
    };
    addLeg(leg);
    toastFn('Lucro registrado', 'ok');
    onClose();
  }

  return (
    <Modal title="Registrar Outros Lucros" onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-slate-500">Data</span>
          <input type="datetime-local" value={bd} onChange={e => setBd(e.target.value)}
            className="font-mono" style={INPUT_S} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-slate-500">Descrição</span>
          <input value={ev} onChange={e => setEv(e.target.value)}
            placeholder="Ex: Bônus, Freebets, Promo..." style={INPUT_S} autoFocus />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase text-slate-500">Valor (R$)</span>
          <input value={profit} onChange={e => setProfit(e.target.value)}
            placeholder="+50,00 ou -20,00" className="font-mono" style={INPUT_S} />
        </label>

        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(77,166,255,.08)', color: '#4DA6FF', border: '1px solid rgba(77,166,255,.15)' }}>
          Registra o valor como lucro direto — sem casas ou odds associadas.
        </div>

        <div className="flex justify-end gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>Registrar</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Op card (view + inline edit) ──────────────────────────────────────────────

type Op = ReturnType<typeof groupLegsIntoOps>[number];

interface EditLegDraft {
  id: string; ho: string; mk: string;
  od: string; st: string; re: ResultType; ed: string;
}

function OpCard({
  op, isEditing, onEnterEdit, onExitEdit, onDeleteOp, onChangeResult,
}: {
  op: Op;
  isEditing: boolean;
  onEnterEdit: (oid: string) => void;
  onExitEdit: () => void;
  onDeleteOp: (oid: string) => void;
  onChangeResult: (id: string, re: ResultType) => void;
}) {
  const addLeg    = useStore(s => s.addLeg);
  const deleteLeg = useStore(s => s.deleteLeg);
  const toastFn   = useStore(s => s.toast);

  const [open, setOpen]           = useState(false);
  const [sp,   setSp]             = useState('');
  const [ev,   setEv]             = useState('');
  const [bd,   setBd]             = useState('');
  const [legDrafts, setLegDrafts] = useState<EditLegDraft[]>([]);

  const opType     = (op.legs[0]?.opType ?? 'surebet') as OpType;
  const isAlt      = opType !== 'surebet';
  const { profit } = op;
  const sig        = op.signal ?? detectSignal(op.bet_date, op.legs[0]?.ed ?? '');

  const profitColor = profit > 0 ? '#3DFF8F' : profit < 0 ? '#FF4545' : '#6B7280';
  const profitBg    = profit > 0 ? 'rgba(61,255,143,.12)' : profit < 0 ? 'rgba(255,69,69,.12)' : 'rgba(107,114,128,.08)';

  // Initialise draft state when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setSp(op.sport ?? 'Futebol');
      setEv(op.event ?? '');
      setBd((op.bet_date ?? '').slice(0, 16));
      setLegDrafts(op.legs.map(l => ({
        id:  l.id,
        ho:  l.ho,
        mk:  l.mk,
        od:  l.od ? String(l.od) : '',
        st:  l.manualProfit !== undefined ? '' : (l.st ? String(l.st) : ''),
        re:  l.re,
        ed:  (l.ed || l.bd).slice(0, 16),
      })));
      setOpen(true);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  function setDraft(i: number, patch: Partial<EditLegDraft>) {
    setLegDrafts(prev => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d));
  }

  function handleSave() {
    if (!ev.trim()) { toastFn('Preencha o evento', 'wrn'); return; }

    const oid = op.id;
    op.legs.forEach(l => deleteLeg(l.id));

    legDrafts.forEach((draft, i) => {
      const edVal = draft.ed || bd;
      const leg: Leg = {
        id:     `l_m_${Date.now()}_${i}`,
        oid,
        bd,
        ed:     edVal,
        sp,
        ev:     ev.trim(),
        ho:     draft.ho,
        mk:     draft.mk,
        od:     parseFloat(draft.od.replace(',', '.')) || 0,
        st:     parseFloat(draft.st.replace(',', '.')) || 0,
        re:     draft.re,
        pc:     0,
        pr:     0,
        fl:     [],
        source: 'manual',
        signal: detectSignal(bd, edVal),
        opType,
      };
      leg.pr = calcLegProfit(leg);
      addLeg(leg);
    });

    toastFn('Operação atualizada', 'ok');
    onExitEdit();
  }

  function handleCancel() {
    onExitEdit();
  }

  // ── View: collapsed header ─────────────────────────────────────────────────

  const typeCfg  = OP_TYPE_CFG[opType];
  const hasFlags = op.hasFlag;

  return (
    <div
      className="overflow-hidden transition-all"
      style={{
        background:   'var(--bg2)',
        border:       isEditing ? '1px solid rgba(77,166,255,.35)' : '1px solid var(--b)',
        borderRadius: 12,
        boxShadow:    isEditing ? '0 0 0 1px rgba(77,166,255,.15), 0 4px 24px rgba(0,0,0,.5)' : '0 2px 16px rgba(0,0,0,.3)',
      }}
    >

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{
          background:    'var(--bg3)',
          borderBottom:  open || isEditing ? '1px solid var(--b)' : 'none',
          cursor:        isEditing ? 'default' : 'pointer',
          minHeight:     56,
        }}
        onClick={() => { if (!isEditing) setOpen(v => !v); }}
      >
        {/* Left: sport + date + event */}
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold shrink-0" style={{ color: '#6B7280' }}>
              <span className="mr-1">{sportEmoji(op.sport)}</span>
              {op.sport || '—'}
            </span>
            <span style={{ color: '#374151', fontSize: 10 }}>•</span>
            <span className="text-xs font-mono shrink-0" style={{ color: '#4B5563' }}>
              {fmtDate(op.bet_date)}
            </span>
          </div>
          <p className="text-sm font-semibold truncate" style={{ color: '#E2E8F0' }}>
            {op.event || '—'}
          </p>
        </div>

        {/* Right: badges + actions + profit */}
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>

          {/* Op type badge */}
          <span
            className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded shrink-0"
            style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              background: typeCfg.bg, color: typeCfg.color, border: `1px solid ${typeCfg.border}`,
            }}
          >
            {isAlt
              ? <><Shuffle size={8} />{OP_TYPE_LABELS[opType]}</>
              : <><Zap size={8} />{OP_TYPE_LABELS[opType]}</>
            }
          </span>

          {hasFlags && (
            <span className="flex items-center text-xs px-2 py-0.5 rounded"
              style={{ background: 'rgba(255,203,47,.1)', color: '#FFCB2F' }}>
              <AlertTriangle size={10} />
            </span>
          )}

          {/* Profit chip */}
          <span
            className="text-xs font-bold font-mono px-3 py-1 rounded shrink-0"
            style={{ background: profitBg, color: profitColor, minWidth: 96, textAlign: 'center' }}
          >
            {fmtBRL(profit)}
          </span>

          {/* Edit / Save+Cancel */}
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 transition-all"
                style={{ background: 'rgba(61,255,143,.14)', color: '#3DFF8F', border: '1px solid rgba(61,255,143,.25)' }}
              >
                <Check size={12} /> Salvar
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 transition-all"
                style={{ background: 'rgba(255,255,255,.05)', color: '#9CA3AF', border: '1px solid rgba(255,255,255,.08)' }}
              >
                <X size={12} /> Cancelar
              </button>
              <button
                onClick={() => { if (confirm('Remover esta operação?')) { onDeleteOp(op.id); onExitEdit(); } }}
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ color: '#FF4545', background: 'rgba(255,69,69,.1)' }}
              >
                <Trash2 size={12} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onEnterEdit(op.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
                style={{ color: '#94A3B8', background: 'rgba(255,255,255,.05)' }}
                title="Editar inline"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => { if (confirm('Remover esta operação?')) onDeleteOp(op.id); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
                style={{ color: '#FF4545', background: 'rgba(255,69,69,.08)' }}
                title="Excluir"
              >
                <Trash2 size={12} />
              </button>
              <ChevronDown
                size={15}
                style={{
                  color: '#4B5563', flexShrink: 0,
                  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Body: view table / edit form ──────────────────────────────────── */}
      {(open || isEditing) && (
        isEditing ? (
          // ── EDIT MODE ─────────────────────────────────────────────────────
          <div className="p-4 flex flex-col gap-4">

            {/* Header fields */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase" style={{ color: '#4B5563' }}>Esporte</span>
                <select value={sp} onChange={e => setSp(e.target.value)} style={SELECT_S}>
                  {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase" style={{ color: '#4B5563' }}>Data da Aposta</span>
                <input type="datetime-local" value={bd} onChange={e => setBd(e.target.value)}
                  className="font-mono" style={INPUT_S} />
              </label>
              <label className="col-span-2 sm:col-span-1 flex flex-col gap-1">
                <span className="text-xs font-bold uppercase" style={{ color: '#4B5563' }}>Evento</span>
                <input value={ev} onChange={e => setEv(e.target.value)}
                  placeholder="Ex: Flamengo vs Palmeiras" style={INPUT_S} />
              </label>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,.05)' }} />

            {/* Per-leg rows */}
            {legDrafts.map((draft, i) => (
              <div key={draft.id} className="rounded-xl p-3 flex flex-col gap-3"
                style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase" style={{ color: '#4B5563' }}>
                    Operação {i + 1}
                  </span>
                  <HouseBadge name={draft.ho || '—'} />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-bold uppercase" style={{ color: '#374151' }}>Data Evento</span>
                    <input type="datetime-local" value={draft.ed}
                      onChange={e => setDraft(i, { ed: e.target.value })}
                      className="font-mono" style={INPUT_S} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-bold uppercase" style={{ color: '#374151' }}>Casa</span>
                    <select value={draft.ho}
                      onChange={e => setDraft(i, { ho: e.target.value })} style={SELECT_S}>
                      <option value="">Selecionar...</option>
                      {ALL_HOUSES.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-bold uppercase" style={{ color: '#374151' }}>Mercado</span>
                    <input value={draft.mk} onChange={e => setDraft(i, { mk: e.target.value })}
                      placeholder="1X2..." style={INPUT_S} />
                  </label>
                  {!isAlt && (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-bold uppercase" style={{ color: '#374151' }}>Odd</span>
                        <input value={draft.od} onChange={e => setDraft(i, { od: e.target.value })}
                          placeholder="1.85" className="font-mono" style={INPUT_S} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-bold uppercase" style={{ color: '#374151' }}>Stake (R$)</span>
                        <input value={draft.st} onChange={e => setDraft(i, { st: e.target.value })}
                          placeholder="100,00" className="font-mono" style={INPUT_S} />
                      </label>
                    </>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-bold uppercase" style={{ color: '#374151' }}>Status</span>
                    <select value={draft.re}
                      onChange={e => setDraft(i, { re: e.target.value as ResultType })}
                      style={{ ...SELECT_S, ...(() => { const s = sCfg(draft.re); return { background: s.bg, color: s.color, border: `1px solid ${s.border}` }; })() }}>
                      {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // ── VIEW MODE ─────────────────────────────────────────────────────
          <div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,.025)' }}>
                    {['Data Evento','Casa','Mercado','Odd','Stake','%','Status'].map(h => (
                      <th key={h} style={{
                        padding: '7px 12px', fontSize: 10, fontWeight: 700,
                        color: '#374151', letterSpacing: '.07em', textTransform: 'uppercase',
                        textAlign: 'left', whiteSpace: 'nowrap',
                        borderBottom: '1px solid rgba(255,255,255,.05)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {op.legs.map((leg, i) => (
                    <tr key={leg.id}
                      style={{ background: i % 2 === 1 ? 'rgba(255,255,255,.015)' : 'transparent' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,.03)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 1 ? 'rgba(255,255,255,.015)' : 'transparent'; }}
                    >
                      <td style={{ padding: '9px 12px', fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        {fmtDate(leg.ed || leg.bd)}
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        <HouseBadge name={leg.ho} />
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: '#9CA3AF', maxWidth: 180, borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        <span className="truncate block" title={leg.mk}>{leg.mk || '—'}</span>
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: '#E2E8F0', fontFamily: 'monospace', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        {leg.od || '—'}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: '#9CA3AF', fontFamily: 'monospace', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        {leg.manualProfit !== undefined
                          ? <span style={{ color: '#6B7280' }}>manual</span>
                          : `R$ ${(leg.st || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        }
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: '#6B7280', fontFamily: 'monospace', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        {leg.pc > 0 ? `${leg.pc.toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,.04)', overflow: 'visible' }}>
                        <StatusPill value={leg.re}
                          onChange={re => onChangeResult(leg.id, re)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden flex flex-col divide-y divide-white/5">
              {op.legs.map(leg => (
                <div key={leg.id} className="p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <HouseBadge name={leg.ho} />
                    <StatusPill value={leg.re} onChange={re => onChangeResult(leg.id, re)} />
                  </div>
                  <div className="text-xs" style={{ color: '#9CA3AF' }}>
                    {leg.mk || '—'}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs" style={{ color: '#6B7280' }}>
                      {fmtDate(leg.ed || leg.bd)}
                    </span>
                    <span className="font-mono text-xs font-bold" style={{ color: '#E2E8F0' }}>
                      @{leg.od || '—'}
                    </span>
                    <span className="font-mono text-xs" style={{ color: '#9CA3AF' }}>
                      {leg.manualProfit !== undefined
                        ? 'manual'
                        : `R$ ${(leg.st || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
                      }
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function OperationsPage() {
  const legs      = useStore(s => s.legs);
  const deleteLeg = useStore(s => s.deleteLeg);
  const updateLeg = useStore(s => s.updateLeg);
  const toastFn   = useStore(s => s.toast);

  const [showAdd,     setShowAdd]     = useState(false);
  const [showAltAdd,  setShowAltAdd]  = useState(false);
  const [editingOid,  setEditingOid]  = useState<string | null>(null);
  const [search,      setSearch]      = useState('');
  const [onlyFlag,    setOnlyFlag]    = useState(false);
  const [onlyPend,    setOnlyPend]    = useState(false);
  const [filterOpType, setFilterOpType] = useState<OpType | 'all'>('all');
  // Default to current month so the list isn't overwhelmingly long
  const [filterMonth,  setFilterMonth]  = useState(currentMonth());
  const [filterDate,   setFilterDate]   = useState('');

  const allOps = useMemo(() => {
    const sorted = [...legs].sort((a, b) => (b.bd || '').localeCompare(a.bd || ''));
    return groupLegsIntoOps(sorted);
  }, [legs]);

  // ── Open bets summary — current month only ───────────────
  const openStats = useMemo(() => {
    const curMonth    = currentMonth(); // YYYY-MM
    const pendingLegs = legs.filter(l =>
      l.re === 'Pendente' && (l.bd || '').slice(0, 7) === curMonth
    );
    const openOps   = groupLegsIntoOps(pendingLegs);
    const openStake = +pendingLegs.reduce((s, l) => s + (l.st || 0), 0).toFixed(2);
    const estProfit = +pendingLegs.reduce((s, l) => {
      if (l.manualProfit !== undefined) return s + l.manualProfit;
      return s + (l.st || 0) * ((l.od || 1) - 1);
    }, 0).toFixed(2);
    return { count: openOps.length, stake: openStake, estProfit };
  }, [legs]);

  const usedOpTypes = useMemo(() => {
    const types = new Set<OpType>();
    legs.forEach(l => types.add((l.opType ?? 'surebet') as OpType));
    return Array.from(types);
  }, [legs]);

  const ops = useMemo(() => {
    let out = allOps;
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(op =>
        (op.event || '').toLowerCase().includes(q) ||
        (op.sport  || '').toLowerCase().includes(q) ||
        op.legs.some(l => (l.ho || '').toLowerCase().includes(q))
      );
    }
    if (onlyFlag)              out = out.filter(op => op.hasFlag);
    if (onlyPend)              out = out.filter(op => op.pending);
    if (filterOpType !== 'all') {
      out = out.filter(op => (op.legs[0]?.opType ?? 'surebet') === filterOpType);
    }
    if (filterMonth) out = out.filter(op => (op.bet_date || '').slice(0, 7) === filterMonth);
    if (filterDate)  out = out.filter(op => (op.bet_date || '').slice(0, 10) === filterDate);
    return out;
  }, [allOps, search, onlyFlag, onlyPend, filterOpType, filterMonth, filterDate]);

  function handleDeleteOp(oid: string) {
    legs.filter(l => l.oid === oid).forEach(l => deleteLeg(l.id));
    toastFn('Operação removida', 'ok');
  }

  const filterBtn = (active: boolean, label: React.ReactNode, color?: { active: string; activeBg: string; activeBorder: string }) => ({
    className: 'px-3 py-2 rounded-lg text-xs font-bold transition-all',
    style: {
      background: active ? (color?.activeBg ?? 'rgba(77,166,255,.12)') : 'rgba(255,255,255,.04)',
      color:      active ? (color?.active ?? '#4DA6FF') : '#6B7280',
      border: `1px solid ${active ? (color?.activeBorder ?? 'rgba(77,166,255,.2)') : 'rgba(255,255,255,.07)'}`,
    } as React.CSSProperties,
  });

  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* Open bets summary bar */}
      {openStats.count > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>,
              label: 'Saldo em Aberto',
              value: `R$ ${openStats.stake.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
              color: '#FFBF00',
            },
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><rect x="3" y="4" width="6" height="6" rx="1"/></svg>,
              label: 'Entradas Abertas',
              value: String(openStats.count),
              color: '#FFBF00',
            },
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/></svg>,
              label: 'Lucro Aberto Estimado',
              value: `R$ ${openStats.estProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
              color: openStats.estProfit >= 0 ? 'var(--g)' : 'var(--r)',
            },
          ].map((card, i) => (
            <div key={i}
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{ background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.15)' }}
            >
              <span style={{ color: '#FFBF00', flexShrink: 0 }}>{card.icon}</span>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold uppercase truncate" style={{ color: 'rgba(255,191,0,.6)' }}>
                  {card.label}
                </span>
                <span className="text-sm font-black font-mono" style={{ color: card.color }}>
                  {card.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#E2E8F0' }}>Operações</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: '#4B5563' }}>
            {allOps.length} operações · {ops.length} exibidas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAltAdd(true)}>
            <Shuffle size={14} /> Registrar outros lucros
          </Button>
          <Button variant="primary" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Nova Surebet
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar evento, casa, esporte..."
          className="px-3 py-2 rounded-lg text-sm flex-1 min-w-48"
          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', color: '#E2E8F0' }}
        />

        {/* Month filter — pre-filled with current month */}
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          title="Filtrar por mês" className="px-3 py-2 rounded-lg text-sm font-mono"
          style={{
            background: filterMonth ? 'rgba(63,255,33,.08)' : 'rgba(255,255,255,.05)',
            border: `1px solid ${filterMonth ? 'rgba(63,255,33,.25)' : 'rgba(255,255,255,.08)'}`,
            color: filterMonth ? 'var(--g)' : '#E2E8F0',
          }} />

        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          title="Filtrar por data" className="px-3 py-2 rounded-lg text-sm font-mono"
          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', color: '#E2E8F0' }} />

        {/* Ver todos os meses */}
        {filterMonth && (
          <button onClick={() => { setFilterMonth(''); setFilterDate(''); }}
            className="px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap"
            style={{ background: 'rgba(255,255,255,.05)', color: '#94A3B8', border: '1px solid rgba(255,255,255,.08)' }}>
            Ver todos os meses
          </button>
        )}

        {usedOpTypes.length > 1 && (
          <>
            <button {...filterBtn(filterOpType === 'all', 'Todos')} onClick={() => setFilterOpType('all')}>Todos</button>
            {usedOpTypes.map(t => {
              const cfg = OP_TYPE_CFG[t];
              return (
                <button key={t}
                  {...filterBtn(filterOpType === t, OP_TYPE_LABELS[t], { active: cfg.color, activeBg: cfg.bg, activeBorder: cfg.border })}
                  onClick={() => setFilterOpType(t)}>
                  {OP_TYPE_LABELS[t]}
                </button>
              );
            })}
          </>
        )}

        <button
          {...filterBtn(onlyPend, 'Pendentes', { active: '#FFCB2F', activeBg: 'rgba(255,203,47,.12)', activeBorder: 'rgba(255,203,47,.25)' })}
          onClick={() => setOnlyPend(v => !v)}>
          Pendentes
        </button>
        <button
          onClick={() => setOnlyFlag(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
          style={{
            background: onlyFlag ? 'rgba(255,69,69,.1)' : 'rgba(255,255,255,.04)',
            color:      onlyFlag ? '#FF4545' : '#6B7280',
            border: `1px solid ${onlyFlag ? 'rgba(255,69,69,.25)' : 'rgba(255,255,255,.07)'}`,
          }}>
          <AlertTriangle size={11} /> Anomalias
        </button>

        {filterDate && (
          <button onClick={() => setFilterDate('')}
            className="px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: 'rgba(255,69,69,.1)', color: '#FF4545', border: '1px solid rgba(255,69,69,.2)' }}>
            Limpar data
          </button>
        )}
      </div>

      {/* Cards */}
      {ops.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: '#4B5563' }}>
          Nenhuma operação encontrada
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {ops.slice(0, 100).map(op => (
            <OpCard
              key={op.id}
              op={op}
              isEditing={editingOid === op.id}
              onEnterEdit={oid => setEditingOid(oid)}
              onExitEdit={() => setEditingOid(null)}
              onDeleteOp={handleDeleteOp}
              onChangeResult={(id, re) => updateLeg(id, { re })}
            />
          ))}
        </div>
      )}

      {showAdd && <OpModal onClose={() => setShowAdd(false)} />}
      {showAltAdd && <AltOpModal onClose={() => setShowAltAdd(false)} />}
    </div>
  );
}
