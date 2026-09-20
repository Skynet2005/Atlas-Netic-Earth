import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const robots = readFileSync(new URL('../app/robots.ts', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../app/manifest.ts', import.meta.url), 'utf8');

test('SEO metadata defines a canonical production identity and social preview', () => {
  assert.match(layout, /metadataBase: new URL\(SITE_URL\)/);
  assert.match(layout, /alternates: \{ canonical: "\/" \}/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /twitter:/);
  assert.match(layout, /atlas-netic-social-preview-v2\.jpg/);
});

test('structured data describes Atlas as a software application without hidden keyword copy', () => {
  assert.match(page, /SoftwareApplication/);
  assert.match(page, /isAccessibleForFree: true/);
  assert.doesNotMatch(page, /display:\s*['"]none/);
});

test('robots sitemap and manifest expose the public app', () => {
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /atlas-netic-earth\.vercel\.app/);
  assert.match(manifest, /display: 'standalone'/);
  assert.match(manifest, /Atlas-Netic/);
});


test('social preview uses the canonical Atlas product image', () => {
  const image = new URL('../public/atlas-netic-social-preview-v2.jpg', import.meta.url);
  assert.equal(existsSync(image), true);
  assert.ok(statSync(image).size > 50_000);
  assert.match(layout, /url: "\/atlas-netic-social-preview-v2\.jpg"/);
  assert.match(layout, /images: \["\/atlas-netic-social-preview-v2\.jpg"\]/);
  assert.doesNotMatch(layout, /\/opengraph-image/);
});
