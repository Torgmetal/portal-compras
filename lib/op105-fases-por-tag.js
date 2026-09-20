// ─── OP-105 (BIANCHINI / TMSA): FASES DE ENTREGA COM LISTA DE PEÇAS, PARA O CRONOGRAMA MEDIR POR TAG ──
//
// Tarefa da Manutenção (Admin › Manutenção). Vitor (20/09/2026): o cliente pediu o cronograma de
// fabricação separado por fase — as duas entregas B (Quadros Vasadores e Longarinas) e as duas
// treliças A (TC 4706 e TC 4707) — "deixar o percentual exatamente como está o apontamento".
//
// O que esta tarefa faz, tudo ADITIVO e IDEMPOTENTE (rodar de novo não repete nada):
//
//  1. Troca a chave da LPC da fase C, gravada em 03/09 sob o NÚMERO da obra ("105") para a FASE
//     ("T105C") — ver lib/lpc-chave.js. Sob "105" ela nunca aparece como fase C. É UPDATE de
//     `opNumero`, não apaga linha nenhuma; preserva status, produção sincronizada e vínculos.
//  2. Divide a fase "Treliças TC 4706 - 4707 (A)" em duas — "Treliças TC 4706 (A)" e "Treliças TC
//     4707 (A)" — e leva as áreas e as tarefas do cronograma junto (as linhas "… - TC4707" vão para a
//     nova área). ⚠ A LETRA CONTINUA A nas duas: o modelo do Tekla já saiu assim ("como já fizemos
//     isso no Tekla vamos ter que deixar as treliças como A"). Quem separa é a lista, não a letra.
//  3. Grava a lista de peças de cada fase (`PecaLote`) a partir de lib/op105-fases-por-tag.json —
//     marca e quantidade por fase. É essa lista que o motor de avanço passa a usar
//     (lib/cronograma-lotes.js).
//  4. Devolve ao AUTOMÁTICO as linhas de fabricação das cinco fases. "Preparação - TC4706" estava
//     marcada `avancoManual` (do dia 07/09, quando o % não entrava) e a regra da casa — manual
//     prevalece — a deixava em 0% ao lado de uma Montagem a 41,8%. Vitor (20/09/2026): "verifica
//     pois os percentuais de preparação você não avançou". É decisão explícita dele para ESTA obra:
//     "o percentual exatamente como está o apontamento".
//
// ⚠ A LPC da fase B (T105B- LPC_R00.xlsx) NÃO é importada aqui: importação de lista é pela tela de
// Engenharia › Listas, que arquiva o arquivo e registra a revisão. A lista da fase B fica gravada
// mesmo assim; o motor só passa a medir a fase B quando as peças entrarem.
//
// ⚠ Caso único desta obra, de propósito. Vitor (08/09/2026): "somente dessa obra, pois não havíamos
// feito coisas separadas" — nas próximas, cada fase nasce como frente própria no Tekla.
import dados from "@/lib/op105-fases-por-tag.json";
import { chaveNomeLote } from "@/lib/cronograma-lotes";

const RX_4707 = /TC\s*-?\s*4707/i;

async function op(prisma) {
  return prisma.oP.findFirst({ where: { numero: dados.op }, select: { id: true } });
}

async function lotesDaOp(prisma, opId) {
  const lotes = await prisma.loteExpedicao.findMany({ where: { opId }, select: { id: true, nome: true, ordem: true, local: true, dataPrevista: true, _count: { select: { pecas: true } } } });
  const por = new Map(lotes.map((l) => [chaveNomeLote(l.nome), l]));
  return { lotes, por };
}

/** O que ainda falta fazer, para a tela dizer antes do clique. */
export async function checarOp105(prisma) {
  const o = await op(prisma);
  if (!o) return { falta: false, detalhe: `OP-${dados.op} não encontrada` };
  const partes = [];

  const rechavear = await prisma.pecaConjunto.count({ where: { opId: o.id, opNumero: dados.rechavear.de, fonte: "LPC_IMPORT", marca: { in: dados.rechavear.marcas } } });
  if (rechavear) partes.push(`${rechavear} linha(s) da fase C ainda sob a chave "${dados.rechavear.de}"`);

  const { por } = await lotesDaOp(prisma, o.id);
  const antiga = por.get(chaveNomeLote(dados.loteA.nomeAtual));
  const nova = por.get(chaveNomeLote(dados.loteA.nome4707));
  if (antiga || !nova) partes.push("fase A ainda não dividida em TC 4706 / TC 4707");

  let faltamPecas = 0;
  for (const l of dados.lotes) {
    const lote = por.get(chaveNomeLote(l.nome));
    if (!lote) { faltamPecas += l.marcas.length; continue; }
    const tem = await prisma.pecaLote.count({ where: { loteId: lote.id, marca: { in: l.marcas.map((m) => m.marca) } } });
    faltamPecas += Math.max(0, l.marcas.length - tem);
  }
  if (faltamPecas) partes.push(`${faltamPecas} marca(s) sem lista de fase`);
  const manuais = await prisma.cronogramaTarefa.count({ where: { cronograma: { opId: o.id }, departamento: "FABRICACAO", avancoManual: true, area: { in: dados.lotes.map((l) => l.nome) } } });
  if (manuais) partes.push(`${manuais} linha(s) de fabricação ainda em avanço manual`);

  return { falta: partes.length > 0, detalhe: partes.join(" · ") || "fases, listas e chave da LPC em dia" };
}

