// Original low-poly meshes authored X-forward/Y-up, exported glTF Z-forward/Y-up.
import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('public/models',{recursive:true});
function model(kind){const positions=[],normals=[],colors=[];
 const triangle=(a,b,c,color)=>{const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;for(const p of [a,b,c]){positions.push(...p);normals.push(...n.map(x=>x/len));colors.push(...color);}};
 const prism=(outline,low,high,color)=>{const bottom=outline.map(([x,z])=>[x,low,z]),top=outline.map(([x,z])=>[x,high,z]);for(let i=1;i<outline.length-1;i++){triangle(top[0],top[i+1],top[i],color);triangle(bottom[0],bottom[i],bottom[i+1],color);}for(let i=0;i<outline.length;i++){const j=(i+1)%outline.length;triangle(bottom[i],top[i],top[j],color);triangle(bottom[i],top[j],bottom[j],color);}};
 const box=(x,y,z,l,h,w,c)=>prism([[x-l/2,z-w/2],[x+l/2,z-w/2],[x+l/2,z+w/2],[x-l/2,z+w/2]],y,y+h,c);
 if(kind==='aircraft'){
 prism([[27,0],[18,-2.7],[-19,-2.7],[-25,0],[-19,2.7],[18,2.7]],-1.5,1.5,[.78,.86,.9]);
 prism([[7,-2],[-7,-25],[-13,-25],[-7,-2]],-.3,.3,[.35,.55,.65]);prism([[7,2],[-7,2],[-13,25],[-7,25]],-.3,.3,[.35,.55,.65]);
 prism([[-16,-1],[-22,-10],[-26,-10],[-23,-1]],.5,1,[.35,.55,.65]);prism([[-16,1],[-23,1],[-26,10],[-22,10]],.5,1,[.35,.55,.65]);
 box(-21,1,0,5,7,.7,[.25,.5,.65]);box(-2,-3,-9,7,2.4,2.4,[.25,.32,.38]);box(-2,-3,9,7,2.4,2.4,[.25,.32,.38]);box(19,1.5,0,3,.3,3,[.07,.19,.25]);
 }else{
 prism([[55,0],[36,-9],[-45,-9],[-49,-6],[-49,6],[-45,9],[36,9]],0,6,[.12,.28,.38]);
 box(-29,6,0,17,9,14,[.83,.86,.82]);box(-30,15,0,12,2,15,[.15,.38,.47]);box(-35,17,0,3,7,3,[.77,.32,.18]);
 for(const x of [-9,5,19])for(const z of [-4,4])box(x,6,z,12,5,6,[.25+(x+9)/100,.48,.46]);
 }
 for(const a of [positions,normals])for(let i=0;i<a.length;i+=3){const x=a[i],z=a[i+2];a[i]=-z;a[i+2]=x;}
 const arrays=[positions,normals,colors].map(a=>new Float32Array(a));const buffer=Buffer.concat(arrays.map(a=>Buffer.from(a.buffer)));let offset=0;
 const views=arrays.map(a=>{const v={buffer:0,byteOffset:offset,byteLength:a.byteLength,target:34962};offset+=a.byteLength;return v;});
 const accessors=arrays.map((a,i)=>({bufferView:i,componentType:5126,count:a.length/3,type:'VEC3',...(i===0?{min:[0,1,2].map(k=>Math.min(...positions.filter((_,j)=>j%3===k))),max:[0,1,2].map(k=>Math.max(...positions.filter((_,j)=>j%3===k)))}:{})}));
 return {asset:{version:'2.0',generator:'Atlas-Netic original traffic silhouettes'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,COLOR_0:2},material:0}]}],materials:[{doubleSided:true,pbrMetallicRoughness:{metallicFactor:.15,roughnessFactor:.7}}],buffers:[{byteLength:buffer.length,uri:'data:application/octet-stream;base64,'+buffer.toString('base64')}],bufferViews:views,accessors};
}
for(const kind of ['aircraft','vessel'])writeFileSync(`public/models/${kind}.gltf`,JSON.stringify(model(kind)));
