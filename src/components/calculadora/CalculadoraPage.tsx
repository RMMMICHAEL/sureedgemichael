'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { SurebetCalc } from '@/components/calcalendario/SurebetCalc';
import { Calculator, TrendingUp, Gift, Percent, Search, X, Building2, ScanSearch } from 'lucide-react';

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
  const [dateTime,     setDateTime]     = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  async function loadEvents(date?: string) {
    setLoading(true);
    setFetchErr('');
    setEvents([]);
    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    try {
      const res  = await fetch('/api/supermonitor/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ date: targetDate }),
      });
      const json = await res.json() as { ok: boolean; events?: CachedEvent[]; error?: string };

      if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar eventos');

      setEvents(json.events ?? []);
      setFetchedDate(targetDate);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? '';
      // Oculta detalhes técnicos — mensagem genérica sempre
      setFetchErr(msg.includes('401') || msg.includes('expirado') || msg.includes('inválido')
        ? 'Serviço temporariamente indisponível. Tente novamente.'
        : 'Não foi possível carregar os eventos.');
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
        <span className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: 'var(--t3)' }}>
          Buscar Evento
        </span>
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
          {!loading && (fetchErr || (!fetchErr && events.length === 0)) && (
            <button type="button" onClick={() => loadEvents()}
              className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
              Tentar novamente
            </button>
          )}
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

// Casas com Pagamento Antecipado (PA)
const PA_SET = new Set([
  'betano','novibet','betvip','betsul','betesporte','brasilbet','betsson','bet365',
  'bet365arg','bet365pe','lotogreen','kto','vivasorte','sportingbet','superbet',
  'apostabet','br4bet','esportesdasorte','esportiva','esportivabet','sortenabet',
  'betmgm','estrelabet','bet7k','jogodeouro','mcgames','meridianbet','meridian',
  'versusbet','vupi','vupibet','vaidebet',
]);

function isPa(house: string): boolean {
  const n = house.toLowerCase().replace(/[\s\-_.]/g, '');
  if (PA_SET.has(n)) return true;
  for (const pa of PA_SET) {
    if (n.length >= 4 && pa.length >= 4 && (n.startsWith(pa) || pa.startsWith(n))) return true;
  }
  return false;
}

// ── BMRow types ────────────────────────────────────────────────────────────────

interface BMRow {
  house:   string;
  pa:      boolean;
  url?:    string;
  mlHome?: number;
  mlDraw?: number;
  mlAway?: number;
  dc1X?:   number;
  dcX2?:   number;
  dc12?:   number;
}

interface ParsedSearch {
  home:   string;
  away:   string;
  date:   string;
  league: string;
  rows:   BMRow[];
}

type ColKey = 'mlHome' | 'mlDraw' | 'mlAway' | 'dc1X' | 'dcX2' | 'dc12';
const ALL_COLS: ColKey[] = ['mlHome', 'mlDraw', 'mlAway', 'dc1X', 'dcX2', 'dc12'];
const COL_LABELS: Record<ColKey, string> = {
  mlHome: '1', mlDraw: 'X', mlAway: '2', dc1X: '1X', dcX2: 'X2', dc12: '12',
};

// ── Parse search results ───────────────────────────────────────────────────────

