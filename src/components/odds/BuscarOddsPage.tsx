'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, X, ScanSearch, ChevronLeft, ChevronRight, ExternalLink, ArrowDown, RefreshCw } from 'lucide-react';
import { SurebetCalc } from '@/components/calcalendario/SurebetCalc';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BookmakerOdds {
  slug:  string;
  name:  string;
  home:  number;
  draw:  number;
  away:  number;
  url:   string;
  /** true = Pagamento Antecipado; false/undefined = pagamento normal */
  is_pa?: boolean;
}

interface OddsSummary {
  match_id:    string;
  home_team:   string;
  away_team:   string;
  start_time:  string;
  league_name: string;
  league_id:   number;
  bookmakers:  BookmakerOdds[];
}

// ─── Casas com Pagamento Antecipado ──────────────────────────────────────────

const PA_SET = new Set([
  'estrelabet','br4bet','esportivabet','jogodeouro','vaidebet',
  'sortenabet','lotogreen','betpix365','f12','vupibet','vupibr',
  'bet7k','esportesdasorte','apostabet','brasilbet',
  'superbet',
]);

function isPa(slug: string): boolean {
  const n = slug.toLowerCase().replace(/[\s\-_.]/g, '');
  for (const pa of PA_SET) {
    if (n === pa || n.startsWith(pa.slice(0, 5)) || pa.startsWith(n.slice(0, 5))) return true;
  }
  return false;
}

// ─── Esportes/ligas excluídos ─────────────────────────────────────────────────

const EXCL_LEAGUE = ['e-futebol','e-soccer','esoccer','futebol virtual','virtual','efootball','cyber','esport','h2h'];

