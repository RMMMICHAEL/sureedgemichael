'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Building2, ScanSearch, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CachedEvent {
  id:          string;
  name:        string;
  sport:       string;
  league:      string;
  start_utc:   string;
  house_count: number;
}

interface BookmakerOdds {
  slug: string;
  name: string;
  home: number;
  draw: number;
  away: number;
  url:  string;
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
  'betano','novibet','betvip','betsul','betesporte','brasilbet','betsson','bet365',
  'lotogreen','kto','vivasorte','sportingbet','superbet','apostabet','br4bet',
  'esportivabet','esportesdasorte','sortenabet','betmgm','estrelabet','bet7k',
  'jogodeouro','mcgames','meridianbet','versusbet','vupibet','vaidebet',
  // slugs dos novos clientes
  'betano','superbet','novibet','ktobr','sportingbet',
]);

function isPa(slug: string): boolean {
  const n = slug.toLowerCase().replace(/[\s\-_.]/g, '');
  for (const pa of PA_SET) {
    if (n === pa || n.startsWith(pa.slice(0, 5)) || pa.startsWith(n.slice(0, 5))) return true;
  }
  return false;
}

// ─── Esportes excluídos (e-soccer / virtuais) ────────────────────────────────

const EXCL = ['e-futebol','e-soccer','esoccer','futebol virtual','virtual','esports','e-sports','efootball'];

function isExcluded(sport: string): boolean {
  const s = sport.toLowerCase();
  return EXCL.some(ex => s.includes(ex));
}

// ─── Normalização para fuzzy match ───────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function fuzzy(a: string, b: string): boolean {
  const an = norm(a), bn = norm(b);
  if (an === bn) return true;
  const short = Math.min(an.length, bn.length, 6);
  if (short < 3) return false;
  return an.slice(0, short) === bn.slice(0, short) ||
         an.includes(bn.slice(0, short)) || bn.includes(an.slice(0, short));
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

// ─── Painel de odds ───────────────────────────────────────────────────────────

