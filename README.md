# Atlas Netic Earth

Interactive 3D globe with Esri measured terrain, satellite imagery, country borders, and close terrain views.

## Development

Requires Node.js 22.13+ and pnpm 11.25.0.

```sh
pnpm install
pnpm dev
```

## Vercel

Import this repository into Vercel using the Next.js framework preset. No environment variables or API keys are required. The build copies Cesium assets to public/cesium before compiling Next.js.

```sh
pnpm build
pnpm test
```

Elevation uses Esri World Elevation Terrain 3D. Source resolution and accuracy vary by location. Height scale defaults to true scale (1×); optional exaggeration changes display only. Terrain 3D focuses near the measured ground to reveal real relief.

Satellite imagery and relief are provided by Esri; borders and labels are from Natural Earth. Required Cesium notices ship with the generated assets.
