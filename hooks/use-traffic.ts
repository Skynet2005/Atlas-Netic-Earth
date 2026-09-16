"use client";
import {useEffect,useRef,useState,useCallback} from 'react';
import {mergeTrafficReports,isFreshTarget,type TrafficLayers,type TrafficSnapshot,type TrafficTarget} from '@/lib/traffic';
import {distanceKm} from '@/lib/geo';
type FeedState={targets:TrafficTarget[];phase:'off'|'loading'|'live'|'error';message:string;updatedAt:number|null;limited:boolean};
const empty:FeedState={targets:[],phase:'off',message:'',updatedAt:null,limited:false};
const cache=new Map<string,{latitude:number;longitude:number;state:FeedState}>();
function useFeed(feed:'air'|'maritime',enabled:boolean,latitude:number,longitude:number,paused:boolean){
 const [state,setState]=useState<FeedState>(empty),[refreshToken,setRefreshToken]=useState(0);
 const position=useRef({latitude,longitude});
 useEffect(()=>{position.current={latitude,longitude};},[latitude,longitude]);
 useEffect(()=>{
  if(!enabled){setState(empty);return;}
  const controller=new AbortController();let busy=false,lastRequest=0;
  let region=position.current,targets=new Map<string,TrafficTarget>();
  const old=cache.get(feed);
  if(old){targets=new Map(old.state.targets.filter(t=>isFreshTarget(t)).map(t=>[t.id,t]));setState({...old.state,targets:[...targets.values()]});}
  else setState({...empty,phase:'loading'});
  const interval=feed==='air'?15000:45000;
  const refresh=async()=>{
   if(busy||document.hidden||paused||controller.signal.aborted)return;
   busy=true;lastRequest=Date.now();const requested={...position.current};region=requested;
   try{
    const timeout=new AbortController();const limit=setTimeout(()=>timeout.abort(),18000);
    let response:Response;
    try{response=await fetch(`/api/traffic/${feed}?lat=${Math.round(requested.latitude*2)/2}&lon=${Math.round(requested.longitude*2)/2}`,{signal:AbortSignal.any([controller.signal,timeout.signal])});}finally{clearTimeout(limit);}
    const data=await response.json() as TrafficSnapshot&{error?:string};
    if(!response.ok||!Array.isArray(data.targets))throw new Error(data.error||'Feed unavailable. Retrying.');
    if(controller.signal.aborted)return;
    targets=new Map(mergeTrafficReports([...targets.values()],data.targets).map(t=>[t.id,t]));
    const next:FeedState={targets:[...targets.values()],phase:'live',message:data.coverage,updatedAt:data.fetchedAt,limited:!!data.limited};
    cache.set(feed,{...requested,state:next});setState(next);
   }catch(error){if(!controller.signal.aborted)setState(old=>({...old,targets:old.targets.filter(t=>isFreshTarget(t)),phase:'error',message:(error instanceof Error?error.message:'Feed unavailable')+' Last fresh reports retained.'}));}
   finally{busy=false;}
  };
  void refresh();
  const timer=setInterval(()=>{
   const p=position.current,moved=distanceKm(region.latitude,region.longitude,p.latitude,p.longitude)>150;
   if(Date.now()-lastRequest>=(moved?3000:interval))void refresh();
   setState(old=>{const fresh=old.targets.filter(t=>isFreshTarget(t));return fresh.length===old.targets.length?old:{...old,targets:fresh};});
  },2000);
  const visibility=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',visibility);
  return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
 },[feed,enabled,paused,refreshToken]);
 return {...state,refresh:useCallback(()=>setRefreshToken(n=>n+1),[])};
}
export function useTraffic(layers:TrafficLayers,_ready:boolean,latitude:number,longitude:number,paused=false){
 const air=useFeed('air',layers.air||layers.military,latitude,longitude,paused);
 const maritime=useFeed('maritime',layers.maritime,latitude,longitude,paused);
 return {air,maritime};
}
