import {afterEach,beforeEach,expect,it,vi} from "vitest";
import * as XLSX from "xlsx";
const mocks=vi.hoisted(()=>({findUnique:vi.fn(),upsert:vi.fn()}));
vi.mock("@/lib/sharepoint",()=>({getAccessToken:async()=>"teste"}));
vi.mock("@/lib/sharepoint-lpc",()=>({resolveServidorDriveId:async()=>"drive"}));
vi.mock("@/lib/prisma",()=>({prisma:{},prismaDirect:{listaExpedicao:{findUnique:mocks.findUnique,upsert:mocks.upsert}}}));
vi.mock("@/lib/expedicao-cronograma",()=>({alinharCronogramaExpedicao:vi.fn()}));
import {importarListasOP} from "@/lib/lista-avancada-sharepoint";
let arquivos;
beforeEach(()=>{
 vi.clearAllMocks();mocks.findUnique.mockResolvedValue(null);mocks.upsert.mockResolvedValue({});
 arquivos=[{id:"formatada",name:"LE_OP-107_2026-09-10.xlsx",file:{},lastModifiedDateTime:"2026-09-10T12:00:00Z"}];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Item","Marca","Qtd","Peso total (kg)"],[1,"T107A1",2,10],[2,"T107B2",1,20]]),"LE");
 const bytes=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
 vi.stubGlobal("fetch",vi.fn(async url=>{
  const path=decodeURIComponent(new URL(url).pathname);
  if(path.endsWith('/content'))return new Response(bytes);
  let value=[];
  if(path.endsWith('/01. OP:/children'))value=[{name:"OP-107 - Obra",folder:{}}];
  else if(path.endsWith('/OP-107 - Obra:/children'))value=[{name:"2. Engenharia",folder:{}}];
  else if(path.endsWith('/2. Engenharia:/children'))value=[{name:"2.6 Lista de Expedição",folder:{}}];
  else if(path.endsWith('/2.6 Lista de Expedição:/children'))value=arquivos;
  return Response.json({value});
 }));
});
afterEach(()=>vi.unstubAllGlobals());
it("importa a LE gerada pelo portal",async()=>{
 const r=await importarListasOP({opNumero:"107"});
 expect(r.ok).toBe(true);expect(r.resultados).toHaveLength(1);
 expect(r.resultados[0]).toMatchObject({ok:true,marcas:2,pesoContratado:30});
});
it("usa só a formatada mais recente sem criar uma frente por data",async()=>{
 arquivos.push({...arquivos[0],id:"nova",name:"LE_OP-107_2026-09-11.xlsx",lastModifiedDateTime:"2026-09-11T12:00:00Z"});
 const r=await importarListasOP({opNumero:"107"});
 expect(r.ok).toBe(true);expect(r.resultados).toHaveLength(1);
 expect(r.resultados[0].arquivo).toBe("LE_OP-107_2026-09-11.xlsx");
});
it("não soma a cópia formatada ao arquivo LE original",async()=>{
 arquivos.push({id:"original",name:"T107-LE-R00.xlsx",file:{},lastModifiedDateTime:"2026-09-10T10:00:00Z"});
 const r=await importarListasOP({opNumero:"107"});
 expect(r.ok).toBe(true);expect(r.resultados).toHaveLength(1);
 expect(r.resultados[0].arquivo).toBe("T107-LE-R00.xlsx");
});
