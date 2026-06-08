'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';

const ADMIN_EMAIL = 'michael.martins.trader@gmail.com';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OddRow {
  match_id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  start_time: string;
  league_name: string;
  league_slug: string;
  best_home: number;
  best_draw: number;
  best_away: number;
  best_home_bookmaker: string;
  best_draw_bookmaker: string;
  best_away_bookmaker: string;
  bookmaker_count: number;
  home_direction?: 'up' | 'down' | 'same';
  draw_direction?: 'up' | 'down' | 'same';
  away_direction?: 'up' | 'down' | 'same';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function margin(h: number, d: number, a: number) {
  return ((1 / h + 1 / d + 1 / a) * 100 - 100).toFixed(1);
}

function isSurebet(h: number, d: number, a: number) {
  return 1 / h + 1 / d + 1 / a < 1;
}

function dirIcon(dir?: string) {
  if (dir === 'up')   return <span style={{ color: '#4ade80', fontSize: 10 }}>▲</span>;
  if (dir === 'down') return <span style={{ color: '#f87171', fontSize: 10 }}>▼</span>;
  return <span style={{ color: 'var(--t3)', fontSize: 10 }}>─</span>;
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

function bkmLabel(name: string) {
  const map: Record<string, string> = {
    'Esportes da Sorte': 'EDS',
    'EstrelaBet': 'Estrela',
    'Bet365': 'B365',
    'Betano': 'Betano',
    'Betfair': 'BFair',
    'Pinnacle': 'Pin',
    'Sportingbet': 'SBet',
    'Superbet': 'SuBet',
    'BetMGM': 'MGM',
    'Novibet': 'Novi',
    'Meridianbet': 'Meri',
    'Pixbet': 'Pix',
    'BetNacional': 'BNac',
    'VivaSorte': 'Viva',
  };
  return map[name] ?? name.slice(0, 6);
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BuscarOddsPage() {
  const authEmail  = useStore(s => s.authEmail);
  const isAdmin    = authEmail === ADMIN_EMAIL;

  const [rows,        setRows]        = useState<OddRow[]>([]);
  const [filtered,    setFiltered]    = useState<OddRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [tokenExpired, setTokenExpired] = useState(false);
  const [connecting,  setConnecting]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [league,      setLeague]      = useState('all');
  const [sort,        setSort]        = useState<'time' | 'margin' | 'bkm'>('time');
  const [lastUpd,     setLastUpd]     = useState('');

  // ── Envia token do DuploGreen para o servidor ────────────────────────────────
  const connectDG = useCallback(async () => {
    if (!isAdmin) return;
    setConnecting(true);
    try {
      // Pega o token da sessão DuploGreen armazenada no localStorage (se disponível)
      // Normalmente o admin faz isso via console: copiar e colar o token
      const tokenInput = window.prompt(
        'Cole aqui o access_token do DuploGreen\n\n' +
        'Para obter: abra www.duplogreenengine.com → F12 → Console → cole:\n\n' +
        'JSON.parse(Object.entries(localStorage).find(([k])=>k.includes("sb-db-auth-token"))[1]).access_token'
      );
      if (!tokenInput?.startsWith('eyJ')) {
        alert('Token inválido. Deve começar com "eyJ"');
        return;
      }
      const res = await fetch('/api/dg/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: tokenInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setTokenExpired(false);
        setError('');
        load();
      } else {
        alert('Erro: ' + data.error);
      }
    } finally {
      setConnecting(false);
    }
  }, [isAdmin]);

  // ── Carrega odds ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setTokenExpired(false);
    try {
      const res  = await fetch('/api/dg/odds?type=all');
      const data = await res.json();
      if (data.error === 'TOKEN_EXPIRED') {
        setTokenExpired(true);
        setLoading(false);
        return;
      }
      if (!data.ok) throw new Error(data.error ?? 'Erro ao carregar odds');
      setRows(data.odds ?? []);
      setLastUpd(new Date().toLocaleTimeString('pt-BR'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filtra + ordena ───────────────────────────────────────────────────────────
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
      list = list.filter(r => r.league_slug === league);
    }
    list.sort((a, b) => {
      if (sort === 'margin') {
        return parseFloat(margin(a.best_home, a.best_draw, a.best_away)) -
               parseFloat(margin(b.best_home, b.best_draw, b.best_away));
      }
      if (sort === 'bkm') return b.bookmaker_count - a.bookmaker_count;
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
    setFiltered(list);
  }, [rows, search, league, sort]);

  // ── Ligas únicas ─────────────────────────────────────────────────────────────
  const leagues = Array.from(new Set(rows.map(r => r.league_slug)))
    .map(slug => ({ slug, name: rows.find(r => r.league_slug === slug)?.league_name ?? slug }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const surebetCount = filtered.filter(r => isSurebet(r.best_home, r.best_draw, r.best_away)).length;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)' }}>Buscar Odds</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            {loading ? 'Carregando…' : `${filtered.length} jogos · ${rows.length} total · atualizado ${lastUpd}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {surebetCount > 0 && (
            <div style={{
              padding: '4px 10px', borderRadius: 20,
              background: 'rgba(63,255,33,.12)', border: '1px solid rgba(63,255,33,.3)',
              fontSize: 12, fontWeight: 700, color: 'var(--g)',
            }}>
              🎯 {surebetCount} surebet{surebetCount > 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'var(--bg2)', border: '1px solid var(--b)',
              color: 'var(--t2)', cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '…' : '↻ Atualizar'}
          </button>
        </div>
      </div>

      {/* Token expirado */}
      {tokenExpired && (
        <div style={{
          padding: '14px 16px', borderRadius: 10, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: 'rgba(251,191,36,.07)', border: '1px solid rgba(251,191,36,.25)',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>
              🔑 Token DuploGreen expirado
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
              {isAdmin
                ? 'Clique em Reconectar para atualizar o token de acesso.'
                : 'Aguarde o administrador reconectar o serviço de odds.'}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={connectDG}
              disabled={connecting}
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'rgba(251,191,36,.15)', border: '1px solid rgba(251,191,36,.35)',
                color: '#fbbf24', cursor: connecting ? 'wait' : 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {connecting ? 'Conectando…' : '🔗 Reconectar'}
            </button>
          )}
        </div>
      )}

      {/* Erro */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.2)',
          color: '#f87171', fontSize: 13,
        }}>
          ⚠️ {error}
        </div>
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
        <select
          value={league}
          onChange={e => setLeague(e.target.value)}
          style={{
            padding: '7px 10px', borderRadius: 8,
            background: 'var(--bg2)', border: '1px solid var(--b)',
            color: 'var(--t)', fontSize: 13, cursor: 'pointer',
          }}
        >
          <option value="all">Todas as ligas</option>
          {leagues.map(l => (
            <option key={l.slug} value={l.slug}>{l.name}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as typeof sort)}
          style={{
            padding: '7px 10px', borderRadius: 8,
            background: 'var(--bg2)', border: '1px solid var(--b)',
            color: 'var(--t)', fontSize: 13, cursor: 'pointer',
          }}
        >
          <option value="time">Ordenar: Horário</option>
          <option value="margin">Ordenar: Menor margem</option>
          <option value="bkm">Ordenar: Mais casas</option>
        </select>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{
              height: 72, borderRadius: 10,
              background: 'var(--bg2)', border: '1px solid var(--b)',
              opacity: 1 - i * 0.1,
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

      {/* Lista de jogos */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(row => {
            const mgn    = margin(row.best_home, row.best_draw, row.best_away);
            const sure   = isSurebet(row.best_home, row.best_draw, row.best_away);
            const mgnNum = parseFloat(mgn);

            return (
              <div
                key={row.match_id}
                style={{
                  borderRadius: 10,
                  background: sure ? 'rgba(63,255,33,.04)' : 'var(--bg2)',
                  border: `1px solid ${sure ? 'rgba(63,255,33,.3)' : 'var(--b)'}`,
                  padding: '10px 14px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '6px 12px',
                  alignItems: 'center',
                }}
              >
                {/* Col 1 linha 1: Times */}
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

                {/* Col 2 linha 1: Data + casas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                    {fmtTime(row.start_time)}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 10,
                    background: 'var(--bg)', color: 'var(--t3)', whiteSpace: 'nowrap',
                    border: '1px solid var(--b)',
                  }}>
                    {row.bookmaker_count} casas
                  </span>
                </div>

                {/* Col 1 linha 2: Liga + odds */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{row.league_name}</span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {([
                      { label: '1', odd: row.best_home, dir: row.home_direction, bkm: row.best_home_bookmaker },
                      { label: 'X', odd: row.best_draw, dir: row.draw_direction, bkm: row.best_draw_bookmaker },
                      { label: '2', odd: row.best_away, dir: row.away_direction, bkm: row.best_away_bookmaker },
                    ] as const).map(({ label, odd, dir, bkm }) => (
                      <div
                        key={label}
                        title={`Melhor: ${bkm}`}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          padding: '3px 8px', borderRadius: 7,
                          background: 'var(--bg)', border: '1px solid var(--b)',
                          minWidth: 50,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 10, color: 'var(--t3)' }}>{label}</span>
                          {dirIcon(dir)}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', lineHeight: 1.2 }}>
                          {odd.toFixed(2)}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1 }}>
                          {bkmLabel(bkm)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Col 2 linha 2: Margem */}
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: sure ? 'var(--g)' : mgnNum < 4 ? '#facc15' : 'var(--t3)',
                  }}>
                    {sure ? `−${Math.abs(mgnNum).toFixed(1)}%` : `+${mgn}%`}
                  </span>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>margem</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
