/**
 * SQL Migration — execute no SQL Editor do Supabase:
 *
 * -- 1. Adiciona colunas title e status
 * alter table suggestions
 *   add column if not exists title  text not null default '',
 *   add column if not exists status text not null default 'votacao'
 *     check (status in ('votacao', 'desenvolvimento', 'lancado'));
 *
 * -- 2. Admin pode atualizar qualquer sugestão
 * create policy "admin update suggestions" on suggestions for update
 *   using (auth.uid() = user_id OR auth.email() = 'michael.martins.trader@gmail.com');
 *
 * -- Políticas base (já devem existir):
 * -- create policy "public read suggestions"  on suggestions for select using (true);
 * -- create policy "auth insert suggestions"  on suggestions for insert with check (auth.uid() = user_id);
 * -- create policy "auth delete suggestions"  on suggestions for delete
 * --   using (auth.uid() = user_id OR auth.email() = 'michael.martins.trader@gmail.com');
 * -- create policy "public read votes"        on suggestion_votes for select using (true);
 * -- create policy "auth insert votes"        on suggestion_votes for insert with check (auth.uid() = user_id);
 * -- create policy "auth update votes"        on suggestion_votes for update using (auth.uid() = user_id);
 * -- create policy "auth delete own votes"    on suggestion_votes for delete using (auth.uid() = user_id);
 */

'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { Trash2, Edit2, Check, X } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useStore } from '@/store/useStore';

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_EMAIL   = 'michael.martins.trader@gmail.com';
const MAX_PER_USER  = 5;
const MAX_TITLE     = 80;
const MAX_DESC      = 300;

// ── Types ─────────────────────────────────────────────────────────────────────

type Status  = 'votacao' | 'desenvolvimento' | 'lancado';
type SortKey = 'score' | 'recent' | 'oldest';

interface Suggestion {
  id: string;
  user_id: string | null;
  author_name: string | null;
  title: string;
  content: string;
  status: Status;
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
  score: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<Status, { label: string; color: string; bg: string; border: string }> = {
  votacao:         { label: 'Em Votação',        color: '#FFD600', bg: 'rgba(255,214,0,.1)',   border: 'rgba(255,214,0,.22)'    },
  desenvolvimento: { label: 'Em Desenvolvimento', color: '#4DA6FF', bg: 'rgba(77,166,255,.1)', border: 'rgba(77,166,255,.22)'   },
  lancado:         { label: 'Lançado',            color: '#3FFF21', bg: 'rgba(63,255,33,.1)',   border: 'rgba(63,255,33,.22)'   },
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'score',  label: 'Mais votados' },
  { key: 'recent', label: 'Recentes'     },
  { key: 'oldest', label: 'Antigos'      },
];

const STATUS_FILTERS: { key: Status | 'all'; label: string }[] = [
  { key: 'all',             label: 'Todas'           },
  { key: 'votacao',         label: 'Em Votação'      },
  { key: 'desenvolvimento', label: 'Desenvolvimento' },
  { key: 'lancado',         label: 'Lançado'         },
];

const TOP_MEDAL = ['🏆', '🥈', '🥉'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 2)  return 'agora';
  if (mins  < 60) return `há ${mins}min`;
  if (hours < 24) return `há ${hours}h`;
  if (days  < 30) return `há ${days}d`;
  return `há ${Math.floor(days / 30)}m`;
}

function firstName(name: string | null): string {
  if (!name) return 'Anônimo';
  return name.split(' ')[0];
}

function computeScore(likes: number, dislikes: number, createdAt: string): number {
  const days    = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  const recency = Math.max(0, 7 - days); // +7 bonus para ideias da última semana
  return likes * 2 - dislikes + recency;
}

function charColor(cur: number, max: number): string {
  const p = cur / max;
  if (p < 0.7) return 'var(--t3)';
  if (p < 0.9) return 'var(--y)';
  return 'var(--r)';
}