function parseSearchResults(raw: unknown): ParsedSearch | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const results: Record<string, unknown>[] = Array.isArray(r.results) ? r.results
    : Array.isArray(r.data) ? r.data : [];
  if (!results.length) return null;

  const first = results[0];
  const leagueRaw = first.league;
  const league = typeof leagueRaw === 'object' && leagueRaw !== null
    ? String((leagueRaw as Record<string, unknown>).name ?? '')
    : String(leagueRaw ?? '');

  const houseMap = new Map<string, BMRow>();

  for (const result of results) {
    const bms = result.bookmakers;
    const urls = result.urls as Record<string, string> | undefined;
    if (!bms || typeof bms !== 'object' || Array.isArray(bms)) continue;

    for (const [hn, markets] of Object.entries(bms as Record<string, unknown>)) {
      if (!Array.isArray(markets)) continue;
      let row = houseMap.get(hn);
      if (!row) {
        row = { house: hn, pa: isPa(hn), url: urls?.[hn] };
        houseMap.set(hn, row);
      }
      for (const market of markets as Record<string, unknown>[]) {
        const mName = String(market.name ?? '').toLowerCase();
        const odds = Array.isArray(market.odds) && market.odds.length > 0
          ? (market.odds[0] as Record<string, unknown>) : null;
        if (!odds) continue;

        if (mName === 'ml' || mName === '1x2' || mName === 'moneyline' || mName.includes('resultado')) {
          const h = parseFloat(String(odds.home ?? odds['1'] ?? ''));
          const d = parseFloat(String(odds.draw ?? odds.x ?? ''));
          const a = parseFloat(String(odds.away ?? odds['2'] ?? ''));
          if (!isNaN(h) && h > 1) row.mlHome = h;
          if (!isNaN(d) && d > 1) row.mlDraw = d;
          if (!isNaN(a) && a > 1) row.mlAway = a;
        } else if (mName === 'dc' || mName.includes('double') || mName.includes('dupla')) {
          const x1  = parseFloat(String(odds.dc1X ?? odds['1x'] ?? odds['1X'] ?? ''));
          const x2  = parseFloat(String(odds.dcX2 ?? odds['x2'] ?? odds['X2'] ?? ''));
          const d12 = parseFloat(String(odds.dc12 ?? odds['12'] ?? ''));
          if (!isNaN(x1)  && x1  > 1) row.dc1X  = x1;
          if (!isNaN(x2)  && x2  > 1) row.dcX2  = x2;
          if (!isNaN(d12) && d12 > 1) row.dc12  = d12;
        }
      }
    }
  }

  return {
    home:   String(first.home ?? ''),
    away:   String(first.away ?? ''),
    date:   String(first.date ?? ''),
    league,
    rows: Array.from(houseMap.values()),
  };
}

function getBests(rows: BMRow[]): Record<ColKey, number | undefined> {
  const b: Record<ColKey, number | undefined> = {
    mlHome: undefined, mlDraw: undefined, mlAway: undefined,
    dc1X: undefined, dcX2: undefined, dc12: undefined,
  };
  for (const col of ALL_COLS) {
    const vals = rows.map(r => r[col]).filter(v => v != null && (v as number) > 1) as number[];
    if (vals.length) b[col] = Math.max(...vals);
  }
  return b;
}

// ── Odds table cell ────────────────────────────────────────────────────────────

function OCell({ val, best }: { val?: number; best: boolean }) {
  if (!val || val <= 1) {
    return (
      <td style={{ textAlign: 'center', padding: '5px 6px', fontSize: 11, color: 'rgba(255,255,255,.18)' }}>
        —
      </td>
    );
  }
  return (
    <td style={{
      textAlign: 'center', padding: '5px 6px', fontSize: 12,
      fontWeight: best ? 800 : 500,
      color: best ? 'var(--g)' : 'var(--t2)',
      background: best ? 'rgba(63,255,33,.09)' : undefined,
      fontVariantNumeric: 'tabular-nums',
    }}>
      {val.toFixed(2)}
    </td>
  );
}

// ── Odds table section (SEM PA or COM PA) ──────────────────────────────────────

