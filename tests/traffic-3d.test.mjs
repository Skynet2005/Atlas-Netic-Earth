import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Matrix4,Matrix3,Cartesian3,Transforms,HeadingPitchRoll,Math as CesiumMath} from 'cesium';
import {altitudeValue,altitudeMeters,formatAltitude} from '../lib/altitude.ts';
import {parseAircraft,parseVessels} from '../lib/traffic.ts';
test('altitude units preserve the reported height and default-style thousands of feet',()=>{
 assert.equal(altitudeValue(10668,'kft'),35);assert.ok(Math.abs(altitudeMeters(35,'kft')-10668)<1e-9);assert.equal(altitudeValue(10668,'ft'),35000);assert.equal(formatAltitude(null,'kft'),'Not reported');assert.match(formatAltitude(10668,'kft'),/35\.00 kft/);assert.ok(Math.abs(altitudeMeters(altitudeValue(-50,'kft'),'kft')+50)<1e-9);
});
test('true direction is preferred over track without inventing an unknown heading',()=>{
 const now=Date.now();const base={hex:'abc',lat:40,lon:-74,seen_pos:0,alt_geom:35000,track:85};
 const air=a=>parseAircraft({now:now/1000,ac:[a]},now)[0];
 assert.equal(air({...base,true_heading:90}).heading,90);assert.equal(air({...base,true_heading:90}).headingReference,'true heading');assert.equal(air(base).headingReference,'course over ground');assert.equal(air({...base,track:undefined}).heading,null);assert.equal(air({...base,alt_geom:undefined}).altitude,null);assert.equal(air({...base,alt_geom:-100}).altitude,-30.48);
 const ship=parseVessels({features:[{geometry:{type:'Point',coordinates:[25,60]},properties:{mmsi:123456789,timestampExternal:now,heading:511,cog:75}}]},now)[0];assert.equal(ship.heading,75);assert.equal(ship.headingReference,'course over ground');
});
test('bundled glTF aircraft and vessel are complete finite meshes with Z-forward noses',()=>{
 for(const kind of ['aircraft','vessel']){const gltf=JSON.parse(readFileSync(new URL(`../public/models/${kind}.gltf`,import.meta.url)));assert.equal(gltf.asset.version,'2.0');const buffer=Buffer.from(gltf.buffers[0].uri.split(',')[1],'base64');assert.equal(buffer.length,gltf.buffers[0].byteLength);for(const a of gltf.accessors){const view=gltf.bufferViews[a.bufferView];assert.equal(view.byteLength,a.count*12);for(let i=view.byteOffset;i<view.byteOffset+view.byteLength;i+=4)assert.ok(Number.isFinite(buffer.readFloatLE(i)));}assert.ok(gltf.accessors[0].max[2]>gltf.accessors[0].max[0]);assert.ok(gltf.accessors[0].count<1000);}
});
test('glTF axis correction and reported headings orient nose north/east/south/west',()=>{
 // Cesium glTF defaults apply Y-up to Z-up followed by Z-forward to X-forward.
 const correction=Matrix3.multiply(Matrix3.fromRotationX(Math.PI/2),Matrix3.fromRotationY(Math.PI/2),new Matrix3());
 const nose=Matrix3.multiplyByVector(correction,Cartesian3.UNIT_Z,new Cartesian3());
 const position=Cartesian3.fromDegrees(-74,40,10668),enu=Transforms.eastNorthUpToFixedFrame(position),inverse=Matrix4.inverseTransformation(enu,new Matrix4());
 for(const [heading,expected] of [[0,[0,1,0]],[90,[1,0,0]],[180,[0,-1,0]],[270,[-1,0,0]]]){
 const q=Transforms.headingPitchRollQuaternion(position,new HeadingPitchRoll(CesiumMath.toRadians(heading-90),0,0));const world=Matrix3.multiplyByVector(Matrix3.fromQuaternion(q),nose,new Cartesian3());const local=Matrix4.multiplyByPointAsVector(inverse,world,new Cartesian3());assert.ok(Cartesian3.distance(local,new Cartesian3(...expected))<1e-10);
 }
});
