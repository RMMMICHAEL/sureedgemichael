/**
 * GET /api/supermonitor/sse-proxy
 *
 * Proxy SSE server-to-server para evitar bloqueio CORS/CSP no navegador.
 * O browser conecta neste endpoint (mesmo domínio, sem CORS).
 * O servidor busca o token no Supabase e abre a conexão com o SuperMonitor.
 *
 * Vantagens:
 *  - Sem CORS: conexão server → SuperMonitor não tem restrição de origem
 *  - Reconexão automática: EventSource do navegador reconecta → proxy pega token novo
 *  - Token transparente: frontend não precisa saber o sse_url nem o token
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET() {
  try {
    const sb = await getSupabaseAdmin();

    // Busca token e URL em paralelo
    const [tokenRow, urlRow] = await Promise.all([
      sb.from('app_config').select('value, updated_at').eq('key', 'sse_temp_token').single(),
      sb.from('app_config').select('value').eq('key', 'sse_url').single(),
    ]);

    // Sem token — retorna stream vazio com evento de status
    if (!tokenRow.data?.value) {
      const empty = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('data: {"type":"no_token"}\n\n'));
          ctrl.close();
        },
      });
      return new Response(empty, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Token expirado (> 15 min)
    const age = Date.now() - new Date(tokenRow.data.updated_at).getTime();
    if (age > 15 * 60 * 1000) {
      const expired = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('data: {"type":"token_expired"}\n\n'));
          ctrl.close();
        },
      });
      return new Response(expired, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const token   = tokenRow.data.value as string;
    const sseBase = ((urlRow.data?.value as string | null) ?? 'https://api5.nomacisoft.com').replace(/\/$/, '');
    const upstreamUrl = `${sseBase}/events?temp_token=${encodeURIComponent(token)}`;

    // Abre conexão com o SuperMonitor (server-to-server, sem CORS)
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!upstream.ok || !upstream.body) {
      const errStream = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode(`data: {"type":"upstream_error","status":${upstream.status}}\n\n`));
          ctrl.close();
        },
      });
      return new Response(errStream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    // Passa o stream do SuperMonitor diretamente para o navegador
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',   // desativa buffer no nginx/vercel
      },
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const errStream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(`data: {"type":"proxy_error","msg":${JSON.stringify(msg)}}\n\n`));
        ctrl.close();
      },
    });
    return new Response(errStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }
}
