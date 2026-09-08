import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { opcoesEnvioCronogramaSchema as schema, prepararDadosCronogramaEnvio, resumoCronogramaEnvio } from "@/lib/cronograma-envio";
import { gerarEmailCronograma } from "@/lib/cronograma-email";
import { prepararPacoteCronograma } from "@/lib/cronograma-envio-pacote";

const c = { id: "c1", opNumero: "105", titulo: "Título interno R99", tipoDias: "DU", dataBase: "2026-08-01", op: { cliente: "Cliente & Filhos" } };
const tarefas = [
  { id: "a", uidMpp: 1, nome: "Preparação", departamento: "FABRICACAO", isSummary: false, outlineLevel: 1, dataInicioPrevista: "2026-09-07", dataFimPrevista: "2026-09-11", dataInicioBase: "2026-09-01", dataFimBase: "2026-09-04", duracaoDias: 4, percentualRealizado: 50, antecessoraIds: [] },
  { id: "b", uidMpp: 2, nome: "Montagem", departamento: "FABRICACAO", isSummary: false, outlineLevel: 1, dataInicioPrevista: "2026-09-10", dataFimPrevista: "2026-09-15", dataInicioBase: "2026-09-07", dataFimBase: "2026-09-10", duracaoDias: 3, percentualRealizado: 0, antecessoraIds: ["a"], defasagemDias: -2 },
];
const options = tipoEnvio => schema.parse({ tipoEnvio, tituloCliente: "Galpão industrial", revisao: "R02", resumoAlteracoes: "Expedição reprogramada.\nAguardando liberação." });

describe("tipo de comunicação do cronograma", () => {
  it.each(["INICIAL", "ANDAMENTO"])("%s não divulga rótulo, comparativo ou baseline automáticos", tipo => {
    const o=options(tipo), dados=prepararDadosCronogramaEnvio(c,tarefas,o);
    expect(o.revisao).toBe(""); expect(o.resumoAlteracoes).toBe("");
    expect(dados.cronograma.dataBase).toBeNull();
    expect(dados.tarefas.every(t=>t.dataInicioBase===null&&t.dataFimBase===null)).toBe(true);
    expect(dados.nomes.pdf).toBe("Cronograma_OP-105.pdf");
    const {html,assunto}=gerarEmailCronograma({...dados,opcoes:o,referencia:"2026-09-07"});
    expect(html).not.toMatch(/R02|R99|linha de base|O que mudou|Expedição reprogramada/i);
    expect(assunto).not.toMatch(/revis|R02|R99/i);
    expect(html.includes("Avanço do cronograma:")).toBe(tipo==="ANDAMENTO");
  });
  it("revisão exige identificação e texto, e mantém baseline nos anexos", () => {
    expect(schema.safeParse({tipoEnvio:"REVISAO",tituloCliente:"Obra"}).success).toBe(false);
    const o=options("REVISAO"), dados=prepararDadosCronogramaEnvio(c,tarefas,o);
    expect(dados.tarefas[0].dataInicioBase).toBe(tarefas[0].dataInicioBase);
    expect(dados.nomes.xml).toBe("Cronograma_OP-105_R02.xml");
    const {html}=gerarEmailCronograma({...dados,opcoes:o,referencia:"2026-09-07"});
    expect(html).toContain("R02");expect(html).toContain("O que mudou nesta revisão");expect(html).toContain("TÉRMINO NA LINHA DE BASE");expect(html).toContain("Expedição reprogramada.<br>");
  });
  it("não modifica o cronograma original e não inventa uma baseline ausente", () => {
    const snapshot=JSON.stringify({c,tarefas});
    prepararDadosCronogramaEnvio(c,tarefas,options("ANDAMENTO"));
    expect(JSON.stringify({c,tarefas})).toBe(snapshot);
    const o=options("REVISAO"), semBase=tarefas.map(t=>({...t,dataInicioBase:null,dataFimBase:null}));
    const dados=prepararDadosCronogramaEnvio(c,semBase,o);
    expect(gerarEmailCronograma({...dados,opcoes:o}).html).not.toContain("TÉRMINO NA LINHA DE BASE");
  });
  it("considera apenas folhas no avanço e nas datas", () => {
    const resumo=resumoCronogramaEnvio(c,[...tarefas,{...tarefas[0],id:"s",isSummary:true,dataFimPrevista:"2027-01-01",percentualRealizado:100}]);
    expect(resumo.fim).toBe("2026-09-15");expect(resumo.percentual).toBe(28);expect(resumo.total).toBe(2);
  });
  it("escapa textos do cliente e preserva as quebras de linha", () => {
    const o={...options("ANDAMENTO"),mensagem:'<img src=x onerror="alert(1)">\nMensagem'};
    const html=gerarEmailCronograma({...prepararDadosCronogramaEnvio(c,tarefas,o),opcoes:o}).html;
    expect(html).toContain("&lt;img");expect(html).toContain("&gt;<br>Mensagem");expect(html).toContain("Cliente &amp; Filhos");
    expect(html).not.toContain('<img src=x');
  });
});

describe("pacote real de PDF e XML", () => {
  it.each(["INICIAL","ANDAMENTO","REVISAO"])("%s mantém os vínculos e aplica a seleção ao XML", async tipo => {
    const pacote=await prepararPacoteCronograma(c,tarefas,options(tipo),{name:"Planejamento"},new Date("2026-09-07T15:00:00Z"));
    expect(pacote.anexos).toHaveLength(2);
    expect(Buffer.from(pacote.anexos[0].content,"base64").subarray(0,4).toString()).toBe("%PDF");
    const xml=Buffer.from(pacote.anexos[1].content,"base64").toString();
    expect(xml.includes("<Baseline>")).toBe(tipo==="REVISAO");
    expect(xml.includes("R02")).toBe(tipo==="REVISAO");expect(xml).not.toContain("R99");
    expect(xml).toContain("<LinkLag>-9600</LinkLag>");expect(xml).toContain("<PredecessorUID>1</PredecessorUID>");
  });
  it("a conferência muda se datas, opções ou avanço mudarem", async () => {
    const now=new Date("2026-09-07T15:00:00Z"), user={name:"Planejamento"}, o=options("ANDAMENTO");
    const a=await prepararPacoteCronograma(c,tarefas,o,user,now), b=await prepararPacoteCronograma(c,tarefas,o,user,now);
    expect(a.hash).toBe(b.hash);
    const changed=await prepararPacoteCronograma(c,tarefas.map(t=>({...t,percentualRealizado:75})),o,user,now);
    expect(changed.hash).not.toBe(a.hash);
    expect((await prepararPacoteCronograma(c,tarefas,options("REVISAO"),user,now)).hash).not.toBe(a.hash);
  });
});
