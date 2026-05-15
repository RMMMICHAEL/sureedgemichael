'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Plus, Star, Pencil, Trash2, X, ChevronRight, Users } from 'lucide-react';
import type { Operator } from '@/types';

// ── Guide Modal ───────────────────────────────────────────────────────────────

function GuideModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(0);
  const items = [
    { q: 'O que são Operadores?', a: 'São as pessoas que operam suas bancas (fazem as apostas). Você pode ter um ou mais operadores e acompanhar o desempenho de cada um.' },
    { q: 'Como cadastrar um operador?', a: 'Clique em "Novo Operador", informe o nome, status e, opcionalmente, a comissão percentual que ele recebe.' },
    { q: 'Operador principal', a: 'O operador marcado com estrela é o principal. Você pode definir isso clicando no ícone de estrela no card.' },
    { q: 'Comissão', a: 'Se o operador recebe uma porcentagem do lucro, cadastre aqui para controle financeiro. O valor serve como referência — o cálculo de repasse fica na aba Gastos.' },
  ];
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-lg rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: '1px solid var(--b)' }}>
          <h2 className="font-bold text-base" style={{ color: 'var(--t)' }}>Guia — Operadores</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)' }}>
            <X size={14} />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[60vh] p-4 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
              <button type="button" onClick={() => setOpen(open === i ? null : i)}
                className="flex items-center justify-between gap-3 w-full px-4 py-3 text-left text-sm font-bold"
                style={{ color: 'var(--t)', background: open === i ? 'rgba(63,255,33,.05)' : 'transparent' }}>
                {item.q}
                <ChevronRight size={14} style={{ transform: open === i ? 'rotate(90deg)' : 'none', transition: 'transform .2s', color: 'var(--t3)', flexShrink: 0 }} />
              </button>
              {open === i && (
                <div className="px-4 pb-4 pt-1 text-sm leading-relaxed" style={{ color: 'var(--t3)', borderTop: '1px solid var(--b)', background: 'rgba(255,255,255,.02)' }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Operator Modal ────────────────────────────────────────────────────────────

function OperatorModal({ initial, onSave, onClose, title }: {
  initial?: Partial<Operator>;
  onSave: (data: Omit<Operator, 'id' | 'createdAt'>) => void;
  onClose: () => void;
  title: string;
}) {
  const [name,       setName]       = useState(initial?.name ?? '');
  const [status,     setStatus]     = useState<Operator['status']>(initial?.status ?? 'ativo');
  const [commission, setCommission] = useState(String(initial?.commission ?? ''));
  const [notes,      setNotes]      = useState(initial?.notes ?? '');

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      status,
      commission: commission ? parseFloat(commission) : undefined,
      notes: notes.trim() || undefined,
      isPrimary: initial?.isPrimary ?? false,
    });
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-md rounded-2xl p-6"
        style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-base" style={{ color: 'var(--t)' }}>{title}</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)' }}>
            <X size={12} />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Nome do Operador *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Carlos, João..."
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t)' }} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Status</label>
            <div className="flex gap-2">
              {(['ativo', 'inativo', 'pausado'] as const).map(s => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold capitalize"
                  style={status === s
                    ? { background: 'rgba(63,255,33,.15)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.25)' }
                    : { background: 'rgba(255,255,255,.04)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
                  {s === 'ativo' ? 'Ativo' : s === 'inativo' ? 'Inativo' : 'Pausado'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Comissão (%) — opcional</label>
            <input type="number" step="0.1" min="0" max="100" value={commission} onChange={e => setCommission(e.target.value)}
              placeholder="Ex: 20"
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t)' }} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas sobre o operador..." rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t)' }} />
          </div>
          <button type="button" onClick={handleSave} disabled={!name.trim()}
            className="w-full rounded-xl py-2.5 text-sm font-black disabled:opacity-40"
            style={{ background: 'rgba(63,255,33,.15)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.25)' }}>
            {initial ? 'Salvar Alterações' : 'Criar Operador'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Operator Card ─────────────────────────────────────────────────────────────

function OperatorCard({
  op, onEdit, onDelete, onTogglePrimary, onToggleStatus,
}: {
  op: Operator;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePrimary: () => void;
  onToggleStatus: () => void;
}) {
  const statusColor: Record<Operator['status'], string> = {
    ativo:   'rgba(63,255,33,.15)',
    inativo: 'rgba(255,77,109,.12)',
    pausado: 'rgba(255,214,0,.12)',
  };
  const statusText: Record<Operator['status'], string> = {
    ativo:   'var(--g)',
    inativo: 'var(--r)',
    pausado: 'var(--y)',
  };

  const initial = op.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--b)', background: 'rgba(255,255,255,.02)' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black"
          style={{ background: 'rgba(63,255,33,.12)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold truncate" style={{ color: 'var(--t)' }}>{op.name}</span>
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md"
              style={{ background: statusColor[op.status], color: statusText[op.status] }}>
              {op.status === 'ativo' ? 'Ativo' : op.status === 'inativo' ? 'Inativo' : 'Pausado'}
            </span>
            {op.isPrimary && (
              <Star size={10} fill="#FFD60A" color="#FFD60A" />
            )}
          </div>
          {op.commission != null && (
            <p className="text-[10px]" style={{ color: 'var(--t3)' }}>Comissão: {op.commission}%</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={onTogglePrimary} title={op.isPrimary ? 'Remover como principal' : 'Definir como principal'}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
            style={{ color: op.isPrimary ? '#FFD60A' : 'var(--t3)', background: op.isPrimary ? 'rgba(255,214,0,.12)' : 'transparent' }}>
            <Star size={13} fill={op.isPrimary ? '#FFD60A' : 'none'} />
          </button>
          <button type="button" onClick={onEdit}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--t3)', background: 'rgba(255,255,255,.04)' }}>
            <Pencil size={12} />
          </button>
          <button type="button" onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--r)', background: 'rgba(255,77,109,.08)' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-3 flex flex-col gap-2 text-sm">
        {op.notes && (
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--t3)' }}>{op.notes}</p>
        )}
        <button type="button" onClick={onToggleStatus}
          className="w-full py-1.5 rounded-xl text-xs font-bold mt-1"
          style={{
            background: op.status === 'ativo' ? 'rgba(255,77,109,.07)' : 'rgba(63,255,33,.07)',
            color: op.status === 'ativo' ? 'var(--r)' : 'var(--g)',
            border: `1px solid ${op.status === 'ativo' ? 'rgba(255,77,109,.2)' : 'rgba(63,255,33,.2)'}`,
          }}>
          {op.status === 'ativo' ? 'Desativar' : 'Ativar'}
        </button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function OperadoresPage() {
  const operators      = useStore(s => s.operators ?? []);
  const addOperator    = useStore(s => s.addOperator);
  const updateOperator = useStore(s => s.updateOperator);
  const deleteOperator = useStore(s => s.deleteOperator);

  const [addOpen,    setAddOpen]    = useState(false);
  const [editOp,     setEditOp]     = useState<Operator | null>(null);
  const [guideOpen,  setGuideOpen]  = useState(false);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--t)' }}>Operadores</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Gerencie quem opera suas bancas e acompanhe o desempenho individual</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setGuideOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t3)' }}>
            <Users size={13} /> Guia
          </button>
          <button type="button" onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black"
            style={{ background: 'rgba(63,255,33,.15)', border: '1px solid rgba(63,255,33,.25)', color: 'var(--g)' }}>
            <Plus size={13} /> Novo Operador
          </button>
        </div>
      </div>

      {/* Empty state */}
      {operators.length === 0 && (
        <div className="rounded-2xl p-16 flex flex-col items-center justify-center text-center gap-4"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)' }}>
            <Users size={32} style={{ color: 'var(--t3)' }} />
          </div>
          <div>
            <p className="font-bold text-base" style={{ color: 'var(--t)' }}>Nenhum operador cadastrado</p>
            <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>Adicione os operadores que gerenciam suas bancas</p>
          </div>
          <button type="button" onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: 'rgba(63,255,33,.10)', border: '1px solid rgba(63,255,33,.2)', color: 'var(--g)' }}>
            <Plus size={14} /> Novo Operador
          </button>
        </div>
      )}

      {/* Cards grid */}
      {operators.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {operators.map(op => (
            <OperatorCard
              key={op.id}
              op={op}
              onEdit={() => setEditOp(op)}
              onDelete={() => {
                if (confirm(`Excluir operador "${op.name}"?`)) deleteOperator(op.id);
              }}
              onTogglePrimary={() => {
                // Only one primary at a time
                operators.forEach(o => {
                  if (o.id === op.id) updateOperator(o.id, { isPrimary: !op.isPrimary });
                  else if (o.isPrimary) updateOperator(o.id, { isPrimary: false });
                });
              }}
              onToggleStatus={() => {
                updateOperator(op.id, { status: op.status === 'ativo' ? 'inativo' : 'ativo' });
              }}
            />
          ))}
        </div>
      )}

      {addOpen && (
        <OperatorModal
          title="Novo Operador"
          onSave={data => addOperator(data)}
          onClose={() => setAddOpen(false)}
        />
      )}
      {editOp && (
        <OperatorModal
          title="Editar Operador"
          initial={editOp}
          onSave={data => updateOperator(editOp.id, data)}
          onClose={() => setEditOp(null)}
        />
      )}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
