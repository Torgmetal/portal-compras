// ─── AVANÇO DAS FASES NO CRONOGRAMA, PELO APONTAMENTO ──────────────────────────────────────────
//
// Vitor (07/09/2026): "com base nos apontamentos da OP 105 preciso que ajuste os percentuais que já
// avançamos dessa obra" e, sobre a chave: "T105A são das treliças, coloquei o A, B e C justamente
// para você conseguir dar baixa neles".
//
// ⚠⚠ A LETRA ENTRE PARÊNTESES NO NOME DA FASE É A CHAVE. "Treliças TC 4706 - 4707 (A)" casa com as
// marcas T105A…; "Apoio e Longarina TC - 4701 (C)" com as T105C…. Foi ele quem pôs as letras ali
// para isso — sem elas não há como ligar fase a peça, porque a LPC não conhece "Treliças".
//
// ⚠⚠ CORTE É PREPARAÇÃO. Vitor (07/09/2026), em três palavras. No Syneco são setores separados
// (Corte 10, Preparação 20); no cronograma a linha "Preparação" cobre os dois. Por isso o avanço
// dela é o MAIOR entre os dois — peça cortada já avançou a etapa, mesmo sem apontamento de
// preparação. Usar só "Preparação" mostraria 0% numa obra com 35% cortado.
//
// ⚠ O PERCENTUAL É POR PESO, não por peça: é a régua que a obra usa e a que o Vitor já aplicava no
// Recebimento da matéria prima (31.714 kg planejados, 23.337 recebidos = 73,6%). Peça de 3 kg e
// peça de 300 kg não valem o mesmo.
//
// ⚠ GRAVA `qtdePlanejada` E `qtdeRealizada` JUNTO com o percentual, no mesmo padrão dele: assim o
// número fica auditável — dá para ver de onde saiu — em vez de um percentual solto.
//
// Uso:  node --import ./_loader-reg.mjs scripts/avanco-cronograma-fase.mjs --op 105
//       node --import ./_loader-reg.mjs scripts/avanco-cronograma-fase.mjs --op 105 --aplicar
import { prisma } from "../lib/prisma.js";
import { lerProduzidoPorSetor } from "../lib/produzido-setor.js";
import { ehItemComprado } from "../lib/item-comprado.js";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const OP = arg("--op") || "105";
const aplicar = process.argv.includes("--aplicar");

// a linha do cronograma → os setores do Syneco que a alimentam
// ⚠⚠ CADA ETAPA TEM O SEU DENOMINADOR, e misturar os dois foi o erro que Vitor pegou ("a lista
// 105A não dá 50 ton correto?"). Somar `pesoTotalKg` de tudo DOBRA: a LPC traz o conjunto e os
// croquis dele, que são a mesma estrutura vista duas vezes — 54 t viravam 99 t na soma crua.
//   · o CORTE é apontado no CROQUI → base = croquis          (105A: 23.128 kg)
//   · montagem em diante é no CONJUNTO → base = conjuntos    (105A: 31.122 kg)
// Ver a mesma regra em lib/peso-op.js (`pesoRealPecas`, `pecasTekla`).
const DE_ONDE = {
  "Preparação": { setores: ["CORTE", "PREPARACAO"], base: "CROQUI" },  // ⚠ corte é preparação
  "Montagem": { setores: ["MONTAGEM"], base: "CONJUNTO" },
  "Solda": { setores: ["SOLDA"], base: "CONJUNTO" },
  "Pintura": { setores: ["PINTURA"], base: "CONJUNTO" },
};
const SETORES = [...new Set(Object.values(DE_ONDE).flatMap((x) => x.setores))];
const letraDaMarca = (m) => (String(m || "").toUpperCase().match(/^T?\d+([A-Z]+)/) || [])[1] || null;
const letraDaFase = (nome) => (String(nome || "").match(/\(([A-Z])\)\s*$/) || [])[1] || null;

