# Atlas-Netic

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

## Transponder layers

- Air and publicly identified military aircraft: ADSB.lol open API (ODbL 1.0), within 250 nautical miles of the view center. Refreshed every 15 seconds; position reports expire at 90 seconds. Military classification is a provider flag, not a complete inventory.
- Maritime default: Fintraffic / Digitraffic AIS (CC BY 4.0), Finnish waters and nearby Baltic reception. Refreshed every 45 seconds; position reports expire at 15 minutes.
- Optional wider maritime coverage: add `AISSTREAM_API_KEY` as a secret Vercel environment variable and redeploy. The server collects a bounded, partial 4-second live sample near the view center. The browser never receives the key. No key is needed for the included regional feed.

AISStream allows only three subscribed connections per account. Requests are coalesced and cached within a function instance. For multi-user/high-volume global use, replace the short collector with a persistent shared AIS service; serverless instances cannot share the connection limit.

No simulated traffic is shown. Receivers and transponders have incomplete coverage; a zero count is not proof of empty airspace or sea. Geometric aircraft altitudes are preferred; barometric fallback is labeled. Missing altitude is shown on the surface and marked unknown.

Country names use fixed geodetic anchors, horizon/viewport culling, overlap suppression, and automatically hide for close terrain views (below 250 km on mobile, 180 km on desktop).

## Recovery and utility workspace

Camera location and orientation are saved during navigation and restored after recovery or reload. Phones default to reduced pixel and tile-memory budgets. Recovery uses Eco graphics. Touch picking uses a larger hit area; the searchable traffic roster offers another way to select reports. Open report details remain available if the report leaves the current feed.

Traffic polling starts independently of terrain initialization, uses 15-second aircraft and 45-second vessel refresh intervals, and does not abort on every camera movement. Fresh reports remain visible during temporary failures; expired reports are removed. Optional AISStream collection now waits up to 4 seconds for its first sample. Coverage and upstream availability still affect loading.

The lazy-loaded **Tools** workspace includes [100 additional tools](FEATURES.md): 40 map/traffic workflows and 60 calculators. No simulated traffic is displayed.
