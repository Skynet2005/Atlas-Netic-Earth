import AtlasV2 from '@/components/atlas-v2';

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Atlas-Netic',
  url: 'https://atlas-netic-earth.vercel.app',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  isAccessibleForFree: true,
  description: 'Interactive 3D Earth intelligence platform combining terrain, satellite imagery, public aircraft and maritime traffic, orbital data, earthquakes, active fires, and weather alerts.',
  featureList: [
    'Interactive 3D Earth and measured terrain',
    'Public aircraft and maritime traffic',
    'Satellite positions propagated from orbital elements',
    'Earthquake, wildfire, and weather intelligence',
    'Desktop, tablet, and mobile interface',
  ],
};

export default function Home() {
  return <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
    />
    <AtlasV2 />
  </>;
}
