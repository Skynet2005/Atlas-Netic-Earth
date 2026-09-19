import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const roots = ['app', 'components', 'hooks', 'lib'];
const sourceExtensions = new Set(['.ts', '.tsx', '.mjs', '.js']);
const files = [];

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (sourceExtensions.has(extname(entry.name))) files.push(path);
  }
}
roots.forEach(walk);

const packageName = specifier => {
  if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('node:')) return null;
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
};

const used = new Set();
const pattern = /(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(pattern)) {
    const name = packageName(match[1]);
    if (name) used.add(name);
  }
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const dependencies = Object.keys(pkg.dependencies || {});
const devDependencies = Object.keys(pkg.devDependencies || {});
const devDependencySet = new Set(devDependencies);
const frameworkRuntime = new Set(['next', 'react', 'react-dom']);
const unused = dependencies.filter(name => !used.has(name) && !frameworkRuntime.has(name));
const missing = [...used].filter(name => !dependencies.includes(name) && !devDependencySet.has(name));

const forbidden = [
  'components/earth-explorer.tsx',
  'components/ui',
  'vendor/shadcn-tailwind-4.13.0.css',
  'db',
  'drizzle.config.ts',
  '.openai',
  'vite.config.ts',
  'cloudflare-env.d.ts',
  'examples/d1',
  'build/sites-vite-plugin.ts',
  'app/chatgpt-auth.ts',
];

console.log('Atlas-Netic dependency audit');
console.log(`Source files scanned: ${files.length}`);
console.log(`Runtime dependencies: ${dependencies.join(', ')}`);
console.log(`External packages referenced: ${[...used].sort().join(', ')}`);

const expectedRuntime = ['cesium', 'lucide-react', 'next', 'react', 'react-dom'];
const expectedDev = ['@types/node', '@types/react', '@types/react-dom', 'eslint', 'eslint-config-next', 'typescript'];
const unexpectedRuntime = dependencies.filter(name => !expectedRuntime.includes(name));
const unexpectedDev = devDependencies.filter(name => !expectedDev.includes(name));
const missingRuntime = expectedRuntime.filter(name => !dependencies.includes(name));
const missingDev = expectedDev.filter(name => !devDependencies.includes(name));

let failed = false;
if (unexpectedRuntime.length || missingRuntime.length) {
  failed = true;
  console.error(`Unexpected/missing runtime dependency surface. unexpected=[${unexpectedRuntime.join(', ')}] missing=[${missingRuntime.join(', ')}]`);
}
if (unexpectedDev.length || missingDev.length) {
  failed = true;
  console.error(`Unexpected/missing development dependency surface. unexpected=[${unexpectedDev.join(', ')}] missing=[${missingDev.join(', ')}]`);
}
if (unused.length) {
  failed = true;
  console.error(`Unused direct runtime dependencies: ${unused.join(', ')}`);
}
if (missing.length) {
  failed = true;
  console.error(`Imported packages missing from package.json: ${missing.join(', ')}`);
}
for (const path of forbidden) {
  if (existsSync(path)) {
    failed = true;
    console.error(`Legacy/template path returned: ${path}`);
  }
}
if (failed) process.exit(1);
console.log('PASS  dependency surface and legacy scaffolding are clean');
