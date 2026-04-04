'use client';

import { useStore } from '@/store/useStore';
import type { ViewId } from '@/types';
import {
  LayoutDashboard, Activity, Building2, Wallet,
  BarChart3, ShieldCheck, Receipt, Users, X,
  ChevronRight,
} from 'lucide-react';

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
}

const NAV_MAIN: NavItem[] = [
  { id: 'dash', label: 'Dashboard',      icon: <LayoutDashboard size={17} strokeWidth={1.8} /> },
  { id: 'ops',  label: 'Operações',      icon: <Activity size={17} strokeWidth={1.8} /> },
];

const NAV_FINANCE: NavItem[] = [
  { id: 'bm',     label: 'Casas de Aposta', icon: <Building2 size={17} strokeWidth={1.8} /> },
  { id: 'caixa',  label: 'Caixa',           icon: <Wallet size={17} strokeWidth={1.8} /> },
  { id: 'gastos', label: 'Gastos',          icon: <Receipt size={17} strokeWidth={1.8} /> },
  { id: 'contas', label: 'Contas',          icon: <Users size={17} strokeWidth={1.8} /> },
];

const NAV_OTHER: NavItem[] = [
  { id: 'analise', label: 'Análise', icon: <BarChart3 size={17} strokeWidth={1.8} /> },
  { id: 'admin',   label: 'Admin',   icon: <ShieldCheck size={17} strokeWidth={1.8} /> },
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

  const isOn = view === item.id;
  const badge =
    item.id === 'ops' && pending > 0 ? pending :
    item.id === 'ops' && flagged > 0 ? flagged : null;

  return (
    <button
      onClick={() => { setView(item.id); onClose?.(); }}
      className="group flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13px] font-semibold text-left transition-all duration-200 relative"
      style={
        isOn
          ? {
              background: 'rgba(0,255,136,.10)',
              color: 'var(--g)',
            }
          : { color: 'var(--t3)' }
      }
      onMouseEnter={e => {
        if (!isOn) {
          (e.currentTarget as HTMLElement).style.background = 'rgba(0,255,136,.04)';
          (e.currentTarget as HTMLElement).style.color = 'var(--t2)';
        }
      }}
      onMouseLeave={e => {
        if (!isOn) {
          (e.currentTarget as HTMLElement).style.background = '';
          (e.currentTarget as HTMLElement).style.color = 'var(--t3)';
        }
      }}
    >
      {/* Active indicator bar */}
      {isOn && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
          style={{ background: 'var(--g)', boxShadow: '0 0 8px rgba(0,255,136,.5)' }}
        />
      )}

      <span style={{ opacity: isOn ? 1 : 0.6 }} className="transition-opacity duration-200 flex-shrink-0">
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>

      {badge != null && (
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
          style={
            isOn
              ? { background: 'rgba(0,255,136,.15)', color: 'var(--g)' }
              : {
                  background: item.id === 'ops' && flagged > 0 ? 'var(--rd)' : 'var(--yd)',
                  color:      item.id === 'ops' && flagged > 0 ? 'var(--r)'  : 'var(--y)',
                }
          }
        >
          {badge}
        </span>
      )}

      {isOn && (
        <ChevronRight size={13} style={{ color: 'var(--g)', opacity: 0.5 }} className="flex-shrink-0" />
      )}
    </button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="text-[10px] font-bold tracking-[.12em] px-3 pt-5 pb-1.5 uppercase"
      style={{ color: 'var(--t3)', opacity: 0.7 }}
    >
      {label}
    </div>
  );
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  return (
    <>
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 h-16 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--b)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--g), #00CC6E)',
            boxShadow: '0 0 16px rgba(0,255,136,.35)',
          }}
        >
          <span className="w-2.5 h-2.5 rounded-full block" style={{ background: '#060A07', opacity: 0.9 }} />
        </div>
        <span className="text-base font-black tracking-tight leading-none">
          <span style={{ color: 'var(--g)', textShadow: '0 0 20px rgba(0,255,136,.35)' }}>Sure</span>
          <span style={{ color: 'var(--t)' }}>Edge</span>
        </span>

        {/* Close button — only in mobile drawer */}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--t3)' }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 flex flex-col gap-0.5 overflow-y-auto">
        <SectionLabel label="MENU" />
        {NAV_MAIN.map(item => <NavButton key={item.id} item={item} onClose={onClose} />)}

        <SectionLabel label="FINANÇAS" />
        {NAV_FINANCE.map(item => <NavButton key={item.id} item={item} onClose={onClose} />)}

        <SectionLabel label="OUTROS" />
        {NAV_OTHER.map(item => <NavButton key={item.id} item={item} onClose={onClose} />)}
      </nav>

      {/* Footer */}
      <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--b)' }}>
        <div
          className="flex items-center gap-3 p-2.5 rounded-xl transition-colors"
          style={{ background: 'var(--sur)', border: '1px solid var(--b)' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(0,255,136,.15), rgba(0,255,136,.05))',
              color: 'var(--g)',
              border: '1px solid var(--gb)',
            }}
          >
            U
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold truncate" style={{ color: 'var(--t)' }}>Usuário</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: 'var(--g)', animation: 'pulse-dot 2s infinite' }}
              />
              <span className="text-[10px]" style={{ color: 'var(--t3)' }}>Online</span>
            </div>
          </div>
          <span
            className="text-[10px] px-2 py-0.5 rounded-md font-bold"
            style={{
              background: 'var(--gd)',
              color: 'var(--g)',
              border: '1px solid var(--gb)',
            }}
          >
            Trial
          </span>
        </div>
      </div>
    </>
  );
}

// ── Desktop sidebar ─────────────────────────────────────────────────────────

export function Sidebar() {
  return (
    <aside
      className="w-56 min-h-screen flex-col flex-shrink-0 sticky top-0 h-screen overflow-y-auto z-30 hidden md:flex"
      style={{
        background: 'var(--bg2)',
        borderRight: '1px solid var(--b)',
      }}
    >
      <SidebarContent />
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
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className="fixed left-0 top-0 h-full z-50 w-64 flex flex-col md:hidden animate-slide-up"
        style={{ background: 'var(--bg2)', borderRight: '1px solid var(--b2)' }}
      >
        <SidebarContent onClose={onClose} />
      </aside>
    </>
  );
}
