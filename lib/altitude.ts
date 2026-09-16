export type AltitudeUnit='kft'|'ft'|'m';
export const altitudeValue=(meters:number,unit:AltitudeUnit)=>unit==='m'?meters:meters/0.3048/(unit==='kft'?1000:1);
export const altitudeMeters=(value:number,unit:AltitudeUnit)=>unit==='m'?value:value*0.3048*(unit==='kft'?1000:1);
export const formatAltitude=(meters:number|null,unit:AltitudeUnit)=>meters===null?'Not reported':`${altitudeValue(meters,unit).toLocaleString(undefined,{minimumFractionDigits:unit==='kft'?2:0,maximumFractionDigits:unit==='kft'?3:0})} ${unit}`;
