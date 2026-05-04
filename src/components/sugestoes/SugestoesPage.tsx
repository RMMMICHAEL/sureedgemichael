/**
 * SQL para criar as tabelas no Supabase (execute no SQL Editor):
 *
 * create table if not exists suggestions (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references auth.users(id) on delete cascade,
 *   author_name text,
 *   content text not null,
 *   created_at timestamptz default now()
 * );
 * create table if not exists suggestion_votes (
 *   id uuid primary key default gen_random_uuid(),
 *   suggestion_id uuid references suggestions(id) on delete cascade,
 *   user_id uuid references auth.users(id) on delete cascade,
 *   vote int not null check (vote in (1,-1)),
 *   unique(suggestion_id, user_id)
 * );
 * alter table suggestions enable row level security;
 * alter table suggestion_votes enable row level security;
 * create policy "public read suggestions" on suggestions for select using (true);
 * create policy "auth insert suggestions" on suggestions for insert with check (auth.uid() = user_id);
 * create policy "public read votes" on suggestion_votes for select using (true);
 * create policy "auth insert votes" on suggestion_votes for insert with check (auth.uid() = user_id);
 * create policy "auth update votes" on suggestion_votes for update using (auth.uid() = user_id);
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Suggestion {
  id: string;
  user_id: string | null;
  author_name: string | null;
  content: string;
  created_at: string;
}

interface Vote {
  id: string;
  suggestion_id: string;
  user_id: string;
  vote: 1 | -1;
}

interface SuggestionWithVotes extends Suggestion {
  likes: number;
  dislikes: number;
  myVote: 1 | -1 | 0;
  netVotes: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return 'agora';
  if (mins < 60)  return `há ${mins} minuto${mins > 1 ? 's' : ''}`;
  if (hours < 24) return `há ${hours} hora${hours > 1 ? 's' : ''}`;
  if (days < 30)  return `há ${days} dia${days > 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  return `há ${months} ${months > 1 ? 'meses' : 'mês'}`;
}

function firstName(name: string | null): string {
  if (!name) return 'Anônimo';
  return name.split(' ')[0];
}

// ── Main component ────────────────────────────────────────────────────────────

export function SugestoesPage() {
  const [suggestions, setSuggestions] = useState<SuggestionWithVotes[]>([]);
  const [loading, setLoading]         = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [userId, setUserId]           = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState<string>('');
  const [newContent, setNewContent]   = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const supabase = getSupabaseClient();

  // ── Fetch current user ────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      if (u) {
        setUserId(u.id);
        const meta = u.user_metadata as Record<string, string> | undefined;
        setUserFullName(meta?.full_name || meta?.name || u.email?.split('@')[0] || 'Usuário');
      }
    });
  }, [supabase.auth]);

  // ── Fetch data ────────────────────────────────────────────────────────────
  async function fetchData() {
    try {
      const [{ data: sRows, error: sErr }, { data: vRows, error: vErr }] = await Promise.all([
        supabase.from('suggestions').select('*').order('created_at', { ascending: false }),
        supabase.from('suggestion_votes').select('*'),
      ]);

      if (sErr || vErr) {
        setUnavailable(true);
        return;
      }

      const votes: Vote[] = (vRows || []) as Vote[];
      const currentUid = (await supabase.auth.getUser()).data?.user?.id ?? null;

      const merged: SuggestionWithVotes[] = (sRows || []).map((s: Suggestion) => {
        const sv = votes.filter(v => v.suggestion_id === s.id);
        const likes    = sv.filter(v => v.vote === 1).length;
        const dislikes = sv.filter(v => v.vote === -1).length;
        const myVoteRow = currentUid ? sv.find(v => v.user_id === currentUid) : undefined;
        const myVote    = (myVoteRow?.vote ?? 0) as 1 | -1 | 0;
        return { ...s, likes, dislikes, myVote, netVotes: likes - dislikes };
      });

      merged.sort((a, b) => b.netVotes - a.netVotes);
      setSuggestions(merged);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  // ── Submit new suggestion ─────────────────────────────────────────────────
  async function handleSubmit() {
    if (!newContent.trim() || !userId) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const { error } = await supabase.from('suggestions').insert({
        user_id:     userId,
        author_name: userFullName,
        content:     newContent.trim(),
      });
      if (error) throw error;
      setNewContent('');
      await fetchData();
    } catch {
      setSubmitError('Erro ao enviar sugestão. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Vote ──────────────────────────────────────────────────────────────────
  async function handleVote(s: SuggestionWithVotes, vote: 1 | -1) {
    if (!userId) return;
    if (s.user_id === userId) return; // can't vote own suggestion

    try {
      if (s.myVote === vote) {
        // Remove vote (toggle off) — delete the row
        await supabase
          .from('suggestion_votes')
          .delete()
          .eq('suggestion_id', s.id)
          .eq('user_id', userId);
      } else if (s.myVote !== 0) {
        // Change vote
        await supabase
          .from('suggestion_votes')
          .update({ vote })
          .eq('suggestion_id', s.id)
          .eq('user_id', userId);
      } else {
        // New vote
        await supabase
          .from('suggestion_votes')
          .insert({ suggestion_id: s.id, user_id: userId, vote });
      }
      await fetchData();
    } catch {
      // silent fail
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-5 animate-fade-in">
        <div style={{ height: 60 }} />
        <div className="flex items-center justify-center" style={{ color: 'var(--t3)', fontSize: 14 }}>
          Carregando sugestões…
        </div>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex flex-col gap-5 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Sugestões</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,.35)' }}>
            Compartilhe suas ideias para melhorar o SureEdge
          </p>
        </div>
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
        >
          <p className="text-3xl mb-3">🚀</p>
          <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Recurso em breve</p>
          <p className="text-sm" style={{ color: 'var(--t2)' }}>
            O board de sugestões estará disponível em breve. Fique ligado!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in" style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Sugestões</h2>
        <p className="text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,.35)' }}>
          Compartilhe suas ideias para melhorar o SureEdge
        </p>
      </div>

      {/* Composer */}
      {userId && (
        <div
          className="rounded-2xl p-4 flex flex-col gap-3"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
        >
          <textarea
            ref={textareaRef}
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Sua sugestão para o SureEdge…"
            rows={3}
            className="w-full resize-none text-sm rounded-xl px-4 py-3 transition-all outline-none"
            style={{
              background: 'rgba(255,255,255,.04)',
              border: '1px solid var(--b)',
              color: 'var(--t)',
              fontFamily: 'inherit',
            }}
            onFocus={e => { (e.target as HTMLElement).style.borderColor = 'rgba(63,255,33,.3)'; }}
            onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--b)'; }}
          />
          {submitError && (
            <p className="text-xs" style={{ color: 'var(--r)' }}>{submitError}</p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={submitting || !newContent.trim()}
              onClick={handleSubmit}
              className="px-5 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: newContent.trim() ? 'rgba(63,255,33,.15)' : 'rgba(255,255,255,.04)',
                color: newContent.trim() ? 'var(--g)' : 'var(--t3)',
                border: newContent.trim() ? '1px solid rgba(63,255,33,.25)' : '1px solid var(--b)',
                cursor: newContent.trim() ? 'pointer' : 'not-allowed',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      )}

      {/* Feed */}
      {!suggestions.length ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
        >
          <p className="text-3xl mb-3">💡</p>
          <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhuma sugestão ainda</p>
          <p className="text-sm" style={{ color: 'var(--t2)' }}>
            Seja o primeiro a compartilhar uma ideia!
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {suggestions.map(s => {
            const isOwn = userId && s.user_id === userId;
            const likeActive    = s.myVote === 1;
            const dislikeActive = s.myVote === -1;

            return (
              <div
                key={s.id}
                className="rounded-2xl p-5 flex flex-col gap-3 transition-all"
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--b)',
                  borderRadius: 14,
                }}
              >
                {/* Header: author + time */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, rgba(63,255,33,.18), rgba(63,255,33,.06))',
                        border: '1px solid rgba(63,255,33,.2)',
                        fontSize: 11, fontWeight: 900, color: 'var(--g)', flexShrink: 0,
                      }}
                    >
                      {firstName(s.author_name)[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-xs font-bold" style={{ color: 'var(--t)' }}>
                      {firstName(s.author_name)}
                      {isOwn && (
                        <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                          style={{ background: 'rgba(63,255,33,.1)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.15)' }}>
                          você
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="text-[10px]" style={{ color: 'var(--t3)' }}>
                    {relativeTime(s.created_at)}
                  </span>
                </div>

                {/* Content */}
                <p className="text-sm leading-relaxed" style={{ color: 'var(--t2)' }}>
                  {s.content}
                </p>

                {/* Vote row */}
                <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
                  {/* Net votes badge */}
                  <span
                    className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                    style={{
                      background: s.netVotes > 0
                        ? 'rgba(63,255,33,.08)'
                        : s.netVotes < 0
                          ? 'rgba(255,77,109,.08)'
                          : 'rgba(255,255,255,.04)',
                      color: s.netVotes > 0 ? 'var(--g)' : s.netVotes < 0 ? 'var(--r)' : 'var(--t3)',
                      border: s.netVotes > 0
                        ? '1px solid rgba(63,255,33,.15)'
                        : s.netVotes < 0
                          ? '1px solid rgba(255,77,109,.15)'
                          : '1px solid rgba(255,255,255,.06)',
                      minWidth: 32, textAlign: 'center',
                    }}
                  >
                    {s.netVotes > 0 ? '+' : ''}{s.netVotes}
                  </span>

                  <div className="flex-1" />

                  {/* Like button */}
                  <button
                    type="button"
                    disabled={!!isOwn}
                    onClick={() => handleVote(s, 1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                    style={{
                      background: likeActive ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.04)',
                      color: likeActive ? 'var(--g)' : 'var(--t3)',
                      border: likeActive ? '1px solid rgba(63,255,33,.2)' : '1px solid rgba(255,255,255,.06)',
                      cursor: isOwn ? 'not-allowed' : 'pointer',
                      opacity: isOwn ? 0.4 : 1,
                    }}
                  >
                    <span>👍</span>
                    <span>{s.likes}</span>
                  </button>

                  {/* Dislike button */}
                  <button
                    type="button"
                    disabled={!!isOwn}
                    onClick={() => handleVote(s, -1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                    style={{
                      background: dislikeActive ? 'rgba(255,77,109,.12)' : 'rgba(255,255,255,.04)',
                      color: dislikeActive ? 'var(--r)' : 'var(--t3)',
                      border: dislikeActive ? '1px solid rgba(255,77,109,.2)' : '1px solid rgba(255,255,255,.06)',
                      cursor: isOwn ? 'not-allowed' : 'pointer',
                      opacity: isOwn ? 0.4 : 1,
                    }}
                  >
                    <span>👎</span>
                    <span>{s.dislikes}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
