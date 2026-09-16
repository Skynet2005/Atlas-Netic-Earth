"use client";
import {useAltitude} from '@/hooks/use-altitude';
import type {AltitudeUnit} from '@/lib/altitude';
export function AltitudeUnits(){const {unit,setUnit}=useAltitude();return <label className="altitude-unit-control">Altitude units<select aria-label="Altitude units" value={unit} onChange={e=>setUnit(e.target.value as AltitudeUnit)}><option value="kft">Thousands of feet (kft)</option><option value="ft">Feet (ft)</option><option value="m">Meters (m)</option></select></label>;}
