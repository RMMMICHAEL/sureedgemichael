import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = 'https://sureedge.com.br';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: 'SureEdge — Dashboard Profissional de Surebet',
    template: '%s | SureEdge',
  },
  description:
    'Plataforma profissional de gestão de surebets para traders brasileiros. Registre operações, calcule stakes com precisão matemática, monitore ROI por casa de aposta e importe da Green Surebet automaticamente.',
  keywords: [
    'surebet',
    'surebetting',
    'dashboard surebet',
    'gestão de surebets',
    'calculadora surebet',
    'ROI apostas esportivas',
    'controle de surebets',
    'plataforma surebet brasil',
    'Green Surebet dashboard',
    'apostas esportivas profissional',
    'surebetting profissional',
    'registro de surebets',
  ],
  authors:   [{ name: 'SureEdge', url: SITE_URL }],
  creator:   'SureEdge',
  publisher: 'SureEdge',

  robots: {
    index:  true,
    follow: true,
    googleBot: {
      index:  true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet':       -1,
    },
  },

  openGraph: {
    type:     'website',
    locale:   'pt_BR',
    url:      SITE_URL,
    siteName: 'SureEdge',
    title:       'SureEdge — Dashboard Profissional de Surebet',
    description: 'Registre surebets, calcule stakes e monitore ROI por casa de aposta em tempo real. A plataforma que traders sérios usam para operar com precisão.',
    images: [
      {
        url:    '/dashboard-preview.png',
        width:  1300,
        height: 870,
        alt:    'SureEdge — Dashboard de gestão de surebets',
      },
    ],
  },

  twitter: {
    card:        'summary_large_image',
    title:       'SureEdge — Dashboard Profissional de Surebet',
    description: 'Registre surebets, calcule stakes e monitore ROI por casa de aposta em tempo real.',
    images:      ['/dashboard-preview.png'],
  },

  alternates: {
    canonical: SITE_URL,
  },

  icons: {
    icon:     '/icon',
    shortcut: '/icon',
    apple:    '/icon',
  },

  category: 'finance',
};

// ── JSON-LD Schemas ───────────────────────────────────────────────────────────

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id':   `${SITE_URL}/#website`,
      url:     SITE_URL,
      name:    'SureEdge',
      description: 'Plataforma profissional de gestão de surebets para traders brasileiros.',
      inLanguage:  'pt-BR',
      potentialAction: {
        '@type':       'SearchAction',
        target:        `${SITE_URL}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type':       'SoftwareApplication',
      '@id':         `${SITE_URL}/#app`,
      name:          'SureEdge',
      url:           SITE_URL,
      applicationCategory: 'FinanceApplication',
      operatingSystem:     'Web',
      inLanguage:          'pt-BR',
      description: 'Dashboard profissional para gestão e análise de surebets. Registre operações, calcule stakes, monitore ROI e importe da Green Surebet automaticamente.',
      offers: {
        '@type':    'AggregateOffer',
        priceCurrency: 'BRL',
        lowPrice:      '97',
        highPrice:     '397',
        offerCount:    '3',
      },
      aggregateRating: {
        '@type':       'AggregateRating',
        ratingValue:   '4.9',
        reviewCount:   '127',
        bestRating:    '5',
        worstRating:   '1',
      },
    },
    {
      '@type': 'Organization',
      '@id':   `${SITE_URL}/#organization`,
      name:    'SureEdge',
      url:     SITE_URL,
      logo: {
        '@type':          'ImageObject',
        url:              `${SITE_URL}/icon`,
        contentUrl:       `${SITE_URL}/icon`,
        width:            '32',
        height:           '32',
      },
      sameAs: [],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Utmify — UTM lead ID enrichment (FB + Google) */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){const POLL_MS=500;function getStorageKey(){const url=new URL(window.location.href);const current=url.searchParams.get("utm_source");if(current==="FB")return"lead";if(current==="google")return"lead-google";return null;}function getLeadId(storageKey){if(!storageKey)return null;const raw=localStorage.getItem(storageKey);if(!raw)return null;try{const obj=JSON.parse(raw);return obj&&obj._id?String(obj._id):null;}catch{return null;}}function applyUtmIfNeeded(){const url=new URL(window.location.href);const current=url.searchParams.get("utm_source");const storageKey=getStorageKey();const id=getLeadId(storageKey);if(!id)return false;let desired=null;if(current==="FB"){desired="FBjLj"+id;}else if(current==="google"){desired="googlejLj"+id;}if(!desired)return false;url.searchParams.set("utm_source",desired);window.location.replace(url.toString());return true;}if(applyUtmIfNeeded())return;const interval=setInterval(()=>{if(applyUtmIfNeeded())clearInterval(interval);},POLL_MS);})();` }} />
        {/* Utmify — persiste UTMs entre páginas */}
        <script
          src="https://cdn.utmify.com.br/scripts/utms/latest.js"
          data-utmify-prevent-xcod-sck=""
          data-utmify-prevent-subids=""
          async
          defer
        />
        {/* Utmify Pixel — substitui pixel direto do Meta */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.pixelId="6a1a3c0e7518526a9771a57e";var a=document.createElement("script");a.setAttribute("async","");a.setAttribute("defer","");a.setAttribute("src","https://cdn.utmify.com.br/scripts/pixel/pixel.js");document.head.appendChild(a);`,
          }}
        />
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img height="1" width="1" style={{ display: 'none' }} src="https://www.facebook.com/tr?id=2328015311363509&ev=PageView&noscript=1" alt="" />
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
