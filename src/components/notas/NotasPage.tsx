'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import type { Note } from '@/types';
import { Plus, Search, Pin, Trash2, X, BookOpen, ChevronLeft } from 'lucide-react';

// ── Colour palette ────────────────────────────────────────────────────────────

const COLORS = [
  { id: 'default', accent: '#94A3B8', card: 'rgba(255,255,255,.055)', border: 'rgba(255,255,255,.09)',  dot: '#475569' },
  { id: 'yellow',  accent: '#FFD60A', card: 'rgba(255,214,10,.10)',   border: 'rgba(255,214,10,.22)',   dot: '#FFD60A' },
  { id: 'orange',  accent: '#FF9F0A', card: 'rgba(255,159,10,.10)',   border: 'rgba(255,159,10,.22)',   dot: '#FF9F0A' },
  { id: 'green',   accent: '#30D158', card: 'rgba(48,209,88,.10)',    border: 'rgba(48,209,88,.22)',    dot: '#30D158' },
  { id: 'blue',    accent: '#0A84FF', card: 'rgba(10,132,255,.10)',   border: 'rgba(10,132,255,.22)',   dot: '#0A84FF' },
  { id: 'pink',    accent: '#FF375F', card: 'rgba(255,55,95,.10)',    border: 'rgba(255,55,95,.22)',    dot: '#FF375F' },
  { id: 'purple',  accent: '#BF5AF2', card: 'rgba(191,90,242,.10)',   border: 'rgba(191,90,242,.22)',   dot: '#BF5AF2' },
] as const;

type ColorId = typeof COLORS[number]['id'];

function getColor(id?: string) {
  return COLORS.find(c => c.id === id) ?? COLORS[0];
}

// ── Date formatter ────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000)       return 'agora';
  if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000)   return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604_800_000)  return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── Keyframes injected once ───────────────────────────────────────────────────

const CSS = `
@keyframes notaIn {
  from { opacity: 0; transform: scale(.93) translateY(14px); }
  to   { opacity: 1; transform: scale(1)   translateY(0);    }
}
@keyframes notaOut {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(.85) translateY(8px); }
}
@keyframes sheetUp {
  from { transform: translateY(100%); opacity: .6; }
  to   { transform: translateY(0);    opacity: 1;  }
}
@keyframes sheetDown {
  from { transform: translateY(0);    opacity: 1;  }
  to   { transform: translateY(100%); opacity: 0;  }
}
@keyframes fadeBg {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.nota-card {
  animation: notaIn .38s cubic-bezier(0.2,0.8,0.4,1) both;
}
.nota-card:hover {
  transform: scale(1.02) translateY(-2px);
  transition: transform .22s cubic-bezier(0.2,0.8,0.4,1), box-shadow .22s ease;
}
.nota-card-exit {
  animation: notaOut .28s cubic-bezier(0.4,0,1,1) forwards;
}
.nota-sheet {
  animation: sheetUp .42s cubic-bezier(0.32,0.72,0,1) forwards;
}
.nota-sheet-exit {
  animation: sheetDown .32s cubic-bezier(0.4,0,1,1) forwards;
}
.nota-fab {
  transition: transform .2s cubic-bezier(0.2,0.8,0.4,1), box-shadow .2s ease;
}
.nota-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 8px 32px rgba(255,214,10,.45);
}
.nota-fab:active {
  transform: scale(.93);
}
.nota-color-dot {
  transition: transform .18s cubic-bezier(0.2,0.8,0.4,1);
}
.nota-color-dot:hover { transform: scale(1.3); }
.nota-color-dot.selected { transform: scale(1.35); }
@media (prefers-reduced-motion: reduce) {
  .nota-card { animation: none; opacity: 1; }
  .nota-card-exit { animation: none; }
  .nota-sheet { animation: none; }
  .nota-sheet-exit { animation: none; }
  .nota-fab { transition: none; }
  .nota-color-dot { transition: none; }
}
`;