// 1) chave da fase C — pulando as marcas que já existem sob a chave nova (unique opNumero+marca).
// ⚠⚠ EM LOTE, NÃO MARCA A MARCA. A primeira versão fazia duas consultas por marca aqui e duas por
// marca nas listas (~330 idas ao Neon, uma atrás da outra): a rota de manutenção tem 60 s na Vercel,
// estourou no meio das listas e o Vitor recebeu um erro sem sentido no navegador (20/09/2026).
async function rechavearFaseC(prisma, opId) {
  const jaTem = new Set((await prisma.pecaConjunto.findMany({ where: { opId, opNumero: dados.rechavear.para, marca: { in: dados.rechavear.marcas } }, select: { marca: true } })).map((x) => x.marca));
  const faltam = dados.rechavear.marcas.filter((m) => !jaTem.has(m));
  const r = faltam.length ? await prisma.pecaConjunto.updateMany({ where: { opId, opNumero: dados.rechavear.de, fonte: "LPC_IMPORT", marca: { in: faltam } }, data: { opNumero: dados.rechavear.para } }) : { count: 0 };
  return { rechaveadas: r.count, puladas: jaTem.size };
}

// 2) fase A em duas — o lote (renomeia a antiga, cria a 4707 logo depois na ordem de entrega)
async function dividirLoteA(prisma, opId) {
  const { lotes, por } = await lotesDaOp(prisma, opId);
  const antiga = por.get(chaveNomeLote(dados.loteA.nomeAtual));
  let lote4706 = por.get(chaveNomeLote(dados.loteA.novoNome4706)) || null;
  const feito = [];
  if (antiga && !lote4706) {
    lote4706 = await prisma.loteExpedicao.update({ where: { id: antiga.id }, data: { nome: dados.loteA.novoNome4706 }, select: { id: true, nome: true, ordem: true, local: true, dataPrevista: true } });
    feito.push(`fase "${dados.loteA.nomeAtual}" renomeada para "${dados.loteA.novoNome4706}"`);
  }
  let lote4707 = por.get(chaveNomeLote(dados.loteA.nome4707)) || null;
  if (!lote4707 && lote4706) {
    for (const l of lotes.filter((x) => x.ordem > lote4706.ordem)) await prisma.loteExpedicao.update({ where: { id: l.id }, data: { ordem: l.ordem + 1 } });
    lote4707 = await prisma.loteExpedicao.create({
      data: { opId, nome: dados.loteA.nome4707, ordem: lote4706.ordem + 1, local: lote4706.local, dataPrevista: lote4706.dataPrevista },
      select: { id: true, nome: true, ordem: true },
    });
    feito.push(`fase "${dados.loteA.nome4707}" criada (ordem ${lote4707.ordem})`);
  }
  return { lote4706, lote4707, feito };
}

// 2b) as áreas e as tarefas de TODO cronograma da OP (a tela e o cliente leem a área pelo nome)
async function realocarCronogramas(prisma, opId) {
  const cronogramas = await prisma.cronograma.findMany({ where: { opId }, select: { id: true, areas: true } });
  let movidas = 0;
  for (const c of cronogramas) {
    const areas = Array.isArray(c.areas) ? c.areas.slice() : [];
    const iAntiga = areas.findIndex((a) => chaveNomeLote(a?.nome) === chaveNomeLote(dados.loteA.nomeAtual));
    if (iAntiga >= 0) areas[iAntiga] = { ...areas[iAntiga], nome: dados.loteA.novoNome4706 };
    if (!areas.some((a) => chaveNomeLote(a?.nome) === chaveNomeLote(dados.loteA.nome4707))) {
      const cores = areas.map((a) => Number(a?.cor) || 0);
      areas.push({ cor: cores.length ? Math.max(...cores) + 1 : 0, nome: dados.loteA.nome4707 });
    }
    if (JSON.stringify(areas) !== JSON.stringify(c.areas)) await prisma.cronograma.update({ where: { id: c.id }, data: { areas } });
    const r1 = await prisma.cronogramaTarefa.updateMany({ where: { cronogramaId: c.id, area: dados.loteA.nomeAtual }, data: { area: dados.loteA.novoNome4706 } });
    const na4706 = await prisma.cronogramaTarefa.findMany({ where: { cronogramaId: c.id, area: dados.loteA.novoNome4706 }, select: { id: true, nome: true } });
    const ids4707 = na4706.filter((t) => RX_4707.test(t.nome)).map((t) => t.id);
    const r2 = ids4707.length ? await prisma.cronogramaTarefa.updateMany({ where: { id: { in: ids4707 } }, data: { area: dados.loteA.nome4707 } }) : { count: 0 };
    movidas += r1.count + r2.count;
  }
  return movidas;
}

