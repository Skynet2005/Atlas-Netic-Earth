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

Public traffic continues to use persistent 3D meshes; camera movement does not destroy and recreate models. Intelligence layers use stable entity IDs so updates mutate existing entities. Satellite altitude is not vertically exaggerated. Ground events clamp to the surface. Selected orbital paths use propagated 3D positions rather than decorative arcs.

## Security boundary

Provider secrets are environment variables read only by server routes. The browser receives normalized records, provider/source metadata and public source links, never API keys.
