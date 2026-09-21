import { expect, it } from "vitest";
import { extractText } from "unpdf";
import { gerarModeloCargaPDF } from "@/lib/carga/modelo-carga-pdf";

it("preserva a descrição completa e a distribuição dos volumes na lista de separação", async () => {
  const descricao = "VIGA DE FECHAMENTO DA PLATAFORMA SUPERIOR COM CHAPAS DE LIGACAO E FUROS DE MONTAGEM REFERENCIA FINAL ABC123";
  const membros = Array.from({length: 2}, (_, i) => ({ id: `m${i}`, marca: "T122A12345", desc: descricao, kg: 50, C: 2000, L: 200, A: 300 }));
  const itens = membros.map((m, i) => ({id:`v${i}`,volume:i+1,tipo:"PECA",C:2000,L:200,A:300,kg:50,x:i*2500,y:0,z:0,camada:0,membros:[m]}));
  const carga = {veiculo:{nome:"Truck",pesoMax:12000,alturaUtil:2600,C:8500,L:2450},itens,passos:["v0","v1"],romaneio:[],peso:100,altura:300,chao:5,volumes:2,madeira:{pecas:{}}};
  const {bytes}=await gerarModeloCargaPDF({op:{numero:"122",cliente:"Cliente de demonstração"},previo:{numero:1},carga,prefixo:"T122"});
  const {text}=await extractText(bytes,{mergePages:true});
  expect(text).toContain("REFERENCIA FINAL ABC123");
  expect(text).toContain("T122A12345");
  expect(text).toContain("1 × 1");
  expect(text).toContain("2 × 1");
});
