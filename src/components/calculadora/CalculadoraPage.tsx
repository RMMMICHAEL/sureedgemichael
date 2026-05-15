'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { SurebetCalc } from '@/components/calcalendario/SurebetCalc';
import { Calculator, TrendingUp, Gift, Percent, Search, X, Building2, Settings2, Zap, ScanSearch } from 'lucide-react';

const SM_COOKIE_KEY = 'sm_cookie';

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtBRL(v: number, showSign = false): string {
  const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (showSign) {
    const s = v < 0 ? '−' : '+';
    return `${s} R$ ${abs}`;
  }
  return `R$ ${abs}`;
}

function fmtPct(v: number): string {
  return `${v.toFixed(2)}%`;
}

// ── Shared UI atoms ────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-black uppercase tracking-[.12em] mb-1.5" style={{ color: 'var(--t3)' }}>
      {children}
    </label>
  );
}

function NumInput({
  value, onChange, placeholder, prefix, step,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  step?: string;
}) {
  return (
    <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)' }}>
      {prefix && (
        <span className="px-3 text-xs font-bold flex-shrink-0" style={{ color: 'var(--t3)', borderRight: '1px solid var(--b)' }}>
          {prefix}
        </span>
      )}
      <input
        type="number"
        value={value}
        step={step ?? 'any'}
        placeholder={placeholder ?? '0'}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-transparent px-3 py-2.5 text-sm font-semibold outline-none"
        style={{ color: 'var(--t)' }}
      />
    </div>
  );
}

function ResultCard({
  label, value, sub, accent = 'var(--g)',
}: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl p-3"
      style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)' }}
    >
      <span className="text-[9px] uppercase tracking-[.14em] font-black" style={{ color: 'var(--t3)' }}>{label}</span>
      <span className="text-lg font-black leading-none" style={{ color: accent }}>{value}</span>
      {sub && <span className="text-[10px] font-medium" style={{ color: 'var(--t3)' }}>{sub}</span>}
    </div>
  );
}

function SectionCard({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
    >
      {title && (
        <h3 className="text-sm font-black" style={{ color: 'var(--t)' }}>{title}</h3>
      )}
      {children}
    </div>
  );
}

// ── Tab: Odd Aumentada ─────────────────────────────────────────────────────────
// Odd boosted (A) vs lay/hedge (B). Given stake_a and cashback%, find stake_b
// that equalises profit. Formula: stake_b = stake_a * (odd_a - 1 - cb) / (odd_b - 1)
// Profit if A wins = stake_a * cb  (the boosted portion)
// Profit if B wins = same (by construction)

