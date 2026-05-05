import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow:     '/',
        disallow:  ['/dashboard', '/admin', '/api/'],
      },
    ],
    sitemap: 'https://sureedge.com.br/sitemap.xml',
    host:    'https://sureedge.com.br',
  };
}
