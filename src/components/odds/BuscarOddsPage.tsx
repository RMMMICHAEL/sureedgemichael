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

// Casas com Pagamento Antecipado
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
    if (n.length >= 4 && pa.length >= 4 && (n.startsWith(pa.slice(0,4)) || pa.startsWith(n.slice(0,4)))) return true;
  }
  return false;
}

// Esportes a excluir (virtuais / e-soccer)
const EXCLUDED_SPORTS = new Set([
  'e-futebol','e-soccer','esoccer','e soccer','futebol virtual','virtual',
  'esports','e-sports','eFootball','e-football',
]);

function isExcludedSport(sport: string): boolean {
  const s = sport.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const ex of EXCLUDED_SPORTS) {
    if (s.includes(ex)) return true;
  }
  return false;
}

// ─── Tipos de resultado da busca (supermonitor) ────────────────────────────────

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
const ML_COLS: ColKey[] = ['mlHome', 'mlDraw', 'mlAway'];
const ALL_COLS: ColKey[] = ['mlHome', 'mlDraw', 'mlAway', 'dc1X', 'dcX2', 'dc12'];
const COL_LABELS: Record<ColKey, string> = {
  mlHome: '1', mlDraw: 'X', mlAway: '2', dc1X: '1X', dcX2: 'X2', dc12: '12',
};

// ─── Parse do resultado da extensão ──────────────────────────────────────────

