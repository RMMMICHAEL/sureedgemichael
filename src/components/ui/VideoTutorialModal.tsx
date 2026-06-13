'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, PlayCircle, ExternalLink } from 'lucide-react';

interface VideoTutorialModalProps {
  videoId:      string;
  title:        string;
  description?: string;
  onClose:      () => void;
}

export function VideoTutorialModal({ videoId, title, description, onClose }: VideoTutorialModalProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const content = (
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
        background:     show ? 'rgba(0,0,0,.82)' : 'transparent',
        backdropFilter: show ? 'blur(10px)' : 'none',
        transition:     'background 0.28s ease, backdrop-filter 0.28s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:      '100%',
          maxWidth:   800,
          borderRadius: 22,
          overflow:   'hidden',
          background: '#0D1117',
          border:     '1px solid rgba(63,255,33,.22)',
          boxShadow:  '0 0 0 1px rgba(63,255,33,.06), 0 40px 100px rgba(0,0,0,.85), 0 0 80px rgba(63,255,33,.05)',
          opacity:    show ? 1 : 0,
          transform:  show ? 'translateY(0) scale(1)' : 'translateY(28px) scale(0.95)',
          transition: 'opacity 0.28s ease, transform 0.28s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          display:     'flex',
          alignItems:  'center',
          gap:         10,
          padding:     '13px 16px',
          background:  'rgba(63,255,33,.03)',
          borderBottom:'1px solid rgba(63,255,33,.1)',
        }}>
          {/* Indicador de status ao vivo */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#3FFF21',
              boxShadow: '0 0 6px #3FFF21',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
              color: '#3FFF21', textTransform: 'uppercase',
            }}>Tutorial</span>
          </span>

          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,.1)' }} />

          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#E2E8F0', letterSpacing: '-0.01em' }}>
            {title}
          </span>

          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir no YouTube"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 8,
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
              color: '#6B7280', cursor: 'pointer', textDecoration: 'none',
              transition: 'all .15s',
              marginRight: 4,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.09)';
              (e.currentTarget as HTMLElement).style.color = '#94A3B8';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.04)';
              (e.currentTarget as HTMLElement).style.color = '#6B7280';
            }}
          >
            <ExternalLink size={12} />
          </a>

          <button
            onClick={onClose}
            title="Fechar (Esc)"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 8,
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
              color: '#6B7280', cursor: 'pointer', transition: 'all .15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,69,69,.1)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,69,69,.2)';
              (e.currentTarget as HTMLElement).style.color = '#FF4545';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.04)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.07)';
              (e.currentTarget as HTMLElement).style.color = '#6B7280';
            }}
          >
            <X size={13} />
          </button>
        </div>

        {/* ── Player 16:9 ────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000' }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&color=white&iv_load_policy=3&playsinline=1`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* ── Rodapé ─────────────────────────────────────────────────────── */}
        <div style={{
          display:     'flex',
          alignItems:  'center',
          gap:         10,
          padding:     '11px 16px',
          borderTop:   '1px solid rgba(255,255,255,.05)',
          background:  'rgba(0,0,0,.2)',
        }}>
          <PlayCircle size={13} style={{ color: '#3FFF21', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#4B5563', fontWeight: 500 }}>
            {description ?? 'SureEdge · Tutorial oficial'}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: '#374151', fontWeight: 600, letterSpacing: '0.04em' }}>
            SureEdge
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
