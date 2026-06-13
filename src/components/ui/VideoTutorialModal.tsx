'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, PlayCircle, ExternalLink } from 'lucide-react';

interface VideoTutorialModalProps {
  videoId:       string;
  title:         string;
  description?:  string;
  onClose:       () => void;
  /** Usar quando o vídeo tem restrição de idade — exibe card com link ao invés do iframe */
  restricted?:   boolean;
}

export function VideoTutorialModal({ videoId, title, description, onClose, restricted }: VideoTutorialModalProps) {
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
        {restricted ? (
          /* Card para vídeos com restrição de idade — não podem ser incorporados */
          <div style={{
            position: 'relative', paddingBottom: '56.25%',
            background: 'linear-gradient(135deg, #0a0f1a 0%, #0d1117 60%, #111827 100%)',
          }}>
            {/* Thumbnail com blur */}
            <img
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt=""
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', opacity: 0.18, filter: 'blur(2px)',
              }}
            />
            {/* Overlay content */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 20,
              padding: 32,
            }}>
              {/* Ícone de cadeado + yt */}
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div style={{ textAlign: 'center', maxWidth: 360 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#E2E8F0', margin: '0 0 8px' }}>
                  Vídeo com restrição de idade
                </p>
                <p style={{ fontSize: 12, color: '#4B5563', margin: 0, lineHeight: 1.6 }}>
                  O YouTube exige login para assistir este conteúdo.<br />
                  Abra diretamente no YouTube para assistir.
                </p>
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '11px 24px', borderRadius: 100,
                  background: 'linear-gradient(135deg, #3FFF21, #00BBFF)',
                  color: '#0D1117', fontWeight: 800, fontSize: 13,
                  textDecoration: 'none', cursor: 'pointer',
                  boxShadow: '0 0 24px rgba(63,255,33,.25)',
                  transition: 'opacity .15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              >
                <PlayCircle size={15} />
                Assistir no YouTube
              </a>
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000' }}>
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&color=white&iv_load_policy=3&playsinline=1`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )}

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
