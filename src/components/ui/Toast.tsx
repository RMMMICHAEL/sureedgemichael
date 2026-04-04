'use client';

import { useStore } from '@/store/useStore';
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

const ICONS = {
  ok:   <CheckCircle2  size={14} />,
  err:  <XCircle       size={14} />,
  wrn:  <AlertTriangle size={14} />,
  info: <Info          size={14} />,
};

const COLORS = {
  ok:   { bg: 'rgba(0,255,136,.08)',   border: 'rgba(0,255,136,.18)',  color: '#00FF88' },
  err:  { bg: 'rgba(255,77,77,.08)',   border: 'rgba(255,77,77,.18)',  color: '#FF4D4D' },
  wrn:  { bg: 'rgba(255,214,0,.08)',   border: 'rgba(255,214,0,.18)',  color: '#FFD600' },
  info: { bg: 'rgba(77,166,255,.08)',  border: 'rgba(77,166,255,.18)', color: '#4DA6FF' },
};

export function ToastStack() {
  const toasts      = useStore(s => s.toasts);
  const dismissToast = useStore(s => s.dismissToast);

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2.5 z-[200] pointer-events-none">
      {toasts.map(t => {
        const c = COLORS[t.type];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium animate-slide-up min-w-64 max-w-sm"
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.color,
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 32px rgba(0,0,0,.4)',
            }}
          >
            {ICONS[t.type]}
            <span className="flex-1 text-xs font-medium" style={{ color: 'var(--t)' }}>{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              className="flex-shrink-0 transition-opacity hover:opacity-70"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
