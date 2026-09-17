import type * as Cesium from 'cesium';
import type {TrafficTarget} from './traffic';
import {trafficModelSpec} from './traffic-models';

type CModule=typeof Cesium;
export class TrafficRenderer{
 private source:Cesium.CustomDataSource;
 private targets=new Map<string,TrafficTarget>();
 private detail=false;
 private removeCameraListener:()=>void;
 private legacy?:Cesium.DataSource;
 constructor(private C:CModule,private viewer:Cesium.Viewer){
  this.source=new C.CustomDataSource('atlas-classified-traffic');void viewer.dataSources.add(this.source);
  this.legacy=viewer.dataSources.getByName('transponder-traffic')[0];if(this.legacy)this.legacy.show=false;
  this.removeCameraListener=viewer.camera.changed.addEventListener(()=>this.updateDetailMode());
  this.updateDetailMode();
 }
 private uri(target:TrafficTarget){const spec=trafficModelSpec(target);return this.detail?spec.detail:spec.low;}
 private color(target:TrafficTarget){return this.C.Color.fromCssColorString(target.heading===null||target.altitude===null?'#b9bec6':target.kind==='military'?'#ffbd75':target.vesselClass==='military'?'#ff9d7d':target.kind==='maritime'?'#8ecbff':'#a4ecdb');}
 private updateDetailMode(){
  const next=this.viewer.camera.positionCartographic.height<300_000;
  if(next===this.detail)return;this.detail=next;
  for(const [id,target] of this.targets){const entity=this.source.entities.getById(id);if(entity?.model)entity.model.uri=new this.C.ConstantProperty(this.uri(target));}
  this.viewer.scene.requestRender();
 }
 sync(targets:TrafficTarget[]){
  const C=this.C,entities=this.source.entities,next=new Map(targets.map(target=>[target.id,target]));
  entities.suspendEvents();
  try{
   for(const entity of [...entities.values])if(!next.has(String(entity.id)))entities.remove(entity);
   for(const target of targets){
    const previous=this.targets.get(target.id),position=C.Cartesian3.fromDegrees(target.longitude,target.latitude,target.altitude??0);
    const ground=target.altitudeReference==='surface'||target.altitude===null,reference=ground?C.HeightReference.CLAMP_TO_GROUND:C.HeightReference.NONE;
    const orientation=C.Transforms.headingPitchRollQuaternion(position,new C.HeadingPitchRoll(C.Math.toRadians((target.heading??0)-90),0,0));
    const spec=trafficModelSpec(target);let entity=entities.getById(target.id);
    if(!entity){entity=entities.add({id:target.id,name:target.name,position,orientation,properties:{atlasTrafficClass:spec.className,atlasTrafficLabel:spec.label},model:{uri:this.uri(target),minimumPixelSize:spec.minimumPixelSize,maximumScale:5000,runAnimations:false,incrementallyLoadTextures:false,shadows:C.ShadowMode.DISABLED,enableVerticalExaggeration:false,heightReference:reference,color:this.color(target),colorBlendMode:C.ColorBlendMode.MIX,colorBlendAmount:0.28}});}
    else if(previous!==target){entity.name=target.name;entity.position=new C.ConstantPositionProperty(position);entity.orientation=new C.ConstantProperty(orientation);if(entity.model){entity.model.heightReference=new C.ConstantProperty(reference);entity.model.color=new C.ConstantProperty(this.color(target));const previousClass=previous?trafficModelSpec(previous).className:null;if(previousClass!==spec.className)entity.model.uri=new C.ConstantProperty(this.uri(target));}if(entity.properties){entity.properties.atlasTrafficClass=new C.ConstantProperty(spec.className);entity.properties.atlasTrafficLabel=new C.ConstantProperty(spec.label);}}
   }
  }finally{entities.resumeEvents();}
  this.targets=next;this.viewer.scene.requestRender();
 }
 destroy(){this.removeCameraListener();this.viewer.dataSources.remove(this.source,true);if(this.legacy)this.legacy.show=true;this.targets.clear();}
}
