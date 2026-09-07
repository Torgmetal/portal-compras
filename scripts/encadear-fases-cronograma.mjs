/* Encadeia as FASES do cronograma na ordem de entrega: a fase 2 só começa depois da fase 1, em
   cada setor. Vitor (07/09/2026): "Deixe a [fase A] sendo o primeiro no cronograma" e
   "Fase (A) primeiro depois a (B) e depois a (C)".

   ⚠⚠ O PROBLEMA NÃO ERA A ORDEM DA LISTA, ERA A DAS DATAS. As quatro Preparações estavam
   penduradas em tarefas de ENGENHARIA que terminaram em 10/08, então o recálculo puxava todas
   para agosto — e as fases B e C apareciam no Gantt ANTES da A, marcadas como atrasadas. A fábrica
   não faz as quatro fases ao mesmo tempo: faz uma, depois a outra.

   ⚠ Por que mexer na ANTECESSORA e não na data: o recálculo automático roda a cada edição de
   tarefa e só respeita quem tem antecessora. Gravar data solta seria desfeito na próxima edição;
   o encadeamento sobrevive.

   ⚠ A fase que JÁ COMEÇOU fica presa no início real, via defasagem (lead/lag) — o mesmo campo que
   o portal usa quando alguém edita a data à mão. Sem isso o recálculo levaria a Preparação das
   Treliças de volta para 11/08, quando a fábrica começou a cortar em 28/08.

   Uso: node scripts/encadear-fases-cronograma.mjs --op 105 [--aplicar]  */
import { prisma } from "@/lib/prisma";
import { recalcularCronograma } from "@/lib/cronograma-recalcular";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const OP = arg("--op");
// ⚠ A REVISÃO DO CRONOGRAMA EXIGE AUTOR (CronogramaRevisao.createdById é obrigatório) — sem ele a
// transação inteira do recálculo falha. Quem pediu a mudança assina, como assinaria clicando no
// botão da tela. `--autor <e-mail>` para rodar por outra pessoa.
const AUTOR = arg("--autor") || "vitor@torg.com.br";
const aplicar = process.argv.includes("--aplicar");
if (!OP) { console.error("uso: --op <numero> [--aplicar]"); process.exit(1); }