function OddsSection({
  title, pa, rows, bests,
}: {
  title: string; pa: boolean; rows: BMRow[]; bests: Record<ColKey, number | undefined>;
}) {
  const filtered = [...rows.filter(r => r.pa === pa)].sort((a, b) => {
    const sa = (a.mlHome ?? 0) + (a.mlDraw ?? 0) + (a.mlAway ?? 0);
    const sb = (b.mlHome ?? 0) + (b.mlDraw ?? 0) + (b.mlAway ?? 0);
    return sb - sa;
  });
  if (!filtered.length) return null;

  const accent = pa ? 'rgba(255,159,10,.8)' : 'rgba(63,255,33,.8)';
  const bg     = pa ? 'rgba(255,159,10,.04)' : 'rgba(63,255,33,.04)';

  return (
    <>
      <tr>
        <td colSpan={7} style={{
          padding: '5px 10px', fontSize: 9, fontWeight: 900,
          textTransform: 'uppercase', letterSpacing: '.12em',
          color: accent, background: bg, borderTop: '1px solid var(--b)',
        }}>
          {title} · {filtered.length} casa{filtered.length !== 1 ? 's' : ''}
        </td>
      </tr>
      {filtered.map(row => (
        <tr key={row.house}
          style={{ borderBottom: '1px solid rgba(255,255,255,.035)', transition: 'background .1s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}>
          <td style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, color: 'var(--t2)', whiteSpace: 'nowrap' }}>
            {row.url ? (
              <a href={row.url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'none', transition: 'color .15s' }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = '#818cf8'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = ''; }}>
                {row.house}
              </a>
            ) : row.house}
          </td>
          {ALL_COLS.map(col => (
            <OCell key={col} val={row[col]} best={!!(row[col] && row[col] === bests[col])} />
          ))}
        </tr>
      ))}
    </>
  );
}

// ── 3-way calculator (ML or DC) ────────────────────────────────────────────────

