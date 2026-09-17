# Contributing to Atlas-Netic

## Setup

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Use Node 22.13+ and pnpm 11.25.0.

## Before a pull request

```sh
pnpm verify
```

A PR should keep provider secrets server-side, preserve timestamps/unknown values, add or update tests for parser/lifecycle behavior, and document a new external source in `DATA_SOURCES.md`.

## Adding a data layer

Prefer this structure:

```text
lib/<domain>/types.ts       normalized records
lib/<domain>/parsers.ts     provider validation/normalization
app/api/<domain>/...        server-side provider adapter
hooks/use-<domain>.ts        client refresh/retention
lib/<domain>/renderer.ts    Cesium ownership
```

Use `lib/layers/contracts.ts` as the lifecycle boundary. Do not put provider credentials or raw API parsing in the React shell or Cesium globe class.

## Data-quality rules

- Preserve source observation time.
- Validate latitude/longitude and reject malformed records.
- Keep `null`/unknown as unknown.
- Label derived coordinates as derived.
- Label fallback sources explicitly.
- Do not add simulated traffic to make a layer look populated.
- Explain coverage limitations in user-facing text.

## Rendering rules

- Stable object ID -> stable Cesium entity whenever possible.
- Remove entities only when a record expires or a layer is disabled.
- Prefer shared low-poly assets.
- Avoid per-object animation loops.
- Test coarse-pointer/mobile behavior.

## Pull-request description

Describe the provider/data change, failure behavior, cache/freshness policy, tests added, and any measured rendering or bundle impact.
