import type { MetadataRoute } from 'next';

const SITE_URL = 'https://sureedge.com.br';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url:             SITE_URL,
      lastModified:    new Date(),
      changeFrequency: 'weekly',
      priority:        1.0,
    },
    {
      url:             `${SITE_URL}/pricing`,
      lastModified:    new Date(),
      changeFrequency: 'monthly',
      priority:        0.9,
    },
    {
      url:             `${SITE_URL}/login`,
      lastModified:    new Date(),
      changeFrequency: 'yearly',
      priority:        0.4,
    },
  ];
}
