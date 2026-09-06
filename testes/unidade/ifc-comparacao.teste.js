import { describe, it, expect } from "vitest";
import { compararElementosIfc, canonizarTriangulosIfc } from "../../lib/ifc-comparacao";
import { comparacaoIfcPublicada, comparacaoIfcSchema } from "../../lib/ifc-comparacao-publicacao";
const item = (guid, hash = "a", meta = "m") => ({ guid, hash, meta });
describe("comparação de IFC", () => {
  it("distingue igualdade, alteração, inclusão e remoção", () => {
    expect(compararElementosIfc([item("1"), item("2"), item("3")], [item("1"), item("2","b"), item("4")]).map(x=>x.status)).toEqual(["igual","alterado","removido","adicionado"]);
  });
  it("não associa marca nem identificadores ambíguos", () => {
    expect(compararElementosIfc([item("1"),item("1"),item("")],[item("1"),item("")]).every(x=>x.status === "conferir")).toBe(true);
  });
  it("detecta metadados mesmo com geometria igual", () => {
    expect(compararElementosIfc([item("1")],[item("1","a","outro")])[0].status).toBe("alterado");
  });
  it("normaliza ordem de triângulos, mas detecta deslocamento", () => {
    const p=[0,0,0, 1,0,0, 0,1,0, 1,1,0];
    const a=canonizarTriangulosIfc(p,[0,1,2,1,2,3]);
    expect(canonizarTriangulosIfc(p,[3,2,1,2,1,0])).toBe(a);
    expect(canonizarTriangulosIfc(p.map((v,i)=>i%3===0?v+.002:v),[0,1,2,1,2,3])).not.toBe(a);
  });
});
describe("publicação opt-in", () => {
  const doc={id:"a",nome:"atual.ifc",comparacaoIfc:{publicar:true,anterior:{id:"b",nome:"antigo.ifc"}}};
  it("não expõe comparação sem consentimento explícito", () => {
    expect(comparacaoIfcPublicada({id:"a",nome:"atual.ifc"})).toBeNull();
    expect(comparacaoIfcPublicada({...doc,comparacaoIfc:{...doc.comparacaoIfc,publicar:false}})).toBeNull();
    expect(comparacaoIfcPublicada({...doc,comparacaoIfc:{...doc.comparacaoIfc,publicar:"true"}})).toBeNull();
    expect(comparacaoIfcPublicada(doc)).not.toBeNull();
  });
  it("rejeita publicação sem anterior, arquivo igual ou extensão inválida", () => {
    expect(comparacaoIfcSchema.safeParse({publicar:true,anterior:null}).success).toBe(false);
    expect(comparacaoIfcSchema.safeParse({publicar:false,anterior:null}).success).toBe(true);
    expect(comparacaoIfcPublicada({...doc,id:"b"})).toBeNull();
    expect(comparacaoIfcPublicada({...doc,nome:"x.pdf"})).toBeNull();
  });
});
