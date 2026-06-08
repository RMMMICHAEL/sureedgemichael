'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, X, Building2, ScanSearch, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
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

  useEffect(() => {
    const active = slots.filter(Boolean) as CalcSlot[];
    if (!active.length) { setCalcFill(null); return; }
    setCalcFill({
      odds:   active.map(s => String(s.value)),
      houses: active.map(s => s.bk.name),
      urls:   active.map(s => s.bk.url ?? ''),
    });
  }, [slots]);

  // reset slots when event changes
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

  function slotOf(slug: string, type: OddType): number {
    return slots.findIndex(s => s?.bk.slug === slug && s?.type === type);
  }

  // is_pa do backend (preciso) > heurística de slug (fallback para dados antigos)
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

  function OddCell({ bk, type, value, isBest }: {
    bk: BookmakerOdds; type: OddType; value: number; isBest: boolean;
  }) {
    const slotIdx = slotOf(bk.slug, type);
    const selected = slotIdx >= 0;
    const color = selected ? SLOT_COLORS[slotIdx] : isBest ? 'var(--g)' : 'var(--t2)';
    return (
      <td style={{ padding: '4px 6px', textAlign: 'center', position: 'relative' }}>
        {value > 1 ? (
          <button
            onClick={() => handleOddClick(bk, type, value)}
            title={selected ? `Remover da calculadora (slot ${slotIdx + 1})` : 'Adicionar à calculadora'}
            style={{
              width: '100%', minWidth: 52, padding: '5px 4px',
              borderRadius: 7, cursor: 'pointer',
              fontSize: 12, fontWeight: selected ? 900 : isBest ? 800 : 500,
              fontVariantNumeric: 'tabular-nums', color,
              background: selected
                ? `rgba(${SLOT_COLORS[slotIdx].slice(1).match(/../g)!.map(h=>parseInt(h,16)).join(',')}, .13)`
                : isBest ? 'rgba(63,255,33,.07)' : 'transparent',
              border: selected
                ? `1px solid ${SLOT_COLORS[slotIdx]}55`
                : isBest ? '1px solid rgba(63,255,33,.2)' : '1px solid transparent',
              transition: 'all .12s', position: 'relative',
            }}
          >
            {value.toFixed(2)}
            {selected && (
              <span style={{
                position: 'absolute', top: -5, right: -5,
                width: 14, height: 14, borderRadius: '50%',
                background: SLOT_COLORS[slotIdx],
                color: '#0D1117', fontSize: 8, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              }}>{slotIdx + 1}</span>
            )}
          </button>
        ) : (
          <span style={{ color: 'rgba(255,255,255,.15)', fontSize: 12 }}>—</span>
        )}
      </td>
    );
  }

  function BkRow({ bk, bests }: { bk: BookmakerOdds; bests: { h: number; d: number; a: number } }) {
    const isH = bk.home === bests.h && bk.home > 1;
    const isD = bk.draw === bests.d && bk.draw > 1;
    const isA = bk.away === bests.a && bk.away > 1;
    const anySelected = slots.some(s => s?.bk.slug === bk.slug);
    return (
      <tr style={{
        borderBottom: '1px solid rgba(255,255,255,.03)',
        background: anySelected ? 'rgba(255,255,255,.025)' : undefined,
        transition: 'background .1s',
      }}
        onMouseEnter={e => { if (!anySelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.02)'; }}
        onMouseLeave={e => { if (!anySelected) (e.currentTarget as HTMLElement).style.background = ''; }}>
        <td style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, color: anySelected ? 'var(--t)' : 'var(--t2)', whiteSpace: 'nowrap' }}>
          {bk.url ? (
            <a href={bk.url} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = '#818cf8'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = ''; }}>
              {bk.name}
            </a>
          ) : bk.name}
        </td>
        <OddCell bk={bk} type="home" value={bk.home} isBest={isH} />
        <OddCell bk={bk} type="draw" value={bk.draw} isBest={isD} />
        <OddCell bk={bk} type="away" value={bk.away} isBest={isA} />
      </tr>
    );
  }

  function Section({ title, bks, accent, bg }: {
    title: string; bks: BookmakerOdds[]; accent: string; bg: string;
  }) {
    if (!bks.length) return null;
    const sorted = [...bks].sort((a, b) => (b.home + b.draw + b.away) - (a.home + a.draw + a.away));
    const bests = { h: bestOf(bks, 'home'), d: bestOf(bks, 'draw'), a: bestOf(bks, 'away') };
    const mgn   = margin(bks);
    const isSure = mgn !== null && mgn < 0;
    return (
      <>
        <tr>
          <td colSpan={4} style={{
            padding: '5px 10px', fontSize: 9, fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: '.12em',
            color: accent, background: bg, borderTop: '1px solid var(--b)',
          }}>
            {title} · {bks.length} casa{bks.length !== 1 ? 's' : ''}
            {mgn !== null && (
              <span style={{ marginLeft: 8, fontWeight: 700, color: isSure ? 'var(--g)' : 'rgba(255,255,255,.4)' }}>
                {isSure ? `🎯 Surebet ${Math.abs(mgn).toFixed(2)}%` : `margem ${mgn.toFixed(1)}%`}
              </span>
            )}
          </td>
        </tr>
        {sorted.map(bk => <BkRow key={bk.slug} bk={bk} bests={bests} />)}
      </>
    );
  }

  const allBests = {
    h: bestOf(event.bookmakers, 'home'),
    d: bestOf(event.bookmakers, 'draw'),
    a: bestOf(event.bookmakers, 'away'),
  };
  const activeSlots  = slots.filter(Boolean) as CalcSlot[];
  const eventName    = `${event.home_team} x ${event.away_team}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header do evento */}
      <div style={{
        borderRadius: 14, padding: '12px 16px',
        background: 'var(--bg2)', border: '1px solid var(--b)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: 8, border: '1px solid var(--b)',
          background: 'rgba(255,255,255,.05)', color: 'var(--t3)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ChevronLeft size={15} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {eventName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
            {event.league_name} · {fmtTime(event.start_time)}
          </div>
        </div>
        <button onClick={onRefresh} style={{
          padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          background: 'rgba(99,102,241,.15)', color: '#818cf8',
          border: '1px solid rgba(99,102,241,.3)', flexShrink: 0,
        }}>↻</button>
      </div>

      {/* ── Calculadora integrada ──────────────────────────────────────────── */}
      <div style={{
        borderRadius: 14, overflow: 'hidden',
        border: `1px solid ${activeSlots.length > 0 ? 'rgba(61,255,143,.25)' : 'var(--b)'}`,
        background: activeSlots.length > 0 ? 'rgba(61,255,143,.025)' : 'var(--bg2)',
        transition: 'border-color .2s, background .2s',
      }}>
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.06)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--t3)' }}>
            🧮 Calculadora
          </span>
          <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            {slots.map((slot, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 8px', borderRadius: 7,
                background: slot ? `${SLOT_COLORS[i]}15` : 'rgba(255,255,255,.04)',
                border: `1px solid ${slot ? SLOT_COLORS[i] + '40' : 'rgba(255,255,255,.08)'}`,
                fontSize: 10, fontWeight: 700, transition: 'all .15s',
              }}>
                <span style={{ color: SLOT_COLORS[i], opacity: slot ? 1 : .3, fontSize: 9 }}>{SLOT_LABELS[i]}</span>
                {slot ? (
                  <>
                    <span style={{ color: 'var(--t2)' }}>{slot.bk.name}</span>
                    <span style={{ color: SLOT_COLORS[i], fontWeight: 900 }}>{slot.value.toFixed(2)}</span>
                    <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 9 }}>
                      ({slot.type === 'home' ? '1' : slot.type === 'draw' ? 'X' : '2'})
                    </span>
                    <button onClick={() => { setSlots(prev => { const n = [...prev]; n[i] = null; return n; }); }}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
                  </>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 9 }}>vazio</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <SurebetCalc
            selectedEvent={{ name: eventName, start_utc: event.start_time }}
            externalFill={calcFill}
            defaultNumOutcomes={3}
          />
        </div>
      </div>

      {/* Tabela de odds */}
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--b)' }}>

        {/* Cabeçalho */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'var(--bg2)', borderBottom: '1px solid var(--b)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--t3)' }}>
            Odds por Casa
          </span>
          <div style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 700 }}>
            <span style={{ color: 'rgba(63,255,33,.8)' }}>{semPa.length} sem PA</span>
            <span style={{ color: 'rgba(255,255,255,.2)' }}>·</span>
            <span style={{ color: 'rgba(255,159,10,.8)' }}>{comPa.length} com PA</span>
          </div>
        </div>

        {/* Dica */}
        <div style={{
          padding: '6px 14px', fontSize: 10, color: 'rgba(255,255,255,.3)',
          background: 'rgba(77,166,255,.03)', borderBottom: '1px solid rgba(255,255,255,.04)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>👆</span>
          <span>Clique em uma odd para fixar na calculadora · até 3 slots</span>
          {activeSlots.length > 0 && (
            <button onClick={() => setSlots([null, null, null])} style={{
              marginLeft: 'auto', fontSize: 9, fontWeight: 700,
              color: 'rgba(255,255,255,.4)', background: 'none',
              border: '1px solid rgba(255,255,255,.12)', borderRadius: 5,
              padding: '2px 7px', cursor: 'pointer',
            }}>Limpar slots</button>
          )}
        </div>

        {/* Tabela */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,.025)' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--t3)', minWidth: 110 }}>
                  Casa
                </th>
                {[
                  { label: '1', sub: event.home_team.split(' ')[0] ?? '1' },
                  { label: 'X', sub: 'Empate' },
                  { label: '2', sub: event.away_team.split(' ')[0] ?? '2' },
                ].map(({ label, sub }) => (
                  <th key={label} style={{ padding: '6px 6px', textAlign: 'center', fontSize: 10, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--t3)', minWidth: 56 }}>
                    <div>{label}</div>
                    <div style={{ fontSize: 8, fontWeight: 600, opacity: .5, textTransform: 'none', letterSpacing: 0, marginTop: 1 }}>
                      {sub.slice(0, 8)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Section title="SEM Pagamento Antecipado" bks={semPa} accent="rgba(63,255,33,.8)" bg="rgba(63,255,33,.04)" />
              <Section title="COM Pagamento Antecipado" bks={comPa} accent="rgba(255,159,10,.8)" bg="rgba(255,159,10,.04)" />
            </tbody>
          </table>
        </div>

        {/* Melhores odds */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '8px 14px',
          background: 'rgba(63,255,33,.04)', borderTop: '1px solid rgba(63,255,33,.15)',
        }}>
          <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(63,255,33,.6)' }}>
            Melhores odds
          </span>
          {([['1', allBests.h], ['X', allBests.d], ['2', allBests.a]] as [string, number][]).map(([l, v]) =>
            v > 1 ? (
              <span key={l} style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)' }}>
                <span style={{ color: 'var(--t3)' }}>{l}</span>
                {' '}<span style={{ color: 'var(--g)', fontWeight: 800 }}>{v.toFixed(2)}</span>
              </span>
            ) : null
          )}
        </div>
      </div>

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

  // Carrega odds diretamente da nossa API (independe de SuperMonitor)
  const loadOdds = useCallback(async (date: string) => {
    setLoading(true);
    setFetchErr('');
    setAllOdds([]);
    setSelectedEvent(null);
    try {
      const isToday = date === todayBRT();
      const url     = isToday ? '/api/dg/odds' : `/api/dg/odds?date=${date}`;
      const res     = await fetch(url);
      const json    = await res.json() as { ok: boolean; odds?: OddsSummary[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar odds');
      setAllOdds(json.odds ?? []);
    } catch {
      setFetchErr('Não foi possível carregar as odds.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOdds(selectedDate); }, [selectedDate, loadOdds]);

  const normFn = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtered = useMemo(() =>
    allOdds
      .filter(ev => !isExcluded(ev.league_name ?? ''))
      .filter(ev => {
        if (!search.trim()) return true;
        const q = normFn(search);
        return normFn(ev.home_team).includes(q) ||
               normFn(ev.away_team).includes(q) ||
               normFn(ev.league_name ?? '').includes(q);
      }),
    [allOdds, search]
  );

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
