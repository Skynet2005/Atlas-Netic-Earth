export const R=6371.0088;
export const rad=(n:number)=>n*Math.PI/180;
export const deg=(n:number)=>n*180/Math.PI;
export const wrap=(n:number)=>((n+540)%360)-180;
export const norm=(n:number)=>((n%360)+360)%360;
export type GeoPoint={latitude:number;longitude:number;name?:string};
export function distanceKm(a:number,b:number,c:number,d:number){const x=rad(c-a),y=rad(d-b);return 2*R*Math.asin(Math.sqrt(Math.min(1,Math.sin(x/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(y/2)**2)));}
export function bearing(a:number,b:number,c:number,d:number){return norm(deg(Math.atan2(Math.sin(rad(d-b))*Math.cos(rad(c)),Math.cos(rad(a))*Math.sin(rad(c))-Math.sin(rad(a))*Math.cos(rad(c))*Math.cos(rad(d-b)))));}
export function destination(a:number,b:number,course:number,km:number):GeoPoint {const p=rad(a),t=rad(course),d=km/R;const lat=Math.asin(Math.sin(p)*Math.cos(d)+Math.cos(p)*Math.sin(d)*Math.cos(t));return {latitude:deg(lat),longitude:wrap(b+deg(Math.atan2(Math.sin(t)*Math.sin(d)*Math.cos(p),Math.cos(d)-Math.sin(p)*Math.sin(lat))))};}
export function midpoint(a:number,b:number,c:number,d:number){return destination(a,b,bearing(a,b,c,d),distanceKm(a,b,c,d)/2);}
export function polygonArea(points:GeoPoint[]){if(points.length<3)return 0;let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=rad(wrap(b.longitude-a.longitude))*(2+Math.sin(rad(a.latitude))+Math.sin(rad(b.latitude)));}const area=Math.abs(sum)*R*R/2;return Math.min(area,4*Math.PI*R*R-area);}
export function routeDistance(points:GeoPoint[]){return points.slice(1).reduce((n,p,i)=>n+distanceKm(points[i].latitude,points[i].longitude,p.latitude,p.longitude),0);}
export function parseCoordinates(input:string):GeoPoint {const parts=input.trim().split(/[,;\n]+/);if(parts.length!==2)throw new Error('Use latitude, longitude.');const convert=(s:string)=>{const m=s.trim().match(/^(-?\d+(?:\.\d+)?)\s*(?:°|d)?\s*(?:(\d+(?:\.\d+)?)\s*['′m])?\s*(?:(\d+(?:\.\d+)?)\s*["″s])?\s*([NSEW])?$/i);if(!m)throw new Error('Use decimal degrees or 40° 30\' 0" N, 74° 0\' 0" W');if(Number(m[2]||0)>=60||Number(m[3]||0)>=60)throw new Error('Minutes and seconds must be below 60.');return (Math.abs(Number(m[1]))+Number(m[2]||0)/60+Number(m[3]||0)/3600)*(/[SW]/i.test(m[4]||'')||Number(m[1])<0?-1:1);};const latitude=convert(parts[0]),longitude=convert(parts[1]);if(Math.abs(latitude)>90||Math.abs(longitude)>180)throw new Error('Coordinates outside Earth.');return {latitude,longitude};}
export function dms(n:number,lat=true){let seconds=Math.round(Math.abs(n)*3600);const d=Math.floor(seconds/3600);seconds-=d*3600;const m=Math.floor(seconds/60);return `${d}° ${m}′ ${seconds-m*60}″ ${lat?(n<0?'S':'N'):(n<0?'W':'E')}`;}
export function download(name:string,data:string,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function geoJSON(points:GeoPoint[]){return JSON.stringify({type:'FeatureCollection',features:points.map(p=>({type:'Feature',properties:{name:p.name||''},geometry:{type:'Point',coordinates:[p.longitude,p.latitude]}}))},null,2);}