// ── Note Card ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  index,
  onOpen,
  onDelete,
  onTogglePin,
  exiting,
}: {
  note: Note;
  index: number;
  onOpen: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  exiting: boolean;
}) {
  const col      = getColor(note.color);
  const preview  = note.body.trim().split('\n').filter(Boolean).slice(0, 3).join(' · ');
  const delay    = Math.min(index * 0.045, 0.3);

  return (
    <div
      className={`nota-card${exiting ? ' nota-card-exit' : ''} group relative cursor-pointer select-none`}
      style={{
        animationDelay: `${delay}s`,
        background:     col.card,
        border:         `1px solid ${col.border}`,
        borderRadius:   18,
        padding:        '16px 16px 14px',
        marginBottom:   12,
        breakInside:    'avoid',
        transition:     'box-shadow .22s ease',
        boxShadow:      `0 2px 12px rgba(0,0,0,.18)`,
      }}
      onClick={onOpen}
    >
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 16, right: 16, height: 2,
        background: `linear-gradient(90deg, ${col.accent}60, transparent)`,
        borderRadius: '0 0 4px 4px',
      }} />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3
          className="font-bold text-sm leading-snug flex-1 line-clamp-2"
          style={{
            color: note.title ? 'var(--t)' : 'var(--t3)',
            fontFamily: "'Manrope', sans-serif",
            letterSpacing: '-.01em',
          }}
        >
          {note.title || 'Sem título'}
        </h3>

        {/* Action buttons — visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 -mt-0.5">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onTogglePin(); }}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: note.pinned ? `${col.accent}22` : 'rgba(255,255,255,.06)', color: note.pinned ? col.accent : 'var(--t3)' }}
            aria-label={note.pinned ? 'Desafixar nota' : 'Fixar nota'}
          >
            <Pin size={12} fill={note.pinned ? col.accent : 'none'} />
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,55,95,.10)', color: '#FF375F' }}
            aria-label="Apagar nota"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <p
          className="text-xs leading-relaxed line-clamp-3"
          style={{ color: 'var(--t3)', fontFamily: "'Inter', sans-serif" }}
        >
          {preview}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        <span
          className="text-[10px] font-medium"
          style={{ color: `${col.accent}99`, fontFamily: "'JetBrains Mono', monospace" }}
        >
          {fmtDate(note.updated_at)}
        </span>
        {note.pinned && (
          <Pin size={10} fill={col.accent} color={col.accent} style={{ opacity: .7 }} />
        )}
      </div>
    </div>
  );
}

// ── Editor Sheet (iOS-style slide-up modal) ───────────────────────────────────

function NoteEditor({
  note,
  onClose,
  onUpdate,
  onDelete,
}: {
  note: Note;
  onClose: () => void;
  onUpdate: (patch: Partial<Note>) => void;
  onDelete: () => void;
}) {
  const [title,   setTitle]   = useState(note.title);
  const [body,    setBody]    = useState(note.body);
  const [color,   setColor]   = useState<ColorId>(note.color as ColorId ?? 'default');
  const [closing, setClosing] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const bodyRef   = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const col       = getColor(color);

  // Auto-grow textarea
  useEffect(() => {
    const ta = bodyRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [body]);

  // Debounced save on every keystroke
  const scheduleSave = useCallback((patch: Partial<Note>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onUpdate(patch), 300);
  }, [onUpdate]);

  function handleClose() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    onUpdate({ title, body, color });
    setClosing(true);
    setTimeout(onClose, 300);
  }

  function handleDelete() {
    if (!confirm('Apagar esta nota?')) return;
    setClosing(true);
    setTimeout(() => { onDelete(); onClose(); }, 280);
  }

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.55)',
          backdropFilter: 'blur(4px)',
          zIndex: 40,
          animation: closing ? 'none' : 'fadeBg .3s ease forwards',
          opacity: closing ? 0 : undefined,
          transition: closing ? 'opacity .3s ease' : undefined,
        }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className={`nota-sheet${closing ? ' nota-sheet-exit' : ''}`}
        style={{
          position: 'fixed',
          inset: 0,
          top: '5vh',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
          borderRadius: '20px 20px 0 0',
          overflow: 'hidden',
          boxShadow: '0 -8px 48px rgba(0,0,0,.5)',
          borderTop: `2px solid ${col.border}`,
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,.15)' }} />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center gap-1 text-sm font-semibold"
            style={{ color: col.accent }}
            aria-label="Voltar para notas"
          >
            <ChevronLeft size={18} />
            Notas
          </button>

          <div className="flex-1" />

          {/* Color picker toggle */}
          <button
            type="button"
            onClick={() => setShowColors(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
            aria-label="Escolher cor da nota"
            aria-expanded={showColors}
            style={{
              background: showColors ? `${col.accent}22` : 'rgba(255,255,255,.06)',
              color: col.accent,
              border: `1px solid ${col.border}`,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.dot }} />
            Cor
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={handleDelete}
            className="w-10 h-10 flex items-center justify-center rounded-full"
            aria-label="Apagar nota"
            style={{ background: 'rgba(255,55,95,.10)', color: '#FF375F' }}
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Color strip */}
        {showColors && (
          <div
            className="flex items-center gap-3 px-5 py-3"
            style={{
              borderBottom: '1px solid rgba(255,255,255,.05)',
              background: 'rgba(255,255,255,.02)',
            }}
          >
            {COLORS.map(c => (
              <button
                key={c.id}
                type="button"
                className={`nota-color-dot${color === c.id ? ' selected' : ''}`}
                aria-label={`Cor ${c.id}`}
                aria-pressed={color === c.id}
                onClick={() => {
                  setColor(c.id as ColorId);
                  scheduleSave({ color: c.id, title, body });
                }}
                style={{
                  width: color === c.id ? 26 : 22,
                  height: color === c.id ? 26 : 22,
                  borderRadius: '50%',
                  background: c.dot,
                  border: color === c.id ? `3px solid rgba(255,255,255,.8)` : `2px solid rgba(255,255,255,.2)`,
                  boxShadow: color === c.id ? `0 0 12px ${c.dot}80` : 'none',
                }}
              />
            ))}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
          {/* Title */}
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); scheduleSave({ title: e.target.value, body, color }); }}
            aria-label="Título da nota"
            placeholder="Título"
            autoFocus={!note.title}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 26,
              fontWeight: 700,
              color: 'var(--t)',
              fontFamily: "'Manrope', sans-serif",
              letterSpacing: '-.02em',
              lineHeight: 1.25,
              marginBottom: 14,
              caretColor: col.accent,
            }}
          />

          {/* Divider */}
          <div style={{ height: 1, background: `linear-gradient(90deg, ${col.accent}30, transparent)`, marginBottom: 16 }} />

          {/* Body */}
          <textarea
            ref={bodyRef}
            value={body}
            onChange={e => { setBody(e.target.value); scheduleSave({ title, body: e.target.value, color }); }}
            aria-label="Conteúdo da nota"
            placeholder="Comece a escrever sua nota aqui..."
            style={{
              width: '100%',
              minHeight: 220,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 15,
              lineHeight: 1.7,
              color: 'var(--t2)',
              fontFamily: "'Inter', sans-serif",
              caretColor: col.accent,
              overflow: 'hidden',
            }}
          />
        </div>

        {/* Footer bar */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.2)' }}
        >
          <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: "'JetBrains Mono', monospace" }}>
            {wordCount} palavra{wordCount !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 11, color: `${col.accent}80`, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtDate(note.updated_at)}
          </span>
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function NotasPage() {
  const notes      = useStore(s => s.notes ?? []);
  const addNote    = useStore(s => s.addNote);
  const updateNote = useStore(s => s.updateNote);
  const deleteNote = useStore(s => s.deleteNote);

  const [search,    setSearch]    = useState('');
  const [editing,   setEditing]   = useState<Note | null>(null);
  const [exitingId, setExitingId] = useState<string | null>(null);

  // Inject keyframes once
  useEffect(() => {
    if (document.getElementById('nota-css')) return;
    const el = document.createElement('style');
    el.id = 'nota-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  // Filter + sort: pinned first, then by updated_at desc
  const filtered = notes
    .filter(n => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });

  const pinned   = filtered.filter(n => n.pinned);
  const unpinned = filtered.filter(n => !n.pinned);

  function handleNew() {
    addNote({ title: '', body: '', color: 'default', pinned: false });
    // the new note lands at index 0 — open it after a microtask so it's in the store
    setTimeout(() => {
      const fresh = useStore.getState().notes?.[0];
      if (fresh) setEditing(fresh);
    }, 0);
  }

  function handleDelete(id: string) {
    setExitingId(id);
    if (editing?.id === id) setEditing(null);
    setTimeout(() => {
      deleteNote(id);
      setExitingId(null);
    }, 280);
  }

  function handleUpdate(id: string, patch: Partial<Note>) {
    updateNote(id, patch);
    // Keep editing ref fresh
    setEditing(prev => prev?.id === id ? { ...prev, ...patch, updated_at: new Date().toISOString() } : prev);
  }

  function NoteGroup({ title: groupTitle, items }: { title: string; items: Note[] }) {
    if (items.length === 0) return null;
    return (
      <div className="mb-2">
        <p className="text-[11px] font-black uppercase tracking-widest mb-3 px-1"
          style={{ color: 'var(--t3)', fontFamily: "'Manrope',sans-serif", letterSpacing: '.12em' }}>
          {groupTitle}
        </p>
        <div style={{ columns: 'var(--nota-cols, 2)', columnGap: 12 }}>
          {items.map((n, i) => (
            <NoteCard
              key={n.id}
              note={n}
              index={i}
              exiting={exitingId === n.id}
              onOpen={() => setEditing(n)}
              onDelete={() => handleDelete(n.id)}
              onTogglePin={() => updateNote(n.id, { pinned: !n.pinned })}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Responsive column variable */}
      <style>{`
        :root { --nota-cols: 2; }
        @media (min-width: 640px)  { :root { --nota-cols: 2; } }
        @media (min-width: 900px)  { :root { --nota-cols: 3; } }
        @media (min-width: 1280px) { :root { --nota-cols: 4; } }
      `}</style>

      <div className="max-w-5xl mx-auto">

        {/* ── Page header */}
        <div className="mb-6">
          <div className="flex items-end justify-between mb-1">
            <h1
              style={{
                fontSize: 34,
                fontWeight: 800,
                color: 'var(--t)',
                fontFamily: "'Manrope',sans-serif",
                letterSpacing: '-.03em',
                lineHeight: 1,
              }}
            >
              Notas
            </h1>
            <span
              style={{
                fontSize: 13,
                color: 'var(--t3)',
                fontFamily: "'JetBrains Mono',monospace",
                paddingBottom: 4,
              }}
            >
              {notes.length} {notes.length === 1 ? 'nota' : 'notas'}
            </span>
          </div>

          {/* Search bar */}
          <div
            className="flex items-center gap-2 mt-4 px-3 py-2.5"
            style={{
              background: 'rgba(255,255,255,.055)',
              border: '1px solid rgba(255,255,255,.09)',
              borderRadius: 14,
            }}
          >
            <Search size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Pesquisar nas notas"
              placeholder="Pesquisar nas notas"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 14,
                color: 'var(--t)',
                caretColor: '#FFD60A',
              }}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} style={{ color: 'var(--t3)', padding: 4 }} aria-label="Limpar pesquisa">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Empty state */}
        {notes.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-24 gap-5"
            style={{ animation: 'notaIn .5s cubic-bezier(0.2,0.8,0.4,1) both' }}
          >
            <div
              style={{
                width: 72, height: 72,
                borderRadius: 20,
                background: 'rgba(255,214,10,.12)',
                border: '1px solid rgba(255,214,10,.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <BookOpen size={32} style={{ color: '#FFD60A' }} />
            </div>
            <div className="text-center">
              <p className="font-bold text-base mb-1" style={{ color: 'var(--t)' }}>
                Nenhuma nota ainda
              </p>
              <p className="text-sm" style={{ color: 'var(--t3)' }}>
                Toque no <strong style={{ color: '#FFD60A' }}>+</strong> para criar sua primeira nota
              </p>
            </div>
          </div>
        )}

        {/* ── Note groups */}
        {notes.length > 0 && filtered.length === 0 && (
          <p className="text-center py-16 text-sm" style={{ color: 'var(--t3)' }}>
            Nenhuma nota encontrada para &ldquo;{search}&rdquo;
          </p>
        )}

        <NoteGroup title="Fixadas" items={pinned} />
        <NoteGroup title={pinned.length > 0 ? 'Outras' : ''} items={unpinned} />
      </div>

      {/* ── FAB */}
      <button
        type="button"
        onClick={handleNew}
        aria-label="Nova nota"
        className="nota-fab"
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          width: 58,
          height: 58,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FFD60A, #FF9F0A)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(255,214,10,.4), 0 2px 8px rgba(0,0,0,.3)',
          zIndex: 30,
        }}
        title="Nova nota"
      >
        <Plus size={26} color="#1a1200" strokeWidth={2.8} />
      </button>

      {/* ── Editor */}
      {editing && (
        <NoteEditor
          note={editing}
          onClose={() => {
            // discard empty note
            const current = useStore.getState().notes?.find(n => n.id === editing.id);
            if (current && !current.title.trim() && !current.body.trim()) {
              deleteNote(editing.id);
            }
            setEditing(null);
          }}
          onUpdate={(patch) => handleUpdate(editing.id, patch)}
          onDelete={() => handleDelete(editing.id)}
        />
      )}
    </>
  );
}
