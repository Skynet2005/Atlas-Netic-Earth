export type CameraSnapshot={latitude:number;longitude:number;height:number;heading:number;pitch:number;roll:number};
export function validCamera(value:unknown):value is CameraSnapshot {
  if(!value||typeof value!=='object')return false;
  const v=value as CameraSnapshot;
  return [v.latitude,v.longitude,v.height,v.heading,v.pitch,v.roll].every(Number.isFinite)&&Math.abs(v.latitude)<=90&&Math.abs(v.longitude)<=180&&v.height>=-500&&v.height<=50000000;
}
export function readCamera():CameraSnapshot|null {
  try {const params=new URLSearchParams(window.location.hash.slice(1));const shared=params.get('view');if(shared&&sessionStorage.getItem('atlas-loaded-share')!==shared){try{const v=JSON.parse(shared);if(validCamera(v)){sessionStorage.setItem('atlas-loaded-share',shared);return v;}}catch{/* Ignore malformed share links and restore the saved camera. */}}
    const v=JSON.parse(localStorage.getItem('atlas-camera-v1')||'null');return validCamera(v)?v:null;}catch{return null;}
}
export function writeCamera(value:CameraSnapshot){try{if(validCamera(value))localStorage.setItem('atlas-camera-v1',JSON.stringify(value));}catch{/* Storage can be unavailable in private browsing. */}}
export function readStored<T>(key:string,fallback:T):T {try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
export function saveStored(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