function OddAumentadaTab() {
  const [oddA, setOddA] = useState('');
  const [oddB, setOddB] = useState('');
  const [stakeA, setStakeA] = useState('');
  const [cb, setCb] = useState('');

  const result = useMemo(() => {
    const oa = parseFloat(oddA);
    const ob = parseFloat(oddB);
    const sa = parseFloat(stakeA);
    const c  = parseFloat(cb) / 100;
    if (!oa || !ob || !sa || oa <= 1 || ob <= 1) return null;
    // equal-profit formula (treating cashback as reducing the boosted stake's effective cost)
    // simple equal-profit: stake_b so that profit is the same in both outcomes
    // if A wins: +sa*(oa-1) - stake_b  = profit
    // if B wins: +stake_b*(ob-1) - sa  = profit
    // => stake_b = sa * oa / ob  (without cashback)
    // with cashback on stake_a: effective stake_a cost = sa * (1 - c)
    // => equal profit: sa*(oa-1) - stake_b = stake_b*(ob-1) - sa*(1-c)
    //    sa*oa - sa - stake_b = stake_b*ob - stake_b - sa + sa*c
    //    sa*oa - sa*c = stake_b*ob
    //    stake_b = sa*(oa - c) / ob
    const cb_frac = isNaN(c) ? 0 : c;
    const stakeB = sa * (oa - cb_frac) / ob;
    const profitAWins = sa * (oa - 1) - stakeB;
    const profitBWins = stakeB * (ob - 1) - sa;
    const eff = Math.min(profitAWins, profitBWins);
    const roi = (eff / (sa + stakeB)) * 100;
    return { stakeB, profitAWins, profitBWins, eff, roi };
  }, [oddA, oddB, stakeA, cb]);

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <SectionCard title="Entradas">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Odd Aumentada (A)</FieldLabel>
            <NumInput value={oddA} onChange={setOddA} placeholder="ex: 3.50" />
          </div>
          <div>
            <FieldLabel>Odd Proteção (B)</FieldLabel>
            <NumInput value={oddB} onChange={setOddB} placeholder="ex: 2.10" />
          </div>
          <div>
            <FieldLabel>Stake A (R$)</FieldLabel>
            <NumInput value={stakeA} onChange={setStakeA} placeholder="100" prefix="R$" />
          </div>
          <div>
            <FieldLabel>Cashback / Bônus (%)</FieldLabel>
            <NumInput value={cb} onChange={setCb} placeholder="0" prefix="%" />
          </div>
        </div>
      </SectionCard>

      {result ? (
        <SectionCard title="Resultado">
          <div className="grid grid-cols-2 gap-3">
            <ResultCard label="Stake Proteção" value={fmtBRL(result.stakeB)} />
            <ResultCard label="ROI" value={fmtPct(result.roi)} accent={result.roi >= 0 ? 'var(--g)' : 'var(--r)'} />
            <ResultCard
              label="Se A vencer"
              value={fmtBRL(result.profitAWins, true)}
              accent={result.profitAWins >= 0 ? 'var(--g)' : 'var(--r)'}
            />
            <ResultCard
              label="Se B vencer"
              value={fmtBRL(result.profitBWins, true)}
              accent={result.profitBWins >= 0 ? 'var(--g)' : 'var(--r)'}
            />
          </div>
          <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{
            background: result.eff >= 0 ? 'rgba(63,255,33,.07)' : 'rgba(255,77,109,.07)',
            border: `1px solid ${result.eff >= 0 ? 'rgba(63,255,33,.2)' : 'rgba(255,77,109,.2)'}`,
            color: result.eff >= 0 ? 'var(--g)' : 'var(--r)',
          }}>
            Lucro garantido: {fmtBRL(result.eff, true)}
          </div>
        </SectionCard>
      ) : (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t3)' }}>
          Preencha os campos acima para ver o resultado.
        </div>
      )}
    </div>
  );
}

// ── Tab: Extração FreeBet SNR ──────────────────────────────────────────────────
// SNR = Stake Not Returned. Freebet value F, odd_a, odd_b (lay/hedge).
// stake_b = F * (odd_a - 1) / odd_b
// extraction = F * (odd_a - 1) * (odd_b - 1) / odd_b
// extraction% = extraction / F * 100

