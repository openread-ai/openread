import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/library/', '/reader/', '/settings/'],
      },
    ],
    sitemap: 'https://web.openread.com/sitemap.xml',
  };
}