const crono = await prisma.cronograma.findFirst({ where: { op: { numero: OP } }, select: { id: true } });
if (!crono) { console.log(`OP-${OP} sem cronograma`); process.exit(1); }
const tarefas = await prisma.cronogramaTarefa.findMany({
  where: { cronogramaId: crono.id, departamento: "FABRICACAO" },
  select: { id: true, nome: true, area: true, percentualRealizado: true, qtdePlanejada: true, qtdeRealizada: true },
});
const pecas = (await prisma.pecaConjunto.findMany({
  where: { op: { numero: OP }, fonte: "LPC_IMPORT" },
  select: { id: true, opId: true, marca: true, qte: true, pesoTotalKg: true, perfil: true, descricao: true, tipoPeca: true },
})).filter((p) => !ehItemComprado(p));
const feito = await lerProduzidoPorSetor(pecas.map((p) => ({ opId: p.opId, marca: p.marca })), SETORES);

// peso por letra, e peso já concluído em cada setor
const vazio = () => ({ kg: 0, setor: Object.fromEntries(SETORES.map((s) => [s, 0])) });
const porLetra = new Map();
for (const p of pecas) {
  const L = letraDaMarca(p.marca);
  if (!L) continue;
  const base = p.tipoPeca === "CROQUI" ? "CROQUI" : "CONJUNTO";
  const a = porLetra.get(L) || { CROQUI: vazio(), CONJUNTO: vazio() };
  const q = Math.max(1, p.qte || 1), kg = p.pesoTotalKg || 0;
  a[base].kg += kg;
  for (const s of SETORES) a[base].setor[s] += Math.min(1, feito({ opId: p.opId, marca: p.marca }, s) / q) * kg;
  porLetra.set(L, a);
}

// ⚠ LETRA REPETIDA NÃO SE DIVIDE. Duas fases com a mesma letra (a 105 tem duas "(B)") não têm como
// ser separadas pela marca — lançar o mesmo peso nas duas contaria o trabalho duas vezes.
const contagem = {};
for (const t of tarefas) { const L = letraDaFase(t.area); if (L) contagem[L] = (contagem[L] || 0) + 1; }
const areasPorLetra = {};
for (const t of tarefas) { const L = letraDaFase(t.area); if (L) (areasPorLetra[L] ||= new Set()).add(t.area); }

/* ─── AS DATAS ──────────────────────────────────────────────────────────────
   ⚠⚠ ATRASO QUE NÃO É REAL NÃO PODE APARECER. Vitor (07/09/2026): "os atrasos que marcou não podem
   aparecer pois não é real, precisa ajustar isso e [ajustar] a duração de cada etapa para casar com
   as datas de entrega".
   Eu tinha gerado as datas para trás a partir da entrega, com 4·4·4·6 dias fixos — e isso punha a
   Preparação da Treliças começando em 07/09 quando a fábrica corta desde 28/08 e já fez 68%. Uma
   etapa "não iniciada" que está quase pronta lê como atraso, e não é.
   A janela agora é REAL: começa quando o primeiro apontamento aconteceu (ou hoje, se nada começou)
   e termina na data de entrega da fase. As quatro etapas dividem essa janela na proporção 4:4:4:6 —
   as durações passam a servir ao prazo, em vez de o prazo servir às durações. */
const ehUtil = (d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const proxUtil = (d) => { const x = new Date(d); while (!ehUtil(x)) x.setUTCDate(x.getUTCDate() + 1); return x; };
const somaUteis = (d, n) => { const x = new Date(d); let i = 0; while (i < n) { x.setUTCDate(x.getUTCDate() + 1); if (ehUtil(x)) i++; } return x; };
const contaUteis = (a, b) => { let n = 0; const x = new Date(a); while (x < b) { x.setUTCDate(x.getUTCDate() + 1); if (ehUtil(x)) n++; } return n; };
const brd = (d) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
const PESO_ETAPA = { "Preparação": 4, "Montagem": 4, "Solda": 4, "Pintura": 6 };
const hojeUTC = (() => { const [y, m, d] = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); })();

