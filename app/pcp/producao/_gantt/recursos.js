import { META_KG_DIA_ACABAMENTO, META_KG_DIA_JATO } from "@/lib/capacidade-acabamento";
import { META_KG_DIA_PINTURA } from "@/lib/capacidade-pintura";

// ─── RECURSOS, SETORES E CORES ─────────────────────────────────────────────────────────────────
//
// ⚠ AS CAPACIDADES SÃO MEDIDAS, NÃO ESCOLHIDAS. Os kg/dia do corte saem do p75 dos apontamentos do
// Syneco (ver o commit 4481aa33); montagem e solda valem 1 bancada-dia e o custo real de cada
// conjunto vem de lib/montagem-capacidade e lib/solda-capacidade. Mudar um número aqui muda o prazo
// que o portal promete — não é ajuste de tela.

export const RECURSOS = {
  CORTE: [
    { k:null, nome:"sem máquina", obs:"atribuir laser" },
    { k:"LASER_PERFIL", nome:"Laser Perfil", cap:2843 },
    { k:"LASER_CHAPA", nome:"Laser Chapa", cap:2407 },
    { k:"LASER_TUBO", nome:"Laser Tubo", cap:1864 },
    { k:"LASER_CANTONEIRA", nome:"Laser Cantoneira", cap:1065 },
    { k:"CORTE_MANUAL", nome:"Corte Manual", cap:419 },
  ],
  MONTAGEM: [{ k:null, nome:"sem bancada", obs:"atribuir bancada" },
    ...["MONTAGEM 1","MONTAGEM 2","MONTAGEM 3","MONTAGEM 4","MONTAGEM 5"].map(n=>({k:n,nome:n,cap:1}))],
  SOLDA: [{ k:null, nome:"sem bancada", obs:"atribuir bancada" },
    ...["SOLDA 1","SOLDA 2","SOLDA 4","SOLDA 5","SOLDA 6","SOLDA 7"].map(n=>({k:n,nome:n,cap:1}))],
  // ⚠⚠ ACABAMENTO TEM UMA BANCADA SÓ, e é isso que o faz caber no quadro sem conceito novo. Vitor
  // (06/09/2026): "não temos bancadas (…) selecionar a bancada única do acabamento". Escolher a
  // bancada vira um clique; a decisão que sobra é QUAL OP e QUAL DIA — que é o arraste que já
  // existe. A capacidade é em kg/dia, como o corte, não em bancada-dia: aqui não há régua de peças
  // por faixa de peso, o setor é um só.
  ACABAMENTO: [{ k:null, nome:"sem bancada", obs:"atribuir" },
    { k:"ACABAMENTO", nome:"Acabamento", cap: META_KG_DIA_ACABAMENTO }],
  // ⚠⚠ O JATO TEM DUAS. Vitor (06/09/2026): "temos dois jatos, o turbina e o manual". Elas dividem
  // a meta do setor; a repartição entre as duas é do PCP com o líder, como no corte.
  JATO: [{ k:null, nome:"sem bancada", obs:"atribuir jato" },
    { k:"JATO_TURBINA", nome:"Jato Turbina", cap: Math.round(META_KG_DIA_JATO / 2) },
    { k:"JATO_MANUAL", nome:"Jato Manual", cap: Math.round(META_KG_DIA_JATO / 2) }],
  // ⚠⚠ NA PINTURA O POSTO É O GALPÃO. Vitor (06/09/2026): "temos galpões separados, hoje tem o
  // galpão 1 que fica na Torg onde pintamos quase todas as estruturas, e o Galpão 2 que seria um
  // galpão apoio que pintamos peças leves, como chapas, travamentos, coisa que daria para virar na
  // mão, até guarda-corpo". O terceiro barracão está em negociação e NÃO entra até fechar.
  //
  // ⚠ A CAPACIDADE ESTÁ DIVIDIDA AO MEIO como no jato, e isso é um chute honesto: ninguém mediu
  // quanto cada galpão pinta por dia. Quando esse número existir, é aqui que se acerta.
  PINTURA: [{ k:null, nome:"sem galpão", obs:"atribuir galpão" },
    { k:"GALPAO_1", nome:"Galpão 1", cap: Math.round(META_KG_DIA_PINTURA / 2) },
    { k:"GALPAO_2", nome:"Galpão 2", cap: Math.round(META_KG_DIA_PINTURA / 2) }],
};
export const SETORES = ["CORTE","MONTAGEM","SOLDA","ACABAMENTO","JATO","PINTURA"];
export const COR_SETOR = { CORTE:"#8e5cd9", MONTAGEM:"#006EAB", SOLDA:"#c2410c",
                           ACABAMENTO:"#0f766e", JATO:"#3730a3", PINTURA:"#9d174d" };
// ⚠ acabamento e jato já são medidos contra a META (cap em kg/dia da meta), então o fator é 1:
// não existe "ritmo normal" separado para eles como há na montagem e na solda.
export const FATOR_META = { MONTAGEM:0.47, SOLDA:0.58, CORTE:1, ACABAMENTO:1, JATO:1, PINTURA:1 };

export const capDe = (setor, rec)=> (RECURSOS[setor].find(r=>r.k===rec)||{}).cap || 0;
export const nomeRec = (setor, rec)=> (RECURSOS[setor].find(r=>r.k===rec)||{}).nome || "sem recurso";

const PALETA = ["#0D1F3C","#006EAB","#0f766e","#b45309","#7c2d92","#be123c","#4d7c0f","#0369a1",
                "#9a3412","#3730a3","#065f46","#a16207"];

/* ⚠ O VERMELHO SAIU DA PALETA DE OP de propósito: ele significa ATRASO, e uma OP que por acaso
   caísse na cor vermelha pareceria atrasada o tempo todo. Vitor (05/09/2026): "vamos deixar o
   vermelho apenas para atraso". */
export function criarCores(lotes){
  const ops = [...new Set(lotes.map(l=>l.op))].sort();
  const porOp = new Map(ops.map((op,i)=>[op, PALETA[i%PALETA.length]]));
  const corDaOp = (op)=>porOp.get(op) || "#5b6a7d";
  /* o mesmo tom da OP, esmaecido: é o fundo de "programado e ainda não apontado" */
  const tintaOp = (op)=>{ const h = corDaOp(op).replace("#","");
    const n = parseInt(h.length===3 ? h.split("").map(c=>c+c).join("") : h, 16);
    return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+",.13)"; };
  return { corDaOp, tintaOp };
}