// 4) as linhas de fabricação das fases com lista voltam ao automático (só as da OP-105)
async function voltarAoAutomatico(prisma, opId) {
  const nomes = dados.lotes.map((l) => l.nome);
  const r = await prisma.cronogramaTarefa.updateMany({
    where: { cronograma: { opId }, departamento: "FABRICACAO", avancoManual: true, area: { in: nomes } },
    data: { avancoManual: false },
  });
  return r.count;
}

// 3) listas de peças por fase — peso unitário da LPC quando a marca já entrou, senão o da lista do
// cliente. Uma leitura do que já existe, um createMany do que falta, e update só de quantidade que mudou.
async function gravarListas(prisma, opId) {
  const { por } = await lotesDaOp(prisma, opId);
  const lpc = await prisma.pecaConjunto.findMany({ where: { opId, naLPC: true }, select: { marca: true, qte: true, pesoTotalKg: true } });
  const pesoLpc = new Map(lpc.map((x) => [x.marca, x.qte > 0 ? (x.pesoTotalKg || 0) / x.qte : null]));
  const existentes = await prisma.pecaLote.findMany({ where: { opId }, select: { id: true, loteId: true, marca: true, qtd: true } });
  const chave = (loteId, marca) => `${loteId}|${marca}`;
  const ja = new Map(existentes.map((x) => [chave(x.loteId, x.marca), x]));
  const criar = [];
  let atualizadas = 0;
  const semLote = [];
  for (const l of dados.lotes) {
    const lote = por.get(chaveNomeLote(l.nome));
    if (!lote) { semLote.push(l.nome); continue; }
    for (const m of l.marcas) {
      const pesoUnit = pesoLpc.get(m.marca) ?? m.pesoUnitKg ?? null;
      const data = { qtd: m.qtd, descricao: m.descricao || null, pesoUnitKg: pesoUnit, pesoTotalKg: pesoUnit != null ? pesoUnit * m.qtd : (m.pesoTotalKg ?? null) };
      const atual = ja.get(chave(lote.id, m.marca));
      if (!atual) { criar.push({ opId, loteId: lote.id, marca: m.marca, ...data }); continue; }
      if (atual.qtd !== m.qtd) { await prisma.pecaLote.update({ where: { id: atual.id }, data }); atualizadas++; }
    }
  }
  const criadas = criar.length ? (await prisma.pecaLote.createMany({ data: criar })).count : 0;
  return { criadas, atualizadas, semLote };
}

/** Aplica os três passos. Devolve o resumo para a tela e para a auditoria. */
export async function aplicarOp105(prisma, user) {
  const o = await op(prisma);
  if (!o) return `OP-${dados.op} não encontrada`;
  const feito = [];

  const { rechaveadas, puladas } = await rechavearFaseC(prisma, o.id);
  if (rechaveadas || puladas) feito.push(`fase C: ${rechaveadas} linha(s) passaram de "${dados.rechavear.de}" para "${dados.rechavear.para}"${puladas ? ` (${puladas} já estavam)` : ""}`);

  const { lote4706, lote4707, feito: feitoLote } = await dividirLoteA(prisma, o.id);
  feito.push(...feitoLote);
  const tarefasMovidas = await realocarCronogramas(prisma, o.id);
  if (tarefasMovidas) feito.push(`${tarefasMovidas} tarefa(s) do cronograma realocada(s) entre as áreas`);

  const { criadas, atualizadas, semLote } = await gravarListas(prisma, o.id);
  if (criadas || atualizadas) feito.push(`lista de peças: ${criadas} marca(s) gravada(s)${atualizadas ? `, ${atualizadas} corrigida(s)` : ""} em ${dados.lotes.length} fases`);
  if (semLote.length) feito.push(`⚠ fase(s) sem lote cadastrado, lista não gravada: ${semLote.join(", ")}`);
  const automaticas = await voltarAoAutomatico(prisma, o.id);
  if (automaticas) feito.push(`${automaticas} linha(s) de fabricação voltaram ao avanço automático`);

  const resumo = feito.length ? feito.join(" · ") : "nada a fazer — já estava aplicado";
  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "OP105_FASES_POR_TAG", entity: "OP", entityId: o.id,
            diff: { resumo, rechaveadas, puladas, tarefasMovidas, criadas, atualizadas, automaticas, lote4706: lote4706?.id || null, lote4707: lote4707?.id || null } },
  }).catch(() => {});
  return resumo;
}
