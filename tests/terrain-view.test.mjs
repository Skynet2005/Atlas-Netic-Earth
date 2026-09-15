import test from 'node:test';
import assert from 'node:assert/strict';
import { approachCoordinates, nearestTerrainPlace, planTerrainApproach } from '../lib/terrain-view.ts';

test('a side view leaves orbital distance and makes kilometer-scale relief visible', () => {
  const plan=planTerrainApproach({range:18_000_000,angle:24,height:754,maximumHeight:2100,exaggeration:1});
  const projectedRelief=range=>2000*Math.cos(24*Math.PI/180)/(2*range*Math.tan(45*Math.PI/360))*800;
  assert.ok(projectedRelief(18_000_000)<1);
  assert.ok(projectedRelief(plan.range)>50);
  assert.ok(plan.range<=18000);
});
test('mountain targeting uses measured elevation, with true scale preserved', () => {
  const plan=planTerrainApproach({range:14000,angle:24,height:8841,maximumHeight:8870,exaggeration:1});
  assert.equal(plan.height,8841);
  assert.equal(plan.range,14000);
});
test('camera clearance follows exaggerated terrain across a canyon approach', () => {
  for(const exaggeration of [1,2,4,6]) {
    const plan=planTerrainApproach({range:10500,angle:24,height:754,maximumHeight:2200,exaggeration});
    const cameraHeight=plan.height+plan.range*Math.sin(plan.angle*Math.PI/180);
    assert.ok(cameraHeight>=2200*exaggeration+699.99);
  }
});
test('close inspection retains an already useful distance', () => {
  const plan=planTerrainApproach({range:2500,angle:30,height:100,maximumHeight:200,exaggeration:1});
  assert.equal(plan.range,2500);
});
test('world-scale terrain examples follow the visible part of Earth', () => {
  assert.equal(nearestTerrainPlace(24,-90).name,'Grand Canyon');
  assert.equal(nearestTerrainPlace(25,85).name,'Himalayas');
  assert.equal(nearestTerrainPlace(48,8).name,'The Alps');
  assert.equal(nearestTerrainPlace(-35,-70).name,'The Andes');
  assert.equal(nearestTerrainPlace(0,181).name,nearestTerrainPlace(0,-179).name);
});
test('approach sampling stays within terrain coverage and wraps longitude', () => {
  const samples=approachCoordinates(-179.99,84.99,20000,24,90);
  assert.equal(samples.length,5);
  for(const point of samples) {
    assert.ok(point.longitude>=-180&&point.longitude<=180);
    assert.ok(Math.abs(point.latitude)<=85);
  }
});
test('invalid camera inputs fail instead of creating a broken camera', () => {
  assert.throws(()=>planTerrainApproach({range:NaN,angle:24,height:0,maximumHeight:100,exaggeration:1}));
});
