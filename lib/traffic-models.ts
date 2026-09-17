import type {TrafficTarget,VesselClass} from './traffic';

export type AircraftModelClass='jet'|'heavy'|'prop'|'helicopter'|'fighter';
export type TrafficModelClass=`air-${AircraftModelClass}`|`ship-${VesselClass}`;
export type TrafficModelSpec={className:TrafficModelClass;low:string;detail:string;label:string;minimumPixelSize:number};

const normalize=(value:string|undefined)=>(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const anyPrefix=(value:string,prefixes:string[])=>prefixes.some(prefix=>value.startsWith(prefix));

export function aircraftModelClass(type:string|undefined,kind:TrafficTarget['kind']):AircraftModelClass{
 const t=normalize(type);
 if(anyPrefix(t,['H60','UH','AH','CH','MH','HH','R22','R44','R66','B06','B407','EC','H135','H145','AS3','AS5','AW','S76','S92']))return'helicopter';
 if(anyPrefix(t,['F15','F16','F18','F22','F35','FA18','EUFI','RFAL','MIR2','SU2','SU3','MIG','JAS']))return'fighter';
 if(anyPrefix(t,['C130','C30J','A400','AT4','AT7','DH8','C208','PC12','B350','BE20','AN12','AN26']))return'prop';
 if(anyPrefix(t,['A388','A35','B74','B77','B78','C17','C5M','A124','IL76','MD11','DC10']))return'heavy';
 if(kind==='military'&&anyPrefix(t,['T38','T6','HAWK','L39']))return'fighter';
 return'jet';
}

export function trafficModelClass(target:TrafficTarget):TrafficModelClass{
 return target.kind==='maritime'?`ship-${target.vesselClass||'generic'}`:`air-${aircraftModelClass(target.aircraftType,target.kind)}`;
}

const labels:Record<TrafficModelClass,string>={
 'air-jet':'Jet aircraft','air-heavy':'Heavy jet','air-prop':'Prop / turboprop','air-helicopter':'Helicopter','air-fighter':'Fighter / tactical jet',
 'ship-generic':'Vessel','ship-passenger':'Passenger vessel','ship-cargo':'Cargo vessel','ship-tanker':'Tanker','ship-tug':'Tug','ship-sailing':'Sailing vessel','ship-military':'Military vessel','ship-service':'Service vessel',
};
export function trafficModelSpec(target:TrafficTarget):TrafficModelSpec{
 const className=trafficModelClass(target),base=`/models/${className}`;
 return{className,low:`${base}-low.gltf`,detail:`${base}-detail.gltf`,label:labels[className],minimumPixelSize:target.kind==='maritime'?20:18};
}