const ETAPAS = ["Preparação", "Montagem", "Solda", "Pintura"];
const brd = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const ehUtil = (d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const uteisEntre = (a, b) => { let n = 0; const x = new Date(a); while (x < b) { x.setUTCDate(x.getUTCDate() + 1); if (ehUtil(x)) n++; } return n; };

const op = await prisma.oP.findFirst({ where: { numero: OP }, select: { id: true, numero: true } });
if (!op) { console.error(`OP ${OP} não encontrada`); process.exit(1); }
const crono = await prisma.cronograma.findFirst({ where: { opId: op.id }, select: { id: true } });
if (!crono) { console.error("OP sem cronograma"); process.exit(1); }

// ordem das fases = ordem dos LOTES DE ENTREGA (é o que o Planejamento define)
const lotes = await prisma.loteExpedicao.findMany({
  where: { opId: op.id }, select: { nome: true, ordem: true, dataPrevista: true }, orderBy: { ordem: "asc" },
});
const tarefas = await prisma.cronogramaTarefa.findMany({
  where: { cronogramaId: crono.id, departamento: "FABRICACAO", isSummary: false },
  select: { id: true, nome: true, area: true, antecessoraIds: true, defasagemDias: true,
            duracaoDias: true, dataInicioPrevista: true, dataFimPrevista: true, percentualRealizado: true },
});
const acha = (area, etapa) => tarefas.find((t) => t.area === area && t.nome === etapa);

console.log(`${aplicar ? "APLICANDO" : "SIMULAÇÃO"} — encadeando as fases da OP-${OP}\n`);
console.log("ordem das fases (pelos lotes de entrega):");
lotes.forEach((l, i) => console.log(`  ${i + 1}. ${l.nome}   entrega ${brd(l.dataPrevista)}`));

// ── 1) a fase i>0 espera a fase i-1 no MESMO setor ──
const mudancas = [];
for (const etapa of ETAPAS) {
  for (let i = 1; i < lotes.length; i++) {
    const t = acha(lotes[i].nome, etapa), ant = acha(lotes[i - 1].nome, etapa);
    if (!t || !ant) continue;
    // mantém a antecessora da etapa anterior DENTRO da fase (Montagem espera a Preparação dela)
    const dentro = etapa === "Preparação" ? [] : [acha(lotes[i].nome, ETAPAS[ETAPAS.indexOf(etapa) - 1])?.id].filter(Boolean);
    const novo = [...new Set([...dentro, ant.id])];
    const igual = novo.length === (t.antecessoraIds || []).length && novo.every((x) => t.antecessoraIds.includes(x));
    if (igual) continue;
    mudancas.push({ id: t.id, area: lotes[i].nome, etapa, novo,
      de: (t.antecessoraIds || []).map((x) => tarefas.find((y) => y.id === x)?.nome || "fora da fabricação").join(" + ") || "nenhuma",
      para: novo.map((x) => `${tarefas.find((y) => y.id === x)?.area?.slice(0, 14) || ""} · ${tarefas.find((y) => y.id === x)?.nome}`).join(" + ") });
  }
}
console.log(`\n${mudancas.length} antecessora(s) a trocar:`);
for (const m of mudancas) console.log(`  ${m.area.slice(0, 26).padEnd(26)} ${m.etapa.padEnd(11)} ${m.de}  →  ${m.para}`);

// ── 2) a primeira fase, se já começou, fica presa no início real (defasagem) ──
const prep1 = acha(lotes[0].nome, "Preparação");
let lag = null;
if (prep1 && (prep1.percentualRealizado ?? 0) > 0) {
  const r = await prisma.$queryRawUnsafe(
    `select min("dataInicio")::date d from "MesApontamento" where "opId" = $1 and "produzidoUn" > 0`, op.id);
  const real = r?.[0]?.d ? new Date(r[0].d) : null;
  if (real && prep1.dataInicioPrevista) {
    const atual = new Date(prep1.dataInicioPrevista);
    const dif = uteisEntre(atual, real) * (real >= atual ? 1 : -1);
    lag = (prep1.defasagemDias || 0) + dif;
    console.log(`\n${lotes[0].nome} · Preparação começou de fato em ${brd(real)} (previsto ${brd(atual)}) → defasagem ${lag > 0 ? "+" : ""}${lag} du`);
  }
}

if (!aplicar) { console.log("\nNada gravado. Rode com --aplicar."); await prisma.$disconnect(); process.exit(0); }

for (const m of mudancas) await prisma.cronogramaTarefa.update({ where: { id: m.id }, data: { antecessoraIds: m.novo } });
if (lag != null) await prisma.cronogramaTarefa.update({ where: { id: prep1.id }, data: { defasagemDias: lag } });
const autor = await prisma.user.findUnique({ where: { email: AUTOR }, select: { id: true, name: true } });
if (!autor) { console.error(`usuário ${AUTOR} não encontrado — passe --autor <e-mail>`); process.exit(1); }
const { updates } = await recalcularCronograma(crono.id, autor.id);
console.log(`\n✓ gravado por ${autor.name} · ${mudancas.length} antecessora(s), ${updates.length} data(s) recalculada(s) pelo motor do portal`);

// ── 3) resultado, comparado com a entrega de cada fase ──
const fim = await prisma.cronogramaTarefa.findMany({
  where: { cronogramaId: crono.id, departamento: "FABRICACAO", isSummary: false },
  select: { nome: true, area: true, duracaoDias: true, dataInicioPrevista: true, dataFimPrevista: true, percentualRealizado: true },
});
const entrega = new Map(lotes.map((l) => [l.nome, l.dataPrevista]));
console.log("\n─── como ficou ───");
for (const l of lotes) {
  console.log(`  ${l.nome}   entrega ${brd(l.dataPrevista)}`);
  for (const etapa of ETAPAS) {
    const t = fim.find((x) => x.area === l.nome && x.nome === etapa);
    if (!t) continue;
    const e = entrega.get(l.nome);
    const passa = e && t.dataFimPrevista > new Date(e);
    console.log(`     ${etapa.padEnd(11)} ${brd(t.dataInicioPrevista)} → ${brd(t.dataFimPrevista)}  (${t.duracaoDias}d)` +
      `${t.percentualRealizado ? `  ${t.percentualRealizado}%` : ""}${passa ? "   ⚠ PASSA DA ENTREGA" : ""}`);
  }
}
await prisma.$disconnect();
