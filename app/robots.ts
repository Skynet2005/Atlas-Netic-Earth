import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: 'https://atlas-netic-earth.vercel.app/sitemap.xml',
    host: 'https://atlas-netic-earth.vercel.app',
  };
}
