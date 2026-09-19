# Atlas-Netic architecture

## Goals

Atlas-Netic is designed as a persistent Earth-intelligence system rather than a collection of unrelated map toggles. The architecture separates provider behavior, normalized records, client state and Cesium rendering so a new source can fail without destabilizing unrelated layers.

## Runtime flow

```text
External provider
   ↓
Server route / adapter
   ↓
validation + normalization
   ↓
retry / Retry-After / single-flight / TTL cache / stale fallback
   ↓
normalized snapshot + source health
   ↓
client feed cache
   ↓
layer renderer
   ↓
Cesium data source / primitives
```

`lib/data/source-runtime.ts` owns provider retry, request coalescing and warm-instance stale caches. It deliberately does not pretend serverless instances share memory; provider caches reduce duplicate work inside a warm instance while CDN response caching reduces repeated public requests across clients.

## Boundaries

- `lib/globe.ts`: terrain, base imagery, camera, country borders/labels, existing transponder renderer and legacy workspace surface.
- `lib/layers/contracts.ts`: common lifecycle/data-source interfaces for future layer extraction.
- `lib/intelligence/*`: normalized Earth-intelligence records, parsing, SGP4 propagation, scene serialization and modular Cesium intelligence renderer.
- `hooks/use-intelligence.ts`: client polling, last-good retention and reprojection of orbital elements.
- `hooks/use-traffic.ts`: public transponder polling, regional merge, current freshness and rolling in-session observation history.
- `app/api/*`: server-side provider isolation. Secrets stay here.
- `components/atlas-v2.tsx`: orchestration only—view state, enabled layers, panel composition and scene sharing.

## Layer contract

`AtlasLayer<TRecord>` is the target contract for every independently owned layer. A layer attaches to a renderer context, owns enable/disable/update/select/destroy behavior and reports health. Provider access is represented separately by `AtlasDataSource<TRecord,TQuery>`.

The intelligence renderer already keeps earthquakes, fires, weather and satellites in independent Cesium `CustomDataSource` collections. Traffic remains compatible with the existing `Globe` renderer while the common contract provides the migration boundary for future traffic extraction.

## Failure model

Provider failure must degrade a layer, not the application. The supported source states are `loading`, `live`, `degraded`, `stale`, `fallback`, `rate_limited`, `unavailable` and `off`.

Rules:

1. Fresh cache wins.
2. Identical in-flight requests coalesce.
3. Retry transient failures with bounded exponential backoff and respect `Retry-After` when present.
4. If refresh fails and a still-acceptable server snapshot exists, return it explicitly as stale.
5. The client retains last-good records while retrying.
6. Unknown provider values remain unknown.
7. No feed may fabricate activity merely to avoid an empty map.

## Time model

Events retain provider observation/effective/expiration times. The replay slider filters event layers against a point in the past. Satellite state is recomputed at the requested replay time from CelesTrak orbital elements. Traffic replay uses observations collected during the active browser session; Atlas does not claim historical traffic it did not receive.

## Shareable state

Scene links serialize camera pose, imagery/terrain state, display toggles, traffic layers, intelligence layers, satellite catalog and replay offset. Workspace content such as user annotations remains local unless the user explicitly exports it.

## Rendering policy

Public traffic continues to use persistent 3D meshes; camera movement does not destroy and recreate models. Aircraft and vessels resolve to conservative shape families from reported type metadata, keep a minimum screen-space footprint, and use outlines for contrast against bright terrain.

Satellite contacts use generated low/detail 3D spacecraft families selected from catalog names/groups. These are category representations only: Atlas does not claim a source-reported spacecraft bus, scale, or attitude when the feed does not provide one. Ground intelligence is represented by semantic event glyphs (earthquake, fire, weather) rather than anonymous point markers. Selection rings are secondary emphasis and never replace the underlying contact representation.

Atlas uses semantic zoom rather than exposing progressively more raw markers. GLOBAL view replaces individual traffic and intelligence contacts with geographic density clusters/heat zones. REGIONAL view restores decluttered semantic contacts and low-detail 3D traffic. LOCAL view exposes the individual objects and detailed 3D models. The shared policy lives in `lib/semantic-zoom.ts` so traffic and intelligence transition at the same camera scales.

Intelligence layers use stable entity IDs so updates mutate existing entities. Satellite altitude is not vertically exaggerated. Ground events clamp to the surface. Selected orbital paths use propagated 3D positions rather than decorative arcs.

## Security boundary

Provider secrets are environment variables read only by server routes. The browser receives normalized records, provider/source metadata and public source links, never API keys.


## Front-end dependency policy

The active application intentionally avoids the old template UI bundle. Atlas keeps a small custom component surface and direct CSS modules/global styles. `scripts/dependency-audit.mjs` fails CI when unused direct runtime dependencies or removed legacy/template paths return.

## Browser regression policy

`tests/e2e` runs Atlas in Chromium at desktop, tablet, and iPhone-sized viewports. The suite captures screenshots, verifies the clean closed-menu startup state, checks overflow and basic interaction, and confirms canonical/social/structured SEO metadata. Browser artifacts are retained by the dedicated GitHub Actions workflow.
