'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
  size?:    'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  // Drive enter animation: false → hidden, true → visible
  const [show, setShow] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Single rAF to trigger CSS transition after mount
    rafRef.current = requestAnimationFrame(() => setShow(true));

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);

    // Prevent body scroll while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    /**
     * Two-layer overlay pattern for correct viewport centering:
     *
     * Layer 1 (backdrop): fixed inset-0 + overflow-y-auto
     *   Handles the semi-transparent backdrop and provides a scroll container
     *   for very tall modals (rare). MUST NOT have flex on it — adding flex+overflow
     *   together causes centering to be relative to the scroll content, not viewport.
     *
     * Layer 2 (flex wrapper): min-h-full flex items-center justify-center
     *   Fills the full viewport height (min-h-full relative to the fixed parent),
     *   then flex-centers the panel. On tall content, the wrapper grows with its
     *   child and the scroll in layer 1 takes over — modal stays centered.
     */
    <div
      className="fixed inset-0 z-[200] overflow-y-auto"
      style={{
        background: show ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
        transition: 'background 0.2s ease',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Flex centering wrapper — separate from the scroll container */}
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={e => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
      {/* Modal panel */}
      <div
        className={clsx('w-full flex flex-col rounded-2xl', SIZE_CLASSES[size])}
        style={{
          background: 'var(--bg3)',
          border:     '1px solid var(--b2)',
          boxShadow:  '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(63,255,33,0.04)',
          maxHeight:  'min(90dvh, 90vh)',
          opacity:    show ? 1 : 0,
          transform:  show ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
          transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.2,0.8,0.4,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--b)' }}
        >
          <h2 className="text-sm font-bold" style={{ color: 'var(--t)' }}>{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150"
            style={{ color: 'var(--t3)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--sur)';
              (e.currentTarget as HTMLElement).style.color      = 'var(--t2)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = '';
              (e.currentTarget as HTMLElement).style.color      = 'var(--t3)';
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 overscroll-contain">
          {children}
        </div>
      </div>
      </div>{/* end flex wrapper */}
    </div>
  );
}
