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
- Semantic zoom: global density clusters, regional intelligence, and local individual 3D contacts.
- Source-health states, stale-data preservation, request coalescing, retries and server-side stale caches.
- A 24-hour event/orbit replay control. Traffic history is retained from observations collected during the active browser session.
- Exact scene sharing: camera, map state, traffic layers, intelligence layers, catalog and replay position are encoded into a link.
- **Mobility Center:** place-to-place road directions with turn-by-turn maneuvers and toll/highway/ferry avoidance through HeiGIT openrouteservice; FAA NASR airway lookup rendered on the globe; gated FAA NMS NOTAM retrieval; and Amtrak GTFS train schedules with published route shapes.
- The existing 100-tool workspace remains available for manual routes, terrain profiles, traffic workflows and engineering/geospatial calculators.

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

That runs lint, unit/contract tests, the direct-dependency audit, static performance budgets and the production build.

Browser regression tests are maintained separately with Playwright at desktop, tablet, and iPhone viewports. CI installs the test runner ephemerally so it does not expand the production dependency graph.

```sh
pnpm e2e
```

## Optional environment variables

Copy `.env.example` to `.env.local` for local use. Never commit real keys.

```text
AISSTREAM_API_KEY=   # optional wider maritime reception
FIRMS_MAP_KEY=       # optional NASA FIRMS VIIRS thermal detections
OPENROUTESERVICE_API_KEY=  # required for Mobility Center road routing
FAA_NMS_API_URL=      # approved FAA NMS API URL template containing {location}
FAA_NMS_API_KEY=      # FAA-issued NMS distribution API credential
FAA_NMS_API_KEY_HEADER=X-API-Key
```

Atlas still starts without optional provider credentials. Maritime uses the included Fintraffic/Digitraffic regional feed and fire intelligence falls back to NASA EONET. Road routing stays visibly unavailable until a HeiGIT key is configured. FAA airway data and Amtrak schedules need no application key; live NOTAM retrieval stays disabled until authorized FAA NMS API access is configured.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md). Provider and licensing details are in [DATA_SOURCES.md](DATA_SOURCES.md). Performance expectations and measurement are in [PERFORMANCE.md](PERFORMANCE.md).

The intended layer boundary is:

```text
provider -> validate/normalize -> resilient server cache -> client feed -> layer renderer -> Cesium
```

New intelligence layers should own their provider adapter, normalized record contract, state/health and renderer instead of adding provider logic directly to the globe shell.

## Vercel

Use the Next.js framework preset. `scripts/prepare-globe.mjs` copies the required Cesium runtime assets before compilation. Add optional provider keys as encrypted environment variables on the server; they are never sent to the browser.

## Mobility data integrity

Ground routes are provider-computed from the routing graph available to HeiGIT/openrouteservice. Avoid-tolls/highways/ferries are routing preferences, not guarantees that every real-world restriction, closure or temporary condition is represented.

FAA airway geometry is reconstructed from the effective 28-day NASR airway, fix and navaid subscriber files. Atlas draws that published network on the globe for situational understanding; it does not assign a flight altitude to the visual line. FAA NMS NOTAM data is treated as operationally sensitive information: Atlas only uses the authorized API adapter and never substitutes scraped website results.

Amtrak rail lookup uses the official static GTFS schedule and shape feed. It is labelled **scheduled**, not live. A future agency GTFS-Realtime feed can plug into the mobility provider boundary without changing the rail UI.

## Accuracy and coverage

Terrain source resolution and vertical accuracy vary by location. Public ADS-B, MLAT and AIS reception is incomplete. Military classification is upstream metadata, not comprehensive identification. NWS alert coverage is U.S.-focused. Satellite propagation accuracy depends on orbital-element age. EONET describes wildfire events rather than individual thermal pixels; FIRMS provides the thermal-detection layer when configured.

## Security and contributions

See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Atlas-Netic source code is MIT-licensed. Third-party datasets, APIs, imagery, terrain, notices and assets retain their own terms; see [DATA_SOURCES.md](DATA_SOURCES.md).
