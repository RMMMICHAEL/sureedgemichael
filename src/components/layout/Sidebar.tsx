'use client';

import { useStore } from '@/store/useStore';
import type { ViewId } from '@/types';
import {
  LayoutDashboard, Activity, Building2, Wallet,
  BarChart3, ShieldCheck, Receipt, Users, X,
  UserCircle, LogOut,
} from 'lucide-react';

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
}

const NAV_MAIN: NavItem[] = [
  { id: 'dash', label: 'Dashboard',      icon: <LayoutDashboard size={15} strokeWidth={2} /> },
  { id: 'ops',  label: 'Operações',      icon: <Activity        size={15} strokeWidth={2} /> },
];

const NAV_FINANCE: NavItem[] = [
  { id: 'bm',     label: 'Casas de Aposta', icon: <Building2  size={15} strokeWidth={2} /> },
  { id: 'caixa',  label: 'Caixa',           icon: <Wallet     size={15} strokeWidth={2} /> },
  { id: 'gastos', label: 'Gastos',          icon: <Receipt    size={15} strokeWidth={2} /> },
  { id: 'contas', label: 'Contas',          icon: <Users      size={15} strokeWidth={2} /> },
];

const NAV_OTHER: NavItem[] = [
  { id: 'analise', label: 'Análise', icon: <BarChart3   size={15} strokeWidth={2} /> },
  { id: 'admin',   label: 'Admin',   icon: <ShieldCheck size={15} strokeWidth={2} /> },
  { id: 'perfil',  label: 'Perfil',  icon: <UserCircle  size={15} strokeWidth={2} /> },
];

interface SidebarProps {
  onClose?: () => void;
}

function NavButton({ item, onClose }: { item: NavItem; onClose?: () => void }) {
  const view    = useStore(s => s.view);
  const setView = useStore(s => s.setView);
  const legs    = useStore(s => s.legs);

  const pending = legs.filter(l => l.re === 'Pendente').length;
  const flagged = legs.filter(l => l.fl && l.fl.length > 0).length;

  const isOn  = view === item.id;
  const badge =
    item.id === 'ops' && pending > 0 ? { val: pending, warn: false } :
    item.id === 'ops' && flagged > 0 ? { val: flagged, warn: true  } : null;

  return (
    <button
      onClick={() => { setView(item.id); onClose?.(); }}
      className={`nav-item ${isOn ? 'active' : ''}`}
    >
      {/* Active bar */}
      {isOn && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-full"
          style={{ background: 'var(--g)', boxShadow: '0 0 10px rgba(63,255,33,.7)' }}
        />
      )}

      {/* Icon container */}
      <span className="icon-wrap">
        {item.icon}
      </span>

      <span className="flex-1 truncate">{item.label}</span>

      {/* Badge */}
      {badge && (
        <span
          className="pill text-[10px]"
          style={
            isOn
              ? { background: 'rgba(63,255,33,.15)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }
              : badge.warn
                ? { background: 'var(--rd)', color: 'var(--r)', border: '1px solid rgba(255,77,109,.2)' }
                : { background: 'var(--yd)', color: 'var(--y)', border: '1px solid rgba(255,214,0,.2)' }
          }
        >
          {badge.val}
        </span>
      )}
    </button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pt-5 pb-1.5 flex items-center gap-2">
      <span
        className="text-[9px] font-black tracking-[.14em] uppercase"
        style={{ color: 'var(--t3)' }}
      >
        {label}
      </span>
      <span className="flex-1 h-px" style={{ background: 'var(--b)' }} />
    </div>
  );
}

async function handleSignOut() {
  try {
    const { getSupabaseClient } = await import('@/lib/supabase/client');
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  } catch {
    // Supabase not configured yet — no-op
  }
}

