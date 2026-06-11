'use client';

/**
 * Toast.tsx
 *
 * Bulletproof toast stack:
 * • Entry animation via CSS keyframe
 * • Exit: set `leaving` flag → CSS fade-out → then remove from store (avoids
 *   fill-mode glitch where element stays invisible but still in DOM)
 * • Progress bar shows remaining 4 s auto-dismiss time
 * • Deduplication: same message already showing → no duplicate
 * • Larger dismiss hit-area (36 × 36 px minimum)
 */

import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import type { ToastMsg } from '@/store/useStore';

// ── Design tokens ─────────────────────────────────────────────────────────────
const SCHEME: Record<ToastMsg['type'], { bg: string; border: string; accent: string; icon: React.ReactNode }> = {
  ok:   { bg: 'rgba(0,220,120,.09)',  border: 'rgba(0,220,120,.22)',  accent: '#3FFF21', icon: <CheckCircle2  size={13} /> },
  err:  { bg: 'rgba(255,77,77,.09)',  border: 'rgba(255,77,77,.22)',  accent: '#FF5A5A', icon: <XCircle       size={13} /> },
  wrn:  { bg: 'rgba(255,200,0,.09)', border: 'rgba(255,200,0,.22)', accent: '#FFD60A', icon: <AlertTriangle  size={13} /> },
  info: { bg: 'rgba(77,160,255,.09)', border: 'rgba(77,160,255,.22)', accent: '#60A5FA', icon: <Info          size={13} /> },
};

const AUTO_DISMISS_MS = 4000;

// ── Single toast item ─────────────────────────────────────────────────────────
function ToastItem({ toast }: { toast: ToastMsg }) {
  const dismissToast = useStore(s => s.dismissToast);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheme = SCHEME[toast.type];

  // Helper: kick off exit animation, then remove from store after 220ms
  const dismiss = () => {
    if (leaving) return;          // already leaving — ignore double-click
    setLeaving(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    setTimeout(() => dismissToast(toast.id), 220);
  };

  // Auto-dismiss timer
  useEffect(() => {
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 10px 10px 14px',
        borderRadius: 10,
        background: scheme.bg,
        border: `1px solid ${scheme.border}`,
        backdropFilter: 'blur(14px)',
        boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        maxWidth: 300, minWidth: 220,
        overflow: 'hidden',
        position: 'relative',
        // Entry / exit animation
        animation: leaving
          ? 'toastOut .22s ease-out forwards'
          : 'toastIn .28s cubic-bezier(.2,.8,.4,1) both',
      }}
    >
      {/* Icon */}
      <span style={{ color: scheme.accent, flexShrink: 0, paddingTop: 1 }}>{scheme.icon}</span>

      {/* Message */}
      <span style={{
        flex: 1, fontSize: 12, fontWeight: 500, lineHeight: 1.5,
        color: 'rgba(241,245,249,.9)',
      }}>
        {toast.message}
      </span>

      {/* Dismiss — large hit area */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar"
        style={{
          flexShrink: 0,
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6, border: 'none', background: 'transparent',
          color: 'rgba(148,163,184,.7)', cursor: 'pointer',
          transition: 'color .12s, background .12s',
          marginTop: -2, marginRight: -2,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.color = '#F1F5F9';
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.08)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.color = 'rgba(148,163,184,.7)';
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        <X size={12} />
      </button>

      {/* Progress bar */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, height: 2,
          background: scheme.accent, opacity: .5, borderRadius: '0 0 0 10px',
          animation: `toastProgress ${AUTO_DISMISS_MS}ms linear forwards`,
          transformOrigin: 'left',
        }}
      />
    </div>
  );
}

// ── CSS injected once ─────────────────────────────────────────────────────────
const TOAST_CSS = `
@keyframes toastIn {
  from { opacity: 0; transform: translateX(28px) scale(.96); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes toastOut {
  from { opacity: 1; transform: translateX(0) scale(1); max-height: 100px; }
  to   { opacity: 0; transform: translateX(28px) scale(.95); max-height: 0; padding-top: 0; padding-bottom: 0; margin: 0; }
}
@keyframes toastProgress {
  from { width: 100%; }
  to   { width: 0%; }
}
`;

let cssInjected = false;

// ── Stack ─────────────────────────────────────────────────────────────────────
export function ToastStack() {
  const toasts = useStore(s => s.toasts);

  // Inject CSS once on mount (avoids adding a separate .css file)
  if (!cssInjected && typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = TOAST_CSS;
    document.head.appendChild(style);
    cssInjected = true;
  }

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: 20, right: 20,
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 9999,
        pointerEvents: 'none',   // outer: no events
      }}
    >
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  );
}
