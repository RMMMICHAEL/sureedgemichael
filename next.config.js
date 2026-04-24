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
      // Next.js precisa de scripts inline e eval em dev; em prod apenas 'self' + CDNs usados
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Supabase (auth, storage), Google Sheets, TheSportsDB, Telegram
      "connect-src 'self' https://*.supabase.co https://docs.google.com https://www.thesportsdb.com https://t.me",
      // Imagens: self + Supabase storage + logos de times/ligas
      "img-src 'self' data: blob: https://*.supabase.co https://www.thesportsdb.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "frame-src 'none'",
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
