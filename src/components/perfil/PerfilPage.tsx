'use client';

import { useState, useRef, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { groupLegsIntoOps, calcLegProfit, calcBySport } from '@/lib/finance/calculator';
import { currentMonth, todayStr } from '@/lib/parsers/dateParser';
import {
  Camera, Shield, User, Phone, Mail, Edit3, Check, X,
  TrendingUp, BarChart3, Settings,
} from 'lucide-react';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  const sign = v < 0 ? '−' : '+';
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

const ROLES = ['Apostador', 'Gerente', 'Analista', 'Operador', 'Trader'];

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ dataUrl, name, size = 96 }: { dataUrl?: string; name: string; size?: number }) {
  const initials = (name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, rgba(0,255,136,.3), rgba(77,166,255,.3))',
        border: '1px solid rgba(0,255,136,.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.33, fontWeight: 900, color: 'var(--t)',
        letterSpacing: '-0.02em',
      }}
    >
      {initials}
    </div>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────

function EditableField({
  icon: Icon, label, value, placeholder, type = 'text',
  onSave,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);

  function save() {
    onSave(draft);
    setEditing(false);
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
      style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
    >
      <Icon size={15} style={{ color: 'var(--t3)', flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--t3)' }}>
          {label}
        </div>
        {editing ? (
          <input
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            placeholder={placeholder}
            autoFocus
            className="text-sm font-medium w-full"
            style={{
              background: 'var(--sur)', border: '1px solid rgba(0,255,136,.3)',
              borderRadius: 6, padding: '4px 8px', color: 'var(--t)', outline: 'none',
            }}
          />
        ) : (
          <div className="text-sm" style={{ color: value ? 'var(--t)' : 'var(--t3)' }}>
            {value || placeholder || '—'}
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex gap-1 flex-shrink-0">
          <button type="button" onClick={save}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(0,255,136,.1)', color: 'var(--g)' }}>
            <Check size={12} />
          </button>
          <button type="button" onClick={() => { setDraft(value); setEditing(false); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)' }}>
            <X size={12} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => { setDraft(value); setEditing(true); }}
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
          style={{ color: 'var(--t3)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
        >
          <Edit3 size={12} />
        </button>
      )}
    </div>
  );
}

// ── Stat grid item ────────────────────────────────────────────────────────────

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-3"
      style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.05)' }}>
      <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--t3)' }}>
        {label}
      </div>
      <div className="text-sm font-bold" style={{ color: color ?? 'var(--t)', fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
    </div>
  );
}

// ── Performance tab ───────────────────────────────────────────────────────────

function PerformanceTab() {
  const legs  = useStore(s => s.legs);
  const bms   = useStore(s => s.bms);
  const month = currentMonth();

  const stats = useMemo(() => {
    const settled = legs.filter(l => l.re !== 'Pendente');
    const ops     = groupLegsIntoOps(legs);
    const pending = legs.filter(l => l.re === 'Pendente').length;

    const totalProfit  = +legs.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);
    const monthProfit  = +legs
      .filter(l => (l.bd || '').slice(0, 7) === month)
      .reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);

    const totalStake = settled.filter(l => l.re !== 'Devolvido').reduce((s, l) => s + l.st, 0);
    const roi = totalStake > 0 ? +(totalProfit / totalStake * 100).toFixed(2) : 0;

    const totalBalance = bms.reduce((s, b) => s + b.balance, 0);

    const sports = calcBySport(legs);
    const topSport = sports[0]?.sport ?? '—';

    const houses = new Set(legs.map(l => l.ho).filter(Boolean));

    const greenCount = settled.filter(l => l.re === 'Green').length;
    const redCount   = settled.filter(l => l.re === 'Red').length;
    const winRate    = settled.length > 0 ? +(greenCount / settled.length * 100).toFixed(1) : 0;

    return {
      totalOps: ops.length, totalLegs: legs.length, pending,
      totalProfit, monthProfit, roi, totalBalance,
      topSport, housesCount: houses.size, winRate, greenCount, redCount,
    };
  }, [legs, bms, month]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatItem label="Operações" value={String(stats.totalOps)} color="#4DA6FF" />
        <StatItem label="Lucro Total" value={fmtBRL(stats.totalProfit)}
          color={stats.totalProfit >= 0 ? 'var(--g)' : 'var(--r)'} />
        <StatItem label="Lucro do Mês" value={fmtBRL(stats.monthProfit)}
          color={stats.monthProfit >= 0 ? 'var(--g)' : 'var(--r)'} />
        <StatItem label="ROI" value={`${stats.roi >= 0 ? '+' : ''}${stats.roi}%`}
          color={stats.roi >= 0 ? '#4DA6FF' : 'var(--r)'} />
        <StatItem label="Saldo Bancas" value={fmtBRL(stats.totalBalance)}
          color={stats.totalBalance >= 0 ? '#FFCB2F' : 'var(--r)'} />
        <StatItem label="Casas Ativas" value={String(stats.housesCount)} color="#C084FC" />
        <StatItem label="Pendentes" value={String(stats.pending)} color="#FFCB2F" />
        <StatItem label="Esporte Principal" value={stats.topSport} color="var(--t2)" />
      </div>

      {stats.greenCount + stats.redCount > 0 && (
        <div className="rounded-xl px-4 py-3"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--t3)' }}>
            <span>{stats.greenCount} Greens</span>
            <span>Taxa de acerto</span>
            <span>{stats.redCount} Reds</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
            <div
              style={{
                width: `${stats.winRate}%`, height: '100%',
                background: 'linear-gradient(90deg, rgba(0,255,136,.6), rgba(0,255,136,.8))',
                borderRadius: 9999, transition: 'width .5s ease',
              }}
            />
          </div>
          <div className="text-center text-xs font-bold mt-1.5"
            style={{ color: 'var(--g)', fontFamily: "'JetBrains Mono', monospace" }}>
            {stats.winRate}%
          </div>
        </div>
      )}
    </div>
  );
}