function Calc3Way({
  title, labels, cols, bests,
}: {
  title: string;
  labels: [string, string, string];
  cols: [ColKey, ColKey, ColKey];
  bests: Record<ColKey, number | undefined>;
}) {
  const [odds,  setOdds]  = useState(['', '', '']);
  const [stake, setStake] = useState('1000');

  // Pre-fill with best odds whenever they change
  useEffect(() => {
    setOdds([
      bests[cols[0]] ? bests[cols[0]]!.toFixed(2) : '',
      bests[cols[1]] ? bests[cols[1]]!.toFixed(2) : '',
      bests[cols[2]] ? bests[cols[2]]!.toFixed(2) : '',
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bests[cols[0]], bests[cols[1]], bests[cols[2]]]);

  function setOdd(i: number, v: string) {
    setOdds(prev => prev.map((o, idx) => idx === i ? v : o));
  }

  const result = useMemo(() => {
    const [o1, o2, o3] = odds.map(o => parseFloat(o));
    const s = parseFloat(stake);
    if (!o1 || !o2 || !o3 || !s || o1 <= 1 || o2 <= 1 || o3 <= 1) return null;
    const m = 1/o1 + 1/o2 + 1/o3;
    const s1 = s * (1/o1) / m;
    const s2 = s * (1/o2) / m;
    const s3 = s * (1/o3) / m;
    const profit = s * (1/m - 1);
    const roi = (1/m - 1) * 100;
    return { m, s1, s2, s3, profit, roi, ok: m < 1 };
  }, [odds, stake]);

  const isOk = result?.ok;

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--bg2)', border: `1px solid ${isOk ? 'rgba(63,255,33,.25)' : 'var(--b)'}` }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-black" style={{ color: 'var(--t)' }}>{title}</span>
        {result && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
            style={{
              background: isOk ? 'rgba(63,255,33,.1)' : 'rgba(255,77,109,.08)',
              color: isOk ? 'var(--g)' : 'var(--r)',
              border: `1px solid ${isOk ? 'rgba(63,255,33,.2)' : 'rgba(255,77,109,.2)'}`,
            }}>
            {isOk ? `Surebet ${result.roi.toFixed(2)}%` : `Margem ${(result.m * 100).toFixed(1)}%`}
          </span>
        )}
      </div>

      {/* Odds + stake inputs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {labels.map((lbl, i) => (
          <div key={i}>
            <label className="block text-[9px] font-black uppercase tracking-[.1em] mb-1" style={{ color: 'var(--t3)' }}>
              {lbl}
            </label>
            <input
              type="number" step="any" value={odds[i]}
              onChange={e => setOdd(i, e.target.value)}
              className="w-full bg-transparent text-sm font-bold outline-none rounded-lg px-2.5 py-2"
              style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)', color: 'var(--t)' }}
            />
          </div>
        ))}
        <div>
          <label className="block text-[9px] font-black uppercase tracking-[.1em] mb-1" style={{ color: 'var(--t3)' }}>
            Stake Total
          </label>
          <div className="flex items-center rounded-lg overflow-hidden"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)' }}>
            <span className="px-2 text-[10px] font-bold flex-shrink-0" style={{ color: 'var(--t3)', borderRight: '1px solid var(--b)' }}>R$</span>
            <input
              type="number" step="any" value={stake}
              onChange={e => setStake(e.target.value)}
              className="flex-1 bg-transparent px-2 py-2 text-sm font-bold outline-none"
              style={{ color: 'var(--t)' }}
            />
          </div>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="grid grid-cols-3 gap-2 pt-1">
          {labels.map((lbl, i) => {
            const st = [result.s1, result.s2, result.s3][i];
            return (
              <div key={i} className="rounded-xl p-2.5 text-center"
                style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)' }}>
                <div className="text-[9px] font-black uppercase tracking-[.1em] mb-1" style={{ color: 'var(--t3)' }}>
                  Stake {lbl}
                </div>
                <div className="text-sm font-black" style={{ color: 'var(--t)' }}>
                  {st.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            );
          })}
          <div className="col-span-3 rounded-xl px-3 py-2 text-sm font-bold text-center"
            style={{
              background: isOk ? 'rgba(63,255,33,.07)' : 'rgba(255,255,255,.03)',
              border: `1px solid ${isOk ? 'rgba(63,255,33,.2)' : 'var(--b)'}`,
              color: isOk ? 'var(--g)' : 'var(--t3)',
            }}>
            {isOk
              ? `Lucro garantido: R$ ${result.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `Sem surebet — falta ${((result.m - 1) * 100).toFixed(2)}% de margem`}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main BuscarOddsTab ─────────────────────────────────────────────────────────

function BuscarOddsTab({ selectedEvent }: { selectedEvent: CachedEvent | null }) {
  const [loading,  setLoading]  = useState(false);
  const [parsed,   setParsed]   = useState<ParsedSearch | null>(null);
  const [fetchErr, setFetchErr] = useState('');

  async function fetchOdds(event: CachedEvent) {
    setLoading(true);
    setFetchErr('');
    setParsed(null);
    try {
      const res  = await fetch('/api/supermonitor/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: event.name }),
      });
      const json = await res.json() as { ok: boolean; data?: unknown; error?: string };
      if (!json.ok) throw new Error(json.error ?? '');
      const p = parseSearchResults(json.data);
      if (!p) throw new Error('Nenhuma odd encontrada para este evento');
      setParsed(p);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? '';
      setFetchErr(
        msg === 'Nenhuma odd encontrada para este evento'
          ? msg
          : msg.includes('401') || msg.includes('expirado') || msg.includes('inválido')
            ? 'Serviço temporariamente indisponível. Tente novamente.'
            : 'Não foi possível carregar as odds.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedEvent) fetchOdds(selectedEvent);
  }, [selectedEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!selectedEvent) {
    return (
      <div className="rounded-2xl p-10 text-center flex flex-col items-center gap-3"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <ScanSearch size={32} style={{ color: 'var(--t3)' }} />
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--t2)' }}>Selecione um evento acima</p>
          <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
            As odds de todas as casas aparecerão aqui, divididas por SEM PA e COM PA
          </p>
        </div>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <div className="text-xs mb-2" style={{ color: 'var(--t3)' }}>Buscando odds para</div>
        <div className="text-sm font-black" style={{ color: 'var(--t)' }}>{selectedEvent.name}</div>
        <div className="mt-4 flex justify-center gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-full"
              style={{
                width: 6, height: 6, background: 'var(--g)',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (fetchErr) {
    return (
      <div className="rounded-2xl p-5 flex flex-col gap-3"
        style={{ background: 'rgba(255,77,109,.06)', border: '1px solid rgba(255,77,109,.2)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--r)' }}>⚠ {fetchErr}</p>
        <button type="button" onClick={() => fetchOdds(selectedEvent)}
          className="self-start text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!parsed) return null;

  const bests    = getBests(parsed.rows);
  const semPa    = parsed.rows.filter(r => !r.pa).length;
  const comPa    = parsed.rows.filter(r =>  r.pa).length;

  // Format event date
  let eventDateTime = '';
  try {
    const d = new Date(parsed.date);
    if (!isNaN(d.getTime())) {
      eventDateTime = d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    }
  } catch { /* noop */ }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Event header ── */}
      <div className="rounded-2xl p-4 flex items-center gap-3"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black truncate" style={{ color: 'var(--t)' }}>
            {parsed.home} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>×</span> {parsed.away}
          </div>
          <div className="text-[11px] mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--t3)' }}>
            <span>{parsed.league}</span>
            {eventDateTime && <><span style={{ opacity: .4 }}>·</span><span>{eventDateTime}</span></>}
            <span style={{ opacity: .4 }}>·</span>
            <span>{parsed.rows.length} casas</span>
          </div>
        </div>
        <button type="button" onClick={() => fetchOdds(selectedEvent)}
          className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0"
          style={{ background: 'rgba(99,102,241,.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,.3)' }}>
          Atualizar
        </button>
      </div>

      {/* ── Odds table ── */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}>
          <span className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: 'var(--t3)' }}>
            Odds por Casa
          </span>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span style={{ color: 'rgba(63,255,33,.8)' }}>{semPa} sem PA</span>
            <span style={{ color: 'rgba(255,255,255,.2)' }}>·</span>
            <span style={{ color: 'rgba(255,159,10,.8)' }}>{comPa} com PA</span>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,.025)' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--t3)', whiteSpace: 'nowrap', minWidth: 110 }}>
                  Casa
                </th>
                {(['mlHome','mlDraw','mlAway'] as ColKey[]).map(col => (
                  <th key={col} style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--t3)', minWidth: 48 }}>
                    {COL_LABELS[col]}
                  </th>
                ))}
                <th style={{ padding: '6px 4px', textAlign: 'center', width: 1, borderLeft: '1px solid rgba(255,255,255,.06)' }} />
                {(['dc1X','dcX2','dc12'] as ColKey[]).map(col => (
                  <th key={col} style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.35)', minWidth: 48 }}>
                    {COL_LABELS[col]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <OddsSection title="SEM Pagamento Antecipado" pa={false} rows={parsed.rows} bests={bests} />
              <OddsSection title="COM Pagamento Antecipado" pa={true}  rows={parsed.rows} bests={bests} />
            </tbody>
          </table>
        </div>
        {/* Best odds summary row */}
        <div className="flex items-center gap-4 px-4 py-2.5 flex-wrap"
          style={{ background: 'rgba(63,255,33,.04)', borderTop: '1px solid rgba(63,255,33,.15)' }}>
          <span className="text-[9px] font-black uppercase tracking-[.12em]" style={{ color: 'rgba(63,255,33,.7)' }}>
            Melhores odds
          </span>
          {ALL_COLS.map(col => bests[col] ? (
            <span key={col} className="text-[10px] font-bold" style={{ color: 'var(--t2)' }}>
              <span style={{ color: 'var(--t3)' }}>{COL_LABELS[col]}</span>
              {' '}<span style={{ color: 'var(--g)', fontWeight: 800 }}>{bests[col]!.toFixed(2)}</span>
            </span>
          ) : null)}
        </div>
      </div>

      {/* ── Calculadoras ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Calc3Way
          title="Calculadora ML (1×2)"
          labels={['Casa (1)', 'Empate (X)', 'Fora (2)']}
          cols={['mlHome', 'mlDraw', 'mlAway']}
          bests={bests}
        />
        <Calc3Way
          title="Calculadora DC (Dupla Chance)"
          labels={['1X', 'X2', '12']}
          cols={['dc1X', 'dcX2', 'dc12']}
          bests={bests}
        />
      </div>

    </div>
  );
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
      {tab === 'surebet'  && <SurebetCalc selectedEvent={selectedEvent} />}
      {tab === 'missao'   && <FreeBetTab />}
      {tab === 'odd'      && <OddAumentadaTab />}
      {tab === 'cashback' && <CashbackTab />}
      {tab === 'odds'     && <BuscarOddsTab selectedEvent={selectedEvent} />}
    </div>
  );
}
