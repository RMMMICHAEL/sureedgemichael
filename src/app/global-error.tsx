'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#080D18' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 32, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>
            Ocorreu um erro inesperado na aplicação
          </div>
          <div style={{
            fontSize: 11.5, color: 'rgba(248,113,113,.55)',
            fontFamily: 'monospace', maxWidth: 520,
            background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.18)',
            borderRadius: 8, padding: '10px 14px', wordBreak: 'break-all',
          }}>
            {error.message || error.digest || 'Erro desconhecido — veja o console do browser'}
          </div>
          <button
            onClick={reset}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.28)',
              color: '#f87171', cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
