'use client';

import React from 'react';

interface State { hasError: boolean; message: string }

export class PageErrorBoundary extends React.Component<
  { children: React.ReactNode; fallbackLabel?: string },
  State
> {
  constructor(props: { children: React.ReactNode; fallbackLabel?: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 14, padding: '80px 24px', textAlign: 'center',
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: '#f87171',
          }}>
            {this.props.fallbackLabel ?? 'Esta página encontrou um erro'}
          </div>
          {this.state.message && (
            <div style={{ fontSize: 11, color: 'rgba(248,113,113,.6)', fontFamily: 'monospace', maxWidth: 480 }}>
              {this.state.message}
            </div>
          )}
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
              color: '#f87171', cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
