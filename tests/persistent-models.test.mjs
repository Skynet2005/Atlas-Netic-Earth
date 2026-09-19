import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as C from 'cesium';
import {mergeTrafficReports} from '../lib/traffic.ts';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('.')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e}}});
const {Globe}=await import('../lib/globe.ts');
const now=Date.now();
const report=(id,extra={})=>({id,kind:'air',name:id,latitude:40,longitude:-74,altitude:10000,altitudeReference:'geometric',heading:90,speed:400,observedAt:now,source:'test',...extra});
test('regional snapshots retain fresh traffic and reject older updates',()=>{
 const a=report('a'),b=report('b',{longitude:130});
 assert.deepEqual(mergeTrafficReports([a],[b],now),[a,b]);
 assert.equal(mergeTrafficReports([a],[report('a',{observedAt:now-1000})],now)[0],a);
 assert.equal(mergeTrafficReports([a],[],now+91000).length,0);
});
test('all traffic gets models beyond old distance and count limits; updates preserve model identity',()=>{
 const globe=Object.create(Globe.prototype);Object.assign(globe,{C,disposed:false,traffic:new C.CustomDataSource('test'),trafficTargets:new Map(),callbacks:{onTraffic(){}},render(){}});
 const targets=Array.from({length:120},(_,i)=>report(String(i),{longitude:i-60,...(i===0?{altitude:null,heading:null}:{}),...(i===1?{kind:'maritime',altitude:0,altitudeReference:'surface'}:{})}));
 globe.setTraffic(targets);assert.equal(globe.traffic.entities.values.length,120);
 const before=globe.traffic.entities.values.map(e=>e.model);
 for(const e of globe.traffic.entities.values){assert.ok(e.model);assert.equal(e.billboard,undefined);const minimum=e.model.minimumPixelSize.getValue();assert.ok(minimum>=28);assert.equal(e.model.maximumScale.getValue(),4800);assert.ok(e.model.silhouetteSize.getValue()>=1.55);}
 globe.setTraffic(targets.map(t=>({...t,longitude:t.longitude+1,observedAt:now+1000})));
 globe.traffic.entities.values.forEach((e,i)=>assert.equal(e.model,before[i]));
 assert.match(globe.traffic.entities.getById('1').model.uri.getValue(),/vessel.gltf/);
 globe.setTraffic([]);assert.equal(globe.traffic.entities.values.length,0);
});
