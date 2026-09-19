import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Atlas-Netic — Earth Intelligence',
    short_name: 'Atlas-Netic',
    description: 'Live 3D Earth intelligence with terrain, public traffic, satellites, earthquakes, fires, and weather.',
    start_url: '/',
    display: 'standalone',
    background_color: '#02070c',
    theme_color: '#02070c',
    orientation: 'any',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
