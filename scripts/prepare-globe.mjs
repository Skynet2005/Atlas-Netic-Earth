import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cesiumRoot = dirname(require.resolve('cesium/package.json'));
const destination = resolve('public/cesium');
await mkdir(destination, { recursive: true });
await cp(resolve(cesiumRoot, 'Build/Cesium'), destination, { recursive: true });

for (const filename of ['LICENSE.md', 'ThirdParty.json', 'ThirdParty.extra.json']) {
  await cp(resolve(cesiumRoot, filename), resolve(destination, filename));
}