function EventOddsPanel({ event, onBack }: { event: CachedEvent; onBack: () => void }) {
  const [loading,  setLoading]  = useState(true);
  const [odds,     setOdds]     = useState<OddsSummary | null>(null);
  const [fetchErr, setFetchErr] = useState('');

  async function load() {
    setLoading(true);
    setFetchErr('');
    setOdds(null);
    try {
      const res  = await fetch('/api/dg/odds?all=1');
      const data = await res.json() as { ok: boolean; odds?: OddsSummary[]; error?: string };
      if (!data.ok) throw new Error(data.error ?? 'Erro ao carregar odds');

      // Extrai times do nome do evento (padrão: "Time A x Time B")
      const [rawHome, rawAway] = event.name.split(/\s+x\s+/i);
      const home = rawHome?.trim() ?? '';
      const away = rawAway?.trim() ?? '';

      const all = data.odds ?? [];
      const match = all.find(ev =>
        fuzzy(ev.home_team, home) && fuzzy(ev.away_team, away)
      ) ?? all.find(ev =>
        fuzzy(ev.home_team, home) || fuzzy(ev.away_team, away)
      );

      if (!match) throw new Error('Jogo não encontrado nas casas integradas ainda.');
      setOdds(match);
    } catch (e: unknown) {
      setFetchErr((e as Error).message ?? 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function fmtUtc(utc: string) {
    try { return new Date(utc).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
    catch { return utc; }
  }

  // Separa casas em sem PA / com PA e calcula melhores
  const semPa = (odds?.bookmakers ?? []).filter(b => !isPa(b.slug));
  const comPa = (odds?.bookmakers ?? []).filter(b =>  isPa(b.slug));

  function bestOf(bks: BookmakerOdds[], key: keyof BookmakerOdds): number {
    const vals = bks.map(b => b[key] as number).filter(v => v > 1);
    return vals.length ? Math.max(...vals) : 0;
  }

  function margin(bks: BookmakerOdds[]): number | null {
    const h = bestOf(bks, 'home'), d = bestOf(bks, 'draw'), a = bestOf(bks, 'away');
    if (!h || !d || !a) return null;
    return (1/h + 1/d + 1/a - 1) * 100;
  }

  function BkRow({ bk, bests }: { bk: BookmakerOdds; bests: { h: number; d: number; a: number } }) {
    const isH = bk.home === bests.h && bk.home > 1;
    const isD = bk.draw === bests.d && bk.draw > 1;
    const isA = bk.away === bests.a && bk.away > 1;
    const cell = (val: number, best: boolean) => (
      <td style={{
        textAlign: 'center', padding: '6px 8px', fontSize: 12,
        fontWeight: best ? 800 : 500,
        color: best ? 'var(--g)' : 'var(--t2)',
        background: best ? 'rgba(63,255,33,.09)' : undefined,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {val > 1 ? val.toFixed(2) : <span style={{ color: 'rgba(255,255,255,.2)' }}>—</span>}
      </td>
    );
    return (
      <tr style={{ borderBottom: '1px solid rgba(255,255,255,.03)', transition: 'background .1s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}>
        <td style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--t2)', whiteSpace: 'nowrap' }}>
          {bk.url ? (
            <a href={bk.url} target="_blank" rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = '#818cf8'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = ''; }}>
              {bk.name}
            </a>
          ) : bk.name}
        </td>
        {cell(bk.home, isH)}
        {cell(bk.draw, isD)}
        {cell(bk.away, isA)}
      </tr>
    );
  }

  function Section({ title, bks, accent, bg }: {
    title: string; bks: BookmakerOdds[]; accent: string; bg: string;
  }) {
    if (!bks.length) return null;
    const sorted = [...bks].sort((a, b) => (b.home + b.draw + b.away) - (a.home + a.draw + a.away));
    const bests = {
      h: bestOf(bks, 'home'),
      d: bestOf(bks, 'draw'),
      a: bestOf(bks, 'away'),
    };
    const mgn = margin(bks);
    const isSure = mgn !== null && mgn < 0;
    return (
      <>
        <tr>
          <td colSpan={4} style={{
            padding: '6px 12px', fontSize: 9, fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: '.12em',
            color: accent, background: bg, borderTop: '1px solid var(--b)',
          }}>
            {title} · {bks.length} casa{bks.length !== 1 ? 's' : ''}
            {mgn !== null && (
              <span style={{
                marginLeft: 8, fontWeight: 700,
                color: isSure ? 'var(--g)' : 'rgba(255,255,255,.4)',
              }}>
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
    h: bestOf(odds?.bookmakers ?? [], 'home'),
    d: bestOf(odds?.bookmakers ?? [], 'draw'),
    a: bestOf(odds?.bookmakers ?? [], 'away'),
  };

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
            {event.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
            {event.league} · {fmtUtc(event.start_utc)}
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{
          padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          background: 'rgba(99,102,241,.15)', color: '#818cf8',
          border: '1px solid rgba(99,102,241,.3)', opacity: loading ? 0.5 : 1, flexShrink: 0,
        }}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          borderRadius: 14, padding: '48px 16px', textAlign: 'center',
          background: 'var(--bg2)', border: '1px solid var(--b)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>Buscando odds…</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--g)',
                animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite`,
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Erro */}
      {!loading && fetchErr && (
        <div style={{
          borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10,
          background: 'rgba(255,77,109,.06)', border: '1px solid rgba(255,77,109,.2)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--r)' }}>⚠ {fetchErr}</div>
          <button onClick={load} style={{
            alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 8, fontSize: 11,
            background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)', cursor: 'pointer',
          }}>Tentar novamente</button>
        </div>
      )}

      {/* Tabela de odds */}
      {!loading && odds && (
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

          {/* Tabela */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,.025)' }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--t3)', minWidth: 120 }}>
                    Casa
                  </th>
                  {['1','X','2'].map(l => (
                    <th key={l} style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 800,
                      textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--t3)', minWidth: 52 }}>
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Section
                  title="SEM Pagamento Antecipado"
                  bks={semPa}
                  accent="rgba(63,255,33,.8)"
                  bg="rgba(63,255,33,.04)"
                />
                <Section
                  title="COM Pagamento Antecipado"
                  bks={comPa}
                  accent="rgba(255,159,10,.8)"
                  bg="rgba(255,159,10,.04)"
                />
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
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BuscarOddsPage() {
  const today = todayBRT();

  const [selectedDate,  setSelectedDate]  = useState(today);
  const [events,        setEvents]        = useState<CachedEvent[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchErr,      setFetchErr]      = useState('');
  const [search,        setSearch]        = useState('');
  const [selectedEvent, setSelectedEvent] = useState<CachedEvent | null>(null);

  // Carrega eventos do Supabase (sm_events)
  async function loadEvents(date: string) {
    setLoading(true);
    setFetchErr('');
    setEvents([]);
    setSelectedEvent(null);
    try {
      const res  = await fetch('/api/sure/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ date }),
      });
      const json = await res.json() as { ok: boolean; events?: CachedEvent[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao carregar eventos');
      setEvents(json.events ?? []);
    } catch {
      setFetchErr('Não foi possível carregar os eventos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEvents(selectedDate); }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const normFn = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtered = useMemo(() =>
    events
      .filter(ev => !isExcluded(ev.sport ?? ''))
      .filter(ev => {
        if (!search.trim()) return true;
        const q = normFn(search);
        return normFn(ev.name).includes(q) || normFn(ev.league ?? '').includes(q);
      }),
    [events, search]
  );

  const byLeague = useMemo(() => {
    const map = new Map<string, CachedEvent[]>();
    for (const ev of filtered) {
      const key = ev.league || 'Outros';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const aBr = a[0].toLowerCase().includes('brasil') || a[0].toLowerCase().includes('série');
      const bBr = b[0].toLowerCase().includes('brasil') || b[0].toLowerCase().includes('série');
      if (aBr && !bBr) return -1;
      if (!aBr && bBr) return 1;
      return a[1][0].start_utc.localeCompare(b[1][0].start_utc);
    });
  }, [filtered]);

  const days = Array.from({ length: 10 }, (_, i) => addDays(today, i));

  // ── Modo evento selecionado ────────────────────────────────────────────────
  if (selectedEvent) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <EventOddsPanel event={selectedEvent} onBack={() => setSelectedEvent(null)} />
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
            {loading ? 'Carregando…' : `${filtered.length} eventos · ${fmtDayLabel(selectedDate)}`}
          </div>
        </div>
        <button onClick={() => loadEvents(selectedDate)} disabled={loading} style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: 'var(--bg2)', border: '1px solid var(--b)',
          color: 'var(--t2)', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
        }}>
          {loading ? '…' : '↻ Atualizar'}
        </button>
      </div>

      {/* Seletor de dia (10 dias) */}
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
          <button onClick={() => loadEvents(selectedDate)} style={{
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
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum evento encontrado</div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: .6 }}>
            {search ? 'Tente outro termo.' : 'Sem eventos para esta data.'}
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
            <button key={ev.id} onClick={() => setSelectedEvent(ev)} style={{
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
                {fmtTime(ev.start_utc)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--t)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {ev.name}
                </div>
              </div>
              {ev.house_count > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  <Building2 size={10} style={{ color: '#818cf8' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#818cf8' }}>{ev.house_count}</span>
                </div>
              )}
              <ChevronRight size={14} style={{ color: 'var(--t3)', flexShrink: 0, opacity: .4 }} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
