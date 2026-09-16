import {type GeoPoint} from './geo';
import {type CameraSnapshot,validCamera} from './session';
export type SavedView={id:string;name:string;camera:CameraSnapshot};
export type Workspace={points:GeoPoint[];views:SavedView[];history:GeoPoint[];watch:string[]};
export const EMPTY_WORKSPACE:Workspace={points:[],views:[],history:[],watch:[]};
const validPoint=(p:unknown):p is GeoPoint=>!!p&&typeof p==='object'&&Number.isFinite((p as GeoPoint).latitude)&&Math.abs((p as GeoPoint).latitude)<=90&&Number.isFinite((p as GeoPoint).longitude)&&Math.abs((p as GeoPoint).longitude)<=180&&((p as GeoPoint).name===undefined||typeof (p as GeoPoint).name==='string'&&(p as GeoPoint).name!.length<=120);
export function parseWorkspace(value:unknown):Workspace {
 const v=value as Workspace;if(!v||!Array.isArray(v.points)||v.points.length>200||!v.points.every(validPoint)||!Array.isArray(v.views)||v.views.length>100||!v.views.every(p=>typeof p.id==='string'&&typeof p.name==='string'&&p.name.length<=120&&validCamera(p.camera))||!Array.isArray(v.history)||v.history.length>50||!v.history.every(validPoint)||!Array.isArray(v.watch)||v.watch.length>200||!v.watch.every(p=>typeof p==='string'))throw new Error('Invalid workspace backup. Maximum 200 points, 100 views, and 200 watched targets.');return v;
}
export function importGeoJSON(value:unknown):GeoPoint[]{
 const v=value as {type?:string;features?:{geometry?:{type?:string;coordinates?:unknown};properties?:{name?:unknown}}[]};
 if(v?.type!=='FeatureCollection'||!Array.isArray(v.features))throw new Error('Expected a GeoJSON FeatureCollection.');
 const points:GeoPoint[]=[];for(const feature of v.features){const g=feature.geometry;if(!g)continue;const coords=g.type==='Point'?[g.coordinates]:g.type==='LineString'?g.coordinates:[];if(!Array.isArray(coords))throw new Error('Invalid coordinates.');for(const c of coords){if(!Array.isArray(c))throw new Error('Invalid coordinate pair.');const p={longitude:c[0],latitude:c[1],name:typeof feature.properties?.name==='string'?feature.properties.name.slice(0,120):undefined};if(!validPoint(p))throw new Error('Coordinates outside valid latitude/longitude.');points.push(p);}}
 if(!points.length||points.length>200)throw new Error('Import 1 to 200 points.');return points;
}
export function csv(rows:(string|number|null)[][]){return rows.map(row=>row.map(v=>{let s=String(v??'');if(typeof v==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function gpx(points:GeoPoint[]){return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Atlas-Netic" xmlns="http://www.topografix.com/GPX/1/1"><rte><name>Atlas-Netic route</name>${points.map(p=>`<rtept lat="${p.latitude}" lon="${p.longitude}"><name>${xml(p.name||'Waypoint')}</name></rtept>`).join('')}</rte></gpx>`;}
