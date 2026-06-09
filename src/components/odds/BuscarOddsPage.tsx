'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, X, Building2, ScanSearch, Calendar, ChevronLeft, ChevronRight, ExternalLink, ArrowDown } from 'lucide-react';
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

// PA = Pagamento Antecipado: casas que pagam antes do fim do jogo (plataforma Altenar) + Superbet.
// NÃO inclui: Bet365, Betano, Sportingbet — essas pagam apenas ao fim do jogo.
const PA_SET = new Set([
  // Altenar (todas são PA)
  'estrelabet','br4bet','esportivabet','jogodeouro','vaidebet',
  'sortenabet','lotogreen','betpix365','f12','vupibet','vupibr',
  'bet7k','esportesdasorte','apostabet','brasilbet',
  // Superbet
  'superbet',
]);

function isPa(slug: string): boolean {
  const n = slug.toLowerCase().replace(/[\s\-_.]/g, '');
  for (const pa of PA_SET) {
    if (n === pa || n.startsWith(pa.slice(0, 5)) || pa.startsWith(n.slice(0, 5))) return true;
  }
  return false;
}

// ─── Esportes/ligas excluídos (e-soccer / virtuais) ───────────────────────────

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
        style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
        <span style={{ color: 'rgba(255,255,255,.15)', fontSize: 12 }}>—</span>
      </div>
    );

    const btnStyle: React.CSSProperties = selected ? {
      background: `${slotColor}20`,
      border:     `1px solid ${slotColor}70`,
      color:      slotColor,
      boxShadow:  `0 0 10px ${slotColor}30`,
    } : isBest ? {} : isSecond ? {
      background: 'hsl(150 70% 45% / 0.06)',
      border:     '1px solid hsl(150 70% 45% / 0.22)',
      color:      'hsl(150 60% 58%)',
    } : {
      background: 'rgba(255,255,255,.05)',
      border:     '1px solid rgba(255,255,255,.1)',
      color:      'rgba(255,255,255,.75)',
    };

    return (
      <button
        type="button"
        onClick={() => handleOddClick(bk, type, value)}
        title={selected ? `Slot ${slotIdx + 1} — clique para remover` : 'Adicionar à calculadora'}
        className={`relative flex h-10 w-[72px] items-center justify-center rounded-xl font-mono text-sm font-semibold transition-all duration-300 hover:scale-105 active:scale-95${isBest && !selected ? ' animate-best-odd-glow' : ''}`}
        style={isBest && !selected ? {
          background: 'hsl(150 90% 45% / 0.15)',
          border:     '1px solid hsl(150 90% 50% / 0.5)',
          color:      'hsl(150 90% 58%)',
        } : btnStyle}
      >
        {value.toFixed(2)}
        {selected && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            width: 15, height: 15, borderRadius: '50%',
            background: slotColor, color: '#060A07',
            fontSize: 8, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{slotIdx + 1}</span>
        )}
      </button>
    );
  }

  // ── Seção (sem PA / com PA) ──────────────────────────────────────────────────
  function OddsSection({ label, bks, accentColor, headerBg }: {
    label: string; bks: BookmakerOdds[]; accentColor: string; headerBg: string;
  }) {
    if (!bks.length) return null;
    const bests  = { h: bestOf(bks, 'home'), d: bestOf(bks, 'draw'), a: bestOf(bks, 'away') };
    const mgn    = margin(bks);
    const isSure = mgn !== null && mgn < 0;

    // Ordenar pela coluna selecionada, decrescente
    const sorted = [...bks].sort((a, b) => {
      const va = a[sortCol] as number ?? 0;
      const vb = b[sortCol] as number ?? 0;
      return vb - va;
    });

    // segundas melhores (empatadas com a melhor ficam no grupo "best"; aqui pegamos o segundo valor distinto)
    const secondH = [...new Set(bks.map(b => b.home).filter(v => v > 1 && v < bests.h))].sort((a,b)=>b-a)[0] ?? 0;
    const secondD = [...new Set(bks.map(b => b.draw).filter(v => v > 1 && v < bests.d))].sort((a,b)=>b-a)[0] ?? 0;
    const secondA = [...new Set(bks.map(b => b.away).filter(v => v > 1 && v < bests.a))].sort((a,b)=>b-a)[0] ?? 0;

    const cols: { key: 'home'|'draw'|'away'; label: string }[] = [
      { key: 'home', label: 'Casa (1)' },
      { key: 'draw', label: 'Empate (X)' },
      { key: 'away', label: 'Fora (2)' },
    ];

    return (
      <div className="overflow-hidden rounded-2xl" style={{ border: `1px solid ${accentColor}40`, boxShadow: `0 0 20px ${accentColor}10` }}>

        {/* Header da seção */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: headerBg, borderBottom: `1px solid ${accentColor}30` }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wide" style={{ color: accentColor }}>{label}</span>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${accentColor}18`, color: accentColor }}>
              {bks.length} casas
            </span>
          </div>
          {mgn !== null && (
            <span className="text-[11px] font-bold" style={{ color: isSure ? 'hsl(150 90% 55%)' : 'rgba(255,255,255,.35)' }}>
              {isSure ? `🎯 Surebet +${Math.abs(mgn).toFixed(2)}%` : `margem ${mgn.toFixed(1)}%`}
            </span>
          )}
        </div>

        {/* Cabeçalho das colunas */}
        <div className="grid items-center gap-3 px-5 py-2" style={{ gridTemplateColumns: '1fr 72px 72px 72px', background: 'rgba(255,255,255,.02)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.3)' }}>Casa</span>
          {cols.map(c => (
            <button key={c.key} type="button"
              onClick={() => setSortCol(c.key)}
              className="flex items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors"
              style={{ color: sortCol === c.key ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.35)' }}>
              {c.label}
              {sortCol === c.key && <ArrowDown size={10} />}
            </button>
          ))}
        </div>

        {/* Linhas */}
        <div className="divide-y divide-white/[.04]">
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
                className="grid items-center gap-3 px-5 py-3 transition-colors"
                style={{
                  gridTemplateColumns: '1fr 72px 72px 72px',
                  background: anySelected ? 'rgba(255,255,255,.03)' : idx % 2 === 1 ? 'rgba(255,255,255,.015)' : undefined,
                }}>

                {/* Nome da casa */}
                <div className="flex min-w-0 items-center gap-2">
                  {bk.url ? (
                    <a href={bk.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm font-semibold transition-colors hover:text-cyan-400 truncate"
                      style={{ color: anySelected ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.8)' }}>
                      <ExternalLink size={11} className="shrink-0 opacity-50" />
                      <span className="truncate">{bk.name}</span>
                    </a>
                  ) : (
                    <span className="text-sm font-semibold truncate" style={{ color: 'rgba(255,255,255,.7)' }}>{bk.name}</span>
                  )}
                  {(bk.is_pa ?? isPa(bk.slug)) && (
                    <span className="shrink-0 rounded px-1 py-px text-[8px] font-bold" style={{ background: 'rgba(255,159,10,.12)', color: 'rgba(255,159,10,.7)', border: '1px solid rgba(255,159,10,.2)' }}>PA</span>
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
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <button onClick={onBack} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/10"
          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t3)' }}>
          <ChevronLeft size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-bold" style={{ color: 'var(--t)' }}>{eventName}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--t3)' }}>
            {event.league_name} · {fmtTime(event.start_time)}
          </div>
        </div>
        <button onClick={onRefresh} className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors hover:opacity-80"
          style={{ background: 'rgba(99,102,241,.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,.3)' }}>
          ↻ Atualizar
        </button>
      </div>

      {/* ── Calculadora ───────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl transition-all duration-300"
        style={{
          border: `1px solid ${activeSlots.length > 0 ? 'rgba(61,255,143,.3)' : 'var(--b)'}`,
          background: activeSlots.length > 0 ? 'rgba(61,255,143,.02)' : 'var(--bg2)',
        }}>

        {/* Slots */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'rgba(255,255,255,.05)' }}>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--t3)' }}>🧮 Calculadora</span>
          <div className="flex flex-1 flex-wrap gap-2">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all text-[10px] font-semibold"
                style={{
                  background: slot ? `${SLOT_COLORS[i]}15` : 'rgba(255,255,255,.04)',
                  border: `1px solid ${slot ? SLOT_COLORS[i] + '45' : 'rgba(255,255,255,.08)'}`,
                }}>
                <span style={{ color: SLOT_COLORS[i], opacity: slot ? 1 : .35, fontSize: 9 }}>{SLOT_LABELS[i]}</span>
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
              style={{ color: 'rgba(255,255,255,.35)', border: '1px solid rgba(255,255,255,.12)' }}>
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
      <p className="px-1 text-[11px]" style={{ color: 'rgba(255,255,255,.3)' }}>
        👆 Clique em qualquer odd para adicioná-la à calculadora · máx 3 slots
      </p>

      {/* ── Seções de odds ────────────────────────────────────────────────── */}
      <OddsSection
        label="Odds sem PA"
        bks={semPa}
        accentColor="hsl(210 80% 65%)"
        headerBg="hsl(215 30% 10%)"
      />
      <OddsSection
        label="Odds com PA — Pagamento Antecipado"
        bks={comPa}
        accentColor="hsl(38 95% 65%)"
        headerBg="hsl(35 30% 9%)"
      />

    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BuscarOddsPage() {
  const today = todayBRT();

  const [selectedDate,  setSelectedDate]  = useState(today);
  const [allOdds,       setAllOdds]       = useState<OddsSummary[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchErr,      setFetchErr]      = useState('');
  const [search,        setSearch]        = useState('');
  const [selectedEvent, setSelectedEvent] = useState<OddsSummary | null>(null);

  // Carrega odds: tenta banco de dados importado primeiro, cai nas APIs ao vivo se vazio
  const loadOdds = useCallback(async (date: string, silent = false) => {
    if (!silent) { setLoading(true); setFetchErr(''); setAllOdds([]); setSelectedEvent(null); }
    try {
      // 1ª tentativa: dados importados no Supabase (mais rápido e completo)
      const dbUrl  = `/api/dg/odds-db?date=${date}`;
      console.log('[frontend:4-fetch] tentando banco importado:', dbUrl);
      const dbRes  = await fetch(dbUrl);
      const dbJson = await dbRes.json() as { ok: boolean; odds?: OddsSummary[]; source?: string; error?: string };

      if (dbJson.ok && (dbJson.odds?.length ?? 0) > 0) {
        const odds = dbJson.odds!;
        console.log('[frontend:4-fetch] banco importado:', odds.length, 'jogos | source:', dbJson.source);
        setAllOdds(odds);
        return;
      }

      console.log('[frontend:4-fetch] banco vazio para essa data, usando APIs ao vivo…');

      // 2ª tentativa: APIs ao vivo
      const isToday = date === todayBRT();
      const liveUrl = isToday ? '/api/dg/odds' : `/api/dg/odds?date=${date}`;
      console.log('[frontend:4-fetch] buscando odds ao vivo:', liveUrl);
      const res  = await fetch(liveUrl);
      const json = await res.json() as { ok: boolean; odds?: OddsSummary[]; source?: string; error?: string };

      if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar odds');

      const odds = json.odds ?? [];
      console.log('[frontend:4-fetch] odds ao vivo:', odds.length, '| sources:', json.source);

      const bkCount: Record<string, number> = {};
      for (const ev of odds) {
        for (const bk of ev.bookmakers) {
          bkCount[bk.slug] = (bkCount[bk.slug] ?? 0) + 1;
        }
      }
      console.log('[frontend:4-fetch] bookmakers:', bkCount);

      setAllOdds(odds);
    } catch {
      if (!silent) setFetchErr('Não foi possível carregar as odds.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadOdds(selectedDate); }, [selectedDate, loadOdds]);

  // Auto-refresh a cada 30s (silent = não mostra loading spinner)
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

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  // ── Modo evento selecionado ────────────────────────────────────────────────
  if (selectedEvent) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <EventOddsPanel
          event={selectedEvent}
          onBack={() => setSelectedEvent(null)}
          onRefresh={() => loadOdds(selectedDate)}
        />
      </div>
    );
  }

  // ── Lista de eventos ───────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t)' }}>Buscar Odds</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            {loading ? 'Carregando…' : `${filtered.length} jogos · ${fmtDayLabel(selectedDate)}`}
          </div>
        </div>
        <button onClick={() => loadOdds(selectedDate)} disabled={loading} style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: 'var(--bg2)', border: '1px solid var(--b)',
          color: 'var(--t2)', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
        }}>
          {loading ? '…' : '↻ Atualizar'}
        </button>
      </div>

      {/* Seletor de dia */}
      <div style={{
        borderRadius: 12, padding: '10px 12px',
        background: 'var(--bg2)', border: '1px solid var(--b)',
        display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto',
      }}>
        <Calendar size={13} style={{ color: 'var(--t3)', flexShrink: 0 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {days.map(day => {
            const active = day === selectedDate;
            return (
              <button key={day} onClick={() => setSelectedDate(day)} style={{
                padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid',
                background: active ? 'var(--accent,#818cf8)' : 'transparent',
                borderColor: active ? 'var(--accent,#818cf8)' : 'var(--b)',
                color: active ? '#fff' : 'var(--t3)',
              }}>
                {fmtDayLabel(day)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Campo de busca */}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--t3)', pointerEvents: 'none',
        }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar time ou liga…"
          style={{
            width: '100%', padding: '9px 34px', borderRadius: 10, boxSizing: 'border-box',
            background: 'var(--bg2)', border: '1px solid var(--b)',
            color: 'var(--t)', fontSize: 13, outline: 'none',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer',
          }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Erro */}
      {fetchErr && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.2)',
          color: '#f87171', fontSize: 13,
        }}>
          ⚠ {fetchErr}
          <button onClick={() => loadOdds(selectedDate)} style={{
            marginLeft: 12, fontSize: 11, color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer',
          }}>Tentar novamente</button>
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{
              height: 58, borderRadius: 10, background: 'var(--bg2)',
              border: '1px solid var(--b)', opacity: 1 - i * 0.11,
            }} />
          ))}
        </div>
      )}

      {/* Vazio */}
      {!loading && !fetchErr && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t3)' }}>
          <ScanSearch size={28} style={{ margin: '0 auto 10px', opacity: .4 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum jogo encontrado</div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: .6 }}>
            {search ? 'Tente outro termo.' : 'Sem jogos com odds disponíveis para esta data.'}
          </div>
        </div>
      )}

      {/* Eventos por liga */}
      {!loading && byLeague.map(([league, evs]) => (
        <div key={league} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{
            fontSize: 10, fontWeight: 900, textTransform: 'uppercase',
            letterSpacing: '.1em', color: 'var(--t3)',
            padding: '2px 2px 4px', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ flex: 1 }}>{league}</span>
            <span style={{ opacity: .45, fontWeight: 600 }}>{evs.length}</span>
          </div>

          {evs.map(ev => (
            <button key={ev.match_id} onClick={() => setSelectedEvent(ev)} style={{
              width: '100%', textAlign: 'left', cursor: 'pointer',
              borderRadius: 10, padding: '10px 14px',
              background: 'var(--bg2)', border: '1px solid var(--b)',
              display: 'flex', alignItems: 'center', gap: 12,
              transition: 'border-color .15s, background .15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(129,140,248,.4)';
              (e.currentTarget as HTMLElement).style.background  = 'rgba(129,140,248,.05)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--b)';
              (e.currentTarget as HTMLElement).style.background  = 'var(--bg2)';
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: 'var(--t3)',
                flexShrink: 0, minWidth: 36, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtTime(ev.start_time)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--t)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {ev.home_team} x {ev.away_team}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <Building2 size={10} style={{ color: '#818cf8' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#818cf8' }}>{ev.bookmakers.length}</span>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--t3)', flexShrink: 0, opacity: .4 }} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