// ── Security tab ──────────────────────────────────────────────────────────────

function SecurityTab() {
  const toast = useStore(s => s.toast);
  const [saved,   setSaved]   = useState(false);
  const [pin,     setPin]     = useState('');
  const [pinConf, setPinConf] = useState('');

  function savePin() {
    if (pin.length < 4) { toast('PIN deve ter ao menos 4 dígitos', 'wrn'); return; }
    if (pin !== pinConf) { toast('PINs não coincidem', 'wrn'); return; }
    setSaved(true);
    setPin('');
    setPinConf('');
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Info banner */}
      <div className="rounded-xl px-4 py-3 text-xs"
        style={{ background: 'rgba(192,132,252,.06)', color: '#C084FC', border: '1px solid rgba(192,132,252,.12)' }}>
        Os dados desta aplicação são armazenados localmente no seu dispositivo. Não há conta de acesso online.
      </div>

      {/* Contact update */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
        <div className="px-4 py-3" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>
            Dados de Contato
          </div>
        </div>
        <div className="px-4 py-4 flex flex-col gap-3" style={{ background: 'var(--bg2)' }}>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>
              Novo E-mail
            </span>
            <input
              type="email"
              placeholder="novo@email.com"
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)', outline: 'none' }}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>
              Novo Telefone
            </span>
            <input
              type="tel"
              placeholder="+55 11 99999-9999"
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)', outline: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* PIN */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
        <div className="px-4 py-3" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>
            PIN de Acesso
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Opcional — mínimo 4 dígitos</div>
        </div>
        <div className="px-4 py-4 flex flex-col gap-3" style={{ background: 'var(--bg2)' }}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>PIN</span>
              <input
                type="password"
                maxLength={8}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="px-3 py-2 rounded-lg text-sm font-mono text-center"
                style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)', outline: 'none' }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>
                Confirmar PIN
              </span>
              <input
                type="password"
                maxLength={8}
                value={pinConf}
                onChange={e => setPinConf(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="px-3 py-2 rounded-lg text-sm font-mono text-center"
                style={{
                  background: 'var(--sur)',
                  border: `1px solid ${pinConf && pin !== pinConf ? 'var(--r)' : 'var(--b2)'}`,
                  color: 'var(--t)', outline: 'none',
                }}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={savePin}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
              style={{
                background: saved ? 'rgba(0,255,136,.1)' : 'rgba(0,255,136,.08)',
                color: saved ? 'var(--g)' : 'var(--g)',
                border: `1px solid ${saved ? 'rgba(0,255,136,.3)' : 'rgba(0,255,136,.15)'}`,
              }}
            >
              {saved ? 'Configurações salvas' : 'Salvar'}
            </button>
            {pinConf && pin !== pinConf && (
              <span className="text-xs" style={{ color: 'var(--r)' }}>PINs não coincidem</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = 'dados' | 'desempenho' | 'seguranca';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'dados',       label: 'Dados',      icon: User      },
  { id: 'desempenho',  label: 'Desempenho', icon: BarChart3 },
  { id: 'seguranca',   label: 'Segurança',  icon: Shield    },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export function PerfilPage() {
  const profile       = useStore(s => s.profile);
  const updateProfile = useStore(s => s.updateProfile);
  const toast         = useStore(s => s.toast);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabId>('dados');

  const name   = profile?.name  ?? '';
  const email  = profile?.email ?? '';
  const phone  = profile?.phone ?? '';
  const role   = profile?.role  ?? '';
  const avatar = profile?.avatarDataUrl;

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Selecione uma imagem', 'wrn'); return; }
    if (file.size > 2 * 1024 * 1024) { toast('Imagem muito grande (máx. 2MB)', 'wrn'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      updateProfile({ avatarDataUrl: ev.target?.result as string });
      toast('Foto atualizada', 'ok');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in" style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Perfil</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
          Informações pessoais e configurações da conta
        </p>
      </div>

      {/* Identity card */}
      <div
        className="rounded-2xl p-5 flex flex-col sm:flex-row items-center sm:items-start gap-5"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
      >
        {/* Avatar */}
        <div className="flex flex-col items-center gap-2.5 flex-shrink-0">
          <div className="relative">
            <Avatar dataUrl={avatar} name={name} size={88} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(77,166,255,.9)', border: '2px solid var(--bg2)', color: '#fff' }}
              title="Alterar foto"
            >
              <Camera size={12} />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)', border: '1px solid var(--b)' }}
          >
            Alterar foto
          </button>
          {avatar && (
            <button
              type="button"
              onClick={() => { updateProfile({ avatarDataUrl: undefined }); toast('Foto removida', 'ok'); }}
              className="text-[11px]" style={{ color: 'var(--t3)' }}
            >
              Remover
            </button>
          )}
        </div>

        {/* Identity info */}
        <div className="flex-1 flex flex-col gap-3 w-full">
          <div>
            <div className="text-lg font-bold" style={{ color: 'var(--t)' }}>
              {name || 'Sem nome'}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
              {role || 'Apostador'}
            </div>
          </div>

          {/* Role selector */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--t3)' }}>
              Função
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => updateProfile({ role: r })}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: role === r ? 'rgba(0,255,136,.1)' : 'rgba(255,255,255,.04)',
                    color:      role === r ? 'var(--g)'            : 'var(--t3)',
                    border: `1px solid ${role === r ? 'rgba(0,255,136,.25)' : 'rgba(255,255,255,.07)'}`,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        {TABS.map(t => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: active ? 'rgba(0,255,136,.1)' : 'transparent',
                color:      active ? 'var(--g)'           : 'var(--t3)',
                border: active ? '1px solid rgba(0,255,136,.2)' : '1px solid transparent',
              }}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Dados */}
      {tab === 'dados' && (
        <div className="flex flex-col gap-2">
          <EditableField
            icon={User}
            label="Nome completo"
            value={name}
            placeholder="Seu nome"
            onSave={v => { updateProfile({ name: v }); toast('Nome atualizado', 'ok'); }}
          />
          <EditableField
            icon={Mail}
            label="E-mail"
            value={email}
            placeholder="seu@email.com"
            type="email"
            onSave={v => { updateProfile({ email: v }); toast('E-mail atualizado', 'ok'); }}
          />
          <EditableField
            icon={Phone}
            label="Telefone"
            value={phone}
            placeholder="+55 11 99999-9999"
            type="tel"
            onSave={v => { updateProfile({ phone: v }); toast('Telefone atualizado', 'ok'); }}
          />
        </div>
      )}

      {/* Tab: Desempenho */}
      {tab === 'desempenho' && <PerformanceTab />}

      {/* Tab: Segurança */}
      {tab === 'seguranca' && <SecurityTab />}
    </div>
  );
}