function FreeBetTab() {
  const [freebet, setFreebet] = useState('');
  const [oddA, setOddA]     = useState('');
  const [oddB, setOddB]     = useState('');

  const result = useMemo(() => {
    const F  = parseFloat(freebet);
    const oa = parseFloat(oddA);
    const ob = parseFloat(oddB);
    if (!F || !oa || !ob || oa <= 1 || ob <= 1) return null;
    const stakeB     = F * (oa - 1) / ob;
    const extraction = F * (oa - 1) * (ob - 1) / ob;
    const pct        = (extraction / F) * 100;
    const profitAWins = F * (oa - 1) - stakeB;   // freebet wins, hedge lost
    const profitBWins = stakeB * (ob - 1);         // hedge wins (freebet lost, but was free)
    return { stakeB, extraction, pct, profitAWins, profitBWins };
  }, [freebet, oddA, oddB]);

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <SectionCard title="Entradas">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Valor da FreeBet (R$)</FieldLabel>
            <NumInput value={freebet} onChange={setFreebet} placeholder="50" prefix="R$" />
          </div>
          <div />
          <div>
            <FieldLabel>Odd FreeBet (A)</FieldLabel>
            <NumInput value={oddA} onChange={setOddA} placeholder="ex: 3.00" />
          </div>
          <div>
            <FieldLabel>Odd Proteção (B)</FieldLabel>
            <NumInput value={oddB} onChange={setOddB} placeholder="ex: 2.00" />
          </div>
        </div>
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--t3)' }}>
          Fórmula SNR — stake não devolvida. O valor da freebet não retorna; só o lucro volta.
        </p>
      </SectionCard>

      {result ? (
        <SectionCard title="Resultado">
          <div className="grid grid-cols-2 gap-3">
            <ResultCard label="Stake Proteção" value={fmtBRL(result.stakeB)} />
            <ResultCard
              label="Extração"
              value={fmtBRL(result.extraction)}
              sub={`${fmtPct(result.pct)} da freebet`}
              accent="var(--g)"
            />
            <ResultCard
              label="Se A vencer"
              value={fmtBRL(result.profitAWins, true)}
              accent={result.profitAWins >= 0 ? 'var(--g)' : 'var(--r)'}
            />
            <ResultCard
              label="Se B vencer"
              value={fmtBRL(result.profitBWins, true)}
              accent={result.profitBWins >= 0 ? 'var(--g)' : 'var(--r)'}
            />
          </div>
          <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{
            background: 'rgba(63,255,33,.07)',
            border: '1px solid rgba(63,255,33,.2)',
            color: 'var(--g)',
          }}>
            Extração garantida: {fmtBRL(result.extraction)} ({fmtPct(result.pct)})
          </div>
        </SectionCard>
      ) : (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t3)' }}>
          Preencha os campos acima para ver o resultado.
        </div>
      )}
    </div>
  );
}

// ── Tab: Cashback ──────────────────────────────────────────────────────────────
// Casa A oferece cashback% se perder. Hedge em casa B.
// stake_b = stake_a * (odd_a - cb_frac) / odd_b
// Profit A wins = stake_a * (odd_a - 1) - stake_b
// Profit B wins = stake_b * (odd_b - 1) - stake_a * (1 - cb_frac)

