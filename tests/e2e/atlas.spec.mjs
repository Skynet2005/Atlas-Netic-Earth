import { test, expect } from '@playwright/test';

test('Atlas shell is responsive and starts uncluttered', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/?__atlas_e2e=1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Atlas-Netic' })).toBeVisible();
  await expect(page.getByLabel('Interactive Atlas-Netic 3D Earth')).toBeVisible();
  await expect(page.getByLabel('Atlas controls')).toHaveCount(0);

  await page.waitForTimeout(100);
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 2);
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 2);

  // Chromium + SwiftShader can spend tens of seconds reading back a live WebGL
  // canvas. The responsive screenshot gate is for Atlas UI/layout; hide only the
  // WebGL canvas during capture so screenshots stay deterministic and fast.
  await page.locator('canvas').evaluateAll(nodes => nodes.forEach(node => { node.dataset.e2eVisibility = node.style.visibility; node.style.visibility = 'hidden'; }));
  const homePath = testInfo.outputPath('atlas-home.png');
  await page.screenshot({ path: homePath, animations: 'disabled' });
  await testInfo.attach('Atlas home', { path: homePath, contentType: 'image/png' });
  await page.locator('canvas').evaluateAll(nodes => nodes.forEach(node => { node.style.visibility = node.dataset.e2eVisibility || ''; delete node.dataset.e2eVisibility; }));

  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.getByLabel('Atlas controls')).toBeVisible();
  await page.locator('canvas').evaluateAll(nodes => nodes.forEach(node => { node.style.visibility = 'hidden'; }));
  const controlsPath = testInfo.outputPath('atlas-controls.png');
  await page.screenshot({ path: controlsPath, animations: 'disabled' });
  await testInfo.attach('Atlas controls', { path: controlsPath, contentType: 'image/png' });
  await page.locator('canvas').evaluateAll(nodes => nodes.forEach(node => { node.style.visibility = ''; }));

  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Atlas controls')).toHaveCount(0);

  await page.getByRole('button', { name: 'Mobility' }).click();
  await expect(page.getByLabel('Atlas Mobility Center')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mobility Center' })).toBeVisible();
  await expect(page.getByText('Turn-by-turn directions')).toBeVisible();
  const mobilityOverflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(mobilityOverflow.document).toBeLessThanOrEqual(mobilityOverflow.viewport + 2);
  expect(mobilityOverflow.body).toBeLessThanOrEqual(mobilityOverflow.viewport + 2);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Atlas Mobility Center')).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test('SEO metadata is present in the rendered document', async ({ page }) => {
  await page.goto('/?__atlas_e2e=1', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Atlas-Netic.*Earth Intelligence/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://atlas-netic-earth.vercel.app');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /3D Earth intelligence/i);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Atlas-Netic/i);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const structured = await page.locator('script[type="application/ld+json"]').evaluate(node => JSON.parse(node.textContent || '{}'));
  expect(structured['@type']).toBe('SoftwareApplication');
  expect(structured.name).toBe('Atlas-Netic');
});
