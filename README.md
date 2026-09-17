# Atlas-Netic

Atlas-Netic is a real-time 3D Earth intelligence workspace built with Next.js, TypeScript and Cesium. Its design rule is simple: visible information should preserve its source, timestamp and uncertainty instead of inventing missing state.

## What it does

- Real measured terrain and satellite/relief imagery with recoverable camera state.
- Persistent 3D public transponder traffic for aircraft and vessels.
- Public-provider military aircraft classification when the upstream feed marks it; it is not an inventory of military activity.
- USGS earthquake events.
- NASA wildfire intelligence: FIRMS VIIRS thermal detections when `FIRMS_MAP_KEY` is configured, otherwise NASA EONET wildfire-event fallback.
- NOAA/NWS active weather alerts for the map center.
- CelesTrak orbital elements propagated in-browser with SGP4/SDP4 for stations, GPS, weather, science, GEO and Starlink catalogs.
- Selected satellite orbit paths.
- Source-health states, stale-data preservation, request coalescing, retries and server-side stale caches.
- A 24-hour event/orbit replay control. Traffic history is retained from observations collected during the active browser session.
- Exact scene sharing: camera, map state, traffic layers, intelligence layers, catalog and replay position are encoded into a link.
- The existing 100-tool workspace remains available for routes, terrain profiles, traffic workflows and engineering/geospatial calculators.

## Data integrity principles

Atlas-Netic does not simulate missing traffic or silently convert unknown measurements into known values. Coverage gaps, stale data, fallbacks and derived positions are exposed in the UI. A zero count is not proof that an area is empty.

Satellite positions are derived from provider orbital elements. Fire, earthquake, weather, aircraft and vessel locations remain provider observations unless explicitly labelled otherwise.

## Development

Requires Node.js 22.13+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Full verification:

```sh
pnpm verify
```

That runs lint, unit/contract tests, static performance budgets and the production build.

## Optional environment variables

Copy `.env.example` to `.env.local` for local use. Never commit real keys.

```text
AISSTREAM_API_KEY=   # optional wider maritime reception
FIRMS_MAP_KEY=       # optional NASA FIRMS VIIRS thermal detections
```

Without either key the application still starts. Maritime uses the included Fintraffic/Digitraffic regional feed and fire intelligence falls back to NASA EONET.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md). Provider and licensing details are in [DATA_SOURCES.md](DATA_SOURCES.md). Performance expectations and measurement are in [PERFORMANCE.md](PERFORMANCE.md).

The intended layer boundary is:

```text
provider -> validate/normalize -> resilient server cache -> client feed -> layer renderer -> Cesium
```

New intelligence layers should own their provider adapter, normalized record contract, state/health and renderer instead of adding provider logic directly to the globe shell.

## Vercel

Use the Next.js framework preset. `scripts/prepare-globe.mjs` copies the required Cesium runtime assets before compilation. Add optional provider keys as encrypted environment variables on the server; they are never sent to the browser.

## Accuracy and coverage

Terrain source resolution and vertical accuracy vary by location. Public ADS-B, MLAT and AIS reception is incomplete. Military classification is upstream metadata, not comprehensive identification. NWS alert coverage is U.S.-focused. Satellite propagation accuracy depends on orbital-element age. EONET describes wildfire events rather than individual thermal pixels; FIRMS provides the thermal-detection layer when configured.

## Security and contributions

See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Atlas-Netic source code is MIT-licensed. Third-party datasets, APIs, imagery, terrain, notices and assets retain their own terms; see [DATA_SOURCES.md](DATA_SOURCES.md).
