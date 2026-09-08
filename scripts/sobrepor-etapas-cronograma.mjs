/* SOBREPOSIÇÃO ENTRE ETAPAS — a solda não espera a montagem fechar.

   ⚠⚠ POR QUE ISTO EXISTE. Vitor (07/09/2026): "um cronograma não pode ser em fila, quando a
   montagem já tiver uma quantidade de peças prontas a solda já tem que começar, tanto que isso
   sempre foi um erro no nosso cronograma, pois esperamos um setor estar 100% para depois
   começarmos no outro, o que não é real".

   Finish-to-start puro é ficção de planejamento: nenhuma fábrica de estrutura espera o corte
   acabar para montar. O portal já tem o campo certo — `defasagemDias` (lead/lag, negativo =
   antecipação) — e o recálculo o respeita. Faltava alguém preencher.

   ⚠ AS PORCENTAGENS SÃO MEDIDAS, NÃO ARBITRADAS. Saem dos apontamentos do Syneco: para cada obra,
   quanto do setor anterior estava pronto no dia em que o seguinte começou. Só entram obras com o
   setor anterior JÁ ENCERRADO (último apontamento há mais de 30 dias) — em obra andando o
   denominador ainda cresce e o percentual sai inflado. Medido em 07/09/2026:

       Preparação → Montagem   13 obras   mediana 76%   (faixa 12–100%)
       Montagem   → Solda      13 obras   mediana 46%   (faixa  7–100%)
       Solda      → Pintura    10 obras   mediana 46%   (faixa 10–100%)

   A faixa é larga de propósito no registro: os casos de 100% são justamente as obras em que se
   esperou o setor fechar — o erro que se está corrigindo. A MEDIANA é o comportamento de quando a
   fábrica trabalha sobreposta. Refazer a medição: scripts/ (ver o commit).

   ⚠ Montagem em 76% e não 46% não é inconsistência: montagem precisa do conjunto INTEIRO cortado,
   então depende de quase todo o corte; solda e pintura pegam peça a peça.

   ⚠ ENTRE FASES a fila continua: é a mesma bancada fazendo a fase A e depois a B. O que se
   sobrepõe é SETOR com SETOR dentro da fase. Sobrepor fase com fase é decisão de capacidade
   (quantas bancadas), não de sequência.

   Uso: node scripts/sobrepor-etapas-cronograma.mjs --op 105 [--aplicar] [--autor <e-mail>]  */
import { prisma } from "@/lib/prisma";
import { recalcularCronograma } from "@/lib/cronograma-recalcular";
import { SOBREPOSICAO, lagDaEtapa } from "@/lib/cronograma-sobreposicao";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const OP = arg("--op");
const AUTOR = arg("--autor") || "vitor@torg.com.br";
const aplicar = process.argv.includes("--aplicar");
if (!OP) { console.error("uso: --op <numero> [--aplicar]"); process.exit(1); }

// ⚠ a tabela mora em lib/cronograma-sobreposicao.js — a mesma que o cronograma NOVO usa ao
//   nascer. Duas cópias divergiriam no primeiro ajuste de medição.
const ETAPAS = ["Preparação", "Montagem", "Solda", "Pintura"];
const brd = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

const op = await prisma.oP.findFirst({ where: { numero: OP }, select: { id: true } });
const crono = await prisma.cronograma.findFirst({ where: { opId: op.id }, select: { id: true } });
const lotes = await prisma.loteExpedicao.findMany({ where: { opId: op.id }, select: { nome: true, dataPrevista: true }, orderBy: { ordem: "asc" } });
const tarefas = await prisma.cronogramaTarefa.findMany({
  where: { cronogramaId: crono.id, departamento: "FABRICACAO", isSummary: false },
  select: { id: true, nome: true, area: true, duracaoDias: true, defasagemDias: true, antecessoraIds: true },
});
const acha = (area, etapa) => tarefas.find((t) => t.area === area && t.nome === etapa);

console.log(`${aplicar ? "APLICANDO" : "SIMULAÇÃO"} — sobrepondo as etapas da OP-${OP}\n`);
const mudancas = [];
for (const l of lotes) {
  for (const etapa of ETAPAS.slice(1)) {
    const t = acha(l.nome, etapa);
    const ant = acha(l.nome, ETAPAS[ETAPAS.indexOf(etapa) - 1]);
    if (!t || !ant) continue;
    const D = ant.duracaoDias || 0;
    if (D <= 0) continue;
    /* início desejado = início da antecessora + X·D. O motor faz
       início = próximo dia útil depois do fim da antecessora + lag, e fim = início + D,
       logo o lag que leva ao ponto desejado é X·D − D − 1. */
    const lag = lagDaEtapa(etapa, D);
    if ((t.defasagemDias || 0) === lag) continue;
    mudancas.push({ id: t.id, area: l.nome, etapa, de: t.defasagemDias || 0, para: lag, base: D });
  }
}
for (const m of mudancas)
  console.log(`  ${m.area.slice(0, 30).padEnd(30)} ${m.etapa.padEnd(11)} entra com ${Math.round(SOBREPOSICAO[m.etapa] * 100)}% da anterior (${m.base}d) → defasagem ${m.de} → ${m.para}`);
console.log(`\n${mudancas.length} defasagem(ns) a gravar.`);

if (!aplicar) { console.log("Nada gravado. Rode com --aplicar."); await prisma.$disconnect(); process.exit(0); }
const autor = await prisma.user.findUnique({ where: { email: AUTOR }, select: { id: true, name: true } });
if (!autor) { console.error(`usuário ${AUTOR} não encontrado`); process.exit(1); }
for (const m of mudancas) await prisma.cronogramaTarefa.update({ where: { id: m.id }, data: { defasagemDias: m.para } });
const { updates } = await recalcularCronograma(crono.id, autor.id);
console.log(`✓ gravado por ${autor.name} · ${updates.length} data(s) recalculada(s)\n`);

const fim = await prisma.cronogramaTarefa.findMany({
  where: { cronogramaId: crono.id, departamento: "FABRICACAO", isSummary: false },
  select: { nome: true, area: true, duracaoDias: true, dataInicioPrevista: true, dataFimPrevista: true, percentualRealizado: true },
});
console.log("─── como ficou ───");
for (const l of lotes) {
  console.log(`  ${l.nome}   entrega ${brd(l.dataPrevista)}`);
  for (const etapa of ETAPAS) {
    const t = fim.find((x) => x.area === l.nome && x.nome === etapa);
    if (!t) continue;
    const passa = l.dataPrevista && t.dataFimPrevista > new Date(l.dataPrevista);
    console.log(`     ${etapa.padEnd(11)} ${brd(t.dataInicioPrevista)} → ${brd(t.dataFimPrevista)}  (${t.duracaoDias}d)` +
      `${t.percentualRealizado ? `  ${t.percentualRealizado}%` : ""}${passa ? "   ⚠ PASSA DA ENTREGA" : ""}`);
  }
}
await prisma.$disconnect();
