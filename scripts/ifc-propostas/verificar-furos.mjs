import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),W=require('web-ifc');
const api=new W.IfcAPI();await api.Init();const m=api.OpenModel(new Uint8Array(await fs.readFile('/private/tmp/op089-modelo.ifc')));
const {items,geos}=JSON.parse(await fs.readFile('/private/tmp/op089-propostas.json','utf8'));
const b=items.find(i=>i.id===845),c=b.min.map((v,k)=>(v+b.max[k])/2);
for(const i of items.filter(i=>/plate/i.test(i.type)&&c.every((v,k)=>v>=i.min[k]-.43&&v<=i.max[k]+.43))){const l=api.GetLine(m,i.id);console.log(JSON.stringify({id:i.id,name:i.name,tag:i.tag,triangles:geos[i.geo].i.length/3,representation:api.GetLine(m,l.Representation.value,true)}));}
for(const type of [W.IFCOPENINGELEMENT,W.IFCBOOLEANRESULT,W.IFCBOOLEANCLIPPINGRESULT,W.IFCRELVOIDSELEMENT])console.log(api.GetNameFromTypeCode(type),api.GetLineIDsWithType(m,type).size());
api.CloseModel(m);