function CashbackTab() {
  const [oddA, setOddA]   = useState('');
  const [oddB, setOddB]   = useState('');
  const [stakeA, setStakeA] = useState('');
  const [cbPct, setCbPct]  = useState('');

  const result = useMemo(() => {
    const oa = parseFloat(oddA);
    const ob = parseFloat(oddB);
    const sa = parseFloat(stakeA);
    const cb = parseFloat(cbPct) / 100;
    if (!oa || !ob || !sa || isNaN(cb) || oa <= 1 || ob <= 1) return null;
    const stakeB    = sa * (oa - cb) / ob;
    const profitA   = sa * (oa - 1) - stakeB;
    const profitB   = stakeB * (ob - 1) - sa * (1 - cb);
    const eff       = Math.min(profitA, profitB);
    const roi       = (eff / (sa + stakeB)) * 100;
    const cbValue   = sa * cb;
    return { stakeB, profitA, profitB, eff, roi, cbValue };
  }, [oddA, oddB, stakeA, cbPct]);

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <SectionCard title="Entradas">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Odd Casa A</FieldLabel>
            <NumInput value={oddA} onChange={setOddA} placeholder="ex: 2.80" />
          </div>
          <div>
            <FieldLabel>Odd Proteção (B)</FieldLabel>
            <NumInput value={oddB} onChange={setOddB} placeholder="ex: 2.00" />
          </div>
          <div>
            <FieldLabel>Stake A (R$)</FieldLabel>
            <NumInput value={stakeA} onChange={setStakeA} placeholder="100" prefix="R$" />
          </div>
          <div>
            <FieldLabel>Cashback (%)</FieldLabel>
            <NumInput value={cbPct} onChange={setCbPct} placeholder="ex: 10" prefix="%" />
          </div>
        </div>
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--t3)' }}>
          Casa A devolve {cbPct ? cbPct : 'X'}% do stake se a aposta perder. O cashback é incluído no cálculo da proteção.
        </p>
      </SectionCard>

      {result ? (
        <SectionCard title="Resultado">
          <div className="grid grid-cols-2 gap-3">
            <ResultCard label="Stake Proteção" value={fmtBRL(result.stakeB)} />
            <ResultCard label="ROI" value={fmtPct(result.roi)} accent={result.roi >= 0 ? 'var(--g)' : 'var(--r)'} />
            <ResultCard
              label="Se A vencer"
              value={fmtBRL(result.profitA, true)}
              accent={result.profitA >= 0 ? 'var(--g)' : 'var(--r)'}
            />
            <ResultCard
              label="Se B vencer"
              value={fmtBRL(result.profitB, true)}
              sub={`Cashback: ${fmtBRL(result.cbValue)}`}
              accent={result.profitB >= 0 ? 'var(--g)' : 'var(--r)'}
            />
          </div>
          <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{
            background: result.eff >= 0 ? 'rgba(63,255,33,.07)' : 'rgba(255,77,109,.07)',
            border: `1px solid ${result.eff >= 0 ? 'rgba(63,255,33,.2)' : 'rgba(255,77,109,.2)'}`,
            color: result.eff >= 0 ? 'var(--g)' : 'var(--r)',
          }}>
            Lucro garantido: {fmtBRL(result.eff, true)} (ROI {fmtPct(result.roi)})
          </div>
        </SectionCard>
      ) : (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t3)' }}>
          Preencha os campos acima para ver o resultado.
        </div>
      )}
    </div>
  );
}

// ── Cached event type ──────────────────────────────────────────────────────────

interface CachedEvent {
  id: string;
  name: string;
  sport: string;
  league: string;
  start_utc: string;
  house_count: number;
}

// ── Event Search Card ──────────────────────────────────────────────────────────

