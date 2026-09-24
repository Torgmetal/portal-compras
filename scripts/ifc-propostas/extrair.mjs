import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import * as T from 'three';
const require=createRequire(import.meta.url), W=require('web-ifc');
const api=new W.IfcAPI();await api.Init();
const model=api.OpenModel(new Uint8Array(await fs.readFile('/private/tmp/op089-modelo.ifc')),{COORDINATE_TO_ORIGIN:true});
const value=x=>x?.value??x;
const parents=new Map(), marks=new Map();
const as=api.GetLineIDsWithType(model,W.IFCELEMENTASSEMBLY);
for(let i=0;i<as.size();i++){const id=as.get(i),l=api.GetLine(model,id);marks.set(id,String(value(l.Tag)||value(l.Name)||id));}
const rs=api.GetLineIDsWithType(model,W.IFCRELAGGREGATES);
for(let i=0;i<rs.size();i++){const l=api.GetLine(model,rs.get(i));if(marks.has(l.RelatingObject.value))for(const x of l.RelatedObjects)parents.set(x.value,l.RelatingObject.value);}
const geos={},items=[];
api.StreamAllMeshes(model,mesh=>{
 const l=api.GetLine(model,mesh.expressID),asm=parents.get(mesh.expressID);
 for(let j=0;j<mesh.geometries.size();j++){
 const p=mesh.geometries.get(j),id=p.geometryExpressID;
 if(!geos[id]){const g=api.GetGeometry(model,id),v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()),ix=api.GetIndexArray(g.GetIndexData(),g.GetIndexDataSize());geos[id]={v:Array.from(v,x=>Math.round(x*1e6)/1e6),i:Array.from(ix)};g.delete();}
 const {v}=geos[id],box=new T.Box3(),mat=new T.Matrix4().fromArray(p.flatTransformation);
 for(let k=0;k<v.length;k+=6)box.expandByPoint(new T.Vector3(v[k],v[k+1],v[k+2]).applyMatrix4(mat));
 items.push({id:mesh.expressID,geo:id,m:Array.from(p.flatTransformation),color:[p.color.x,p.color.y,p.color.z],type:api.GetNameFromTypeCode(l.type),name:String(value(l.Name)||''),tag:String(value(l.Tag)||''),guid:value(l.GlobalId),asm,mark:marks.get(asm)||'',min:box.min.toArray(),max:box.max.toArray()});
 }
});
await fs.writeFile('/private/tmp/op089-propostas.json',JSON.stringify({geos,items}));
const types={};for(const i of items)types[i.type]=(types[i.type]||0)+1;
console.log(JSON.stringify({items:items.length,geos:Object.keys(geos).length,types,example:items.filter(x=>/FASTENER/.test(x.type)).slice(0,2)}));api.CloseModel(model);
