/**
 * Rota temporária de diagnóstico — REMOVER após corrigir o auto-login
 * GET /api/supermonitor/debug-auth
 */
import { NextResponse } from 'next/server';

const BASE = 'https://painel.supermonitor.pro';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export async function GET() {
  const results: Record<string, unknown> = {};

  // Testa URLs de login comuns
  const candidates = ['/login', '/entrar', '/auth/login', '/api/login', '/index.php'];

  for (const path of candidates) {
    try {
      const r = await fetch(`${BASE}${path}`, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json,*/*' },
        redirect: 'follow',
      });
      const text = await r.text();
      const ct   = r.headers.get('content-type') ?? '';

      // Extrai apenas o que interessa (campos de form, action)
      const forms   = [...text.matchAll(/<form[^>]*>/gi)].map(m => m[0]);
      const inputs  = [...text.matchAll(/<input[^>]+>/gi)].map(m => m[0]);
      const setCook = r.headers.get('set-cookie');

      results[path] = {
        status:     r.status,
        finalUrl:   r.url,
        ct,
        setCookie:  setCook ? setCook.slice(0, 80) : null,
        forms:      forms.slice(0, 3),
        inputs:     inputs.filter(i => /type=.?(text|email|password|hidden)/i.test(i)).slice(0, 10),
        bodySnippet: text.slice(0, 500),
      };
    } catch (e) {
      results[path] = { error: String(e) };
    }
  }

  return NextResponse.json(results);
}