function parseSearchResults(raw: unknown): ParsedSearch | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const results: Record<string, unknown>[] = Array.isArray(r.results) ? r.results
    : Array.isArray(r.data) ? r.data : [];
  if (!results.length) return null;

  const first  = results[0];
  const leagueRaw = first.league;
  const league = typeof leagueRaw === 'object' && leagueRaw !== null
    ? String((leagueRaw as Record<string, unknown>).name ?? '')
    : String(leagueRaw ?? '');

  const houseMap = new Map<string, BMRow>();

  for (const result of results) {
    const bms  = result.bookmakers;
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
        const odds  = Array.isArray(market.odds) && market.odds.length > 0
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

// ─── Célula de odd ─────────────────────────────────────────────────────────────

function OCell({ val, best }: { val?: number; best: boolean }) {
  if (!val || val <= 1) {
    return (
      <td style={{ textAlign: 'center', padding: '5px 6px', fontSize: 11, color: 'rgba(255,255,255,.18)' }}>—</td>
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

// ─── Seção SEM PA / COM PA ────────────────────────────────────────────────────

function OddsSection({ title, pa, rows, bests }: {
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

// ─── Painel de odds do evento selecionado ──────────────────────────────────────

type LoadPhase = 'cache' | 'extension' | 'done';

function EventOddsPanel({ event, onBack }: { event: CachedEvent; onBack: () => void }) {
  const [phase,    setPhase]    = useState<LoadPhase>('cache');
  const [loading,  setLoading]  = useState(false);
  const [parsed,   setParsed]   = useState<ParsedSearch | null>(null);
  const [fetchErr, setFetchErr] = useState('');

  async function fetchOdds() {
    setLoading(true);
    setFetchErr('');
    setParsed(null);

    // ── Fase 1: cache rápido (/api/sure/search) ──────────────────────────
    setPhase('cache');
    try {
      const res  = await fetch('/api/sure/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: event.name }),
      });
      const json = await res.json() as {
        ok: boolean; data?: unknown; error?: string;
        reason?: string; cached_at?: string;
      };

      if (json.ok && json.data) {
        const p = parseSearchResults(json.data);
        if (p) {
          setParsed(p);
          setLoading(false);
          setPhase('done');
          return;
        }
      }

      // Cache velho ou não encontrado → tenta extensão
      const needsExtension = !json.ok; // reason: 'stale' | 'not_found' | 'error'
      if (!needsExtension) {
        throw new Error('Nenhuma odd encontrada para este evento');
      }
    } catch (e: unknown) {
      const msg = (e as Error).message ?? '';
      // Se não foi erro de "cache precisa de extensão", já para aqui
      if (!msg.includes('stale') && !msg.includes('not_found')) {
        setFetchErr(
          msg === 'Nenhuma odd encontrada para este evento' ? msg
          : 'Não foi possível carregar as odds. Verifique se o SuperMonitor está ativo.',
        );
        setLoading(false);
        return;
      }
    }

    // ── Fase 2: extensão em tempo real (/api/sure/search-odds) ──────────
    setPhase('extension');
    try {
      const res2  = await fetch('/api/sure/search-odds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: event.name }),
      });
      const json2 = await res2.json() as { ok: boolean; results?: unknown; error?: string };

      if (!json2.ok) throw new Error(json2.error ?? 'Extensão não respondeu');

      const p = parseSearchResults(json2.results);
      if (!p) throw new Error('Nenhuma odd encontrada para este evento');
      setParsed(p);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? '';
      setFetchErr(
        msg.includes('Timeout') || msg.includes('não respondeu')
          ? 'Extensão não respondeu. Verifique se o navegador está aberto com o SuperMonitor ativo.'
          : msg === 'Nenhuma odd encontrada para este evento'
            ? msg
            : 'Não foi possível carregar as odds.',
      );
    } finally {
      setLoading(false);
      setPhase('done');
    }
  }

  useEffect(() => { fetchOdds(); }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function fmtUtc(utc: string) {
    try { return new Date(utc).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return utc; }
  }

  const phaseLabel = phase === 'cache' ? 'Verificando cache…' : phase === 'extension' ? 'Buscando via SuperMonitor…' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header do evento */}
      <div style={{
        borderRadius: 14, padding: '12px 16px',
        background: 'var(--bg2)', border: '1px solid var(--b)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={onBack} style={{
          width: 30, height: 30, borderRadius: 8, border: '1px solid var(--b)',
          background: 'rgba(255,255,255,.05)', color: 'var(--t3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
            {event.league} · {fmtUtc(event.start_utc)}
            {event.house_count > 0 && ` · ${event.house_count} casas`}
          </div>
        </div>
        <button onClick={fetchOdds} disabled={loading} style={{
          padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
          background: 'rgba(99,102,241,.15)', color: '#818cf8',
          border: '1px solid rgba(99,102,241,.3)', cursor: 'pointer',
          opacity: loading ? 0.5 : 1, flexShrink: 0,
        }}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          borderRadius: 14, padding: '40px 16px', textAlign: 'center',
          background: 'var(--bg2)', border: '1px solid var(--b)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>{phaseLabel}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--g)',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
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
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--r)' }}>⚠ {fetchErr}</div>
          <button onClick={fetchOdds} style={{
            alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 8, fontSize: 11,
            background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)', cursor: 'pointer',
          }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* Tabela de odds */}
      {!loading && parsed && (() => {
        const bests  = getBests(parsed.rows);
        const semPa  = parsed.rows.filter(r => !r.pa).length;
        const comPa  = parsed.rows.filter(r =>  r.pa).length;

        return (
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
                <span style={{ color: 'rgba(63,255,33,.8)' }}>{semPa} sem PA</span>
                <span style={{ color: 'rgba(255,255,255,.2)' }}>·</span>
                <span style={{ color: 'rgba(255,159,10,.8)' }}>{comPa} com PA</span>
              </div>
            </div>

            {/* Tabela */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,.025)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 800,
                      textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--t3)', minWidth: 110 }}>
                      Casa
                    </th>
                    {ML_COLS.map(col => (
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

            {/* Linha de melhores odds */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              padding: '8px 14px',
              background: 'rgba(63,255,33,.04)', borderTop: '1px solid rgba(63,255,33,.15)',
            }}>
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(63,255,33,.7)' }}>
                Melhores odds
              </span>
              {ALL_COLS.map(col => bests[col] ? (
                <span key={col} style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)' }}>
                  <span style={{ color: 'var(--t3)' }}>{COL_LABELS[col]}</span>
                  {' '}<span style={{ color: 'var(--g)', fontWeight: 800 }}>{bests[col]!.toFixed(2)}</span>
                </span>
              ) : null)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

function todayBRT(): string {
  const d   = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function fmtDateLabel(date: string): string {
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

// ─── Componente principal ─────────────────────────────────────────────────────

export function BuscarOddsPage() {
  const today = todayBRT();

  const [selectedDate,  setSelectedDate]  = useState(today);
  const [events,        setEvents]        = useState<CachedEvent[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchErr,      setFetchErr]      = useState('');
  const [search,        setSearch]        = useState('');
  const [selectedEvent, setSelectedEvent] = useState<CachedEvent | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ── Carrega eventos do dia ─────────────────────────────────────────────────
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
    } catch (e: unknown) {
      setFetchErr('Não foi possível carregar os eventos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEvents(selectedDate); }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Filtra e-soccer e busca
  const filtered = useMemo(() => {
    return events
      .filter(ev => !isExcludedSport(ev.sport ?? ''))
      .filter(ev => {
        if (!search.trim()) return true;
        const q = normalize(search);
        return normalize(ev.name).includes(q) || normalize(ev.league ?? '').includes(q);
      });
  }, [events, search]);

  // Separar por esporte para highlights
  const byLeague = useMemo(() => {
    const map = new Map<string, CachedEvent[]>();
    for (const ev of filtered) {
      const key = ev.league || 'Outros';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries()).sort((a, b) => {
      // Ligas brasileiras primeiro
      const aBr = a[0].toLowerCase().includes('brasil') || a[0].toLowerCase().includes('série');
      const bBr = b[0].toLowerCase().includes('brasil') || b[0].toLowerCase().includes('série');
      if (aBr && !bBr) return -1;
      if (!aBr && bBr) return 1;
      return a[1][0].start_utc.localeCompare(b[1][0].start_utc);
    });
  }, [filtered]);

  // Dias disponíveis: hoje + 9 dias
  const days = Array.from({ length: 10 }, (_, i) => addDays(today, i));

  // ─── Se tem evento selecionado, mostra painel de odds ────────────────────
  if (selectedEvent) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <EventOddsPanel event={selectedEvent} onBack={() => setSelectedEvent(null)} />
      </div>
    );
  }

  // ─── Lista de eventos ────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t)' }}>Buscar Odds</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            {loading ? 'Carregando…' : `${filtered.length} eventos · ${fmtDateLabel(selectedDate)}`}
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

      {/* Seletor de dia */}
      <div style={{
        borderRadius: 12, padding: '10px 12px',
        background: 'var(--bg2)', border: '1px solid var(--b)',
        display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto',
      }}>
        <Calendar size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {days.map(day => {
            const active = day === selectedDate;
            return (
              <button
                key={day}
                onClick={() => setSelectedDate(day)}
                style={{
                  padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                  whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid',
                  background: active ? 'var(--accent, #818cf8)' : 'transparent',
                  borderColor: active ? 'var(--accent, #818cf8)' : 'var(--b)',
                  color: active ? '#fff' : 'var(--t3)',
                }}
              >
                {fmtDateLabel(day)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca */}
      <div style={{ position: 'relative' }} ref={wrapRef}>
        <Search size={13} style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--t3)', pointerEvents: 'none',
        }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar time ou liga…"
          style={{
            width: '100%', padding: '9px 34px', borderRadius: 10,
            background: 'var(--bg2)', border: '1px solid var(--b)',
            color: 'var(--t)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
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
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              height: 64, borderRadius: 10, background: 'var(--bg2)',
              border: '1px solid var(--b)', opacity: 1 - i * 0.13,
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
            {search ? 'Tente outro termo de busca.' : 'Sem eventos para esta data.'}
          </div>
        </div>
      )}

      {/* Eventos agrupados por liga */}
      {!loading && byLeague.map(([league, evs]) => (
        <div key={league} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Liga header */}
          <div style={{
            fontSize: 10, fontWeight: 900, textTransform: 'uppercase',
            letterSpacing: '.1em', color: 'var(--t3)',
            padding: '4px 2px', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ flex: 1 }}>{league}</span>
            <span style={{ opacity: .5 }}>{evs.length}</span>
          </div>

          {/* Eventos da liga */}
          {evs.map(ev => (
            <button
              key={ev.id}
              onClick={() => setSelectedEvent(ev)}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                borderRadius: 10, padding: '10px 14px',
                background: 'var(--bg2)', border: '1px solid var(--b)',
                display: 'flex', alignItems: 'center', gap: 12,
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(129,140,248,.4)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(129,140,248,.05)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--b)';
                (e.currentTarget as HTMLElement).style.background = 'var(--bg2)';
              }}
            >
              {/* Horário */}
              <div style={{
                fontSize: 12, fontWeight: 700, color: 'var(--t3)',
                flexShrink: 0, minWidth: 36, textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtTime(ev.start_utc)}
              </div>

              {/* Nome */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--t)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {ev.name}
                </div>
              </div>

              {/* Badge de casas */}
              {ev.house_count > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  flexShrink: 0,
                }}>
                  <Building2 size={10} style={{ color: '#818cf8' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#818cf8' }}>
                    {ev.house_count}
                  </span>
                </div>
              )}

              {/* Seta */}
              <ChevronRight size={14} style={{ color: 'var(--t3)', flexShrink: 0, opacity: .5 }} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
