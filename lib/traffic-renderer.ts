import type * as Cesium from 'cesium';
import type {TrafficTarget} from './traffic';
import {trafficModelSpec} from './traffic-models';
import {clusterTraffic,semanticZoomForAltitude,trafficClusterSummary,type SemanticZoomLevel} from './semantic-zoom';

type CModule=typeof Cesium;

export class TrafficRenderer{
 private targets=new Map<string,TrafficTarget>();
 private detail=false;
 private zoom:SemanticZoomLevel='global';
 private readonly clusters:Cesium.CustomDataSource;
 private removeCameraListener:()=>void;

 constructor(private C:CModule,private viewer:Cesium.Viewer){
  this.clusters=new C.CustomDataSource('atlas-traffic-density');
  void viewer.dataSources.add(this.clusters);
  this.removeCameraListener=viewer.camera.changed.addEventListener(()=>this.updateSemanticMode());
  this.updateSemanticMode();
 }

 private source(){return this.viewer.dataSources.getByName('transponder-traffic')[0] as Cesium.CustomDataSource|undefined;}
 private uri(target:TrafficTarget){const spec=trafficModelSpec(target);return this.detail?spec.detail:spec.low;}
 private color(target:TrafficTarget){return this.C.Color.fromCssColorString(target.heading===null||target.altitude===null?'#b9bec6':target.kind==='military'?'#ffbd75':target.vesselClass==='military'?'#ff9d7d':target.kind==='maritime'?'#8ecbff':'#a4ecdb');}
 private maximumDistance(target:TrafficTarget){return target.kind==='maritime'?6_000_000:12_000_000;}
 private silhouette(target:TrafficTarget){return target.kind==='military'||target.vesselClass==='military'?this.C.Color.fromCssColorString('#ffd6a0'):this.C.Color.WHITE.withAlpha(0.88);}
 private silhouetteSize(target:TrafficTarget){return target.kind==='military'||target.vesselClass==='military'?2.2:1.55;}

 private renderClusters(){
  const C=this.C,entities=this.clusters.entities;
  entities.removeAll();
  const summaries=clusterTraffic([...this.targets.values()],12).slice(0,140);
  for(const cluster of summaries){
   const dominant=cluster.military>=cluster.air&&cluster.military>=cluster.maritime?'military':cluster.maritime>cluster.air?'maritime':'air';
   const color=C.Color.fromCssColorString(dominant==='military'?'#ffbd75':dominant==='maritime'?'#8ecbff':'#a4ecdb');
   const radius=Math.max(85_000,Math.min(360_000,70_000+Math.sqrt(cluster.count)*42_000));
   entities.add({
    id:cluster.id,
    position:C.Cartesian3.fromDegrees(cluster.longitude,cluster.latitude),
    ellipse:{
     semiMajorAxis:radius,semiMinorAxis:radius,
     material:color.withAlpha(Math.min(.24,.075+cluster.count*.012)),
     outline:true,outlineColor:color.withAlpha(.72),
     heightReference:C.HeightReference.CLAMP_TO_GROUND,
    },
    label:{
     text:`${cluster.count}\n${trafficClusterSummary(cluster)}`,
     font:'600 11px Inter, sans-serif',
     fillColor:C.Color.WHITE.withAlpha(.96),
     outlineColor:C.Color.fromCssColorString('#031018'),
     outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,
     pixelOffset:new C.Cartesian2(0,-4),
     heightReference:C.HeightReference.CLAMP_TO_GROUND,
     disableDepthTestDistance:0,
     distanceDisplayCondition:new C.DistanceDisplayCondition(0,30_000_000),
    },
   });
  }
 }

 private updateSemanticMode(){
  const altitude=this.viewer.camera.positionCartographic.height;
  const nextZoom=semanticZoomForAltitude(altitude);
  const nextDetail=nextZoom==='local'&&altitude<450_000;
  const zoomChanged=nextZoom!==this.zoom,detailChanged=nextDetail!==this.detail;
  this.zoom=nextZoom;this.detail=nextDetail;

  const source=this.source();
  if(source)source.show=nextZoom!=='global';
  this.clusters.show=nextZoom==='global';
  if(zoomChanged&&nextZoom==='global')this.renderClusters();

  if(detailChanged&&source){
   for(const [id,target] of this.targets){
    const entity=source.entities.getById(id);
    if(entity?.model)entity.model.uri=new this.C.ConstantProperty(this.uri(target));
   }
  }
  if(zoomChanged||detailChanged)this.viewer.scene.requestRender();
 }

 sync(targets:TrafficTarget[]){
  const source=this.source();
  if(!source){this.targets=new Map(targets.map(target=>[target.id,target]));this.renderClusters();return;}
  const C=this.C,entities=source.entities,next=new Map(targets.map(target=>[target.id,target]));
  entities.suspendEvents();
  try{
   for(const entity of [...entities.values])if(!next.has(String(entity.id)))entities.remove(entity);
   for(const target of targets){
    const previous=this.targets.get(target.id),position=C.Cartesian3.fromDegrees(target.longitude,target.latitude,target.altitude??0);
    const ground=target.altitudeReference==='surface'||target.altitude===null,reference=ground?C.HeightReference.CLAMP_TO_GROUND:C.HeightReference.NONE;
    const orientation=C.Transforms.headingPitchRollQuaternion(position,new C.HeadingPitchRoll(C.Math.toRadians((target.heading??0)-90),0,0));
    const spec=trafficModelSpec(target),distance=new C.DistanceDisplayCondition(0,this.maximumDistance(target));let entity=entities.getById(target.id);
    if(!entity){
     entity=entities.add({id:target.id,name:target.name,position,orientation,model:{
      uri:this.uri(target),minimumPixelSize:spec.minimumPixelSize,maximumScale:4800,runAnimations:false,incrementallyLoadTextures:false,
      shadows:C.ShadowMode.DISABLED,enableVerticalExaggeration:false,heightReference:reference,distanceDisplayCondition:distance,
      color:this.color(target),colorBlendMode:C.ColorBlendMode.MIX,colorBlendAmount:0.14,
      silhouetteColor:this.silhouette(target),silhouetteSize:this.silhouetteSize(target),
     }});
    }else{
     entity.name=target.name;entity.position=new C.ConstantPositionProperty(position);entity.orientation=new C.ConstantProperty(orientation);
     if(entity.model){
      entity.model.heightReference=new C.ConstantProperty(reference);entity.model.distanceDisplayCondition=new C.ConstantProperty(distance);
      entity.model.color=new C.ConstantProperty(this.color(target));entity.model.minimumPixelSize=new C.ConstantProperty(spec.minimumPixelSize);
      entity.model.maximumScale=new C.ConstantProperty(4800);entity.model.silhouetteColor=new C.ConstantProperty(this.silhouette(target));
      entity.model.silhouetteSize=new C.ConstantProperty(this.silhouetteSize(target));
      const previousClass=previous?trafficModelSpec(previous).className:null;
      if(previousClass!==spec.className||!previous)entity.model.uri=new C.ConstantProperty(this.uri(target));
     }
    }
   }
  }finally{entities.resumeEvents();}
  this.targets=next;
  if(this.zoom==='global')this.renderClusters();
  this.updateSemanticMode();
  this.viewer.scene.requestRender();
 }

 destroy(){
  this.removeCameraListener();
  this.viewer.dataSources.remove(this.clusters,true);
  this.targets.clear();
 }
}
