'use client';

import { useState, useRef, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { groupLegsIntoOps, calcLegProfit, calcBySport } from '@/lib/finance/calculator';
import { currentMonth, todayStr } from '@/lib/parsers/dateParser';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  Camera, Shield, User, Phone, Mail, Edit3, Check, X,
  TrendingUp, BarChart3, Lock, LogOut,
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

  const [newPw,    setNewPw]    = useState('');
  const [confPw,   setConfPw]   = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const [newEmail,    setNewEmail]    = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const inputStyle = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)', outline: 'none' };

  async function changePassword() {
    if (newPw.length < 6) { toast('Senha deve ter ao menos 6 caracteres', 'wrn'); return; }
    if (newPw !== confPw) { toast('Senhas não coincidem', 'wrn'); return; }
    setPwLoading(true);
    try {
      const { error } = await getSupabaseClient().auth.updateUser({ password: newPw });
      if (error) throw error;
      toast('Senha alterada com sucesso', 'ok');
      setNewPw(''); setConfPw('');
    } catch (err: unknown) {
      toast((err as { message?: string }).message ?? 'Erro ao alterar senha', 'err');
    } finally {
      setPwLoading(false);
    }
  }

  async function changeEmail() {
    if (!newEmail.trim()) { toast('Informe o novo e-mail', 'wrn'); return; }
    setEmailLoading(true);
    try {
      const { error } = await getSupabaseClient().auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      toast('Verifique sua caixa de entrada para confirmar o novo e-mail', 'ok');
      setNewEmail('');
    } catch (err: unknown) {
      toast((err as { message?: string }).message ?? 'Erro ao alterar e-mail', 'err');
    } finally {
      setEmailLoading(false);
    }
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Change password */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}>
          <Lock size={13} style={{ color: 'var(--t3)' }} />
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>
            Alterar Senha
          </div>
        </div>
        <div className="px-4 py-4 flex flex-col gap-3" style={{ background: 'var(--bg2)' }}>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>Nova Senha</span>
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="mínimo 6 caracteres"
              className="px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>Confirmar Senha</span>
            <input
              type="password"
              value={confPw}
              onChange={e => setConfPw(e.target.value)}
              placeholder="repita a senha"
              className="px-3 py-2 rounded-lg text-sm"
              style={{ ...inputStyle, border: `1px solid ${confPw && newPw !== confPw ? 'var(--r)' : 'var(--b2)'}` }}
            />
          </label>
          <button
            type="button"
            onClick={changePassword}
            disabled={pwLoading}
            className="px-4 py-2 rounded-lg text-sm font-bold self-start transition-all"
            style={{ background: 'rgba(0,255,136,.08)', color: 'var(--g)', border: '1px solid rgba(0,255,136,.15)', opacity: pwLoading ? 0.6 : 1 }}
          >
            {pwLoading ? 'Salvando…' : 'Alterar senha'}
          </button>
        </div>
      </div>

      {/* Change email */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b)' }}>
          <Mail size={13} style={{ color: 'var(--t3)' }} />
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>
            Alterar E-mail
          </div>
        </div>
        <div className="px-4 py-4 flex flex-col gap-3" style={{ background: 'var(--bg2)' }}>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>Novo E-mail</span>
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="novo@email.com"
              className="px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            />
          </label>
          <p className="text-xs" style={{ color: 'var(--t3)' }}>
            Um link de confirmação será enviado para o novo endereço.
          </p>
          <button
            type="button"
            onClick={changeEmail}
            disabled={emailLoading}
            className="px-4 py-2 rounded-lg text-sm font-bold self-start transition-all"
            style={{ background: 'rgba(0,255,136,.08)', color: 'var(--g)', border: '1px solid rgba(0,255,136,.15)', opacity: emailLoading ? 0.6 : 1 }}
          >
            {emailLoading ? 'Enviando…' : 'Alterar e-mail'}
          </button>
        </div>
      </div>

      {/* Sign out */}
      <button
        type="button"
        onClick={signOut}
        className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold self-start transition-all"
        style={{ background: 'var(--rd)', color: 'var(--r)', border: '1px solid rgba(255,69,69,.2)' }}
      >
        <LogOut size={14} />
        Sair da conta
      </button>
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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const name   = profile?.name  ?? '';
  const email  = profile?.email ?? '';
  const phone  = profile?.phone ?? '';
  const role   = profile?.role  ?? '';
  const avatar = profile?.avatarDataUrl;

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Selecione uma imagem', 'wrn'); return; }
    if (file.size > 2 * 1024 * 1024) { toast('Imagem muito grande (máx. 2MB)', 'wrn'); return; }

    e.target.value = '';

    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Upload para Supabase Storage e salva a URL pública
      setUploadingAvatar(true);
      try {
        const ext  = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${user.id}/avatar.${ext}`;
        const { error } = await supabase.storage.from('avatars').upload(path, file, {
          upsert: true,
          contentType: file.type,
        });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        // Cache-bust para evitar imagem desatualizada após troca
        updateProfile({ avatarDataUrl: `${publicUrl}?t=${Date.now()}` });
        toast('Foto atualizada', 'ok');
      } catch {
        toast('Erro ao enviar foto — tente novamente', 'err');
      } finally {
        setUploadingAvatar(false);
      }
    } else {
      // Fallback: base64 quando não há sessão Supabase
      const reader = new FileReader();
      reader.onload = ev => {
        updateProfile({ avatarDataUrl: ev.target?.result as string });
        toast('Foto atualizada', 'ok');
      };
      reader.readAsDataURL(file);
    }
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
              onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: uploadingAvatar ? 'rgba(148,163,184,.6)' : 'rgba(77,166,255,.9)', border: '2px solid var(--bg2)', color: '#fff' }}
              title="Alterar foto"
            >
              {uploadingAvatar
                ? <span style={{ fontSize: 9, fontWeight: 900 }}>...</span>
                : <Camera size={12} />}
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
            onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)', border: '1px solid var(--b)', opacity: uploadingAvatar ? 0.5 : 1 }}
          >
            {uploadingAvatar ? 'Enviando...' : 'Alterar foto'}
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