function ProfileFooter({ onClose }: { onClose?: () => void }) {
  const profile = useStore(s => s.profile);
  const setView = useStore(s => s.setView);
  const name    = profile?.name || 'Usuário';
  const role    = profile?.role || 'Apostador';
  const avatar  = profile?.avatarDataUrl;
  const initials = name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div
      className="p-3 flex-shrink-0"
      style={{ borderTop: '1px solid var(--b)' }}
    >
      <button
        type="button"
        onClick={() => { setView('perfil'); onClose?.(); }}
        className="flex items-center gap-3 p-2.5 rounded-xl transition-all w-full text-left group"
        style={{
          background: 'rgba(255,255,255,.03)',
          border: '1px solid rgba(255,255,255,.06)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(63,255,33,.06)';
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(63,255,33,.18)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)';
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.06)';
        }}
      >
        {/* Avatar */}
        {avatar ? (
          <img
            src={avatar} alt={name}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              objectFit: 'cover', flexShrink: 0,
              border: '1.5px solid rgba(63,255,33,.25)',
              boxShadow: '0 0 8px rgba(63,255,33,.12)',
            }}
          />
        ) : (
          <div
            style={{
              width: 34, height: 34, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(63,255,33,.18), rgba(63,255,33,.06))',
              border: '1.5px solid rgba(63,255,33,.22)',
              fontSize: 12, fontWeight: 900,
              color: 'var(--g)',
              boxShadow: '0 0 8px rgba(63,255,33,.1)',
            }}
          >
            {initials || 'U'}
          </div>
        )}

        {/* Name + role */}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold truncate" style={{ color: 'var(--t)', letterSpacing: '-0.01em' }}>
            {name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="live-dot" style={{ width: 5, height: 5 }} />
            <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{role}</span>
          </div>
        </div>

        {/* Pro badge */}
        <span
          className="text-[9px] px-2 py-0.5 rounded-md font-black flex-shrink-0 uppercase tracking-wider"
          style={{
            background: 'rgba(63,255,33,.12)',
            color: 'var(--g)',
            border: '1px solid rgba(63,255,33,.2)',
          }}
        >
          Pro
        </span>
      </button>

      {/* Sign out */}
      <button
        type="button"
        onClick={handleSignOut}
        className="flex items-center gap-2 w-full px-3 py-1.5 mt-1.5 rounded-xl text-xs font-semibold transition-all"
        style={{ color: 'var(--t3)' }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,77,109,.07)';
          (e.currentTarget as HTMLElement).style.color = 'var(--r)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = '';
          (e.currentTarget as HTMLElement).style.color = 'var(--t3)';
        }}
      >
        <LogOut size={13} />
        Sair da conta
      </button>
    </div>
  );
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  return (
    <>
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{
          height: 60,
          borderBottom: '1px solid var(--b)',
          background: 'linear-gradient(180deg, rgba(63,255,33,.04) 0%, transparent 100%)',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 32, height: 32,
            borderRadius: 10,
            background: 'linear-gradient(135deg, var(--g) 0%, #00CC6E 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(63,255,33,.4), 0 0 40px rgba(63,255,33,.12)',
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L12.196 4V10L7 13L1.804 10V4L7 1Z"
              fill="#060A07" fillOpacity=".9" />
          </svg>
        </div>

        <div className="flex flex-col leading-none">
          <span className="text-base font-black tracking-tight">
            <span className="text-glow" style={{ color: 'var(--g)' }}>Sure</span>
            <span style={{ color: 'var(--t)' }}>Edge</span>
          </span>
          <span className="text-[9px] font-semibold tracking-[.08em] uppercase" style={{ color: 'var(--t3)' }}>
            Trading Hub
          </span>
        </div>

        {/* Close button — mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--t3)', background: 'rgba(255,255,255,.04)' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-1 flex flex-col overflow-y-auto">
        <SectionLabel label="Menu" />
        {NAV_MAIN.map(item => <NavButton key={item.id} item={item} onClose={onClose} />)}

        <SectionLabel label="Finanças" />
        {NAV_FINANCE.map(item => <NavButton key={item.id} item={item} onClose={onClose} />)}

        <SectionLabel label="Sistema" />
        {NAV_OTHER.map(item => <NavButton key={item.id} item={item} onClose={onClose} />)}
      </nav>

      {/* Profile footer */}
      <ProfileFooter onClose={onClose} />
    </>
  );
}

// ── Desktop sidebar ──────────────────────────────────────────────────────────

export function Sidebar() {
  return (
    <aside
      className="flex-col flex-shrink-0 sticky top-0 h-screen overflow-hidden z-30 hidden md:flex animate-slide-left"
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--bg2)',
        borderRight: '1px solid var(--b)',
      }}
    >
      {/* Top gradient glow */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          height: 200,
          background: 'radial-gradient(ellipse 80% 120px at 50% -20px, rgba(63,255,33,.07) 0%, transparent 100%)',
        }}
      />
      <div className="relative flex flex-col h-full overflow-y-auto">
        <SidebarContent />
      </div>
    </aside>
  );
}

// ── Mobile drawer ─────────────────────────────────────────────────────────────

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 md:hidden"
        style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className="fixed left-0 top-0 h-full z-50 flex flex-col md:hidden animate-slide-left"
        style={{
          width: 'var(--sidebar-w)',
          background: 'var(--bg2)',
          borderRight: '1px solid var(--b)',
          boxShadow: '16px 0 48px rgba(0,0,0,.6)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none"
          style={{
            height: 200,
            background: 'radial-gradient(ellipse 80% 120px at 50% -20px, rgba(63,255,33,.08) 0%, transparent 100%)',
          }}
        />
        <div className="relative flex flex-col h-full overflow-y-auto">
          <SidebarContent onClose={onClose} />
        </div>
      </aside>
    </>
  );
}
