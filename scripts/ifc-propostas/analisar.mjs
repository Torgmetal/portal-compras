import fs from 'node:fs/promises';
const {items}=JSON.parse(await fs.readFile('/private/tmp/op089-propostas.json','utf8'));
const center=a=>a.min.map((x,k)=>(x+a.max[k])/2);
const near=(p,a,r)=>p.every((v,k)=>v>=a.min[k]-r&&v<=a.max[k]+r);
const bolts=items.filter(x=>/FASTENER/i.test(x.type));
let best=[];
for(const b of bolts.filter((_,i)=>i%12===0)){
const c=center(b),ns=items.filter(x=>near(c,x,.16));
const structural=ns.filter(x=>/BEAM|COLUMN|MEMBER/i.test(x.type));
const plates=ns.filter(x=>/PLATE/i.test(x.type));
if(structural.length>=2&&plates.length&&ns.length<55)best.push({id:b.id,c,n:ns.length,structural:structural.map(x=>({id:x.id,name:x.name,mark:x.mark})),plates:plates.length});
}
console.log(JSON.stringify(best.slice(0,8),null,2));