function hasDuplicate(title: string, list: SuggestionWithVotes[]): boolean {
  const n = title.toLowerCase().replace(/\s+/g, ' ').trim();
  return list.some(s => {
    const sn = (s.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return sn === n || (n.length > 15 && sn.length > 15 && (sn.includes(n) || n.includes(sn)));
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="px-3 py-1 rounded-lg text-[11px] font-bold transition-all"
      style={{
        background: active ? 'rgba(63,255,33,.1)'            : 'rgba(255,255,255,.03)',
        color:      active ? 'var(--g)'                       : 'var(--t3)',
        border:     active ? '1px solid rgba(63,255,33,.2)'   : '1px solid rgba(255,255,255,.05)',
      }}>
      {children}
    </button>
  );
}

function SortBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="px-3 py-1 rounded-lg text-[11px] font-bold transition-all"
      style={{
        background: active ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)',
        color:      active ? 'var(--t)'              : 'var(--t3)',
        border:     active ? '1px solid rgba(255,255,255,.12)' : '1px solid transparent',
      }}>
      {children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SugestoesPage() {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [suggestions,  setSuggestions]  = useState<SuggestionWithVotes[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [unavailable,  setUnavailable]  = useState(false);
  const [userId,       setUserId]       = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState('');

  // ── Composer ─────────────────────────────────────────────────────────────────
  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle,     setNewTitle]     = useState('');
  const [newContent,   setNewContent]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState('');
  const [dupWarning,   setDupWarning]   = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [sort,         setSort]         = useState<SortKey>('score');

  // ── Admin edit ────────────────────────────────────────────────────────────
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editTitle,   setEditTitle]   = useState('');
  const [editContent, setEditContent] = useState('');
  const [editStatus,  setEditStatus]  = useState<Status>('votacao');
  const [saving,      setSaving]      = useState(false);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const supabase  = getSupabaseClient();
  const authEmail = useStore(s => s.authEmail);
  const isAdmin   = authEmail === ADMIN_EMAIL;

  // ── Fetch user ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      if (!u) return;
      setUserId(u.id);
      const meta = u.user_metadata as Record<string, string> | undefined;
      setUserFullName(meta?.full_name || meta?.name || u.email?.split('@')[0] || 'Usuário');
    });
  }, [supabase.auth]);

  // ── Fetch data ────────────────────────────────────────────────────────────
  async function fetchData() {
    try {
      const [{ data: sRows, error: sErr }, { data: vRows, error: vErr }] = await Promise.all([
        supabase.from('suggestions').select('*').order('created_at', { ascending: false }),
        supabase.from('suggestion_votes').select('*'),
      ]);
      if (sErr || vErr) { setUnavailable(true); return; }

      const votes      = (vRows || []) as Vote[];
      const currentUid = (await supabase.auth.getUser()).data?.user?.id ?? null;

      const merged: SuggestionWithVotes[] = (sRows || []).map((s: Suggestion) => {
        const sv       = votes.filter(v => v.suggestion_id === s.id);
        const likes    = sv.filter(v => v.vote ===  1).length;
        const dislikes = sv.filter(v => v.vote === -1).length;
        const myVote   = ((currentUid ? sv.find(v => v.user_id === currentUid)?.vote : 0) ?? 0) as 1 | -1 | 0;
        const score    = computeScore(likes, dislikes, s.created_at);
        return {
          ...s,
          title:  s.title  || '',
          status: (s.status as Status) || 'votacao',
          likes, dislikes, myVote, score,
        };
      });

      setSuggestions(merged);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const byScore = useMemo(() =>
    [...suggestions].sort((a, b) => b.score - a.score),
  [suggestions]);

  const displayed = useMemo(() => {
    let list = [...suggestions];
    if (filterStatus !== 'all') list = list.filter(s => s.status === filterStatus);
    if (sort === 'score')  list.sort((a, b) => b.score - a.score);
    if (sort === 'recent') list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sort === 'oldest') list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return list;
  }, [suggestions, filterStatus, sort]);

  const userCount    = suggestions.filter(s => s.user_id === userId).length;
  const canSubmitMore = userCount < MAX_PER_USER;
  const titleOk      = newTitle.trim().length >= 3;
  const contentOk    = newContent.trim().length >= 10;
  const formReady    = titleOk && contentOk;

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const t = newTitle.trim();
    const c = newContent.trim();
    if (!t || !c || !userId) return;
    if (hasDuplicate(t, suggestions)) { setDupWarning(true); return; }
    setSubmitting(true); setSubmitError(''); setDupWarning(false);
    try {
      const { error } = await supabase.from('suggestions').insert({
        user_id: userId, author_name: userFullName,
        title: t, content: c, status: 'votacao',
      });
      if (error) throw error;
      setNewTitle(''); setNewContent(''); setComposerOpen(false);
      await fetchData();
    } catch {
      setSubmitError('Erro ao enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote(s: SuggestionWithVotes, vote: 1 | -1) {
    if (!userId || s.user_id === userId) return;
    try {
      if (s.myVote === vote) {
        await supabase.from('suggestion_votes').delete()
          .eq('suggestion_id', s.id).eq('user_id', userId);
      } else if (s.myVote !== 0) {
        await supabase.from('suggestion_votes').update({ vote })
          .eq('suggestion_id', s.id).eq('user_id', userId);
      } else {
        await supabase.from('suggestion_votes').insert({ suggestion_id: s.id, user_id: userId, vote });
      }
      await fetchData();
    } catch { /* silent */ }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Remover esta sugestão?')) return;
    setDeletingId(id);
    try {
      await supabase.from('suggestions').delete().eq('id', id);
      await fetchData();
    } catch { /* silent */ } finally { setDeletingId(null); }
  }

  function startEdit(s: SuggestionWithVotes) {
    setEditingId(s.id);
    setEditTitle(s.title);
    setEditContent(s.content);
    setEditStatus(s.status);
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    try {
      await supabase.from('suggestions').update({
        title: editTitle.trim(), content: editContent.trim(), status: editStatus,
      }).eq('id', id);
      setEditingId(null);
      await fetchData();
    } catch { /* silent */ } finally { setSaving(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center animate-fade-in"
      style={{ height: 200, color: 'var(--t3)', fontSize: 13 }}>
      Carregando sugestões…
    </div>
  );

  if (unavailable) return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Sugestões</h2>
        <p className="text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,.32)' }}>
          Execute o SQL de migração e recarregue a página
        </p>
      </div>
      <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <p className="text-3xl mb-3">🚀</p>
        <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Recurso em breve</p>
        <p className="text-sm" style={{ color: 'var(--t2)' }}>O board de sugestões será ativado em instantes.</p>
      </div>
    </div>
  );

  return (
    <div className="suggestion-card flex flex-col gap-5 animate-fade-in"
      style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>

      {/* ══ Wall Header ══════════════════════════════════════════════════════ */}
      <div className="wall-header flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Sugestões</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,.32)' }}>
            {suggestions.length} ideia{suggestions.length !== 1 ? 's' : ''}
            {userId && <span> · {userCount}/{MAX_PER_USER} enviadas</span>}
          </p>
        </div>

        {userId && (
          canSubmitMore ? (
            <button type="button"
              onClick={() => {
                setComposerOpen(v => !v);
                if (!composerOpen) setTimeout(() => titleInputRef.current?.focus(), 80);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: composerOpen ? 'rgba(63,255,33,.14)' : 'rgba(255,255,255,.06)',
                color:      composerOpen ? 'var(--g)' : 'var(--t)',
                border:     composerOpen ? '1px solid rgba(63,255,33,.25)' : '1px solid var(--b)',
              }}>
              {composerOpen ? '✕ Cancelar' : '+ Nova ideia'}
            </button>
          ) : (
            <span className="text-[11px] px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,.04)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
              Limite de {MAX_PER_USER} atingido
            </span>
          )
        )}
      </div>

      {/* ══ Composer ═════════════════════════════════════════════════════════ */}
      {composerOpen && userId && (
        <div className="suggest rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: 'var(--bg2)', border: '1px solid rgba(63,255,33,.18)', boxShadow: '0 0 28px rgba(63,255,33,.05)' }}>

          {/* Title field */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
                Título <span style={{ color: 'var(--r)' }}>*</span>
              </label>
              <span className="text-[10px] font-mono transition-colors"
                style={{ color: charColor(newTitle.length, MAX_TITLE) }}>
                {newTitle.length}/{MAX_TITLE}
              </span>
            </div>
            <input
              ref={titleInputRef}
              value={newTitle}
              onChange={e => { if (e.target.value.length <= MAX_TITLE) { setNewTitle(e.target.value); setDupWarning(false); } }}
              placeholder="Resumo da sua ideia (mín. 3 caracteres)"
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
              style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${newTitle.length > 0 && !titleOk ? 'rgba(255,77,109,.3)' : 'var(--b)'}`, color: 'var(--t)', fontFamily: 'inherit' }}
              onFocus={e  => { (e.target as HTMLElement).style.borderColor = 'rgba(63,255,33,.3)'; }}
              onBlur={e   => { (e.target as HTMLElement).style.borderColor = newTitle.length > 0 && !titleOk ? 'rgba(255,77,109,.3)' : 'var(--b)'; }}
            />
            {dupWarning && (
              <p className="text-[11px]" style={{ color: 'var(--y)' }}>
                ⚠ Já existe uma sugestão similar. Verifique antes de enviar.
              </p>
            )}
          </div>

          {/* Description field */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
                Descrição <span style={{ color: 'var(--r)' }}>*</span>
              </label>
              <span className="text-[10px] font-mono transition-colors"
                style={{ color: charColor(newContent.length, MAX_DESC) }}>
                {newContent.length}/{MAX_DESC}
              </span>
            </div>
            <textarea
              value={newContent}
              onChange={e => { if (e.target.value.length <= MAX_DESC) setNewContent(e.target.value); }}
              placeholder="Descreva sua ideia com mais detalhes (mín. 10 caracteres)"
              rows={4}
              className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none transition-all"
              style={{ background: 'rgba(255,255,255,.04)', border: 'var(--b)', color: 'var(--t)', fontFamily: 'inherit' }}
              onFocus={e  => { (e.target as HTMLElement).style.border = '1px solid rgba(63,255,33,.3)'; }}
              onBlur={e   => { (e.target as HTMLElement).style.border = '1px solid var(--b)'; }}
            />
          </div>

          {submitError && <p className="text-xs" style={{ color: 'var(--r)' }}>{submitError}</p>}

          <div className="flex items-center justify-between">
            <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
              Seu nome será exibido publicamente
            </p>
            <button type="button"
              disabled={submitting || !formReady}
              onClick={handleSubmit}
              className="px-6 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: formReady ? 'rgba(63,255,33,.14)' : 'rgba(255,255,255,.04)',
                color:      formReady ? 'var(--g)'            : 'var(--t3)',
                border:     formReady ? '1px solid rgba(63,255,33,.25)' : '1px solid var(--b)',
                opacity: submitting ? 0.6 : 1,
                cursor:  !formReady   ? 'not-allowed' : 'pointer',
              }}>
              {submitting ? 'Enviando…' : 'Enviar ideia'}
            </button>
          </div>
        </div>
      )}

      {/* ══ Filters & Sort ═══════════════════════════════════════════════════ */}
      <div className="filters-group flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <TabBtn key={f.key} active={filterStatus === f.key} onClick={() => setFilterStatus(f.key)}>
              {f.label}
            </TabBtn>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div className="flex gap-1.5">
          {SORT_OPTIONS.map(o => (
            <SortBtn key={o.key} active={sort === o.key} onClick={() => setSort(o.key)}>
              {o.label}
            </SortBtn>
          ))}
        </div>
      </div>

      {/* ══ Feed ═════════════════════════════════════════════════════════════ */}
      {!displayed.length ? (
        <div className="rounded-2xl p-12 text-center"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <p className="text-3xl mb-3">💡</p>
          <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhuma sugestão aqui</p>
          <p className="text-sm" style={{ color: 'var(--t2)' }}>
            {filterStatus !== 'all' ? 'Tente outro filtro.' : 'Seja o primeiro a compartilhar uma ideia!'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayed.map(s => {
            const isOwn     = !!(userId && s.user_id === userId);
            const canDelete = isOwn || isAdmin;
            const rank      = byScore.findIndex(r => r.id === s.id) + 1; // 1-indexed
            const isTop3    = sort === 'score' && rank <= 3;
            const isEditing = editingId === s.id;
            const cfg       = STATUS_CFG[s.status] || STATUS_CFG.votacao;

            const borderColor = isTop3 && rank === 1
              ? 'rgba(255,214,0,.2)'
              : isTop3 && rank === 2
                ? 'rgba(192,192,192,.16)'
                : isTop3 && rank === 3
                  ? 'rgba(205,127,50,.14)'
                  : 'var(--b)';

            return (
              <div key={s.id}
                className="idea-card flex flex-col gap-3 rounded-2xl transition-all"
                style={{
                  background: isTop3 && rank === 1 ? 'rgba(255,214,0,.025)' : 'var(--bg2)',
                  border:     `1px solid ${borderColor}`,
                  padding: 20,
                  position: 'relative',
                }}
              >
                {/* #1 top accent */}
                {isTop3 && rank === 1 && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    borderRadius: '14px 14px 0 0',
                    background: 'linear-gradient(90deg, rgba(255,214,0,.65) 0%, transparent 80%)',
                  }} />
                )}

                {/* ── Row 1: Avatar + name + time + status + actions ── */}
                <div className="flex items-start justify-between gap-3">

                  {/* Left: avatar + name */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(63,255,33,.18), rgba(63,255,33,.06))',
                      border: '1px solid rgba(63,255,33,.2)',
                      fontSize: 12, fontWeight: 900, color: 'var(--g)',
                    }}>
                      {firstName(s.author_name)[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold truncate" style={{ color: 'var(--t)' }}>
                          {firstName(s.author_name)}
                        </span>
                        {isOwn && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                            style={{ background: 'rgba(63,255,33,.1)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.15)' }}>
                            você
                          </span>
                        )}
                        {isTop3 && (
                          <span title={`#${rank} mais votada`} style={{ fontSize: 13, lineHeight: 1 }}>
                            {TOP_MEDAL[rank - 1]}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{relativeTime(s.created_at)}</span>
                    </div>
                  </div>

                  {/* Right: status badge + admin actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="status-badge text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                      {cfg.label}
                    </span>

                    {/* Admin edit + delete */}
                    {isAdmin && !isEditing && (
                      <div className="admin-actions flex items-center gap-1">
                        <button type="button" onClick={() => startEdit(s)}
                          className="flex items-center justify-center w-6 h-6 rounded-lg transition-all"
                          style={{ color: 'var(--t3)', border: '1px solid transparent', cursor: 'pointer' }}
                          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(77,166,255,.1)'; el.style.color = '#4DA6FF'; el.style.borderColor = 'rgba(77,166,255,.2)'; }}
                          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = ''; el.style.color = 'var(--t3)'; el.style.borderColor = 'transparent'; }}
                          title="Editar">
                          <Edit2 size={11} />
                        </button>
                        <button type="button" disabled={deletingId === s.id} onClick={() => handleDelete(s.id)}
                          className="flex items-center justify-center w-6 h-6 rounded-lg transition-all"
                          style={{ color: 'var(--t3)', border: '1px solid transparent', cursor: 'pointer', opacity: deletingId === s.id ? 0.4 : 1 }}
                          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,77,109,.1)'; el.style.color = 'var(--r)'; el.style.borderColor = 'rgba(255,77,109,.2)'; }}
                          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = ''; el.style.color = 'var(--t3)'; el.style.borderColor = 'transparent'; }}
                          title="Remover">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}

                    {/* Own delete (non-admin) */}
                    {!isAdmin && isOwn && !isEditing && (
                      <button type="button" disabled={deletingId === s.id} onClick={() => handleDelete(s.id)}
                        className="flex items-center justify-center w-6 h-6 rounded-lg transition-all"
                        style={{ color: 'var(--t3)', border: '1px solid transparent', cursor: 'pointer', opacity: deletingId === s.id ? 0.4 : 1 }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,77,109,.1)'; el.style.color = 'var(--r)'; el.style.borderColor = 'rgba(255,77,109,.2)'; }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = ''; el.style.color = 'var(--t3)'; el.style.borderColor = 'transparent'; }}
                        title="Remover">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Inline edit form (admin) ── */}
                {isEditing ? (
                  <div className="flex flex-col gap-3">
                    {/* Edit title */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Título</span>
                        <span className="text-[10px] font-mono" style={{ color: charColor(editTitle.length, MAX_TITLE) }}>{editTitle.length}/{MAX_TITLE}</span>
                      </div>
                      <input value={editTitle}
                        onChange={e => { if (e.target.value.length <= MAX_TITLE) setEditTitle(e.target.value); }}
                        className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(63,255,33,.25)', color: 'var(--t)', fontFamily: 'inherit' }} />
                    </div>

                    {/* Edit description */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Descrição</span>
                        <span className="text-[10px] font-mono" style={{ color: charColor(editContent.length, MAX_DESC) }}>{editContent.length}/{MAX_DESC}</span>
                      </div>
                      <textarea value={editContent}
                        onChange={e => { if (e.target.value.length <= MAX_DESC) setEditContent(e.target.value); }}
                        rows={3}
                        className="w-full resize-none rounded-xl px-3 py-2 text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(63,255,33,.25)', color: 'var(--t)', fontFamily: 'inherit' }} />
                    </div>

                    {/* Edit status */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Status</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {(Object.keys(STATUS_CFG) as Status[]).map(st => {
                          const c = STATUS_CFG[st];
                          return (
                            <button key={st} type="button" onClick={() => setEditStatus(st)}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                              style={{
                                background: editStatus === st ? c.bg : 'rgba(255,255,255,.03)',
                                color:      editStatus === st ? c.color : 'var(--t3)',
                                border:     editStatus === st ? `1px solid ${c.border}` : '1px solid transparent',
                              }}>
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Save / Cancel */}
                    <div className="flex gap-2 justify-end pt-1">
                      <button type="button" onClick={() => setEditingId(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
                        <X size={11} /> Cancelar
                      </button>
                      <button type="button" disabled={saving} onClick={() => handleSaveEdit(s.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(63,255,33,.14)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.25)', opacity: saving ? 0.6 : 1 }}>
                        <Check size={11} /> {saving ? 'Salvando…' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Title */}
                    {s.title && (
                      <p className="font-bold text-sm leading-snug" style={{ color: 'var(--t)' }}>
                        {s.title}
                      </p>
                    )}
                    {/* Description */}
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--t2)' }}>
                      {s.content}
                    </p>
                  </>
                )}

                {/* ── Votes section ── */}
                {!isEditing && (
                  <div className="flex items-center gap-2 pt-2"
                    style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>

                    {/* Score badge */}
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                      style={{
                        background: s.score > 0  ? 'rgba(63,255,33,.08)' : s.score < 0 ? 'rgba(255,77,109,.08)' : 'rgba(255,255,255,.04)',
                        color:      s.score > 0  ? 'var(--g)'            : s.score < 0 ? 'var(--r)'             : 'var(--t3)',
                        border:     s.score > 0  ? '1px solid rgba(63,255,33,.15)' : s.score < 0 ? '1px solid rgba(255,77,109,.15)' : '1px solid rgba(255,255,255,.06)',
                        minWidth: 38, textAlign: 'center',
                      }}>
                      {s.score > 0 ? '+' : ''}{Math.floor(s.score)}
                    </span>

                    <div style={{ flex: 1 }} />

                    {/* Like */}
                    <button type="button" disabled={isOwn} onClick={() => handleVote(s, 1)}
                      className="vote-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: s.myVote === 1  ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.04)',
                        color:      s.myVote === 1  ? 'var(--g)'            : 'var(--t3)',
                        border:     s.myVote === 1  ? '1px solid rgba(63,255,33,.2)' : '1px solid rgba(255,255,255,.06)',
                        cursor:  isOwn ? 'not-allowed' : 'pointer',
                        opacity: isOwn ? 0.4 : 1,
                      }}>
                      <span>👍</span><span>{s.likes}</span>
                    </button>

                    {/* Dislike */}
                    <button type="button" disabled={isOwn} onClick={() => handleVote(s, -1)}
                      className="vote-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: s.myVote === -1 ? 'rgba(255,77,109,.12)' : 'rgba(255,255,255,.04)',
                        color:      s.myVote === -1 ? 'var(--r)'             : 'var(--t3)',
                        border:     s.myVote === -1 ? '1px solid rgba(255,77,109,.2)' : '1px solid rgba(255,255,255,.06)',
                        cursor:  isOwn ? 'not-allowed' : 'pointer',
                        opacity: isOwn ? 0.4 : 1,
                      }}>
                      <span>👎</span><span>{s.dislikes}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
