# Performance and regression policy

Atlas-Netic is a GPU-heavy Cesium application, so performance is treated as a feature rather than an afterthought.

## Automated gate

`pnpm perf` enforces static size ceilings for critical orchestration, renderer and model files. It is intentionally dependency-free and runs in CI before the production build. A module that exceeds its budget should normally be split by responsibility rather than simply raising the ceiling.

`pnpm verify` runs:

1. ESLint
2. Node contract/unit tests
3. Static performance budgets
4. Next.js production build

## Runtime diagnostics

The Intelligence panel exposes a live render-FPS estimate, active intelligence-object count and JS heap usage where the browser exposes memory data. Heap reporting is unavailable in some browsers and must not be treated as zero.

## Manual acceptance scenarios

Before merging rendering-heavy changes, test at minimum:

- desktop globe startup from a cold cache;
- mobile/coarse-pointer startup using Eco quality;
- rapid pan across multiple traffic query regions;
- aircraft + maritime + earthquakes simultaneously;
- a satellite catalog enabled and an orbit selected;
- 3,000-object Starlink catalog where device capability permits;
- repeated layer on/off cycles without entity-count growth;
- WebGL/context recovery and camera restoration;
- provider failure while last-good data exists;
- 24-hour replay changes without page reload.

Record browser/device, first usable globe time, initial transfer, approximate FPS during motion, idle FPS, JS heap if available, and visible object count. Compare like-for-like devices; a single absolute FPS target is misleading across mobile and desktop GPUs.

## Design budgets

- Stable entity IDs: mutate rather than recreate on ordinary refresh.
- No animation loops for static traffic meshes.
- Keep low-poly shared traffic assets local.
- Server routes coalesce duplicate upstream requests inside warm instances.
- Client polling pauses while the document is hidden.
- Terrain/mobile quality remains independently degradable from live-data polling.
- Satellite orbital elements refresh slowly; only positions are re-propagated frequently.

## Regression rule

A change that materially improves fidelity may cost performance, but the cost must be measured and documented. Unexplained startup, memory or interaction regressions should block merge.
