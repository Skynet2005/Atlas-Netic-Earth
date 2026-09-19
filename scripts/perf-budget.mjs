import {statSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const budgets=[
 ['components/atlas-v2.tsx',42_000],
 ['components/atlas-v2.module.css',24_000],
 ['lib/intelligence/renderer.ts',22_000],
 ['lib/country-label-overlay.ts',12_000],
 ['hooks/use-intelligence.ts',18_000],
 ['hooks/use-traffic.ts',12_000],
 ['lib/globe.ts',48_000],
 ['public/models/aircraft.gltf',120_000],
 ['public/models/vessel.gltf',120_000],
];
let failed=false,total=0;
console.log('Atlas-Netic static performance budgets');
for(const [file,limit] of budgets){
 const path=resolve(file);
 if(!existsSync(path)){console.error(`MISSING  ${file}`);failed=true;continue;}
 const bytes=statSync(path).size;total+=bytes;
 const okay=bytes<=limit;
 console.log(`${okay?'PASS':'FAIL'}  ${file.padEnd(38)} ${(bytes/1024).toFixed(1)} KiB / ${(limit/1024).toFixed(1)} KiB`);
 if(!okay)failed=true;
}
console.log(`Critical source/assets checked: ${(total/1024).toFixed(1)} KiB`);
if(failed){console.error('Performance budget failed. Split oversized modules or optimize assets before merging.');process.exit(1);}
