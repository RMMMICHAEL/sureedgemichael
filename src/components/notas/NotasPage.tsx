'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Note, NotePriority, NoteStatus } from '@/types';
import {
  Plus, Search, Pin, Trash2, X, BookOpen,
  Flame, Zap, ClipboardList, Calendar, AlertTriangle,
  CheckCircle2, Circle, Clock, XCircle,
} from 'lucide-react';

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

// ── Priority config ───────────────────────────────────────────────────────────

const PRIORITY_MAP: Record<NotePriority, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  urgent:    { label: 'Urgente',    color: '#FF375F', bg: 'rgba(255,55,95,.15)',    Icon: Flame },
  important: { label: 'Importante', color: '#FF9F0A', bg: 'rgba(255,159,10,.15)',   Icon: Zap },
  normal:    { label: 'Normal',     color: '#94A3B8', bg: 'rgba(148,163,184,.12)',  Icon: ClipboardList },
};

const STATUS_MAP: Record<NoteStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  todo:  { label: 'A Fazer', color: '#94A3B8', bg: 'rgba(148,163,184,.12)', Icon: Circle },
  doing: { label: 'Fazendo', color: '#0A84FF', bg: 'rgba(10,132,255,.15)',  Icon: Clock },
  done:  { label: 'Feito',   color: '#30D158', bg: 'rgba(48,209,88,.15)',   Icon: CheckCircle2 },
  lost:  { label: 'Perdido', color: '#FF375F', bg: 'rgba(255,55,95,.15)',   Icon: XCircle },
};

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

function fmtDueDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function isDueOverdue(iso?: string): boolean {
  if (!iso) return false;
  return new Date(iso + 'T23:59:59') < new Date();
}

function isDueSoon(iso?: string): boolean {
  if (!iso) return false;
  const due = new Date(iso + 'T23:59:59');
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return diff > 0 && diff < 2 * 86_400_000; // within 48h
}

// ── Keyframes ────────────────────────────────────────────────────────────────

const CSS = `
@keyframes notaIn {
  from { opacity: 0; transform: scale(.93) translateY(14px); }
  to   { opacity: 1; transform: scale(1)   translateY(0);    }
}
@keyframes notaOut {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(.85) translateY(8px); }
}
@keyframes dialogIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(.95); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1);   }
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
.nota-dialog {
  animation: dialogIn .22s cubic-bezier(0.2,0.8,0.4,1) forwards;
}
.nota-fab {
  transition: transform .2s cubic-bezier(0.2,0.8,0.4,1), box-shadow .2s ease;
}
.nota-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(255,214,10,.5);
}
.nota-fab:active {
  transform: translateY(0) scale(.96);
}
.nota-color-dot {
  transition: transform .18s cubic-bezier(0.2,0.8,0.4,1);
}
.nota-color-dot:hover { transform: scale(1.3); }
.nota-color-dot.selected { transform: scale(1.35); }
@keyframes alertPulse {
  0%,100% { opacity: 1; }
  50%      { opacity: .65; }
}
.alert-pulse { animation: alertPulse 2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .nota-card { animation: none; opacity: 1; }
  .nota-card-exit { animation: none; }
  .nota-dialog { animation: none; }
  .nota-fab { transition: none; }
  .nota-color-dot { transition: none; }
  .alert-pulse { animation: none; }
}
`;

// ── Due date alert banner ─────────────────────────────────────────────────────