// quando cada fase começou de fato, pelo primeiro apontamento diário da frente
const inicioReal = new Map();
for (const [L] of porLetra) {
  const r = await prisma.$queryRawUnsafe(
    `select min("dataInicio")::date d from "MesApontamento" where obra ilike $1 and "produzidoUn" > 0`,
    `%${OP}${L}%`);
  if (r?.[0]?.d) inicioReal.set(L, new Date(r[0].d));
}
const fasesLote = await prisma.loteExpedicao.findMany({
  where: { op: { numero: OP } }, select: { nome: true, dataPrevista: true },
});
const entregaDaArea = new Map(fasesLote.map((f) => [f.nome, f.dataPrevista]));

console.log(`${aplicar ? "APLICANDO" : "SIMULAÇÃO"} — avanço da OP-${OP} por fase\n`);
const updates = [];
const vistas = new Set();
for (const t of tarefas.sort((a, b) => String(a.area).localeCompare(String(b.area)) || 0)) {
  const L = letraDaFase(t.area);
  const regra = DE_ONDE[t.nome];
  if (!L) { console.log(`  ${t.area} · ${t.nome}: sem letra no nome da fase — pulando`); continue; }
  if (!regra) { console.log(`  ${t.area} · ${t.nome}: etapa sem origem no Syneco — pulando`); continue; }
  if ((areasPorLetra[L]?.size || 0) > 1) {
    if (!vistas.has(L)) { console.log(`  ⚠ letra (${L}) usada por ${areasPorLetra[L].size} fases — ${[...areasPorLetra[L]].join(" e ")} — NÃO dá para separar, pulando as duas`); vistas.add(L); }
    continue;
  }
  const d = porLetra.get(L)?.[regra.base];
  if (!d || !d.kg) { console.log(`  ${t.area} · ${t.nome}: letra (${L}) sem ${regra.base.toLowerCase()} na LPC — pulando`); continue; }
  // ⚠ o MAIOR entre os setores da etapa: peça cortada já avançou a preparação
  const kgFeito = Math.max(...regra.setores.map((s) => d.setor[s] || 0));
  const pct = Math.round((kgFeito / d.kg) * 1000) / 10;
  console.log(`  ${t.area} · ${t.nome.padEnd(11)} ${pct}%  (${Math.round(kgFeito).toLocaleString("pt-BR")} de ${Math.round(d.kg).toLocaleString("pt-BR")} kg)` +
    (t.percentualRealizado !== pct ? `   [era ${t.percentualRealizado}%]` : "   [sem mudança]"));
  updates.push({ id: t.id, area: t.area, nome: t.nome, letra: L, pct, plan: Math.round(d.kg * 100) / 100, real: Math.round(kgFeito * 100) / 100 });
}
/* ── as datas, por área — TODAS as fases ───────────────────────────────────
   ⚠ MEDIR O AVANÇO E CORRIGIR A DATA SÃO COISAS SEPARADAS. Na primeira versão eu percorria só as
   áreas que entraram em `updates`, então as duas fases "(B)" — que não dá para medir porque
   dividem a letra — ficaram com a Preparação vencida em agosto: exatamente o atraso falso que se
   mandou tirar. Não saber o percentual não autoriza a tela a acusar atraso. */
