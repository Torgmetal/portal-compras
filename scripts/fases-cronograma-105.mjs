// ─── AS FASES DA OP-105 NO CRONOGRAMA ──────────────────────────────────────────────────────────
//
// Vitor (07/09/2026): "cada fase precisa ter preparação, montagem, solda e pintura igual fizemos
// nos demais" e, sobre as linhas atuais, "as atuais pode excluir e criar as novas".
//
// A 105 tinha 4 linhas de fabricação — "Fabricação - TC - 4706" e irmãs — sem área e com duração
// ZERO, indo de 20/08 até a entrega. Não eram tarefas, eram rótulos.
//
// ⚠⚠ O MOLDE É A OP-089, medido e copiado: nome simples ("Preparação"), a ÁREA é que carrega a fase,
// nível 2, encadeadas em finish-to-start e em DIAS ÚTEIS. A cadeia lá é
// Detalhamento (Engenharia) → Preparação → Montagem → Solda → Pintura, e é a mesma aqui: a
// antecessora da Preparação é a tarefa de Engenharia com o nome da fase, que a 105 já tem.
//
// ⚠ DURAÇÃO 4·4·4·6 DIAS ÚTEIS é o padrão da 089, não uma medição da 105. Vitor foi avisado disso
// antes de mandar seguir. Se a obra tiver peça mais pesada, é aqui que se muda.
//
// ⚠ ANCORADO NO FIM, não no início: cada fase termina na `dataPrevista` do lote de entrega e as
// quatro etapas caminham para trás. A data de entrega é o compromisso; o início é consequência.
//
// Uso:  node --import ./_loader-reg.mjs scripts/fases-cronograma-105.mjs
//       node --import ./_loader-reg.mjs scripts/fases-cronograma-105.mjs --aplicar
import { prisma } from "../lib/prisma.js";

const ETAPAS = [["Preparação", 4], ["Montagem", 4], ["Solda", 4], ["Pintura", 6]];
const aplicar = process.argv.includes("--aplicar");
const OP = "105";

const ehUtil = (d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const proxUtil = (d) => { const x = new Date(d); while (!ehUtil(x)) x.setUTCDate(x.getUTCDate() + 1); return x; };
const somaUteis = (d, n) => { const x = new Date(d); let i = 0; while (i < n) { x.setUTCDate(x.getUTCDate() + 1); if (ehUtil(x)) i++; } return x; };
const tiraUteis = (d, n) => { const x = new Date(d); let i = 0; while (i < n) { x.setUTCDate(x.getUTCDate() - 1); if (ehUtil(x)) i++; } return x; };
const br = (d) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");

const crono = await prisma.cronograma.findFirst({ where: { op: { numero: OP } }, select: { id: true, tipoDias: true } });
if (!crono) { console.log(`OP-${OP} sem cronograma`); process.exit(1); }
const fases = await prisma.loteExpedicao.findMany({
  where: { op: { numero: OP } }, select: { nome: true, ordem: true, dataPrevista: true }, orderBy: { ordem: "asc" },
});
const todas = await prisma.cronogramaTarefa.findMany({
  where: { cronogramaId: crono.id },
  select: { id: true, uidMpp: true, nome: true, departamento: true, area: true, antecessoraIds: true, duracaoDias: true },
});
const antigas = todas.filter((t) => t.departamento === "FABRICACAO");

// ⚠ NINGUÉM PODE DEPENDER DO QUE VAI SAIR. Apagar tarefa que é antecessora de outra deixa a outra
// solta e o recálculo do cronograma passa a errar em silêncio.
const idsAntigas = new Set(antigas.map((t) => t.id));
const presas = todas.filter((t) => !idsAntigas.has(t.id) && t.antecessoraIds.some((i) => idsAntigas.has(i)));
console.log(`${aplicar ? "APLICANDO" : "SIMULAÇÃO"} — cronograma da OP-${OP} (dias: ${crono.tipoDias})\n`);
console.log(`a excluir: ${antigas.length} tarefa(s) de FABRICACAO`);
for (const t of antigas) console.log(`   − ${t.nome} (dur ${t.duracaoDias}d)`);
if (presas.length) {
  console.log(`\n⚠ ABORTADO: ${presas.length} tarefa(s) dependem delas — ${presas.map((t) => t.nome).join(", ")}`);
  process.exit(1);
}
console.log("   nenhuma outra tarefa depende delas — seguro excluir\n");

let uid = Math.max(0, ...todas.map((t) => t.uidMpp || 0));
const novas = [];
for (const f of fases) {
  if (!f.dataPrevista) { console.log(`⚠ ${f.nome}: sem data prevista, pulando`); continue; }
  // a antecessora da Preparação é a tarefa de Engenharia com o nome da fase
  const eng = todas.find((t) => t.departamento === "ENGENHARIA" && norm(t.nome) === norm(f.nome));
  const totalUteis = ETAPAS.reduce((s, [, d]) => s + d, 0);
  let ini = proxUtil(tiraUteis(new Date(f.dataPrevista), totalUteis));
  let anterior = null;
  console.log(`${f.nome}  (entrega ${br(new Date(f.dataPrevista))}${eng ? `, após "${eng.nome}"` : ", SEM tarefa de engenharia correspondente"})`);
  for (const [nome, dias] of ETAPAS) {
    const fim = somaUteis(ini, dias - 1);
    novas.push({
      cronogramaId: crono.id, uidMpp: ++uid, nome, area: f.nome, departamento: "FABRICACAO",
      dataInicioPrevista: new Date(ini), dataFimPrevista: new Date(fim),
      duracaoDias: dias, outlineLevel: 2, isSummary: false,
      _antecessora: anterior === null ? (eng?.id || null) : "__ANTERIOR__",
    });
    console.log(`   ${nome.padEnd(11)} ${br(ini)} → ${br(fim)}  (${dias}d)`);
    anterior = nome;
    ini = proxUtil(somaUteis(fim, 1));
  }
}
console.log(`\ntotal a criar: ${novas.length} tarefas`);
if (!aplicar) { console.log("\nNada gravado. Rode com --aplicar."); await prisma.$disconnect(); process.exit(0); }

await prisma.$transaction(async (tx) => {
  await tx.cronogramaTarefa.deleteMany({ where: { id: { in: [...idsAntigas] } } });
  // ⚠ cria em ordem e amarra a antecessora com o ID recém-criado — por isso não é createMany
  let anteriorId = null, areaAtual = null;
  for (const n of novas) {
    const { _antecessora, ...dados } = n;
    if (areaAtual !== n.area) { anteriorId = null; areaAtual = n.area; }
    const antecessoraIds = _antecessora === "__ANTERIOR__"
      ? (anteriorId ? [anteriorId] : [])
      : (_antecessora ? [_antecessora] : []);
    const criada = await tx.cronogramaTarefa.create({ data: { ...dados, antecessoraIds } });
    anteriorId = criada.id;
  }
  await tx.auditLog.create({
    data: { action: "CRONOGRAMA_FASES", entity: "Cronograma", entityId: crono.id,
            diff: { op: OP, excluidas: antigas.map((t) => t.nome), criadas: novas.length,
                    padrao: "OP-089: Preparação 4d · Montagem 4d · Solda 4d · Pintura 6d (dias úteis)",
                    motivo: "Vitor 07/09/2026: cada fase precisa ter preparação, montagem, solda e pintura" } },
  }).catch(() => {});
});
console.log(`\n✓ ${antigas.length} excluída(s), ${novas.length} criada(s), com AuditLog.`);
await prisma.$disconnect();