function DueBanner({ notes }: { notes: Note[] }) {
  const overdue = notes.filter(n => n.status !== 'done' && n.status !== 'lost' && isDueOverdue(n.dueDate));
  const soon    = notes.filter(n => n.status !== 'done' && n.status !== 'lost' && !isDueOverdue(n.dueDate) && isDueSoon(n.dueDate));
  if (overdue.length === 0 && soon.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 mb-4">
      {overdue.length > 0 && (
        <div className="alert-pulse flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={{ background: 'rgba(255,55,95,.12)', border: '1px solid rgba(255,55,95,.28)' }}>
          <AlertTriangle size={13} style={{ color: '#FF375F', flexShrink: 0 }} />
          <span className="text-xs font-bold" style={{ color: '#FF375F' }}>
            {overdue.length} nota{overdue.length > 1 ? 's' : ''} com prazo vencido:{' '}
            <span className="font-normal">{overdue.map(n => n.title || 'Sem título').join(', ')}</span>
          </span>
        </div>
      )}
      {soon.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={{ background: 'rgba(255,159,10,.10)', border: '1px solid rgba(255,159,10,.22)' }}>
          <Clock size={13} style={{ color: '#FF9F0A', flexShrink: 0 }} />
          <span className="text-xs font-bold" style={{ color: '#FF9F0A' }}>
            {soon.length} nota{soon.length > 1 ? 's' : ''} vencem em breve:{' '}
            <span className="font-normal">{soon.map(n => n.title || 'Sem título').join(', ')}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────────

function NoteCard({
  note, index, onOpen, onDelete, onTogglePin, exiting,
}: {
  note: Note; index: number;
  onOpen: () => void; onDelete: () => void; onTogglePin: () => void; exiting: boolean;
}) {
  const col     = getColor(note.color);
  const preview = note.body.trim().split('\n').filter(Boolean).slice(0, 3).join(' · ');
  const delay   = Math.min(index * 0.045, 0.3);

  const prio   = note.priority ? PRIORITY_MAP[note.priority] : null;
  const status = note.status   ? STATUS_MAP[note.status]     : null;
  const overdue = isDueOverdue(note.dueDate) && note.status !== 'done' && note.status !== 'lost';
  const soon    = isDueSoon(note.dueDate)    && note.status !== 'done' && note.status !== 'lost' && !overdue;

  return (
    <div
      className={`nota-card${exiting ? ' nota-card-exit' : ''} group relative cursor-pointer select-none`}
      style={{
        animationDelay:  `${delay}s`,
        background:      col.card,
        border:          overdue ? '1px solid rgba(255,55,95,.45)' : `1px solid ${col.border}`,
        borderRadius:    18,
        padding:         '16px 16px 14px',
        marginBottom:    12,
        breakInside:     'avoid',
        transition:      'box-shadow .22s ease',
        boxShadow:       overdue ? '0 0 16px rgba(255,55,95,.12)' : '0 2px 12px rgba(0,0,0,.18)',
      }}
      onClick={onOpen}
    >
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 16, right: 16, height: 2,
        background: overdue
          ? 'linear-gradient(90deg, rgba(255,55,95,.7), transparent)'
          : `linear-gradient(90deg, ${col.accent}60, transparent)`,
        borderRadius: '0 0 4px 4px',
      }} />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-sm leading-snug flex-1 line-clamp-2"
          style={{ color: note.title ? 'var(--t)' : 'var(--t3)', fontFamily: "'Manrope',sans-serif", letterSpacing: '-.01em' }}>
          {note.title || 'Sem título'}
        </h3>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 -mt-0.5">
          <button type="button" onClick={e => { e.stopPropagation(); onTogglePin(); }}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: note.pinned ? `${col.accent}22` : 'rgba(255,255,255,.06)', color: note.pinned ? col.accent : 'var(--t3)' }}
            aria-label={note.pinned ? 'Desafixar' : 'Fixar'}>
            <Pin size={12} fill={note.pinned ? col.accent : 'none'} />
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,55,95,.10)', color: '#FF375F' }} aria-label="Apagar">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Badges row: priority + status + due date */}
      {(prio || status || note.dueDate) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {prio && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide"
              style={{ background: prio.bg, color: prio.color }}>
              <prio.Icon size={9} />{prio.label}
            </span>
          )}
          {status && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide"
              style={{ background: status.bg, color: status.color }}>
              <status.Icon size={9} />{status.label}
            </span>
          )}
          {note.dueDate && (
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black${overdue ? ' alert-pulse' : ''}`}
              style={{
                background: overdue ? 'rgba(255,55,95,.18)' : soon ? 'rgba(255,159,10,.15)' : 'rgba(148,163,184,.10)',
                color: overdue ? '#FF375F' : soon ? '#FF9F0A' : 'var(--t3)',
              }}>
              <Calendar size={9} />
              {fmtDueDate(note.dueDate)}
              {overdue && ' ✕'}
            </span>
          )}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--t3)', fontFamily: "'Inter',sans-serif" }}>
          {preview}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] font-medium" style={{ color: `${col.accent}99`, fontFamily: "'JetBrains Mono',monospace" }}>
          {fmtDate(note.updated_at)}
        </span>
        {note.pinned && <Pin size={10} fill={col.accent} color={col.accent} style={{ opacity: .7 }} />}
      </div>
    </div>
  );
}

// ── Note Editor Dialog ────────────────────────────────────────────────────────

function NoteEditor({
  note, isNew, onClose, onSave, onDelete,
}: {
  note: Partial<Note> & { id?: string };
  isNew: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Note>) => void;
  onDelete?: () => void;
}) {
  const [title,    setTitle]    = useState(note.title ?? '');
  const [body,     setBody]     = useState(note.body ?? '');
  const [color,    setColor]    = useState<ColorId>((note.color as ColorId) ?? 'default');
  const [priority, setPriority] = useState<NotePriority | undefined>(note.priority);
  const [status,   setStatus]   = useState<NoteStatus | undefined>(note.status ?? 'todo');
  const [dueDate,  setDueDate]  = useState<string>(note.dueDate ?? '');

  const PRIORITIES: NotePriority[] = ['urgent', 'important', 'normal'];
  const STATUSES:   NoteStatus[]   = ['todo', 'doing', 'done', 'lost'];
  const canSave = title.trim().length > 0 || body.trim().length > 0;

  const DOT_COLORS = [
    { id: 'green',   hex: '#10b981' },
    { id: 'blue',    hex: '#3b82f6' },
    { id: 'yellow',  hex: '#f59e0b' },
    { id: 'pink',    hex: '#ef4444' },
    { id: 'purple',  hex: '#8b5cf6' },
    { id: 'default', hex: '#ec4899' },
  ] as const;

  function handleSave() {
    onSave({ title, body, color, priority, status, dueDate: dueDate || undefined });
    onClose();
  }

  function handleDelete() {
    if (!confirm('Apagar esta nota?')) return;
    onDelete?.();
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 49,
          background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
          animation: 'fadeBg .2s ease forwards',
        }}
        onClick={onClose}
      />

      {/* Dialog — centered, max-w-lg */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'Nova Nota' : 'Editar Nota'}
        className="nota-dialog"
        style={{
          position: 'fixed',
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          width: 'calc(100% - 2rem)',
          maxWidth: 512,
          maxHeight: 'calc(100dvh - 2rem)',
          overflowY: 'auto',
          background: 'var(--bg2)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--t)' }}>
            {isNew ? 'Nova Nota' : 'Editar Nota'}
          </h2>
          <div className="flex items-center gap-2">
            {!isNew && onDelete && (
              <button type="button" onClick={handleDelete}
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ background: 'rgba(255,55,95,.10)', color: '#FF375F' }}>
                <Trash2 size={13} />
              </button>
            )}
            <button type="button" onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)' }}
              aria-label="Fechar">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Textareas */}
        <div className="flex flex-col gap-3">
          <textarea
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Anotar procedimento... (ex: Bet365 - Missão 50 giros)"
            rows={3}
            autoFocus
            style={{
              width: '100%', background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
              padding: '8px 12px', fontSize: 13, color: 'var(--t)',
              outline: 'none', resize: 'vertical', lineHeight: 1.5,
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(63,255,33,.4)'; e.target.style.boxShadow = '0 0 0 2px rgba(63,255,33,.15)'; }}
            onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,.1)'; e.target.style.boxShadow = 'none'; }}
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Detalhes adicionais..."
            rows={4}
            style={{
              width: '100%', background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
              padding: '8px 12px', fontSize: 13, color: 'var(--t)',
              outline: 'none', resize: 'vertical', lineHeight: 1.5,
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(63,255,33,.4)'; e.target.style.boxShadow = '0 0 0 2px rgba(63,255,33,.15)'; }}
            onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,.1)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>

        {/* Color dots */}
        <div className="flex gap-2 flex-wrap">
          {DOT_COLORS.map(c => (
            <button key={c.id} type="button"
              className={`nota-color-dot${color === c.id ? ' selected' : ''}`}
              aria-label={`Cor ${c.id}`}
              onClick={() => setColor(c.id as ColorId)}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: c.hex,
                border: color === c.id ? `3px solid rgba(255,255,255,.85)` : '2px solid transparent',
                boxShadow: color === c.id ? `0 0 10px ${c.hex}80` : 'none',
                flexShrink: 0,
              }} />
          ))}
        </div>

        {/* Due date */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1" style={{ color: 'var(--t3)' }}>
            <Calendar size={11} /> Prazo:
          </p>
          <div className="flex items-center gap-2">
            <input type="date" value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{
                background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--t)',
                outline: 'none', colorScheme: 'dark',
              }} />
            {dueDate && (
              <button type="button" onClick={() => setDueDate('')}
                className="w-7 h-7 flex items-center justify-center rounded-full"
                style={{ background: 'rgba(255,55,95,.12)', color: '#FF375F' }}>
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Priority */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1" style={{ color: 'var(--t3)' }}>
            <Zap size={11} /> Prioridade:
          </p>
          <div className="flex gap-2 flex-wrap">
            {PRIORITIES.map(p => {
              const cfg = PRIORITY_MAP[p];
              const active = priority === p;
              return (
                <button key={p} type="button"
                  onClick={() => setPriority(active ? undefined : p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{
                    background: active ? cfg.bg : 'rgba(255,255,255,.04)',
                    color: active ? cfg.color : 'var(--t3)',
                    border: `1px solid ${active ? cfg.color + '50' : 'rgba(255,255,255,.08)'}`,
                  }}>
                  <cfg.Icon size={11} />{cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1" style={{ color: 'var(--t3)' }}>
            <ClipboardList size={11} /> Status:
          </p>
          <div className="flex gap-2 flex-wrap">
            {STATUSES.map(s => {
              const cfg = STATUS_MAP[s];
              const active = status === s;
              return (
                <button key={s} type="button"
                  onClick={() => setStatus(active ? undefined : s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{
                    background: active ? cfg.bg : 'rgba(255,255,255,.04)',
                    color: active ? cfg.color : 'var(--t3)',
                    border: `1px solid ${active ? cfg.color + '50' : 'rgba(255,255,255,.08)'}`,
                  }}>
                  <cfg.Icon size={11} />{cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full py-2.5 rounded-lg text-sm font-black disabled:opacity-40"
          style={{ background: 'rgba(63,255,33,.15)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.25)' }}
        >
          {isNew ? 'Criar Nota' : 'Salvar Alterações'}
        </button>
      </div>
    </>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

type PrioFilter   = 'all' | NotePriority;
type StatusFilter = 'all' | NoteStatus;

function FilterBar({
  prioFilter, statusFilter,
  onPrio, onStatus,
}: {
  prioFilter: PrioFilter; statusFilter: StatusFilter;
  onPrio: (v: PrioFilter) => void; onStatus: (v: StatusFilter) => void;
}) {
  const PRIORITIES: NotePriority[] = ['urgent', 'important', 'normal'];
  const STATUSES:   NoteStatus[]   = ['todo', 'doing', 'done', 'lost'];

  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {/* Priority filters */}
      {PRIORITIES.map(p => {
        const cfg    = PRIORITY_MAP[p];
        const active = prioFilter === p;
        return (
          <button key={p} type="button"
            onClick={() => onPrio(active ? 'all' : p)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide"
            style={{ background: active ? cfg.bg : 'rgba(255,255,255,.04)', color: active ? cfg.color : 'var(--t3)', border: `1px solid ${active ? cfg.color + '40' : 'rgba(255,255,255,.07)'}` }}>
            <cfg.Icon size={9} />{cfg.label}
          </button>
        );
      })}
      {/* Divider dot */}
      <span style={{ width: 1, height: 22, background: 'rgba(255,255,255,.08)', alignSelf: 'center', margin: '0 2px' }} />
      {/* Status filters */}
      {STATUSES.map(s => {
        const cfg    = STATUS_MAP[s];
        const active = statusFilter === s;
        return (
          <button key={s} type="button"
            onClick={() => onStatus(active ? 'all' : s)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide"
            style={{ background: active ? cfg.bg : 'rgba(255,255,255,.04)', color: active ? cfg.color : 'var(--t3)', border: `1px solid ${active ? cfg.color + '40' : 'rgba(255,255,255,.07)'}` }}>
            <cfg.Icon size={9} />{cfg.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function NotasPage() {
  const notes      = useStore(s => s.notes ?? []);
  const addNote    = useStore(s => s.addNote);
  const updateNote = useStore(s => s.updateNote);
  const deleteNote = useStore(s => s.deleteNote);

  const [search,       setSearch]       = useState('');
  const [prioFilter,   setPrioFilter]   = useState<PrioFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editing,   setEditing]   = useState<Note | null>(null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [exitingId, setExitingId] = useState<string | null>(null);

  useEffect(() => {
    if (document.getElementById('nota-css')) return;
    const el = document.createElement('style');
    el.id = 'nota-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  const filtered = useMemo(() => notes
    .filter(n => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!n.title.toLowerCase().includes(q) && !n.body.toLowerCase().includes(q)) return false;
      }
      if (prioFilter !== 'all'   && n.priority !== prioFilter)   return false;
      if (statusFilter !== 'all' && n.status   !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      // overdue first among non-done
      const ao = isDueOverdue(a.dueDate) && a.status !== 'done' && a.status !== 'lost';
      const bo = isDueOverdue(b.dueDate) && b.status !== 'done' && b.status !== 'lost';
      if (ao !== bo) return ao ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    }), [notes, search, prioFilter, statusFilter]);

  const pinned   = filtered.filter(n => n.pinned);
  const unpinned = filtered.filter(n => !n.pinned);

  function handleNew() {
    setEditing({ id: undefined, title: '', body: '', color: 'default', pinned: false, created_at: '', updated_at: '' } as unknown as Note);
    setIsNewNote(true);
  }

  function handleDelete(id: string) {
    setExitingId(id);
    if (editing?.id === id) setEditing(null);
    setTimeout(() => { deleteNote(id); setExitingId(null); }, 280);
  }

  function handleUpdate(id: string, patch: Partial<Note>) {
    updateNote(id, patch);
    setEditing(prev => prev?.id === id ? { ...prev, ...patch, updated_at: new Date().toISOString() } : prev);
  }

  function NoteGroup({ title: groupTitle, items }: { title: string; items: Note[] }) {
    if (items.length === 0) return null;
    return (
      <div className="mb-2">
        {groupTitle && (
          <p className="text-[11px] font-black uppercase tracking-widest mb-3 px-1"
            style={{ color: 'var(--t3)', fontFamily: "'Manrope',sans-serif", letterSpacing: '.12em' }}>
            {groupTitle}
          </p>
        )}
        <div style={{ columns: 'var(--nota-cols, 2)', columnGap: 12 }}>
          {items.map((n, i) => (
            <NoteCard key={n.id} note={n} index={i} exiting={exitingId === n.id}
              onOpen={() => { setEditing(n); setIsNewNote(false); }}
              onDelete={() => handleDelete(n.id)}
              onTogglePin={() => updateNote(n.id, { pinned: !n.pinned })} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        :root { --nota-cols: 2; }
        @media (min-width: 640px)  { :root { --nota-cols: 2; } }
        @media (min-width: 900px)  { :root { --nota-cols: 3; } }
        @media (min-width: 1280px) { :root { --nota-cols: 4; } }
      `}</style>

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-end justify-between mb-1">
            <h1 style={{
              fontSize: 34, fontWeight: 800, color: 'var(--t)',
              fontFamily: "'Manrope',sans-serif", letterSpacing: '-.03em', lineHeight: 1,
            }}>Notas</h1>
            <span style={{ fontSize: 13, color: 'var(--t3)', fontFamily: "'JetBrains Mono',monospace", paddingBottom: 4 }}>
              {notes.length} {notes.length === 1 ? 'nota' : 'notas'}
            </span>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 mt-4 px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 14 }}>
            <Search size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              aria-label="Pesquisar nas notas" placeholder="Pesquisar nas notas"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--t)', caretColor: '#FFD60A' }} />
            {search && (
              <button type="button" onClick={() => setSearch('')} style={{ color: 'var(--t3)', padding: 4 }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <FilterBar prioFilter={prioFilter} statusFilter={statusFilter}
          onPrio={setPrioFilter} onStatus={setStatusFilter} />

        {/* Due date alerts */}
        <DueBanner notes={notes} />

        {/* Empty state */}
        {notes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-5"
            style={{ animation: 'notaIn .5s cubic-bezier(0.2,0.8,0.4,1) both' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20,
              background: 'rgba(255,214,10,.12)', border: '1px solid rgba(255,214,10,.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BookOpen size={32} style={{ color: '#FFD60A' }} />
            </div>
            <div className="text-center">
              <p className="font-bold text-base mb-1" style={{ color: 'var(--t)' }}>Nenhuma nota ainda</p>
              <p className="text-sm" style={{ color: 'var(--t3)' }}>
                Toque no <strong style={{ color: '#FFD60A' }}>+</strong> para criar sua primeira nota
              </p>
            </div>
          </div>
        )}

        {notes.length > 0 && filtered.length === 0 && (
          <p className="text-center py-16 text-sm" style={{ color: 'var(--t3)' }}>
            Nenhuma nota encontrada para os filtros selecionados.
          </p>
        )}

        <NoteGroup title="Fixadas" items={pinned} />
        <NoteGroup title={pinned.length > 0 ? 'Outras' : ''} items={unpinned} />
      </div>

      {/* FAB */}
      <button type="button" onClick={handleNew} aria-label="Registrar nota" className="nota-fab"
        style={{
          position: 'fixed', bottom: 28, right: 28,
          height: 50, paddingLeft: 20, paddingRight: 22, borderRadius: 25,
          background: 'linear-gradient(135deg, #FFD60A, #FF9F0A)',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 24px rgba(255,214,10,.4), 0 2px 8px rgba(0,0,0,.3)', zIndex: 30,
        }}>
        <Plus size={20} color="#1a1200" strokeWidth={2.8} />
        <span style={{ fontSize: 13, fontWeight: 800, color: '#1a1200', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
          Registrar nota
        </span>
      </button>

      {/* Editor dialog */}
      {editing && (
        <NoteEditor
          note={editing}
          isNew={isNewNote}
          onClose={() => { setEditing(null); setIsNewNote(false); }}
          onSave={(patch) => {
            if (isNewNote) {
              if ((patch.title ?? '').trim() || (patch.body ?? '').trim()) {
                addNote({
                  title:    patch.title    ?? '',
                  body:     patch.body     ?? '',
                  color:    patch.color    ?? 'default',
                  pinned:   false,
                  priority: patch.priority,
                  status:   patch.status,
                  dueDate:  patch.dueDate,
                });
              }
            } else {
              handleUpdate(editing.id, patch);
            }
          }}
          onDelete={editing.id ? () => handleDelete(editing.id!) : undefined}
        />
      )}
    </>
  );
}
