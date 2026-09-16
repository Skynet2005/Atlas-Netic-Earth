import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {CALCULATORS,calculate}=await import('../lib/calculators.ts');
const {FEATURES}=await import('../lib/features.ts');
const {distanceKm,parseCoordinates,polygonArea}=await import('../lib/geo.ts');
const {parseWorkspace,importGeoJSON,csv,gpx,EMPTY_WORKSPACE}=await import('../lib/workspace.ts');
const {readCamera,writeCamera,validCamera}=await import('../lib/session.ts');
test('100 distinct tools with 60 working default calculations',()=>{
 assert.equal(FEATURES.length,100);assert.equal(new Set(FEATURES.map(f=>f.name)).size,100);assert.equal(new Set(FEATURES.map(f=>f.id)).size,100);assert.equal(CALCULATORS.length,60);
 for(const tool of CALCULATORS){const values=Object.fromEntries(tool.fields.map(f=>[f.key,f.value]));const result=calculate(tool,values);assert.ok(Object.keys(result).length,tool.name);for(const value of Object.values(result))if(typeof value==='number')assert.ok(Number.isFinite(value),tool.name);assert.throws(()=>calculate(tool,{...values,[tool.fields[0].key]:NaN}),tool.name);}
});
test('geography handles the date line and DMS hemispheres',()=>{
 assert.ok(Math.abs(distanceKm(0,179,0,-179)-222.39)<.01);
 assert.deepEqual(parseCoordinates('40° 30′ 0″ N, 74° 0′ 0″ W'),{latitude:40.5,longitude:-74});
 assert.throws(()=>parseCoordinates('91, 0'));assert.throws(()=>parseCoordinates('40° 80′ N, 74° W'));
 const area=polygonArea([{latitude:0,longitude:0},{latitude:0,longitude:1},{latitude:1,longitude:1},{latitude:1,longitude:0}]);assert.ok(area>12300&&area<12400);
});
test('backup and geographic imports validate untrusted files',()=>{
 assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify(EMPTY_WORKSPACE))),EMPTY_WORKSPACE);
 assert.throws(()=>importGeoJSON({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[0,100]}}]}));
 assert.equal(importGeoJSON({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'A'},geometry:{type:'Point',coordinates:[-74,40]}}]}).length,1);
 assert.match(csv([['=SUM(A1:A2)','a"b']]),/'=SUM/);assert.match(csv([['a"b']]),/a""b/);
 assert.match(gpx([{latitude:40,longitude:-74,name:'A & <B>'}]),/A &amp; &lt;B&gt;/);
});
test('shared camera is consumed once so crash recovery keeps the latest position',()=>{
 const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
 globalThis.localStorage=storage();globalThis.sessionStorage=storage();
 const initial={latitude:40,longitude:-74,height:10000,heading:0,pitch:-1,roll:0};
 globalThis.window={location:{hash:'#view='+encodeURIComponent(JSON.stringify(initial))}};
 assert.deepEqual(readCamera(),initial);
 const moved={...initial,latitude:45,height:2000};writeCamera(moved);assert.deepEqual(readCamera(),moved);
 assert.equal(validCamera({...moved,height:Infinity}),false);
 window.location.hash='#view=bad-json';assert.deepEqual(readCamera(),moved);
});
