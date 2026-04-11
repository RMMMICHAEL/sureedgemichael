'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
  size?:    'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_MAP = {
  sm:  480,
  md:  560,
  lg:  680,
  xl:  900,
};

export function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  const [show, setShow] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(() => setShow(true));

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const content = (
    /* Backdrop — fixed, fills viewport, centres the panel */
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         500,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '16px',
        overflowY:      'auto',
        background:     show ? 'rgba(0,0,0,0.6)' : 'transparent',
        transition:     'background 0.2s ease',
      }}
    >
      {/* Panel */}
      <div
        className={clsx('w-full flex flex-col rounded-2xl')}
        style={{
          maxWidth:   SIZE_MAP[size],
          maxHeight:  'min(90dvh, 90vh)',
          background: 'var(--bg3)',
          border:     '1px solid var(--b2)',
          boxShadow:  '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(63,255,33,0.05)',
          opacity:    show ? 1 : 0,
          transform:  show ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.96)',
          transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.2,0.8,0.4,1)',
          /* Keep panel out of click-through zone */
          flexShrink: 0,
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
    </div>
  );

  return createPortal(content, document.body);
}
