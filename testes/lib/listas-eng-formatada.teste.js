import { beforeEach, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
const mocks=vi.hoisted(()=>({op:vi.fn(),pecas:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{oP:{findUnique:mocks.op},pecaConjunto:{findMany:mocks.pecas}}}));
import {gerarListaEngFormatada} from "@/lib/listas-eng-formatada";
beforeEach(()=>{
 mocks.op.mockResolvedValue({numero:"107",obra:"Obra",cliente:"Cliente"});
 const pecas=[
  {item:1,marca:"T107A1",fonte:"LE_IMPORT",naLE:true,naLPC:false,qte:2,pesoUnitKg:5,pesoTotalKg:10},
  {item:2,marca:"T107B2",fonte:"LPC_IMPORT",naLE:true,naLPC:true,qte:1,pesoUnitKg:20,pesoTotalKg:20,tipoPeca:"CONJUNTO"},
  {item:3,marca:"CROQUI",fonte:"LPC_IMPORT",naLE:false,naLPC:true,qte:1,pesoUnitKg:20,pesoTotalKg:20,tipoPeca:"CROQUI"},
 ];
 mocks.pecas.mockImplementation(async({where})=>pecas.filter(p=>Object.entries(where).every(([k,v])=>k==='opId'||p[k]===v)));
});
it("LE inclui marcas compartilhadas com LPC sem incluir croquis fora da LE",async()=>{
 const doc=await gerarListaEngFormatada({tipo:"LE",opId:"op107"});
 expect(doc.pecas).toBe(2);
 const wb=XLSX.read(doc.buffer,{type:"buffer"});
 const rows=XLSX.utils.sheet_to_json(wb.Sheets.LE,{header:1});
 expect(rows.map(r=>r[1]).filter(Boolean)).toEqual(["Marca","T107A1","T107B2"]);
 expect(rows.flat()).toContain("30 kg");
});
it("LPC mantém suas peças e não dobra o peso do croqui no resumo",async()=>{
 const doc=await gerarListaEngFormatada({tipo:"LPC",opId:"op107"});
 expect(doc.pecas).toBe(2);
 const wb=XLSX.read(doc.buffer,{type:"buffer"});
 const rows=XLSX.utils.sheet_to_json(wb.Sheets.LPC,{header:1});
 expect(rows.map(r=>r[1]).filter(Boolean)).toEqual(["Marca","T107B2","CROQUI"]);
 expect(rows.flat()).toContain("20 kg");
});