console.log("\n─── datas recalculadas (início real → entrega) ───");
const datas = new Map();
for (const area of [...new Set(tarefas.map((t) => t.area))].sort()) {
  const L = letraDaFase(area);
  const fim = entregaDaArea.get(area);
  if (!fim) { console.log(`  ${area}: sem data de entrega no lote — datas mantidas`); continue; }
  const ini = proxUtil((L && inicioReal.get(L)) || hojeUTC);
  const total = Math.max(4, contaUteis(ini, new Date(fim)));
  const soma = Object.values(PESO_ETAPA).reduce((a, b) => a + b, 0);
  console.log(`  ${area}  ${brd(ini)} → ${brd(new Date(fim))}  (${total} dias úteis)` +
    (L && inicioReal.has(L) ? "  [início pelo 1º apontamento]" : "  [nada começou: início hoje]"));
  let cursor = new Date(ini);
  const ordem = ["Preparação", "Montagem", "Solda", "Pintura"];
  ordem.forEach((etapa, i) => {
    const pctEtapa = updates.find((u) => u.area === area && u.nome === etapa)?.pct ?? 0;
    // ⚠ a última etapa recebe o resto, para o fim cair EXATAMENTE na entrega — repartir por
    // proporção e arredondar quatro vezes sobra ou falta um dia, e um dia aqui vira atraso na tela.
    const dias = i === ordem.length - 1
      ? Math.max(1, contaUteis(cursor, new Date(fim)) + 1)
      : Math.max(1, Math.round((total * PESO_ETAPA[etapa]) / soma));
    let fimEtapa = somaUteis(cursor, dias - 1);
    /* ⚠⚠ ETAPA INACABADA NÃO TERMINA NO PASSADO. Vitor (07/09/2026): "os atrasos que marcou não
       podem aparecer pois não é real". A repartição proporcional punha a Preparação da Treliças
       terminando em 03/09 com 68% feito no dia 07 — a tela leria atraso onde há trabalho em curso.
       Quem não fechou 100% tem prazo de HOJE em diante; as seguintes escorregam junto. Se com isso
       a última passar da entrega, aí o atraso é REAL e deve mesmo aparecer. */
    if (pctEtapa < 100 && fimEtapa < hojeUTC) fimEtapa = new Date(hojeUTC);
    const diasReais = Math.max(1, contaUteis(cursor, fimEtapa) + 1);
    datas.set(`${area}|${etapa}`, { ini: new Date(cursor), fim: fimEtapa, dias: diasReais });
    const marca = fimEtapa > new Date(fim) ? "  ⚠ passa da entrega" : "";
    console.log(`     ${etapa.padEnd(11)} ${brd(cursor)} → ${brd(fimEtapa)}  (${diasReais}d)${pctEtapa ? `  ${pctEtapa}% feito` : ""}${marca}`);
    cursor = proxUtil(somaUteis(fimEtapa, 1));
  });
}

const idPorChave = new Map(tarefas.map((t) => [`${t.area}|${t.nome}`, t.id]));
const pctPorChave = new Map(updates.map((u) => [`${u.area}|${u.nome}`, u]));
const chaves = [...idPorChave.keys()].filter((k) => datas.has(k) || pctPorChave.has(k));
console.log(`\n${chaves.length} tarefa(s) a atualizar — ${updates.length} com percentual medido, ${datas.size} com data recalculada.`);
if (!aplicar) { console.log("Nada gravado. Rode com --aplicar."); await prisma.$disconnect(); process.exit(0); }
for (const k of chaves) {
  const u = pctPorChave.get(k);
  const d = datas.get(k);
  await prisma.cronogramaTarefa.update({
    where: { id: idPorChave.get(k) },
    data: {
      ...(u ? { percentualRealizado: u.pct, qtdePlanejada: u.plan, qtdeRealizada: u.real } : {}),
      ...(d ? { dataInicioPrevista: d.ini, dataFimPrevista: d.fim, duracaoDias: d.dias } : {}),
    },
  });
}
await prisma.auditLog.create({
  data: { action: "CRONOGRAMA_AVANCO", entity: "Cronograma", entityId: crono.id,
          diff: { op: OP, tarefas: chaves.length, comPercentual: updates.length, comData: datas.size, regra: "peso concluído ÷ peso da fase pela letra da marca; Preparação mede sobre CROQUIS (é onde o corte é apontado) e as demais sobre CONJUNTOS; datas do 1º apontamento até a entrega, repartidas 4:4:4:6",
                  motivo: "Vitor 07/09/2026: ajustar os percentuais pelos apontamentos" } },
}).catch(() => {});
console.log("✓ gravado, com AuditLog.");
await prisma.$disconnect();
