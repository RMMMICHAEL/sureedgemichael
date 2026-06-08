'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bestOdds(bkms: BookmakerOdds[]) {
  let bH = 0, bD = 0, bA = 0;
  let nH = '', nD = '', nA = '';
  for (const b of bkms) {
    if (b.home > bH) { bH = b.home; nH = b.name; }
    if (b.draw > bD) { bD = b.draw; nD = b.name; }
    if (b.away > bA) { bA = b.away; nA = b.name; }
  }
  return { bH, bD, bA, nH, nD, nA };
}

function margin(h: number, d: number, a: number) {
  if (!h || !d || !a) return 999;
  return (1 / h + 1 / d + 1 / a) * 100 - 100;
}

function isSurebet(h: number, d: number, a: number) {
  return h > 0 && d > 0 && a > 0 && 1 / h + 1 / d + 1 / a < 1;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  } catch { return iso; }
}

// ─── Componente ───────────────────────────────────────────────────────────────

// ─── Painel de configuração DuploGreen (admin) ───────────────────────────────

function DGSetupPanel({ onClose }: { onClose: () => void }) {
  const [accessToken,  setAccessToken]  = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [expiresAt,    setExpiresAt]    = useState('');
  const [loading,      setLoading]      = useState(false);
  const [msg,          setMsg]          = useState('');
  const [error,        setError]        = useState('');

  async function handleSave() {
    if (!accessToken.startsWith('eyJ'))  { setError('access_token inválido'); return; }
    if (!refreshToken)                   { setError('refresh_token obrigatório'); return; }
    setLoading(true); setError(''); setMsg('');
    try {
      const res  = await fetch('/api/dg/set-token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          access_token:  accessToken.trim(),
          refresh_token: refreshToken.trim(),
          expires_at:    expiresAt ? Number(expiresAt) : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setMsg(`Sessão salva! TTL: ${Math.round(data.ttl / 60)} min. Agora rode: node scripts/dg-poller.mjs`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12, fontFamily: 'monospace',
    background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)', color: 'var(--t)', outline: 'none',
  };

  return (
    <div style={{
      padding: '16px 18px', borderRadius: 12, marginBottom: 12,
      background: 'rgba(129,140,248,.06)', border: '1px solid rgba(129,140,248,.25)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', marginBottom: 10 }}>
        Configurar DuploGreen
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 12, lineHeight: 1.6 }}>
        1. Abra <strong style={{ color: 'var(--t2)' }}>duplogreenengine.com</strong> e faça login<br/>
        2. DevTools (F12) → Console → execute:<br/>
        <code style={{ background: 'rgba(255,255,255,.05)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
          JSON.parse(localStorage.getItem(&apos;sb-db-auth-token&apos;))
        </code><br/>
        3. Copie <strong style={{ color: '#818cf8' }}>access_token</strong>, <strong style={{ color: '#818cf8' }}>refresh_token</strong> e <strong style={{ color: '#818cf8' }}>expires_at</strong>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>access_token</div>
          <input style={inp} value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="eyJ..." />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>refresh_token</div>
          <input style={inp} value={refreshToken} onChange={e => setRefreshToken(e.target.value)} placeholder="cole o refresh_token aqui" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>expires_at (opcional — unix timestamp)</div>
          <input style={inp} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} placeholder="ex: 1749340800" />
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>⚠ {error}</div>}
      {msg   && <div style={{ fontSize: 12, color: '#4ade80', marginTop: 8 }}>✓ {msg}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: 'rgba(255,255,255,.06)', border: '1px solid var(--b)', color: 'var(--t3)', cursor: 'pointer',
        }}>Cancelar</button>
        <button onClick={handleSave} disabled={loading} style={{
          flex: 1, padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: 'rgba(129,140,248,.2)', border: '1px solid rgba(129,140,248,.4)',
          color: '#818cf8', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
        }}>
          {loading ? 'Salvando…' : 'Salvar sessão'}
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BuscarOddsPage() {
  const [rows,      setRows]      = useState<OddsSummary[]>([]);
  const [filtered,  setFiltered]  = useState<OddsSummary[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [league,    setLeague]    = useState('all');
  const [sort,      setSort]      = useState<'time' | 'margin' | 'bkm'>('time');
  const [lastUpd,   setLastUpd]   = useState('');
  const [source,    setSource]    = useState<'duplogreenengine' | 'altenar' | ''>('');
  const [cacheAge,  setCacheAge]  = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const isAdmin = useRef(false);

  // Detecta admin via email (lido do Supabase session no cliente)
  useEffect(() => {
    fetch('/api/dg/set-token')
      .then(r => r.json())
      .then(d => { if (d.ok !== undefined) isAdmin.current = true; })
      .catch(() => {});
  }, []);

  // ── Carrega ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/dg/odds');
      const data = await res.json() as {
        ok: boolean; error?: string;
        odds?: OddsSummary[]; source?: string; cache_age?: number;
      };
      if (!data.ok) throw new Error(data.error ?? 'Erro ao carregar odds');
      setRows(data.odds ?? []);
      setSource((data.source ?? '') as typeof source);
      setCacheAge(data.cache_age ?? 0);
      setLastUpd(new Date().toLocaleTimeString('pt-BR'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filtra + ordena ───────────────────────────────────────────────────────
  useEffect(() => {
    let list = [...rows];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.home_team.toLowerCase().includes(q) ||
        r.away_team.toLowerCase().includes(q) ||
        r.league_name.toLowerCase().includes(q),
      );
    }
    if (league !== 'all') {
      list = list.filter(r => r.league_id === Number(league));
    }
    list.sort((a, b) => {
      if (sort === 'margin') {
        const { bH: aH, bD: aD, bA: aA } = bestOdds(a.bookmakers);
        const { bH: bH2, bD: bD2, bA: bA2 } = bestOdds(b.bookmakers);
        return margin(aH, aD, aA) - margin(bH2, bD2, bA2);
      }
      if (sort === 'bkm') return b.bookmakers.length - a.bookmakers.length;
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
    setFiltered(list);
  }, [rows, search, league, sort]);

  const leagues = Array.from(
    new Map(rows.map(r => [r.league_id, r.league_name]))
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const surebetCount = filtered.filter(r => {
    const { bH, bD, bA } = bestOdds(r.bookmakers);
    return isSurebet(bH, bD, bA);
  }).length;

  // Legenda da fonte
  function sourceLabel() {
    if (loading) return 'Carregando…';
    if (source === 'duplogreenengine') {
      return `${filtered.length} jogos · DuploGreen · 20+ casas · cache ${cacheAge}min atrás · ${lastUpd}`;
    }
    return `${filtered.length} jogos · EstrelaBet · Br4bet · EsportivaBet · Jogo de Ouro · ${lastUpd}`;
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)' }}>Buscar Odds</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>{sourceLabel()}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {source === 'duplogreenengine' && (
            <div style={{
              padding: '3px 8px', borderRadius: 6,
              background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.3)',
              fontSize: 10, fontWeight: 700, color: '#818cf8',
            }}>DG</div>
          )}
          {surebetCount > 0 && (
            <div style={{
              padding: '4px 10px', borderRadius: 20,
              background: 'rgba(63,255,33,.12)', border: '1px solid rgba(63,255,33,.3)',
              fontSize: 12, fontWeight: 700, color: 'var(--g)',
            }}>
              🎯 {surebetCount} surebet{surebetCount > 1 ? 's' : ''}
            </div>
          )}
          {isAdmin.current && (
            <button onClick={() => setShowSetup(s => !s)} style={{
              padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              background: 'rgba(129,140,248,.1)', border: '1px solid rgba(129,140,248,.25)',
              color: '#818cf8', cursor: 'pointer',
            }}>
              {showSetup ? 'Fechar' : 'Config DG'}
            </button>
          )}
          <button onClick={load} disabled={loading} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'var(--bg2)', border: '1px solid var(--b)',
            color: 'var(--t2)', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
          }}>
            {loading ? '…' : '↻ Atualizar'}
          </button>
        </div>
      </div>

      {/* Painel de configuração DG (admin only) */}
      {showSetup && <DGSetupPanel onClose={() => setShowSetup(false)} />}

      {/* Erro */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.2)',
          color: '#f87171', fontSize: 13,
        }}>⚠️ {error}</div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar time ou liga…"
          style={{
            flex: 1, minWidth: 180, padding: '7px 12px', borderRadius: 8,
            background: 'var(--bg2)', border: '1px solid var(--b)',
            color: 'var(--t)', fontSize: 13, outline: 'none',
          }}
        />
        <select value={league} onChange={e => setLeague(e.target.value)} style={{
          padding: '7px 10px', borderRadius: 8, background: 'var(--bg2)',
          border: '1px solid var(--b)', color: 'var(--t)', fontSize: 13, cursor: 'pointer',
        }}>
          <option value="all">Todas as ligas</option>
          {leagues.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} style={{
          padding: '7px 10px', borderRadius: 8, background: 'var(--bg2)',
          border: '1px solid var(--b)', color: 'var(--t)', fontSize: 13, cursor: 'pointer',
        }}>
          <option value="time">Ordenar: Horário</option>
          <option value="margin">Ordenar: Menor margem</option>
          <option value="bkm">Ordenar: Mais casas</option>
        </select>
      </div>

      {/* Skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{
              height: 80, borderRadius: 10, background: 'var(--bg2)',
              border: '1px solid var(--b)', opacity: 1 - i * 0.1,
            }} />
          ))}
        </div>
      )}

      {/* Vazio */}
      {!loading && filtered.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--t3)', fontSize: 14 }}>
          Nenhum jogo encontrado.
        </div>
      )}

      {/* Lista */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(row => {
            const { bH, bD, bA, nH, nD, nA } = bestOdds(row.bookmakers);
            const mgn  = margin(bH, bD, bA);
            const sure = isSurebet(bH, bD, bA);

            return (
              <div key={row.match_id} style={{
                borderRadius: 10,
                background: sure ? 'rgba(63,255,33,.04)' : 'var(--bg2)',
                border: `1px solid ${sure ? 'rgba(63,255,33,.3)' : 'var(--b)'}`,
                padding: '10px 14px',
              }}>
                {/* Linha 1 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {sure && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                        background: 'rgba(63,255,33,.15)', color: 'var(--g)', flexShrink: 0,
                      }}>SUREBET</span>
                    )}
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: 'var(--t)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {row.home_team} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>vs</span> {row.away_team}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>{fmtTime(row.start_time)}</span>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 10,
                      background: 'var(--bg)', color: 'var(--t3)', border: '1px solid var(--b)',
                    }}>
                      {row.bookmakers.length} casas
                    </span>
                  </div>
                </div>

                {/* Linha 2 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>{row.league_name}</span>

                    {/* Odds */}
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[
                        { label: '1', odd: bH, bkm: nH },
                        { label: 'X', odd: bD, bkm: nD },
                        { label: '2', odd: bA, bkm: nA },
                      ].map(({ label, odd, bkm }) => (
                        <div key={label} title={`Melhor: ${bkm}`} style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          padding: '3px 8px', borderRadius: 7,
                          background: 'var(--bg)', border: '1px solid var(--b)', minWidth: 50,
                        }}>
                          <span style={{ fontSize: 10, color: 'var(--t3)' }}>{label}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', lineHeight: 1.2 }}>
                            {odd > 0 ? odd.toFixed(2) : '—'}
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1, maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {bkm}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Odds por casa (detalhes) */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {row.bookmakers.map(b => (
                        <a
                          key={b.slug}
                          href={b.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${b.name}: ${b.home} / ${b.draw} / ${b.away}`}
                          style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 6,
                            background: 'var(--bg)', border: '1px solid var(--b)',
                            color: 'var(--t3)', textDecoration: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {b.name.replace('EstrelaBet', 'Estrela').replace('EsportivaBet', 'Esportiva').replace('Jogo de Ouro', 'JdO')}
                          <span style={{ marginLeft: 4, color: 'var(--t2)' }}>
                            {b.home.toFixed(2)}/{b.draw.toFixed(2)}/{b.away.toFixed(2)}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* Margem */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: sure ? 'var(--g)' : mgn < 4 ? '#facc15' : 'var(--t3)',
                    }}>
                      {sure ? `−${Math.abs(mgn).toFixed(1)}%` : `+${mgn.toFixed(1)}%`}
                    </span>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>margem</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
