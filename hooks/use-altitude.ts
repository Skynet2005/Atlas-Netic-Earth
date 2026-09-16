"use client";
import {useSyncExternalStore} from 'react';
import type {AltitudeUnit} from '@/lib/altitude';
let memory:AltitudeUnit|undefined;
function snapshot():AltitudeUnit {if(memory)return memory;try{const v=localStorage.getItem('atlas-altitude-unit');return v==='ft'||v==='m'?v:'kft';}catch{return 'kft';}}
function subscribe(callback:()=>void){window.addEventListener('atlas-units',callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener('atlas-units',callback);window.removeEventListener('storage',callback);};}
export function useAltitude(){const unit=useSyncExternalStore(subscribe,snapshot,()=>'kft' as AltitudeUnit);return {unit,setUnit:(v:AltitudeUnit)=>{try{localStorage.setItem('atlas-altitude-unit',v);memory=undefined;}catch{memory=v;}window.dispatchEvent(new Event('atlas-units'));}};}
