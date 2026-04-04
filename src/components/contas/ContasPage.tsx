'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { Button }   from '@/components/ui/Button';
import { Modal }    from '@/components/ui/Modal';
import {
  Plus, Trash2, ChevronDown, Users, ShoppingCart, Target,
  CheckCircle, AlertCircle, Pencil,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { Client, PurchasedAccount } from '@/types';
import { todayStr } from '@/lib/parsers/dateParser';

// ── House catalog (for target houses selection) ───────────────────────────────

const ALL_GROUPS = [
  { principal: 'BET7K',     clones: ['PIXBET','APOSTA TUDO','VERABET','DONALDBET','SORTENABET','APOSTAMAX','RICOBET','BATEUBET','B1BET','MMABET','LIDERBET','BRXBET','BULLSBET'] },
  { principal: 'VBET',      clones: ['7GAMES','BETAO','R7','SEUBET','BRAVO','H2BET','MAXIMABET','SEGUROBET','ULTRA'] },
  { principal: 'ESTRELA',   clones: ['MCGAMES','ESPORTIVA','JOGO DE OURO','BR4BET','APOSTA1','LOTOGREEN','GOLDEBET','MULTIBET','VUPI','CASSINOPIX','PAGOLBET','BRBET','BRASILDASORTE'] },
  { principal: 'BLAZE',     clones: ['JONBET','BETVIP','AFUNBET','GANHEIBET','APOSTAGANHA'] },
  { principal: 'LUVABET',   clones: ['REALSBET','ONABET','LUCKYBET','ESPORTE365','STARBET'] },
  { principal: 'BETFAST',   clones: ['TIVOBET','FAZ1BET','IJOGO'] },
  { principal: 'BETPIX365', clones: ['VAIDEBET','HIPERBET','ESPORTEDASORTE'] },
  { principal: 'MARJOS',    clones: ['APOSTOU'] },
  { principal: 'STAKE',     clones: ['BETMGM','KTO','BETWARRIOR'] },
  { principal: 'BOLSADEAPOSTA', clones: ['BETBRA','BETFAIR','FULLTBET'] },
  { principal: 'BETESPORTE',clones: ['LANCEDESORTE','BETBOO'] },
  { principal: 'SPORTINGBET', clones: ['GINGABET','4PLAY','BANDBET'] },
];

const SEM_CLONE = ['BET365','BETANO','RIVALO','SUPERBET','BETSUL','GALERA BET','ALFA BET','VIVA SORTE','F12','BETNACIONAL','REI DO PITACO','NOVIBET','PINNACLE','BETSSON','SPORTY'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
}

// ── Add Client modal ──────────────────────────────────────────────────────────

function AddClientModal({ onClose }: { onClose: () => void }) {
  const addClient = useStore(s => s.addClient);
  const toast     = useStore(s => s.toast);

  const [name,   setName]   = useState('');
  const [cpf,    setCpf]    = useState('');
  const [notes,  setNotes]  = useState('');
  const [status, setStatus] = useState<Client['status']>('ativo');

  function save() {
    if (!name.trim()) { toast('Nome obrigatório', 'wrn'); return; }
    addClient({ name: name.trim(), cpf, notes, status });
    toast('Cliente adicionado', 'ok');
    onClose();
  }

  const s = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };
  return (
    <Modal title="Registrar Novo Cliente" onClose={onClose} size="sm">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>NOME COMPLETO</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João Silva"
            className="px-3 py-2.5 rounded-lg text-sm" style={s} autoFocus />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>CPF (opcional)</span>
          <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00"
            className="px-3 py-2.5 rounded-lg text-sm font-mono" style={s} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>STATUS</span>
          <select value={status} onChange={e => setStatus(e.target.value as Client['status'])}
            className="px-3 py-2.5 rounded-lg text-sm" style={s}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>OBSERVAÇÕES</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Notas sobre o cliente..." className="px-3 py-2.5 rounded-lg text-sm resize-none" style={s} />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--b)' }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={save}>Registrar Cliente</Button>
      </div>
    </Modal>
  );
}

// ── Add purchase modal ────────────────────────────────────────────────────────

function AddPurchaseModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const addPurchasedAccount = useStore(s => s.addPurchasedAccount);
  const targetHouses        = useStore(s => s.targetHouses);
  const toast               = useStore(s => s.toast);

  const allHouses = useMemo(() => {
    const houses: string[] = [];
    ALL_GROUPS.forEach(g => { houses.push(g.principal); g.clones.forEach(c => houses.push(c)); });
    SEM_CLONE.forEach(h => houses.push(h));
    return [...new Set([...targetHouses, ...houses])].sort();
  }, [targetHouses]);

  const [house,  setHouse]  = useState('');
  const [cost,   setCost]   = useState('');
  const [date,   setDate]   = useState(todayStr());
  const [status, setStatus] = useState<PurchasedAccount['status']>('ativa');
  const [notes,  setNotes]  = useState('');

  function save() {
    if (!house.trim()) { toast('Selecione a casa', 'wrn'); return; }
    const costVal = parseFloat(cost.replace(',', '.')) || 0;
    addPurchasedAccount(clientId, { house: house.trim(), cost: costVal, purchaseDate: date, status, notes });
    toast('Conta registrada', 'ok');
    onClose();
  }

  const s = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };
  return (
    <Modal title="Registrar Compra de Conta" onClose={onClose} size="sm">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>CASA DE APOSTA</span>
          <select value={house} onChange={e => setHouse(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm" style={s}>
            <option value="">Selecionar casa...</option>
            {allHouses.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>CUSTO (R$)</span>
            <input value={cost} onChange={e => setCost(e.target.value)} placeholder="0,00"
              className="px-3 py-2.5 rounded-lg text-sm font-mono" style={s} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DATA</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2.5 rounded-lg text-sm" style={s} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>STATUS</span>
          <select value={status} onChange={e => setStatus(e.target.value as PurchasedAccount['status'])}
            className="px-3 py-2.5 rounded-lg text-sm" style={s}>
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
            <option value="suspensa">Suspensa</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>OBSERVAÇÕES</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional"
            className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--b)' }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={save}>Registrar Compra</Button>
      </div>
    </Modal>
  );
}

// ── Target Houses modal ───────────────────────────────────────────────────────

function TargetHousesModal({ onClose }: { onClose: () => void }) {
  const targetHouses    = useStore(s => s.targetHouses);
  const setTargetHouses = useStore(s => s.setTargetHouses);
  const toast           = useStore(s => s.toast);

  const [selected, setSelected] = useState<string[]>(targetHouses);
  const [search,   setSearch]   = useState('');

  const q = search.toLowerCase().trim();

  function toggle(h: string) {
    setSelected(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]);
  }

  function toggleGroup(g: typeof ALL_GROUPS[0]) {
    const all = [g.principal, ...g.clones];
    const allSelected = all.every(h => selected.includes(h));
    if (allSelected) {
      setSelected(prev => prev.filter(h => !all.includes(h)));
    } else {
      setSelected(prev => [...new Set([...prev, ...all])]);
    }
  }

  function save() {
    setTargetHouses(selected);
    toast('Casas alvo atualizadas', 'ok');
    onClose();
  }

  const Chip = ({ h }: { h: string }) => {
    const active = selected.includes(h);
    if (q && !h.toLowerCase().includes(q)) return null;
    return (
      <button type="button" onClick={() => toggle(h)}
        className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
        style={active
          ? { background: 'var(--gd)', color: 'var(--g)', border: '1px solid var(--gb)' }
          : { background: 'var(--sur)', color: 'var(--t2)', border: '1px solid var(--b)' }
        }
      >
        {h}
      </button>
    );
  };

  return (
    <Modal title="Configurar Casas Alvo" onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <p className="text-sm flex-1" style={{ color: 'var(--t2)' }}>
            Selecione as casas que você quer ter contas em todos os clientes.
          </p>
          <span className="text-xs font-mono px-2 py-1 rounded-lg flex-shrink-0"
            style={{ background: 'var(--gd)', color: 'var(--g)', border: '1px solid var(--gb)' }}>
            {selected.length} selecionadas
          </span>
        </div>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filtrar casas..." className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />

        {/* Groups */}
        <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
          {ALL_GROUPS.map(g => {
            const groupHouses = [g.principal, ...g.clones];
            const visible = q ? groupHouses.filter(h => h.toLowerCase().includes(q)) : groupHouses;
            if (visible.length === 0) return null;
            const allSelected = groupHouses.every(h => selected.includes(h));
            return (
              <div key={g.principal}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>{g.principal}</span>
                  <button type="button" onClick={() => toggleGroup(g)}
                    className="text-xs px-2 py-0.5 rounded transition-all"
                    style={{
                      color: allSelected ? 'var(--g)' : 'var(--t3)',
                      background: allSelected ? 'var(--gd)' : 'var(--sur)',
                    }}>
                    {allSelected ? '✓ Todos' : 'Selecionar todos'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {visible.map(h => <Chip key={h} h={h} />)}
                </div>
              </div>
            );
          })}
          <div>
            <div className="text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Sem clone</div>
            <div className="flex flex-wrap gap-1.5">
              {SEM_CLONE.map(h => <Chip key={h} h={h} />)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--b)' }}>
          <button type="button" onClick={() => setSelected([])}
            className="text-xs" style={{ color: 'var(--t3)' }}>
            Limpar tudo
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" onClick={save}>Salvar</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Status config ─────────────────────────────────────────────────────────────

const ACC_STATUS_CFG: Record<PurchasedAccount['status'], { label: string; color: string; bg: string }> = {
  ativa:    { label: 'Ativa',    color: 'var(--g)',  bg: 'var(--gd)' },
  inativa:  { label: 'Inativa',  color: 'var(--t3)', bg: 'var(--sur)' },
  suspensa: { label: 'Suspensa', color: 'var(--r)',  bg: 'var(--rd)' },
};

// ── Client card ───────────────────────────────────────────────────────────────

function ClientCard({ client, targetHouses }: { client: Client; targetHouses: string[] }) {
  const deleteClient            = useStore(s => s.deleteClient);
  const deletePurchasedAccount  = useStore(s => s.deletePurchasedAccount);
  const updatePurchasedAccount  = useStore(s => s.updatePurchasedAccount);
  const toast                   = useStore(s => s.toast);

  const [open,    setOpen]    = useState(false);
  const [addPurch, setAddPurch] = useState(false);

  const purchasedHouses = client.purchasedAccounts.map(a => a.house);
  const missingHouses   = targetHouses.filter(h => !purchasedHouses.includes(h));
  const totalCost       = client.purchasedAccounts.reduce((s, a) => s + a.cost, 0);
  const activeCount     = client.purchasedAccounts.filter(a => a.status === 'ativa').length;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
          style={{ background: 'var(--g)', color: 'var(--bg)', boxShadow: '0 0 10px rgba(0,255,138,.3)' }}>
          {client.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold" style={{ color: 'var(--t)' }}>{client.name}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs px-1.5 py-0.5 rounded font-bold"
              style={{ background: client.status === 'ativo' ? 'var(--gd)' : 'var(--sur)', color: client.status === 'ativo' ? 'var(--g)' : 'var(--t3)' }}>
              {client.status === 'ativo' ? 'Ativo' : 'Inativo'}
            </span>
            <span className="text-xs font-mono" style={{ color: 'var(--t3)' }}>
              {activeCount} contas ativas · {fmtBRL(totalCost)} investidos
            </span>
            {missingHouses.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                style={{ background: 'var(--yd)', color: 'var(--y)' }}>
                {missingHouses.length} faltando
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); if (confirm(`Remover cliente ${client.name}?`)) { deleteClient(client.id); toast('Cliente removido', 'ok'); } }}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--r)', background: 'var(--rd)' }}>
            <Trash2 size={12} />
          </button>
          <ChevronDown size={16} style={{ color: 'var(--t3)', transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--b)' }}>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-0" style={{ borderBottom: '1px solid var(--b)' }}>
            {[
              { label: 'Total Contas', value: String(client.purchasedAccounts.length), color: 'var(--t)' },
              { label: 'Contas Ativas', value: String(activeCount), color: 'var(--g)' },
              { label: 'Investimento', value: fmtBRL(totalCost), color: 'var(--r)' },
            ].map((k, i) => (
              <div key={k.label} className="px-4 py-3 text-center"
                style={i < 2 ? { borderRight: '1px solid var(--b)' } : {}}>
                <div className="text-xs" style={{ color: 'var(--t3)' }}>{k.label}</div>
                <div className="font-bold font-mono text-sm mt-0.5" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Missing houses alert */}
          {missingHouses.length > 0 && (
            <div className="mx-5 my-4 px-4 py-3 rounded-xl flex gap-3"
              style={{ background: 'rgba(255,214,0,.07)', border: '1px solid rgba(255,214,0,.2)' }}>
              <AlertCircle size={16} style={{ color: 'var(--y)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div className="text-xs font-bold mb-1" style={{ color: 'var(--y)' }}>
                  Contas faltando ({missingHouses.length}):
                </div>
                <div className="flex flex-wrap gap-1">
                  {missingHouses.map(h => (
                    <span key={h} className="text-xs px-2 py-0.5 rounded font-mono"
                      style={{ background: 'var(--yd)', color: 'var(--y)' }}>{h}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Purchased accounts list */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
                Contas Compradas ({client.purchasedAccounts.length})
              </span>
              <Button variant="primary" onClick={e => { e.stopPropagation(); setAddPurch(true); }}>
                <Plus size={12} /> Registrar Compra
              </Button>
            </div>

            {client.purchasedAccounts.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--t3)' }}>Nenhuma conta registrada</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {client.purchasedAccounts
                  .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
                  .map(acc => {
                    const cfg = ACC_STATUS_CFG[acc.status];
                    return (
                      <div key={acc.id} className="flex items-center gap-3 py-2 px-3 rounded-lg"
                        style={{ background: 'var(--sur)' }}>
                        <select
                          value={acc.status}
                          onChange={e => updatePurchasedAccount(client.id, acc.id, { status: e.target.value as PurchasedAccount['status'] })}
                          className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 cursor-pointer"
                          style={{ background: cfg.bg, color: cfg.color, border: 'none' }}
                        >
                          <option value="ativa">Ativa</option>
                          <option value="inativa">Inativa</option>
                          <option value="suspensa">Suspensa</option>
                        </select>
                        <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--t)' }}>{acc.house}</span>
                        <span className="text-xs font-mono" style={{ color: 'var(--t3)' }}>{fmtDate(acc.purchaseDate)}</span>
                        <span className="text-xs font-bold font-mono" style={{ color: 'var(--r)' }}>
                          {acc.cost > 0 ? `− ${fmtBRL(acc.cost)}` : '—'}
                        </span>
                        {acc.notes && <span className="text-xs truncate" style={{ color: 'var(--t3)' }}>{acc.notes}</span>}
                        <button
                          onClick={() => { if (confirm('Remover conta?')) deletePurchasedAccount(client.id, acc.id); }}
                          className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                          style={{ color: 'var(--r)' }}>
                          <Trash2 size={10} />
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {addPurch && <AddPurchaseModal clientId={client.id} onClose={() => setAddPurch(false)} />}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ContasPage() {
  const clients          = useStore(s => s.clients);
  const targetHouses     = useStore(s => s.targetHouses);

  const [showAddClient,  setShowAddClient]  = useState(false);
  const [showTargetHouses, setShowTargetHouses] = useState(false);
  const [tab,            setTab]            = useState<'clientes' | 'resumo'>('clientes');

  // Global stats
  const totalAccounts = clients.reduce((s, c) => s + c.purchasedAccounts.length, 0);
  const totalCost     = clients.reduce((s, c) => s + c.purchasedAccounts.reduce((cs, a) => cs + a.cost, 0), 0);

  // House coverage: how many clients have each target house
  const houseCoverage = useMemo(() => {
    return targetHouses.map(house => {
      const count = clients.filter(c => c.purchasedAccounts.some(a => a.house === house)).length;
      return { house, count, total: clients.length, missing: clients.length - count };
    }).sort((a, b) => a.count - b.count);
  }, [clients, targetHouses]);

  // Cost by month
  const costByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    clients.forEach(c => c.purchasedAccounts.forEach(a => {
      const m = a.purchaseDate.slice(0, 7);
      map[m] = (map[m] || 0) + a.cost;
    }));
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([m, v]) => ({ m: m.slice(5), v: +v.toFixed(2) }));
  }, [clients]);

  // Pie: active vs inactive
  const statusCounts = useMemo(() => {
    let ativa = 0, inativa = 0, suspensa = 0;
    clients.forEach(c => c.purchasedAccounts.forEach(a => {
      if (a.status === 'ativa') ativa++;
      else if (a.status === 'suspensa') suspensa++;
      else inativa++;
    }));
    return [
      { name: 'Ativas',   value: ativa,    color: '#00FF88' },
      { name: 'Suspensas',value: suspensa,  color: '#FF4545' },
      { name: 'Inativas', value: inativa,  color: '#3A6B4A' },
    ].filter(d => d.value > 0);
  }, [clients]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t)' }}>
        {payload[0].name}: {payload[0].value}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Controle de Contas</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>
            {clients.length} clientes · {totalAccounts} contas compradas · {fmtBRL(totalCost)} investidos
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTargetHouses(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold"
            style={{ background: 'var(--sur)', color: 'var(--t2)', border: '1px solid var(--b)' }}
          >
            <Target size={14} /> Casas Alvo {targetHouses.length > 0 ? `(${targetHouses.length})` : ''}
          </button>
          <Button variant="primary" onClick={() => setShowAddClient(true)}>
            <Plus size={14} /> Registrar Cliente
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Clientes',        value: String(clients.length),         color: 'var(--t)' },
          { label: 'Contas Compradas',value: String(totalAccounts),          color: 'var(--g)' },
          { label: 'Casas Alvo',      value: String(targetHouses.length),    color: 'var(--bl)' },
          { label: 'Total Investido', value: fmtBRL(totalCost),              color: 'var(--r)' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--t3)' }}>{k.label}</div>
            <div className="text-xl font-extrabold font-mono" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--sur)', width: 'fit-content' }}>
        {([['clientes', Users, 'Clientes'], ['resumo', ShoppingCart, 'Resumo / Gráficos']] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={tab === id
              ? { background: 'var(--g)', color: 'var(--bg)', boxShadow: '0 0 12px rgba(0,255,138,.3)' }
              : { color: 'var(--t3)' }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ── Tab: Clientes ── */}
      {tab === 'clientes' && (
        <>
          {clients.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <p className="text-3xl mb-2">👥</p>
              <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhum cliente cadastrado</p>
              <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>
                Registre clientes e acompanhe as contas de apostas compradas para cada um
              </p>
              <Button variant="primary" onClick={() => setShowAddClient(true)}>+ Registrar Cliente</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {clients.map(client => (
                <ClientCard key={client.id} client={client} targetHouses={targetHouses} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Resumo / Gráficos ── */}
      {tab === 'resumo' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cost by month chart */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
            <div className="font-bold mb-4 text-sm" style={{ color: 'var(--t2)' }}>Gastos com Contas por Mês</div>
            {costByMonth.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--t3)' }}>Sem dados ainda</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={costByMonth} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,138,0.05)" />
                  <XAxis dataKey="m" tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="v" fill="#FF4545" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Status pie */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
            <div className="font-bold mb-4 text-sm" style={{ color: 'var(--t2)' }}>Status das Contas</div>
            {statusCounts.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--t3)' }}>Sem dados ainda</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={statusCounts} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                      dataKey="value" paddingAngle={3}>
                      {statusCounts.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1 mt-2">
                  {statusCounts.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-xs flex-1" style={{ color: 'var(--t2)' }}>{d.name}</span>
                      <span className="text-xs font-bold font-mono" style={{ color: d.color }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Missing houses per target */}
          {targetHouses.length > 0 && (
            <div className="lg:col-span-2 rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <div className="font-bold mb-4 text-sm" style={{ color: 'var(--t2)' }}>
                Cobertura por Casa Alvo — Clientes que precisam de conta
              </div>
              {houseCoverage.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--t3)' }}>Configure as casas alvo primeiro</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {houseCoverage.map(h => {
                    const pct = clients.length > 0 ? (h.count / clients.length * 100) : 0;
                    const color = pct >= 80 ? 'var(--g)' : pct >= 50 ? 'var(--y)' : 'var(--r)';
                    return (
                      <div key={h.house} className="flex items-center gap-2">
                        {pct >= 100
                          ? <CheckCircle size={14} style={{ color: 'var(--g)', flexShrink: 0 }} />
                          : <AlertCircle size={14} style={{ color, flexShrink: 0 }} />
                        }
                        <span className="text-xs w-28 truncate font-medium" style={{ color: 'var(--t2)' }}>{h.house}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--sur)' }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, background: color, height: '100%', transition: 'width 0.5s' }} />
                        </div>
                        <span className="text-xs font-mono" style={{ color, minWidth: 40, textAlign: 'right' }}>
                          {h.count}/{h.total}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAddClient    && <AddClientModal    onClose={() => setShowAddClient(false)} />}
      {showTargetHouses && <TargetHousesModal onClose={() => setShowTargetHouses(false)} />}
    </div>
  );
}
