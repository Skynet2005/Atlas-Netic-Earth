# Security policy

## Reporting a vulnerability

Please use GitHub's private security-advisory workflow for vulnerabilities that could expose credentials, permit code execution, bypass intended authorization, poison provider data, or otherwise create user risk. Do not include live secrets in a public issue.

## Secrets

`AISSTREAM_API_KEY` and `FIRMS_MAP_KEY` are server-only environment variables. Never expose them through `NEXT_PUBLIC_*`, browser bundles, logs, screenshots, example files or client-side fetch parameters.

## External data

All provider responses are untrusted input. New provider integrations should validate coordinate bounds, timestamps, expected collection shapes and numeric fields before rendering. URLs displayed from provider records should remain normal links opened with `rel="noreferrer"`.

## Dependency policy

The core application dependencies are lockfile-pinned. The satellite propagator is currently browser-loaded from a pinned satellite.js version rather than `latest`; changing that version should be reviewed and tested like a dependency update.

## Scope

Atlas-Netic visualizes public/open data. It must not imply that absence of a public transponder report proves absence of an aircraft or vessel, and it must not transform uncertain provider classifications into stronger claims.
