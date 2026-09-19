import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{
    url: 'https://atlas-netic-earth.vercel.app/',
    changeFrequency: 'daily',
    priority: 1,
  }];
}
