'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getMySubscription, PLAN_LABELS, type Subscription } from '@/lib/supabase/subscription';
import {
  Camera, LogOut, AlertTriangle, Pencil, Trash2, Check, X,
  User, Palette, CircleHelp, Users, Lock, TriangleAlert,
} from 'lucide-react';

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ dataUrl, name, size = 80 }: { dataUrl?: string; name: string; size?: number }) {
  const initials = (name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (dataUrl) {
    return (
      <img src={dataUrl} alt={name} width={size} height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, rgba(63,255,33,.25), rgba(63,255,33,.08))',
      border: '1.5px solid rgba(63,255,33,.22)', boxShadow: '0 0 16px rgba(63,255,33,.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 900, color: 'var(--g)', letterSpacing: '-0.02em',
    }}>
      {initials}
    </div>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────────

function SCard({ title, icon, children, danger }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; danger?: boolean;
}) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: 'var(--bg2)',
        border: danger ? '1px solid rgba(255,69,69,.3)' : '1px solid var(--b)',
      }}>
      <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2"
        style={{ color: danger ? 'var(--r)' : 'var(--t3)' }}>
        {icon}{title}
      </h2>
      {children}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const PERFIL_TABS = [
  { id: 'conta',  label: 'Minha Conta',     icon: <User        size={13} /> },
  { id: 'visual', label: 'Aparência',        icon: <Palette     size={13} /> },
  { id: 'ajuda',  label: 'Central de Ajuda', icon: <CircleHelp  size={13} /> },
  { id: 'afil',   label: 'Afiliados',        icon: <Users       size={13} /> },
] as const;

