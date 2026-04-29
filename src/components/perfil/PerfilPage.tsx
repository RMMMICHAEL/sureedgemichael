'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getMySubscription, PLAN_LABELS, type Subscription } from '@/lib/supabase/subscription';
import { Camera, LogOut, AlertTriangle } from 'lucide-react';

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
        background: 'linear-gradient(135deg, rgba(63,255,33,.25), rgba(63,255,33,.08))',
        border: '1.5px solid rgba(63,255,33,.22)',
        boxShadow: '0 0 16px rgba(63,255,33,.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.33, fontWeight: 900, color: 'var(--g)',
        letterSpacing: '-0.02em',
      }}
    >
      {initials}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PerfilPage() {
  const profile       = useStore(s => s.profile);
  const updateProfile = useStore(s => s.updateProfile);
  const toast         = useStore(s => s.toast);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [sub, setSub] = useState<Subscription | null>(null);

  useEffect(() => {
    getMySubscription().then(setSub);
  }, []);

  const expiresAt   = sub?.expires_at ? new Date(sub.expires_at) : null;
  const daysLeft    = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null;
  const isExpiring  = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
  const isExpired   = sub?.status === 'expired' || sub?.status === 'cancelled' || (daysLeft !== null && daysLeft <= 0);
  const planLabel   = sub ? PLAN_LABELS[sub.plan] : '—';
  const statusLabel = isExpired ? 'Expirado' : sub?.status === 'active' ? 'Ativo' : '—';
  const expiryText  = expiresAt
    ? expiresAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : sub?.status === 'active' ? 'Vitalício' : '—';

  const name   = profile?.name  ?? '';
  const role   = profile?.role  ?? 'Apostador';
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
        updateProfile({ avatarDataUrl: `${publicUrl}?t=${Date.now()}` });
        toast('Foto atualizada', 'ok');
      } catch {
        toast('Erro ao enviar foto — tente novamente', 'err');
      } finally {
        setUploadingAvatar(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = ev => {
        updateProfile({ avatarDataUrl: ev.target?.result as string });
        toast('Foto atualizada', 'ok');
      };
      reader.readAsDataURL(file);
    }
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in" style={{ maxWidth: 440, margin: '0 auto' }}>

      {/* Identity card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
      >
        {/* Green accent top */}
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, var(--g) 0%, rgba(63,255,33,.35) 55%, transparent 100%)',
        }} />

        <div className="p-6 flex flex-col items-center gap-5">
          {/* Avatar */}
          <div className="relative">
            <Avatar dataUrl={avatar} name={name} size={96} />
            <button
              type="button"
              onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{
                background: uploadingAvatar ? 'rgba(148,163,184,.6)' : 'var(--g)',
                border: '2.5px solid var(--bg2)',
                color: '#060A07',
              }}
              title="Alterar foto"
            >
              {uploadingAvatar
                ? <span style={{ fontSize: 9, fontWeight: 900 }}>...</span>
                : <Camera size={13} />}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />

          {/* Name + role */}
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: 'var(--t)', letterSpacing: '-0.02em' }}>
              {name || 'Sem nome'}
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              <span className="live-dot" style={{ width: 5, height: 5 }} />
              <span className="text-xs" style={{ color: 'var(--t3)' }}>{role}</span>
            </div>
          </div>

          {/* Plan info row */}
          <div className="flex flex-col gap-2 w-full">
            <div
              className="flex items-center gap-0 rounded-xl w-full overflow-hidden"
              style={{
                border: isExpired
                  ? '1px solid rgba(255,69,69,.25)'
                  : isExpiring
                    ? '1px solid rgba(255,180,0,.25)'
                    : '1px solid rgba(63,255,33,.14)',
              }}
            >
              <div
                className="flex flex-col gap-1 flex-1 px-5 py-4"
                style={{ background: isExpired ? 'rgba(255,69,69,.05)' : 'rgba(63,255,33,.05)' }}
              >
                <span className="text-[9px] font-black uppercase tracking-[.16em]" style={{ color: 'var(--t3)' }}>
                  Plano atual
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-bold" style={{ color: 'var(--t)' }}>{planLabel}</span>
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider"
                    style={
                      isExpired
                        ? { background: 'rgba(255,69,69,.12)', color: 'var(--r)', border: '1px solid rgba(255,69,69,.2)' }
                        : { background: 'rgba(63,255,33,.12)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }
                    }
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>

              <div style={{ width: 1, alignSelf: 'stretch', background: isExpired ? 'rgba(255,69,69,.15)' : 'rgba(63,255,33,.12)' }} />

              <div className="flex flex-col gap-1 flex-1 px-5 py-4" style={{ background: 'rgba(63,255,33,.03)' }}>
                <span className="text-[9px] font-black uppercase tracking-[.16em]" style={{ color: 'var(--t3)' }}>
                  Vencimento
                </span>
                <span
                  className="text-sm font-mono font-bold mt-0.5"
                  style={{ color: isExpired ? 'var(--r)' : isExpiring ? 'rgba(255,180,0,1)' : 'var(--t2)' }}
                >
                  {expiryText}
                </span>
              </div>
            </div>

            {/* Renewal reminder */}
            {isExpiring && !isExpired && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold"
                style={{ background: 'rgba(255,180,0,.08)', border: '1px solid rgba(255,180,0,.22)', color: 'rgba(255,180,0,1)' }}
              >
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                Seu plano vence em {daysLeft} dia{daysLeft !== 1 ? 's' : ''} — renove para não perder o acesso.
              </div>
            )}
            {isExpired && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold"
                style={{ background: 'rgba(255,69,69,.08)', border: '1px solid rgba(255,69,69,.22)', color: 'var(--r)' }}
              >
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                Plano expirado — renove para recuperar o acesso completo.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sign out */}
      <button
        type="button"
        onClick={signOut}
        className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all self-start"
        style={{
          background: 'var(--rd)',
          color: 'var(--r)',
          border: '1px solid rgba(255,69,69,.2)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,69,.12)';
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,69,69,.35)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = 'var(--rd)';
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,69,69,.2)';
        }}
      >
        <LogOut size={14} />
        Sair da conta
      </button>
    </div>
  );
}