function EventSearchCard({
  selectedEvent,
  onSelect,
}: {
  selectedEvent: CachedEvent | null;
  onSelect: (ev: CachedEvent | null) => void;
}) {
  const [query,        setQuery]        = useState(selectedEvent?.name ?? '');
  const [events,       setEvents]       = useState<CachedEvent[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [fetchErr,     setFetchErr]     = useState('');
  const [fetchedDate,  setFetchedDate]  = useState('');
  const [open,         setOpen]         = useState(false);
  const [source,       setSource]       = useState<'supermonitor' | 'sportsdb' | ''>('');
  const [showSmSetup,  setShowSmSetup]  = useState(false);
  const [smCookie,     setSmCookie]     = useState('');
  const [smInput,      setSmInput]      = useState('');
  const [dateTime,     setDateTime]     = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const wrapRef    = useRef<HTMLDivElement>(null);
  const setupRef   = useRef<HTMLDivElement>(null);

  // Load stored cookie on mount
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(SM_COOKIE_KEY) ?? '' : '';
    setSmCookie(stored);
    setSmInput(stored);
  }, []);

  // Close setup panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (setupRef.current && !setupRef.current.contains(e.target as Node)) setShowSmSetup(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function loadEvents(date?: string) {
    setLoading(true);
    setFetchErr('');
    setEvents([]);
    setSource('');
    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    try {
      const cookie = (typeof window !== 'undefined' ? localStorage.getItem(SM_COOKIE_KEY) ?? '' : smCookie);

      const res  = await fetch('/api/supermonitor/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cookie, date: targetDate }),
      });
      const json = await res.json() as { ok: boolean; events?: CachedEvent[]; error?: string };

      if (!json.ok) {
        throw new Error(json.error ?? 'Erro ao buscar eventos do SuperMonitor');
      }

      const events = json.events ?? [];
      setEvents(events);
      setFetchedDate(targetDate);
      setSource('supermonitor');
    } catch (e: unknown) {
      setFetchErr((e as Error).message ?? 'Erro ao buscar eventos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEvents(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function saveSmCookie() {
    const val = smInput.trim();
    localStorage.setItem(SM_COOKIE_KEY, val);
    setSmCookie(val);
    setShowSmSetup(false);
    loadEvents(fetchedDate || undefined);
  }

  function clearSmCookie() {
    localStorage.removeItem(SM_COOKIE_KEY);
    setSmCookie('');
    setSmInput('');
    setShowSmSetup(false);
    loadEvents(fetchedDate || undefined);
  }

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtered = useMemo(() => {
    if (!query.trim()) return events.slice(0, 10);
    const q = normalize(query);
    return events.filter(ev => normalize(ev.name).includes(q) || normalize(ev.league ?? '').includes(q)).slice(0, 12);
  }, [events, query]);

  function handleSelect(ev: CachedEvent) {
    onSelect(ev);
    setQuery(ev.name);
    setOpen(false);
  }

  function handleClear() {
    onSelect(null);
    setQuery('');
  }

  function fmtStartTime(utc: string) {
    try { return new Date(utc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return utc; }
  }

  const today = new Date().toISOString().slice(0, 10);
  const isOlderData = fetchedDate && fetchedDate !== today;

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>

      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: 'var(--t3)' }}>
            Buscar Evento
          </span>
          {/* Source badge */}
          {source === 'supermonitor' && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: 'rgba(99,102,241,.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,.3)' }}>
              <Zap size={9} /> SuperMonitor
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-[10px]" style={{ color: 'var(--t3)' }}>Carregando...</span>
          )}
          {!loading && fetchErr && (
            <span className="text-[10px] font-bold" style={{ color: 'var(--r)' }}>⚠ {fetchErr}</span>
          )}
          {!loading && !fetchErr && events.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: isOlderData ? 'rgba(255,159,10,.12)' : 'rgba(63,255,33,.1)', color: isOlderData ? '#FF9F0A' : 'var(--g)', border: `1px solid ${isOlderData ? 'rgba(255,159,10,.25)' : 'rgba(63,255,33,.2)'}` }}>
              {events.length} eventos{isOlderData ? ` · ${fetchedDate}` : ' · hoje'}
            </span>
          )}
          {!loading && !fetchErr && events.length === 0 && (
            <button type="button" onClick={() => loadEvents()}
              className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
              Tentar novamente
            </button>
          )}

          {/* SuperMonitor setup gear */}
          <div className="relative" ref={setupRef}>
            <button
              type="button"
              onClick={() => setShowSmSetup(v => !v)}
              title="Conectar SuperMonitor"
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 26, height: 26,
                background: smCookie ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.06)',
                border: `1px solid ${smCookie ? 'rgba(99,102,241,.35)' : 'var(--b)'}`,
                color: smCookie ? '#818cf8' : 'var(--t3)',
              }}>
              <Settings2 size={12} />
            </button>

            {showSmSetup && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
                background: 'var(--bg)', border: '1px solid var(--b)', borderRadius: 12,
                boxShadow: '0 12px 40px rgba(0,0,0,.6)', padding: 16, width: 320,
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={13} style={{ color: '#818cf8' }} />
                  <span className="text-xs font-black" style={{ color: 'var(--t)' }}>SuperMonitor</span>
                  {smCookie && (
                    <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(63,255,33,.1)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }}>
                      Conectado
                    </span>
                  )}
                </div>
                <p className="text-[11px] mb-3 leading-relaxed" style={{ color: 'var(--t3)' }}>
                  Cole o cookie da sua sessão em <strong style={{ color: 'var(--t2)' }}>painel.supermonitor.pro</strong>.<br />
                  DevTools → Application → Cookies → copie o valor de <code style={{ color: '#818cf8' }}>PHPSESSID</code> (e outros cookies) como: <code style={{ color: '#818cf8', fontSize: 10 }}>PHPSESSID=abc123</code>
                </p>
                <textarea
                  value={smInput}
                  onChange={e => setSmInput(e.target.value)}
                  placeholder="PHPSESSID=abc123; outro_cookie=xyz..."
                  rows={3}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)',
                    borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--t)',
                    outline: 'none', resize: 'vertical', fontFamily: 'monospace',
                    marginBottom: 10,
                  }}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={saveSmCookie}
                    className="flex-1 py-2 rounded-lg text-xs font-bold"
                    style={{ background: 'rgba(99,102,241,.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,.35)' }}>
                    Salvar e reconectar
                  </button>
                  {smCookie && (
                    <button type="button" onClick={clearSmCookie}
                      className="py-2 px-3 rounded-lg text-xs font-bold"
                      style={{ background: 'rgba(255,77,109,.1)', color: 'var(--r)', border: '1px solid rgba(255,77,109,.2)' }}>
                      Remover
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        {/* Event search */}
        <div className="flex-1 min-w-0" ref={wrapRef}>
          <div className="relative">
            <Search size={13} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--t3)', pointerEvents: 'none',
            }} />
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              placeholder={loading ? 'Carregando eventos...' : 'Digite time ou liga...'}
              disabled={loading}
              style={{
                width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)',
                borderRadius: 10, padding: '8px 32px', fontSize: 13, color: 'var(--t)',
                outline: 'none', opacity: loading ? 0.5 : 1,
              }}
              onFocus={e => { setOpen(true); (e.target as HTMLInputElement).style.borderColor = 'rgba(63,255,33,.4)'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--b)'; }}
            />
            {query && (
              <button type="button" onClick={handleClear}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)' }}>
                <X size={13} />
              </button>
            )}

            {/* Dropdown */}
            {open && !loading && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: 4,
                background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,.5)', maxHeight: 260, overflowY: 'auto',
              }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--t3)' }}>
                    {fetchErr ? `Erro: ${fetchErr}` : events.length === 0 ? 'Nenhum evento disponível para esta data.' : 'Nenhum evento corresponde à busca.'}
                  </div>
                ) : (
                  filtered.map(ev => (
                    <button key={ev.id} type="button" onMouseDown={() => handleSelect(ev)}
                      className="flex items-start w-full gap-2 px-3 py-2.5 text-left"
                      style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.05)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate" style={{ color: 'var(--t)' }}>{ev.name}</div>
                        <div className="text-[10px]" style={{ color: 'var(--t3)' }}>
                          {ev.league} · {fmtStartTime(ev.start_utc)}
                        </div>
                      </div>
                      {ev.house_count > 0 && (
                        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                          <Building2 size={10} style={{ color: '#818cf8' }} />
                          <span className="text-[10px] font-bold" style={{ color: '#818cf8' }}>{ev.house_count}</span>
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected event info */}
          {selectedEvent && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold"
                style={{ background: 'rgba(63,255,33,.1)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }}>
                {selectedEvent.league}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--t3)' }}>
                {fmtStartTime(selectedEvent.start_utc)}{selectedEvent.house_count > 0 ? ` · ${selectedEvent.house_count} casas` : ''}
              </span>
            </div>
          )}
        </div>

        {/* DateTime picker */}
        <div className="w-full sm:w-52 shrink-0">
          <label className="block text-[10px] font-black uppercase tracking-[.12em] mb-1.5" style={{ color: 'var(--t3)' }}>
            Data / Hora
          </label>
          <input
            type="datetime-local"
            value={dateTime}
            onChange={e => {
              setDateTime(e.target.value);
              const datePart = e.target.value.slice(0, 10);
              if (datePart && datePart !== fetchedDate) loadEvents(datePart);
            }}
            style={{
              width: '100%', height: 36, background: 'rgba(255,255,255,.04)',
              border: '1px solid var(--b)', borderRadius: 10,
              padding: '0 12px', fontSize: 12, color: 'var(--t)',
              outline: 'none', colorScheme: 'dark',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Buscar Odds Tab ────────────────────────────────────────────────────────────

interface OddEntry {
  house:   string;
  odd:     number;
  pa:      boolean;   // pagamento antecipado
  result:  string;    // '1' | 'X' | '2' | '1X' | '2X' | etc.
}

interface OddsData {
  event:    string;
  date:     string;
  league:   string;
  outcomes: { result: string; label: string; best: { house: string; odd: number; pa: boolean }; all: OddEntry[] }[];
  raw?:     unknown;
}

function parseOddsData(raw: unknown): OddsData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // Log para debug — remover depois
  console.log('[SM search raw]', JSON.stringify(r, null, 2));

  // Tenta montar um objeto normalizado com o que vier
  return {
    event:    String(r.event ?? r.name ?? r.title ?? ''),
    date:     String(r.date ?? r.start ?? r.start_time ?? ''),
    league:   String(r.league ?? r.competition ?? ''),
    outcomes: [],
    raw,
  };
}

function BuscarOddsTab({ selectedEvent }: { selectedEvent: CachedEvent | null }) {
  const [loading,   setLoading]   = useState(false);
  const [oddsData,  setOddsData]  = useState<OddsData | null>(null);
  const [fetchErr,  setFetchErr]  = useState('');
  const [rawData,   setRawData]   = useState<unknown>(null);
  const [totalStake, setTotalStake] = useState('1000');

  async function fetchOdds(event: CachedEvent) {
    setLoading(true);
    setFetchErr('');
    setOddsData(null);
    setRawData(null);
    try {
      const cookie = typeof window !== 'undefined' ? localStorage.getItem(SM_COOKIE_KEY) ?? '' : '';
      const res  = await fetch('/api/supermonitor/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: event.name, cookie }),
      });
      const json = await res.json() as { ok: boolean; data?: unknown; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao buscar odds');
      setRawData(json.data);
      const parsed = parseOddsData(json.data);
      setOddsData(parsed);
    } catch (e: unknown) {
      setFetchErr((e as Error).message ?? 'Erro');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedEvent) fetchOdds(selectedEvent);
  }, [selectedEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedEvent) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <ScanSearch size={28} style={{ color: 'var(--t3)', margin: '0 auto 12px' }} />
        <p className="text-sm font-bold" style={{ color: 'var(--t2)' }}>Selecione um evento acima</p>
        <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>As odds de todas as casas aparecerão aqui</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <p className="text-sm" style={{ color: 'var(--t3)' }}>Buscando odds para <strong style={{ color: 'var(--t)' }}>{selectedEvent.name}</strong>...</p>
      </div>
    );
  }

  if (fetchErr) {
    return (
      <div className="rounded-2xl p-6" style={{ background: 'rgba(255,77,109,.07)', border: '1px solid rgba(255,77,109,.2)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--r)' }}>⚠ {fetchErr}</p>
        <button type="button" onClick={() => fetchOdds(selectedEvent)} className="mt-3 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (rawData) {
    const raw = rawData as Record<string, unknown>;

    // Extrai resultados/mercados do objeto retornado
    // A estrutura real é descoberta aqui — o objeto completo é mostrado
    const keys = Object.keys(raw);

    return (
      <div className="flex flex-col gap-4">
        {/* Cabeçalho do evento */}
        <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <ScanSearch size={16} style={{ color: '#818cf8', flexShrink: 0 }} />
          <div>
            <div className="text-sm font-black" style={{ color: 'var(--t)' }}>{selectedEvent.name}</div>
            <div className="text-[11px]" style={{ color: 'var(--t3)' }}>{selectedEvent.league} · {selectedEvent.start_utc}</div>
          </div>
          <button type="button" onClick={() => fetchOdds(selectedEvent)}
            className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg"
            style={{ background: 'rgba(99,102,241,.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,.3)' }}>
            Atualizar
          </button>
        </div>

        {/* DEBUG — estrutura do retorno */}
        <div className="rounded-2xl p-4 text-[11px] font-mono overflow-auto" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', maxHeight: 400 }}>
          <div className="font-bold mb-2 text-xs" style={{ color: 'var(--t3)' }}>Campos retornados: {keys.join(', ')}</div>
          <pre style={{ color: 'var(--t2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(rawData, null, 2).slice(0, 3000)}
          </pre>
        </div>
      </div>
    );
  }

  return null;
}

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'surebet',  label: 'Surebet',    icon: <Calculator  size={13} strokeWidth={2} /> },
  { id: 'missao',   label: 'Missão',     icon: <Gift        size={13} strokeWidth={2} /> },
  { id: 'odd',      label: 'Aumentadas', icon: <TrendingUp  size={13} strokeWidth={2} /> },
  { id: 'cashback', label: 'Cashback',   icon: <Percent     size={13} strokeWidth={2} /> },
  { id: 'odds',     label: 'Buscar Odds',icon: <ScanSearch  size={13} strokeWidth={2} /> },
] as const;

type TabId = typeof TABS[number]['id'];

// ── Page ───────────────────────────────────────────────────────────────────────

export function CalculadoraPage() {
  const [tab,           setTab]           = useState<TabId>('surebet');
  const [selectedEvent, setSelectedEvent] = useState<CachedEvent | null>(null);

  // Surebet toggle states
  const [togComissoes,  setTogComissoes]  = useState(true);
  const [togAumento,    setTogAumento]    = useState(false);
  const [togCashback,   setTogCashback]   = useState(false);
  const [togArredondar, setTogArredondar] = useState(false);

  function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <label className="relative inline-flex items-center cursor-pointer gap-2">
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div
          className="relative"
          style={{
            width: 36, height: 20, borderRadius: 10,
            background: checked ? 'var(--g)' : 'rgba(255,255,255,.12)',
            transition: 'background .2s',
            flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute', top: 2, left: checked ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: checked ? 'var(--bg)' : 'rgba(255,255,255,.5)',
            transition: 'left .2s',
          }} />
        </div>
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: checked ? 'var(--t)' : 'var(--t3)' }}>
          {label}
        </span>
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--t)' }}>
          Calculadora
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
          Ferramentas de cálculo para arbitragem, promoções e freebets.
        </p>
      </div>

      {/* Event search card */}
      <EventSearchCard selectedEvent={selectedEvent} onSelect={setSelectedEvent} />

      {/* Type selector */}
      <div
        className="flex gap-1 p-1 rounded-xl flex-wrap"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
      >
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={
              tab === t.id
                ? { background: 'rgba(63,255,33,.12)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }
                : { color: 'var(--t3)', border: '1px solid transparent' }
            }
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Toggle options — only shown for Surebet */}
      {tab === 'surebet' && (
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
        >
          <div className="flex flex-wrap items-center gap-5 md:gap-8">
            <Toggle label="Comissões"  checked={togComissoes}  onChange={setTogComissoes}  />
            <Toggle label="Aumento %"  checked={togAumento}    onChange={setTogAumento}    />
            <Toggle label="Cashback"   checked={togCashback}   onChange={setTogCashback}   />
            <Toggle label="Arredondar" checked={togArredondar} onChange={setTogArredondar} />
          </div>
        </div>
      )}

      {/* Tab content */}
      {tab === 'surebet'  && <SurebetCalc />}
      {tab === 'missao'   && <FreeBetTab />}
      {tab === 'odd'      && <OddAumentadaTab />}
      {tab === 'cashback' && <CashbackTab />}
      {tab === 'odds'     && <BuscarOddsTab selectedEvent={selectedEvent} />}
    </div>
  );
}