type PerfilTab = typeof PERFIL_TABS[number]['id'];

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PerfilPage() {
  const profile       = useStore(s => s.profile);
  const authEmail     = useStore(s => s.authEmail);
  const updateProfile = useStore(s => s.updateProfile);
  const toast         = useStore(s => s.toast);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [sub,         setSub]         = useState<Subscription | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState('');
  const [activeTab,   setActiveTab]   = useState<PerfilTab>('conta');

  // Password change state
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [changingPw,  setChangingPw]  = useState(false);

  useEffect(() => { getMySubscription().then(setSub); }, []);

  const expiresAt  = sub?.expires_at ? new Date(sub.expires_at) : null;
  const daysLeft   = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null;
  const isExpiring = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
  const isExpired  = sub?.status === 'expired' || sub?.status === 'cancelled' || (daysLeft !== null && daysLeft <= 0);
  const planLabel  = sub ? PLAN_LABELS[sub.plan] : '—';
  const statusLabel = isExpired ? 'Expirado' : sub?.status === 'active' ? 'Ativo' : '—';
  const expiryText  = expiresAt
    ? expiresAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : sub?.status === 'active' ? 'Vitalício' : '—';

  const name   = profile?.name ?? '';
  const avatar = profile?.avatarDataUrl;

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Selecione uma imagem', 'wrn'); return; }
    if (file.size > 2 * 1024 * 1024)    { toast('Imagem muito grande (máx. 2MB)', 'wrn'); return; }
    e.target.value = '';
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUploadingAvatar(true);
      try {
        const ext  = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${user.id}/avatar.${ext}`;
        const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        updateProfile({ avatarDataUrl: `${publicUrl}?t=${Date.now()}` });
        toast('Foto atualizada', 'ok');
      } catch { toast('Erro ao enviar foto — tente novamente', 'err'); }
      finally { setUploadingAvatar(false); }
    } else {
      const reader = new FileReader();
      reader.onload = ev => { updateProfile({ avatarDataUrl: ev.target?.result as string }); toast('Foto atualizada', 'ok'); };
      reader.readAsDataURL(file);
    }
  }

  function saveName() {
    const trimmed = nameInput.trim();
    if (trimmed) updateProfile({ name: trimmed });
    setEditingName(false);
  }

  async function handleChangePassword() {
    if (!newPass || newPass.length < 6) { toast('Senha deve ter pelo menos 6 caracteres', 'wrn'); return; }
    if (newPass !== confirmPass)         { toast('As senhas não conferem', 'wrn'); return; }
    setChangingPw(true);
    try {
      const { error } = await getSupabaseClient().auth.updateUser({ password: newPass });
      if (error) throw error;
      toast('Senha alterada com sucesso', 'ok');
      setNewPass(''); setConfirmPass('');
    } catch (err: unknown) {
      toast((err as { message?: string }).message ?? 'Erro ao alterar senha', 'err');
    } finally { setChangingPw(false); }
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  }

  function confirmZerar(modulo: string) {
    if (!confirm(`Zerar dados de ${modulo}? Esta ação não pode ser desfeita.`)) return;
    toast(`Módulo "${modulo}" zerado`, 'ok');
  }

  function handleResetAll() {
    if (!confirm('Isso apagará TODOS os seus dados financeiros permanentemente. Continuar?')) return;
    if (!confirm('Tem certeza absoluta? Não há como desfazer.')) return;
    try {
      const { wipeDB } = require('@/lib/storage/db');
      wipeDB();
      toast('Todos os dados foram apagados', 'ok');
      setTimeout(() => window.location.reload(), 800);
    } catch { toast('Erro ao resetar dados', 'err'); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 animate-fade-in" style={{ maxWidth: 540, margin: '0 auto' }}>

      {/* Page header */}
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--t)' }}>Configurações</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>Gerencie sua conta, aparência e mais</p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5">
        {PERFIL_TABS.map(t => (
          <button key={t.id} type="button"
            onClick={() => setActiveTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={
              activeTab === t.id
                ? { background: 'rgba(63,255,33,.12)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }
                : { background: 'var(--bg2)', color: 'var(--t3)', border: '1px solid var(--b)' }
            }>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Minha Conta ── */}
      {activeTab === 'conta' && (
        <>
          {/* Photo */}
          <SCard title="Foto de Perfil">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar dataUrl={avatar} name={name} size={80} />
                <button type="button"
                  onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: uploadingAvatar ? 'rgba(148,163,184,.6)' : 'var(--g)', border: '2.5px solid var(--bg2)', color: '#060A07' }}>
                  {uploadingAvatar ? <span style={{ fontSize: 8, fontWeight: 900 }}>...</span> : <Camera size={12} />}
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--t)' }}>{name || 'Sem nome'}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Clique no ícone para alterar</p>
                {avatar && (
                  <button type="button" onClick={() => { updateProfile({ avatarDataUrl: undefined }); toast('Foto removida', 'ok'); }}
                    className="flex items-center gap-1 mt-2 text-xs"
                    style={{ color: 'var(--r)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Trash2 size={11} /> Remover foto
                  </button>
                )}
              </div>
            </div>
          </SCard>

          {/* Name */}
          <SCard title="Nome">
            <div className="flex items-center gap-2 max-w-sm">
              {editingName ? (
                <>
                  <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                    style={{
                      flex: 1, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(63,255,33,.35)',
                      borderRadius: 8, padding: '7px 12px', fontSize: 14, color: 'var(--t)', outline: 'none',
                    }} />
                  <button type="button" onClick={saveName}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--g)', padding: 4 }}>
                    <Check size={16} />
                  </button>
                  <button type="button" onClick={() => setEditingName(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 4 }}>
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>{name || 'Sem nome'}</span>
                  <button type="button" onClick={() => { setNameInput(name); setEditingName(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t3)' }}>
                    <Pencil size={11} /> Editar
                  </button>
                </>
              )}
            </div>
          </SCard>

          {/* Account info */}
          <SCard title="Informações da Conta">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--t3)' }}>E-mail</p>
                <p className="text-sm font-medium" style={{ color: 'var(--t)' }}>{authEmail ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--t3)' }}>Plano</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium" style={{ color: 'var(--t)' }}>{planLabel}</p>
                  <span className="text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider"
                    style={isExpired
                      ? { background: 'rgba(255,69,69,.12)', color: 'var(--r)', border: '1px solid rgba(255,69,69,.2)' }
                      : { background: 'rgba(63,255,33,.12)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }}>
                    {statusLabel}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--t3)' }}>Vencimento</p>
                <p className="text-sm font-medium" style={{ color: isExpired ? 'var(--r)' : isExpiring ? '#ffb400' : 'var(--t)' }}>{expiryText}</p>
              </div>
            </div>
            {isExpiring && !isExpired && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold"
                style={{ background: 'rgba(255,180,0,.08)', border: '1px solid rgba(255,180,0,.22)', color: 'rgba(255,180,0,1)' }}>
                <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                Seu plano vence em {daysLeft} dia{daysLeft !== 1 ? 's' : ''} — renove para não perder acesso.
              </div>
            )}
          </SCard>

          {/* Change password */}
          <SCard title="Alterar Senha" icon={<Lock size={13} />}>
            <div className="flex flex-col gap-3 max-w-sm">
              <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                placeholder="Nova senha"
                style={{
                  background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)',
                  borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--t)', outline: 'none',
                }} />
              <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                placeholder="Confirmar nova senha"
                style={{
                  background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)',
                  borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--t)', outline: 'none',
                }} />
              <button type="button" onClick={handleChangePassword}
                disabled={!newPass || !confirmPass || changingPw}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                style={{ background: 'rgba(63,255,33,.12)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }}>
                <Lock size={13} />{changingPw ? 'Alterando...' : 'Alterar Senha'}
              </button>
            </div>
          </SCard>

          {/* Sign out */}
          <button type="button" onClick={signOut}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all self-start"
            style={{ background: 'var(--rd)', color: 'var(--r)', border: '1px solid rgba(255,69,69,.2)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,69,.12)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,69,69,.35)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--rd)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,69,69,.2)'; }}>
            <LogOut size={14} /> Sair da conta
          </button>

          {/* Zerar por módulo */}
          <SCard title="Zerar por Módulo">
            <p className="text-xs" style={{ color: 'var(--t3)' }}>
              Limpe dados de um módulo específico sem afetar os demais.
            </p>
            <div className="flex flex-wrap gap-2">
              {['Volume', 'Custos', 'Balanço', 'Extrato', 'Lucro/CPF', 'Relatório IR'].map(mod => (
                <button key={mod} type="button"
                  onClick={() => confirmZerar(mod)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: 'rgba(255,69,69,.06)', color: 'var(--r)', border: '1px solid rgba(255,69,69,.2)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,69,.14)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,69,.06)'; }}>
                  <Trash2 size={11} />{mod}
                </button>
              ))}
            </div>
          </SCard>

          {/* Danger zone */}
          <SCard title="Zona de Perigo" icon={<TriangleAlert size={13} />} danger>
            <p className="text-xs" style={{ color: 'var(--t3)' }}>
              Apaga permanentemente todas as bancas, operações, parceiros, custos e demais dados financeiros. Seu perfil e conta serão mantidos.
            </p>
            <button type="button" onClick={handleResetAll}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold self-start"
              style={{ background: 'rgba(255,69,69,.15)', color: 'var(--r)', border: '1px solid rgba(255,69,69,.3)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,69,.25)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,69,.15)'; }}>
              <TriangleAlert size={13} /> Resetar Todos os Dados
            </button>
          </SCard>
        </>
      )}

      {/* ── Aparência ── */}
      {activeTab === 'visual' && (
        <SCard title="Aparência">
          <p className="text-sm" style={{ color: 'var(--t3)' }}>
            Opções de personalização visual em breve.
          </p>
        </SCard>
      )}

      {/* ── Central de Ajuda ── */}
      {activeTab === 'ajuda' && (
        <SCard title="Central de Ajuda">
          <div className="flex flex-col gap-3">
            {[
              { q: 'Como registrar uma operação?', a: 'Acesse Operações e clique em "Nova Operação". Preencha as casas, odds e stake.' },
              { q: 'Como configurar casas de aposta?', a: 'Em "Casas de Aposta" você pode adicionar saldo, cor e transações para cada casa.' },
              { q: 'O que é uma Surebet?', a: 'Arbitragem entre casas que garante lucro independente do resultado.' },
              { q: 'Como exportar relatório IR?', a: 'Acesse Perfil > Zerar por Módulo > Relatório IR ou use a seção de Análise.' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)' }}>
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--t)' }}>{item.q}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>{item.a}</p>
              </div>
            ))}
          </div>
        </SCard>
      )}

      {/* ── Afiliados ── */}
      {activeTab === 'afil' && (
        <SCard title="Afiliados">
          <p className="text-sm" style={{ color: 'var(--t3)' }}>
            Programa de afiliados em breve. Indique e ganhe comissões.
          </p>
        </SCard>
      )}
    </div>
  );
}
