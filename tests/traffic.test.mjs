import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAircraft, parseVessels, parseAISMessage, parseTrafficQuery, aisBoundingBoxes, isFreshTarget } from '../lib/traffic.ts';
import { showCountryLabels } from '../lib/country-labels.ts';

const now = Date.UTC(2026,8,15,21,0,0);
const aircraft = { hex:'abc123',flight:'TEST123 ',lat:40,lon:-74,alt_geom:10000,alt_baro:9500,seen_pos:2,gs:200,track:180 };
test('aircraft use source position age, geometric feet-to-meters and military bit flags',()=>{
  const [target] = parseAircraft({now,ac:[{...aircraft,dbFlags:9}]},now);
  assert.equal(target.kind,'military'); assert.equal(target.altitude,3048); assert.equal(target.altitudeReference,'geometric');
  assert.equal(target.observedAt,now-2000); assert.equal(target.name,'TEST123');
  assert.equal(parseAircraft({now,ac:[{...aircraft,dbFlags:8}]},now)[0].kind,'air');
});
test('stale, unlocated, future and malformed aircraft reports never become live markers',()=>{
  assert.deepEqual(parseAircraft({now,ac:[{...aircraft,seen_pos:91},{...aircraft,lat:null},{...aircraft,lon:181},{...aircraft,seen_pos:undefined}]},now),[]);
  assert.deepEqual(parseAircraft({now:now-100000,ac:[aircraft]},now),[]);
  assert.deepEqual(parseAircraft({now:now+100000,ac:[aircraft]},now),[]);
  assert.throws(()=>parseAircraft({ac:[]},now));
});
test('ground and missing aircraft altitude are not invented',()=>{
  const [ground] = parseAircraft({now,ac:[{...aircraft,alt_baro:'ground'}]},now);
  assert.equal(ground.altitude,0); assert.equal(ground.altitudeReference,'surface');
  const [missing] = parseAircraft({now,ac:[{...aircraft,alt_geom:null,alt_baro:undefined}]},now);
  assert.equal(missing.altitude,null);
});
test('AIS uses external epoch timestamp and rejects unavailable position/speed values',()=>{
  const feature = {geometry:{type:'Point',coordinates:[24.8,59.7]},properties:{mmsi:230123456,timestamp:42,timestampExternal:now-5000,sog:102.3,heading:511,cog:181}};
  const [target] = parseVessels({features:[feature]},now);
  assert.equal(target.observedAt,now-5000); assert.equal(target.speed,null); assert.equal(target.heading,181);
  assert.equal(target.longitude,24.8); assert.equal(target.latitude,59.7);
  assert.deepEqual(parseVessels({features:[{...feature,properties:{...feature.properties,timestampExternal:now-901000}}]},now),[]);
  assert.deepEqual(parseVessels({features:[{...feature,geometry:{type:'Point',coordinates:[181,91]}}]},now),[]);
  assert.equal(isFreshTarget(target,now+901000),false);
});
test('AISStream timestamps and unknown headings preserve source meaning',()=>{
  const event={MessageType:'PositionReport',MetaData:{MMSI:230123456,ShipName:'TEST',time_utc:'2026-09-15 20:59:58.123456789 +0000 UTC'},Message:{PositionReport:{Latitude:59.7,Longitude:24.8,TrueHeading:511,Cog:360,Sog:102.3}}};
  const target=parseAISMessage(event,now);
  assert.equal(target.observedAt,now-1877); assert.equal(target.heading,null); assert.equal(target.speed,null);
  assert.equal(parseAISMessage({...event,MetaData:{...event.MetaData,time_utc:'invalid'}},now),null);
});
test('traffic queries reject invalid coordinates and AIS bounds split across the dateline',()=>{
  for (const value of ['', 'lat=90&lon=181', 'lat=NaN&lon=10','lat=&lon=20']) assert.throws(()=>parseTrafficQuery(new URLSearchParams(value)));
  assert.deepEqual(parseTrafficQuery(new URLSearchParams('lat=59.71&lon=24.81')),{latitude:59.75,longitude:24.75});
  for (const lon of [-179,179]) {
    const boxes=aisBoundingBoxes(60,lon); assert.equal(boxes.length,2);
    for(const box of boxes) for(const [lat,lng] of box) {assert.ok(Math.abs(lat)<=90);assert.ok(Math.abs(lng)<=180);}
  }
});
test('country labels disappear for close mobile zoom and side views, and return at orbital scale',()=>{
  assert.equal(showCountryLabels(true,10000,390,-24),false);
  assert.equal(showCountryLabels(true,200000,390,-90),false);
  assert.equal(showCountryLabels(true,500000,390,-90),true);
  assert.equal(showCountryLabels(true,1000000,390,-5),false);
  assert.equal(showCountryLabels(false,18000000,1440,-90),false);
});
