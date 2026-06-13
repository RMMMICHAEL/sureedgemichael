/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Impede que o site seja embutido em iframes de outros domínios (clickjacking)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Evita que browsers tentem "adivinhar" o Content-Type (MIME sniffing)
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Não envia o referrer para outros domínios
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Esconde que o site usa Next.js
  { key: 'X-Powered-By', value: '' },
  // Restringe acesso a câmera, microfone, geolocalização
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Força HTTPS por 1 ano (só ativo em produção com HTTPS)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // Content Security Policy — bloqueia scripts/iframes de domínios não autorizados
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js precisa de scripts inline; unsafe-eval removido (não necessário em produção)
      "script-src 'self' 'unsafe-inline' https://cdn.utmify.com.br https://connect.facebook.net",
      // Supabase, Google Sheets, TheSportsDB, Telegram, Utmify tracking, Meta Pixel
      "connect-src 'self' https://*.supabase.co https://docs.google.com https://www.thesportsdb.com https://t.me https://*.utmify.com.br https://www.facebook.com https://connect.facebook.net https://api.ipify.org https://api6.ipify.org",
      // Imagens: self + Supabase storage + logos de times/ligas + favicons dos bookmakers (Google) + Meta pixel noscript
      "img-src 'self' data: blob: https://*.supabase.co https://www.thesportsdb.com https://www.google.com https://*.gstatic.com https://www.facebook.com https://pps.whatsapp.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,

  // Remove o header X-Powered-By do Next.js
  poweredByHeader: false,

  // Desativa source maps em produção (dificulta engenharia reversa)
  productionBrowserSourceMaps: false,

  // undici é um módulo Node.js nativo — não deve ser bundlado pelo webpack (Next.js 14)
  experimental: {
    serverComponentsExternalPackages: ['undici'],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
