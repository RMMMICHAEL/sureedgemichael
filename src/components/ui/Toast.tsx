'use client';

import { useStore } from '@/store/useStore';
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

const ICONS = {
  ok:   <CheckCircle2  size={12} />,
  err:  <XCircle       size={12} />,
  wrn:  <AlertTriangle size={12} />,
  info: <Info          size={12} />,
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
    <div className="fixed bottom-5 right-5 flex flex-col gap-1.5 z-[200] pointer-events-none">
      {toasts.map(t => {
        const c = COLORS[t.type];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg animate-slide-up"
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.color,
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 16px rgba(0,0,0,.35)',
              maxWidth: 260,
            }}
          >
            {ICONS[t.type]}
            <span className="flex-1" style={{ fontSize: 11, color: 'var(--t)', fontWeight: 500 }}>{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              className="flex-shrink-0 transition-opacity hover:opacity-70"
              style={{ color: 'var(--t3)' }}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