function isExcluded(leagueName: string): boolean {
  const s = leagueName.toLowerCase();
  return EXCL_LEAGUE.some(ex => s.includes(ex));
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

function todayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth()+1)}-${p2(d.getUTCDate())}`;
}
function p2(n: number) { return String(n).padStart(2, '0'); }
function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth()+1)}-${p2(d.getUTCDate())}`;
}
function fmtDayLabel(date: string): string {
  const today = todayBRT();
  if (date === today) return 'Hoje';
  if (date === addDays(today, 1)) return 'Amanhã';
  try {
    return new Date(date + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  } catch { return date; }
}
function fmtTime(utc: string): string {
  try { return new Date(utc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  catch { return utc; }
}

// ─── Slot de calculadora ─────────────────────────────────────────────────────

type OddType = 'home' | 'draw' | 'away';
interface CalcSlot { bk: BookmakerOdds; type: OddType; value: number }

const SLOT_COLORS = ['#3DFF8F', '#4DA6FF', '#FF9F0A'];
const SLOT_LABELS = ['1ª', '2ª', '3ª'];

// ─── Painel de odds ───────────────────────────────────────────────────────────

function EventOddsPanel({
  event,
  onBack,
  onRefresh,
}: {
  event:     OddsSummary;
  onBack:    () => void;
  onRefresh: () => void;
}) {
  const [slots, setSlots] = useState<(CalcSlot | null)[]>([null, null, null]);
  const [calcFill, setCalcFill] = useState<{ odds: string[]; houses: string[]; urls: string[] } | null>(null);
  const [sortCol, setSortCol] = useState<'home' | 'draw' | 'away'>('home');

  useEffect(() => {
    const active = slots.filter(Boolean) as CalcSlot[];
    if (!active.length) { setCalcFill(null); return; }
    setCalcFill({
      odds:   active.map(s => String(s.value)),
      houses: active.map(s => s.bk.name),
      urls:   active.map(s => s.bk.url ?? ''),
    });
  }, [slots]);

  useEffect(() => { setSlots([null, null, null]); }, [event.match_id]);

  function handleOddClick(bk: BookmakerOdds, type: OddType, value: number) {
    if (value <= 1) return;
    setSlots(prev => {
      const existingIdx = prev.findIndex(s => s?.bk.slug === bk.slug && s?.type === type);
      if (existingIdx >= 0) {
        const next = [...prev]; next[existingIdx] = null; return next;
      }
      const emptyIdx = prev.findIndex(s => s === null);
      if (emptyIdx >= 0) {
        const next = [...prev]; next[emptyIdx] = { bk, type, value }; return next;
      }
      return [prev[1], prev[2], { bk, type, value }];
    });
  }

  function slotOf(slug: string, type: OddType) {
    return slots.findIndex(s => s?.bk.slug === slug && s?.type === type);
  }

  const semPa = event.bookmakers.filter(b => !(b.is_pa ?? isPa(b.slug)));
  const comPa = event.bookmakers.filter(b =>  (b.is_pa ?? isPa(b.slug)));

  function bestOf(bks: BookmakerOdds[], key: keyof BookmakerOdds): number {
    const vals = bks.map(b => b[key] as number).filter(v => v > 1);
    return vals.length ? Math.max(...vals) : 0;
  }

  function margin(bks: BookmakerOdds[]): number | null {
    const h = bestOf(bks, 'home'), d = bestOf(bks, 'draw'), a = bestOf(bks, 'away');
    if (!h || !d || !a) return null;
    return (1/h + 1/d + 1/a - 1) * 100;
  }

  const activeSlots = slots.filter(Boolean) as CalcSlot[];
  const eventName   = `${event.home_team} x ${event.away_team}`;

  // ── Odd button ──────────────────────────────────────────────────────────────
  function OddBtn({ bk, type, value, isBest, isSecond }: {
    bk: BookmakerOdds; type: OddType; value: number; isBest: boolean; isSecond: boolean;
  }) {
    const slotIdx = slotOf(bk.slug, type);
    const selected = slotIdx >= 0;
    const slotColor = SLOT_COLORS[slotIdx] ?? SLOT_COLORS[0];

    if (value <= 1) return (
      <div className="flex h-10 w-[72px] items-center justify-center rounded-xl"
        style={{
          background: 'rgba(255,255,255,.025)',
          border: '1px solid rgba(255,255,255,.05)',
        }}>
        <span style={{ color: 'rgba(255,255,255,.12)', fontSize: 12 }}>—</span>
      </div>
    );

    if (selected) {
      return (
        <button
          type="button"
          onClick={() => handleOddClick(bk, type, value)}
          title={`Slot ${slotIdx + 1} — clique para remover`}
          className="relative flex h-10 w-[72px] items-center justify-center rounded-xl font-mono text-sm font-semibold"
          style={{
            background: `${slotColor}22`,
            border: `1px solid ${slotColor}80`,
            color: slotColor,
            boxShadow: `0 0 14px ${slotColor}30, inset 0 1px 0 ${slotColor}20`,
            transition: 'box-shadow 0.2s ease, transform 0.15s ease',
            transform: 'scale(1)',
          }}>
          {value.toFixed(2)}
          <span style={{
            position: 'absolute', top: -5, right: -5,
            width: 15, height: 15, borderRadius: '50%',
            background: slotColor, color: '#060A07',
            fontSize: 8, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{slotIdx + 1}</span>
        </button>
      );
    }

    if (isBest) {
      return (
        <button
          type="button"
          onClick={() => handleOddClick(bk, type, value)}
          title="Melhor odd — adicionar à calculadora"
          className="relative flex h-10 w-[72px] items-center justify-center rounded-xl font-mono text-sm font-black animate-best-odd-glow"
          style={{
            background: 'hsl(150 90% 45% / 0.14)',
            border: '1px solid hsl(150 90% 50% / 0.5)',
            color: 'hsl(150 90% 60%)',
            textShadow: '0 0 10px hsl(150 90% 55% / 0.6)',
            transition: 'box-shadow 0.2s ease, transform 0.15s ease',
          }}>
          {value.toFixed(2)}
        </button>
      );
    }

    if (isSecond) {
      return (
        <button
          type="button"
          onClick={() => handleOddClick(bk, type, value)}
          title="Adicionar à calculadora"
          className="flex h-10 w-[72px] items-center justify-center rounded-xl font-mono text-sm font-semibold"
          style={{
            background: 'hsl(150 70% 45% / 0.07)',
            border: '1px solid hsl(150 70% 45% / 0.22)',
            color: 'hsl(150 60% 58%)',
            transition: 'box-shadow 0.2s ease, transform 0.15s ease',
          }}>
          {value.toFixed(2)}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => handleOddClick(bk, type, value)}
        title="Adicionar à calculadora"
        className="flex h-10 w-[72px] items-center justify-center rounded-xl font-mono text-sm font-semibold"
        style={{
          background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.09)',
          color: 'rgba(255,255,255,.65)',
          transition: 'box-shadow 0.2s ease, background 0.15s ease',
        }}>
        {value.toFixed(2)}
      </button>
    );
  }

  // ── Seção (sem PA / com PA) ──────────────────────────────────────────────────
  function OddsSection({ label, bks, accentColor, isPA }: {
    label: string; bks: BookmakerOdds[]; accentColor: string; isPA: boolean;
  }) {
    if (!bks.length) return null;
    const bests  = { h: bestOf(bks, 'home'), d: bestOf(bks, 'draw'), a: bestOf(bks, 'away') };
    const mgn    = margin(bks);
    const isSure = mgn !== null && mgn < 0;

    const sorted = [...bks].sort((a, b) => {
      const va = a[sortCol] as number ?? 0;
      const vb = b[sortCol] as number ?? 0;
      return vb - va;
    });

    const secondH = [...new Set(bks.map(b => b.home).filter(v => v > 1 && v < bests.h))].sort((a,b)=>b-a)[0] ?? 0;
    const secondD = [...new Set(bks.map(b => b.draw).filter(v => v > 1 && v < bests.d))].sort((a,b)=>b-a)[0] ?? 0;
    const secondA = [...new Set(bks.map(b => b.away).filter(v => v > 1 && v < bests.a))].sort((a,b)=>b-a)[0] ?? 0;

    const cols: { key: 'home'|'draw'|'away'; label: string }[] = [
      { key: 'home', label: 'Casa (1)' },
      { key: 'draw', label: 'Empate (X)' },
      { key: 'away', label: 'Fora (2)' },
    ];

    const accentRgb = isPA ? '255,159,10' : '99,102,241';

    return (
      <div className="overflow-hidden rounded-2xl" style={{
        background: `rgba(${accentRgb},.02)`,
        border: `1px solid rgba(${accentRgb},.18)`,
        boxShadow: `0 4px 24px rgba(0,0,0,.35), 0 0 0 1px rgba(${accentRgb},.06) inset`,
        backdropFilter: 'blur(8px)',
      }}>

        {/* Barra de acento no topo */}
        <div style={{ height: 2, background: `linear-gradient(90deg, rgba(${accentRgb},.9) 0%, rgba(${accentRgb},.3) 60%, transparent 100%)` }} />

        {/* Header da seção */}
        <div className="flex items-center justify-between px-5 py-3" style={{
          background: `linear-gradient(90deg, rgba(${accentRgb},.08) 0%, transparent 70%)`,
          borderBottom: `1px solid rgba(${accentRgb},.12)`,
        }}>
          <div className="flex items-center gap-2.5">
            <div style={{ width: 3, height: 14, borderRadius: 2, background: accentColor }} />
            <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: accentColor }}>{label}</span>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{
              background: `rgba(${accentRgb},.12)`,
              color: accentColor,
              border: `1px solid rgba(${accentRgb},.25)`,
            }}>
              {bks.length} casas
            </span>
          </div>
          {mgn !== null && (
            <span className="rounded-md px-2.5 py-1 text-[11px] font-bold tabular-nums" style={isSure ? {
              background: 'rgba(61,255,143,.12)',
              color: 'hsl(150 90% 58%)',
              border: '1px solid rgba(61,255,143,.3)',
              boxShadow: '0 0 10px rgba(61,255,143,.15)',
            } : {
              color: 'rgba(255,255,255,.3)',
            }}>
              {isSure ? `🎯 Surebet +${Math.abs(mgn).toFixed(2)}%` : `margem ${mgn.toFixed(1)}%`}
            </span>
          )}
        </div>

        {/* Cabeçalho das colunas */}
        <div className="grid items-center gap-3 px-5 py-2.5" style={{
          gridTemplateColumns: '1fr 72px 72px 72px',
          background: 'rgba(255,255,255,.015)',
          borderBottom: '1px solid rgba(255,255,255,.05)',
        }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.25)' }}>Casa</span>
          {cols.map(c => (
            <button key={c.key} type="button"
              onClick={() => setSortCol(c.key)}
              className="flex items-center justify-center gap-0.5 text-[11px] font-bold transition-colors"
              style={{
                color: sortCol === c.key ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.3)',
                borderBottom: sortCol === c.key ? `2px solid rgba(${accentRgb},.7)` : '2px solid transparent',
                paddingBottom: 2,
              }}>
              {c.label}
              {sortCol === c.key && <ArrowDown size={9} style={{ marginLeft: 2 }} />}
            </button>
          ))}
        </div>

        {/* Linhas */}
        <div>
          {sorted.map((bk, idx) => {
            const isH = bk.home === bests.h && bk.home > 1;
            const isD = bk.draw === bests.d && bk.draw > 1;
            const isA = bk.away === bests.a && bk.away > 1;
            const is2H = !isH && bk.home === secondH && bk.home > 1;
            const is2D = !isD && bk.draw === secondD && bk.draw > 1;
            const is2A = !isA && bk.away === secondA && bk.away > 1;
            const anySelected = slots.some(s => s?.bk.slug === bk.slug);
            return (
              <div key={bk.slug}
                className="odds-row odds-row-in grid items-center gap-3 px-5 py-3"
                style={{
                  gridTemplateColumns: '1fr 72px 72px 72px',
                  '--row-i': idx,
                  background: anySelected
                    ? `rgba(${accentRgb},.04)`
                    : idx % 2 === 1 ? 'rgba(255,255,255,.012)' : undefined,
                  borderTop: idx > 0 ? '1px solid rgba(255,255,255,.04)' : undefined,
                } as React.CSSProperties}>

                {/* Nome da casa */}
                <div className="flex min-w-0 items-center gap-2">
                  {bk.url ? (
                    <a href={bk.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[13px] font-semibold transition-colors hover:text-cyan-400 truncate"
                      style={{ color: anySelected ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.75)' }}>
                      <ExternalLink size={10} className="shrink-0 opacity-40" />
                      <span className="truncate">{bk.name}</span>
                    </a>
                  ) : (
                    <span className="text-[13px] font-semibold truncate" style={{ color: 'rgba(255,255,255,.65)' }}>{bk.name}</span>
                  )}
                  {(bk.is_pa ?? isPa(bk.slug)) && (
                    <span className="shrink-0 rounded px-1 py-px text-[8px] font-bold" style={{
                      background: 'rgba(255,159,10,.1)',
                      color: 'rgba(255,159,10,.75)',
                      border: '1px solid rgba(255,159,10,.2)',
                    }}>PA</span>
                  )}
                </div>

                <OddBtn bk={bk} type="home" value={bk.home} isBest={isH} isSecond={is2H} />
                <OddBtn bk={bk} type="draw" value={bk.draw} isBest={isD} isSecond={is2D} />
                <OddBtn bk={bk} type="away" value={bk.away} isBest={isA} isSecond={is2A} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header do evento ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{
        background: 'rgba(13,17,23,0.85)',
        border: '1px solid rgba(129,140,248,.25)',
        borderLeft: '3px solid #818cf8',
        boxShadow: '0 4px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(129,140,248,.06) inset',
        backdropFilter: 'blur(20px)',
      }}>
        <button onClick={onBack} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/10"
          style={{ background: 'rgba(129,140,248,.1)', border: '1px solid rgba(129,140,248,.2)', color: '#818cf8' }}>
          <ChevronLeft size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="truncate text-[15px] font-black tracking-tight" style={{ color: 'var(--t)' }}>
            {eventName}
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--t3)' }}>
            {event.league_name} · {fmtTime(event.start_time)}
          </div>
        </div>
        <button onClick={onRefresh} className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all hover:opacity-80"
          style={{ background: 'rgba(129,140,248,.12)', color: '#818cf8', border: '1px solid rgba(129,140,248,.28)' }}>
          <RefreshCw size={11} />
          Atualizar
        </button>
      </div>

      {/* ── Calculadora ───────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl transition-all duration-300"
        style={{
          background: 'rgba(13,17,23,0.7)',
          border: `1px solid ${activeSlots.length > 0 ? 'rgba(61,255,143,.28)' : 'rgba(255,255,255,.07)'}`,
          boxShadow: activeSlots.length > 0
            ? '0 4px 24px rgba(0,0,0,.35), 0 0 20px rgba(61,255,143,.06)'
            : '0 4px 24px rgba(0,0,0,.35)',
          backdropFilter: 'blur(12px)',
        }}>

        {/* Barra topo calculadora */}
        <div style={{
          height: 2,
          background: activeSlots.length > 0
            ? 'linear-gradient(90deg, rgba(61,255,143,.8) 0%, rgba(61,255,143,.2) 60%, transparent 100%)'
            : 'linear-gradient(90deg, rgba(255,255,255,.08) 0%, transparent 100%)',
          transition: 'background 0.4s ease',
        }} />

        {/* Slots */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'rgba(255,255,255,.05)' }}>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--t3)' }}>🧮 Calculadora</span>
          <div className="flex flex-1 flex-wrap gap-2">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all text-[10px] font-semibold"
                style={{
                  background: slot ? `${SLOT_COLORS[i]}12` : 'rgba(255,255,255,.03)',
                  border: `1px solid ${slot ? SLOT_COLORS[i] + '40' : 'rgba(255,255,255,.07)'}`,
                }}>
                <span style={{ color: SLOT_COLORS[i], opacity: slot ? 1 : .3, fontSize: 9 }}>{SLOT_LABELS[i]}</span>
                {slot ? (
                  <>
                    <span style={{ color: 'var(--t2)' }}>{slot.bk.name}</span>
                    <span style={{ color: SLOT_COLORS[i], fontWeight: 900 }}>{slot.value.toFixed(2)}</span>
                    <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 9 }}>({slot.type === 'home' ? '1' : slot.type === 'draw' ? 'X' : '2'})</span>
                    <button onClick={() => setSlots(prev => { const n = [...prev]; n[i] = null; return n; })}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', lineHeight: 1, padding: 0, marginLeft: 2, fontSize: 12 }}>×</button>
                  </>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 9 }}>vazio</span>
                )}
              </div>
            ))}
          </div>
          {activeSlots.length > 0 && (
            <button onClick={() => setSlots([null, null, null])}
              className="rounded-md px-2 py-1 text-[9px] font-bold transition-colors hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,.35)', border: '1px solid rgba(255,255,255,.1)' }}>
              Limpar
            </button>
          )}
        </div>

        <div className="p-4">
          <SurebetCalc
            selectedEvent={{ name: eventName, start_utc: event.start_time }}
            externalFill={calcFill}
            defaultNumOutcomes={3}
          />
        </div>
      </div>

      {/* ── Dica ──────────────────────────────────────────────────────────── */}
      <p className="px-1 text-[11px]" style={{ color: 'rgba(255,255,255,.25)' }}>
        👆 Clique em qualquer odd para adicioná-la à calculadora · máx 3 slots
      </p>

      {/* ── Seções de odds ────────────────────────────────────────────────── */}
      <OddsSection
        label="Odds sem PA"
        bks={semPa}
        accentColor="hsl(230 80% 70%)"
        isPA={false}
      />
      <OddsSection
        label="Odds com PA — Pagamento Antecipado"
        bks={comPa}
        accentColor="hsl(38 95% 65%)"
        isPA={true}
      />

    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BuscarOddsPage() {
  const today = todayBRT();
  const selectedDate = today;

  const [allOdds,       setAllOdds]       = useState<OddsSummary[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchErr,      setFetchErr]      = useState('');
  const [search,        setSearch]        = useState('');
  const [selectedEvent, setSelectedEvent] = useState<OddsSummary | null>(null);

  const loadOdds = useCallback(async (date: string, silent = false) => {
    if (!silent) { setLoading(true); setFetchErr(''); setAllOdds([]); setSelectedEvent(null); }
    try {
      const dbRes  = await fetch(`/api/dg/odds-db?date=${date}`);
      const dbJson = await dbRes.json() as { ok: boolean; odds?: OddsSummary[]; source?: string; error?: string };

      if (dbJson.ok && (dbJson.odds?.length ?? 0) > 0) {
        setAllOdds(dbJson.odds!);
        return;
      }

      const res  = await fetch('/api/dg/odds');
      const json = await res.json() as { ok: boolean; odds?: OddsSummary[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar odds');
      setAllOdds(json.odds ?? []);
    } catch {
      if (!silent) setFetchErr('Não foi possível carregar as odds.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadOdds(selectedDate); }, [selectedDate, loadOdds]);

  useEffect(() => {
    const id = setInterval(() => loadOdds(selectedDate, true), 30_000);
    return () => clearInterval(id);
  }, [selectedDate, loadOdds]);

  const normFn = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtered = useMemo(() => {
    const result = allOdds
      .filter(ev => !isExcluded(ev.league_name ?? ''))
      .filter(ev => {
        if (!search.trim()) return true;
        const q = normFn(search);
        return normFn(ev.home_team).includes(q) ||
               normFn(ev.away_team).includes(q) ||
               normFn(ev.league_name ?? '').includes(q);
      });
    console.log('[frontend:5-render] odds após filtro:', result.length,
      '| com 2+ bookmakers:', result.filter(e => e.bookmakers.length >= 2).length);
    return result;
  }, [allOdds, search]);

  const byLeague = useMemo(() => {
    const map = new Map<string, OddsSummary[]>();
    for (const ev of filtered) {
      const key = ev.league_name || 'Outros';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const aBr = a[0].toLowerCase().includes('brasil') || a[0].toLowerCase().includes('série');
      const bBr = b[0].toLowerCase().includes('brasil') || b[0].toLowerCase().includes('série');
      if (aBr && !bBr) return -1;
      if (!aBr && bBr) return 1;
      return a[1][0].start_time.localeCompare(b[1][0].start_time);
    });
  }, [filtered]);

  // ── Modo evento selecionado ────────────────────────────────────────────────
  if (selectedEvent) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <EventOddsPanel
          event={selectedEvent}
          onBack={() => setSelectedEvent(null)}
          onRefresh={() => loadOdds(selectedDate)}
        />
      </div>
    );
  }

  // ── Helpers inline ─────────────────────────────────────────────────────────
  function bestOfGroup(bks: BookmakerOdds[], key: keyof BookmakerOdds) {
    const vals = bks.map(b => b[key] as number).filter(v => v > 1);
    return vals.length ? Math.max(...vals) : 0;
  }
  function bestBk(bks: BookmakerOdds[], key: keyof BookmakerOdds) {
    const best = bestOfGroup(bks, key);
    return bks.find(b => (b[key] as number) === best && best > 1) ?? null;
  }
  function calcMargin(bks: BookmakerOdds[]) {
    const h = bestOfGroup(bks, 'home'), d = bestOfGroup(bks, 'draw'), a = bestOfGroup(bks, 'away');
    if (!h || !d || !a) return null;
    return (1/h + 1/d + 1/a - 1) * 100;
  }

  // ── Lista de eventos ───────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex flex-col gap-4" style={{ maxWidth: 920 }}>

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-black tracking-tight" style={{ color: 'var(--t)' }}>Buscar Odds</h1>
            <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
              {loading ? 'Carregando…' : `${filtered.length} jogo${filtered.length !== 1 ? 's' : ''} · dados de hoje`}
            </p>
          </div>
          {/* Badge "Hoje apenas" */}
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{ background: 'rgba(99,102,241,.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,.22)' }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: '#818cf8', boxShadow: '0 0 6px #818cf8' }} />
            Eventos de hoje apenas
          </span>
        </div>

        <button
          onClick={() => loadOdds(selectedDate)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-40"
          style={{
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.08)',
            color: 'var(--t2)',
            boxShadow: '0 2px 8px rgba(0,0,0,.2)',
          }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* ── Busca ───────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar time ou liga…"
          className="w-full rounded-xl py-2.5 pl-10 pr-9 text-[13px] outline-none transition-all"
          style={{
            background: 'rgba(13,17,23,0.8)',
            border: '1px solid rgba(255,255,255,.08)',
            color: 'var(--t)',
            boxShadow: '0 2px 12px rgba(0,0,0,.2)',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Erro ────────────────────────────────────────────────────────── */}
      {fetchErr && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.2)', color: '#f87171' }}>
          ⚠ {fetchErr}
          <button onClick={() => loadOdds(selectedDate)} className="ml-auto text-xs"
            style={{ color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Skeleton ────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl animate-pulse"
              style={{ background: 'var(--bg2)', border: '1px solid var(--b)', opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      )}

      {/* ── Vazio ───────────────────────────────────────────────────────── */}
      {!loading && !fetchErr && filtered.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-3" style={{ color: 'var(--t3)' }}>
          <ScanSearch size={32} className="opacity-30" />
          <p className="text-sm font-semibold">Nenhum jogo encontrado</p>
          <p className="text-xs opacity-60">
            {search ? 'Tente outro termo de busca.' : 'Sem odds importadas para hoje. Importe via painel Admin.'}
          </p>
        </div>
      )}

      {/* ── Cabeçalho das colunas (desktop) ─────────────────────────────── */}
      {!loading && byLeague.length > 0 && (
        <div className="hidden md:grid items-center gap-2 px-4 text-[10px] font-black uppercase tracking-widest"
          style={{ gridTemplateColumns: '44px 1fr 72px 120px 120px 120px', color: 'rgba(255,255,255,.25)' }}>
          <span>Hora</span>
          <span>Jogo</span>
          <span className="text-center">Margem</span>
          <span className="text-center">Casa (1)</span>
          <span className="text-center">Empate (X)</span>
          <span className="text-center">Fora (2)</span>
        </div>
      )}

      {/* ── Eventos por liga ────────────────────────────────────────────── */}
      {!loading && byLeague.map(([league, evs]) => (
        <div key={league} className="overflow-hidden rounded-2xl" style={{
          background: 'rgba(13,17,23,0.75)',
          border: '1px solid rgba(255,255,255,.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,.4), 0 1px 0 rgba(255,255,255,.04) inset',
          backdropFilter: 'blur(10px)',
        }}>

          {/* Barra topo da liga */}
          <div style={{ height: 2, background: 'linear-gradient(90deg, rgba(129,140,248,.7) 0%, rgba(129,140,248,.2) 50%, transparent 100%)' }} />

          {/* Cabeçalho da liga */}
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{
              background: 'linear-gradient(90deg, rgba(129,140,248,.06) 0%, transparent 60%)',
              borderBottom: '1px solid rgba(255,255,255,.05)',
            }}>
            <div className="flex items-center gap-2">
              <div style={{ width: 2, height: 12, borderRadius: 1, background: 'rgba(129,140,248,.6)' }} />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.5)' }}>
                {league}
              </span>
            </div>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold"
              style={{ background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.3)', border: '1px solid rgba(255,255,255,.07)' }}>
              {evs.length}
            </span>
          </div>

          {/* Linhas dos eventos */}
          <div>
            {evs.map((ev, idx) => {
              const mgn = calcMargin(ev.bookmakers);
              const isSure = mgn !== null && mgn < 0;
              const bkH = bestBk(ev.bookmakers, 'home');
              const bkD = bestBk(ev.bookmakers, 'draw');
              const bkA = bestBk(ev.bookmakers, 'away');
              return (
                <button
                  key={ev.match_id}
                  type="button"
                  onClick={() => setSelectedEvent(ev)}
                  className="event-row w-full text-left"
                  style={{
                    background: idx % 2 === 1 ? 'rgba(255,255,255,.012)' : undefined,
                    borderTop: idx > 0 ? '1px solid rgba(255,255,255,.04)' : undefined,
                    display: 'block',
                  }}>

                  {/* ── Desktop layout ── */}
                  <div className="hidden md:grid items-center gap-2 px-4 py-3"
                    style={{ gridTemplateColumns: '44px 1fr 72px 120px 120px 120px' }}>

                    {/* Hora */}
                    <span className="text-[12px] font-bold tabular-nums" style={{ color: 'var(--t3)' }}>
                      {fmtTime(ev.start_time)}
                    </span>

                    {/* Jogo */}
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--t)' }}>
                        {ev.home_team}
                      </p>
                      <p className="truncate text-[12px]" style={{ color: 'var(--t3)' }}>
                        {ev.away_team}
                      </p>
                    </div>

                    {/* Margem */}
                    <div className="flex justify-center">
                      {mgn !== null ? (
                        <span className="rounded-md px-2 py-1 text-[11px] font-bold tabular-nums"
                          style={isSure ? {
                            background: 'rgba(61,255,143,.12)',
                            color: 'hsl(150 90% 55%)',
                            border: '1px solid rgba(61,255,143,.25)',
                            boxShadow: '0 0 8px rgba(61,255,143,.12)',
                          } : {
                            background: 'rgba(248,113,113,.08)',
                            color: '#f87171',
                            border: '1px solid rgba(248,113,113,.15)',
                          }}>
                          {isSure ? `+${Math.abs(mgn).toFixed(2)}%` : `${mgn.toFixed(1)}%`}
                        </span>
                      ) : <span style={{ color: 'rgba(255,255,255,.12)', fontSize: 11 }}>—</span>}
                    </div>

                    <BestOddCell bk={bkH} type="home" />
                    <BestOddCell bk={bkD} type="draw" />
                    <BestOddCell bk={bkA} type="away" />
                  </div>

                  {/* ── Mobile layout ── */}
                  <div className="flex items-center gap-3 px-4 py-3 md:hidden">
                    <span className="w-10 shrink-0 text-[11px] font-bold tabular-nums text-center" style={{ color: 'var(--t3)' }}>
                      {fmtTime(ev.start_time)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--t)' }}>
                        {ev.home_team} x {ev.away_team}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
                        {ev.bookmakers.length} casas
                        {mgn !== null && (
                          <span className="ml-2 font-bold" style={{ color: isSure ? 'hsl(150 90% 55%)' : '#f87171' }}>
                            {isSure ? `🎯 +${Math.abs(mgn).toFixed(2)}%` : `${mgn.toFixed(1)}%`}
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronRight size={14} className="shrink-0 opacity-30" style={{ color: 'var(--t3)' }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Célula de melhor odd (lista) ───────────────────────────────────────────────
function BestOddCell({ bk, type }: { bk: BookmakerOdds | null; type: 'home' | 'draw' | 'away' }) {
  if (!bk) return <div className="flex justify-center"><span style={{ color: 'rgba(255,255,255,.12)', fontSize: 11 }}>—</span></div>;
  const val = bk[type] as number;
  const isPA = bk.is_pa ?? isPa(bk.slug);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[15px] font-black tabular-nums" style={{
        color: 'hsl(150 85% 62%)',
        textShadow: '0 0 12px hsl(150 85% 55% / 0.4)',
      }}>
        {val.toFixed(2)}
      </span>
      <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: 'rgba(255,255,255,.4)' }}>
        {bk.name}
        {isPA && (
          <span className="rounded px-1 text-[8px] font-bold"
            style={{ background: 'rgba(255,159,10,.1)', color: 'rgba(255,159,10,.7)', border: '1px solid rgba(255,159,10,.18)' }}>
            PA
          </span>
        )}
      </span>
    </div>
  );
}
