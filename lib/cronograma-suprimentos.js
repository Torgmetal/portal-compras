import "server-only";
import { familiaMaterial, pesoNaFamilia, FAMILIAS } from "./familia-material";

// AVANÇO AUTOMÁTICO DAS LINHAS DE SUPRIMENTOS do cronograma — mesmo molde do
// `lib/cronograma-syneco.js`, que já faz isso pra Fabricação.
//
// Vitor (19/08/2026): "com a emissão das RMs temos o prazo real do início das cotações e com o
// pedido temos o término… para a linha de recebimento de materiais seria o caso de irmos casando
// com os recebimentos conforme andamento do setor de compras — temos o histórico disso e podemos
// dar baixa de acordo com esses recebimentos, isso deve ser automático".
//
// COTAÇÃO   → começa na 1ª RM emitida, fecha quando todo o escopo virou pedido (ou saiu do estoque)
// RECEBIMENTO → começa no 1º recebimento, fecha quando todo o escopo chegou
//
// A fonte do recebimento é o histórico que já existe: `Recebimento` (CMR, Omie e manual).
//
// ⚠️ **DENOMINADOR CONGELADO** (Vitor escolheu a opção B). O escopo é gravado em `qtdePlanejada`
// na PRIMEIRA vez que a linha é calculada e não sobe mais. RM nova depois disso não empurra a
// barra pra trás — mas também não some: entra na `observacao` como "escopo cresceu X depois do
// congelamento", pra ninguém achar que 100% quer dizer que acabou.
//
// ⚠️ **UNIDADE POR FAMÍLIA** (`lib/familia-material.js`): kg só no aço. Parafuso vem em Pç sem
// peso, tinta em galão e balde — somar isso não significa nada, então ali a conta é de ITENS
// atendidos.
//
// 🚫 **NÃO dá pra separar por ÁREA**: a RM não tem campo de área (nem RM nem RMItem). Vitor pediu
// a possibilidade; enquanto o campo não existir, Suprimentos é uma linha por família, por obra.

const FECHADO = 0.95; // item conta como recebido com 95% do pedido (mesma tolerância da conciliação)

/** Nome da linha → família. O que manda é o nome da tarefa no cronograma. */
export const LINHA_FAMILIA = [
  [/mat[eé]ria[- ]prima|a[çc]o\b/i, "ACO"],
  [/parafus|fixa[çc]/i, "FIXACAO"],
  [/tinta|pintura\s+material/i, "TINTA"],
  [/cobertura|telha|calha|rufo|grade\s+de\s+piso/i, "COBERTURA"],
];
export function familiaDaLinha(nome) {
  for (const [rx, f] of LINHA_FAMILIA) if (rx.test(String(nome || ""))) return f;
  return null;
}
export const ehLinhaCotacao = (nome) => /cota[çc]/i.test(String(nome || ""));
export const ehLinhaRecebimento = (nome) => /recebimento|recebe/i.test(String(nome || ""));
export const ehLinhaPedidoCliente = (nome) => /pedido\s+de\s+compra.*cliente|cliente.*pedido\s+de\s+compra/i.test(String(nome || ""));

/**
 * Situação de suprimentos da OP, por família.
 * @param {Date|null} desde só conta RM emitida a partir daqui (ver `recorteDeEscopo`)
 * @returns {Promise<{porFamilia: Record<string, object>, fd: object}>}
 */
export async function situacaoSuprimentos(prisma, opId, desde = null) {
  const itens = await prisma.rMItem.findMany({
    where: { rm: { opId, ...(desde ? { createdAt: { gte: desde } } : {}) }, canceladoEm: null },
    select: {
      id: true, descricao: true, peso: true, status: true, atendidoEstoqueEm: true,
      rm: { select: { numero: true, createdAt: true, faturamentoDireto: true } },
      pedidoOmie: { select: { numeroPedido: true, createdAt: true } },
      recebimentos: { select: { qtdRecebida: true, dataRecebimento: true } },
    },
  });

  // LINHA GENÉRICA — "Cotação dos materiais", sem família no nome.
  //
  // O modelo padrão tem uma linha por família, mas o Planejamento monta o bloco à mão e nem toda
  // obra se divide assim: na OP-105 o Vitor criou UMA cotação cobrindo tudo e três recebimentos
  // separados. Sem este bucket, `familiaDaLinha() || "ACO"` mediria a cotação geral só contra o
  // aço — 100% com a tinta e os parafusos ainda em cotação.
  //
  // ⚠ Aqui a conta é em ITENS, não em kg: só o aço tem peso, e somar kg com galão de tinta não
  // significa nada. É a mesma razão de `pesoNaFamilia`.
  const porFamilia = { TODAS: { familia: "TODAS", label: "Todos os materiais", unidade: "itens",
    escopo: 0, cotado: 0, recebido: 0, itens: 0,
    primeiraRm: null, ultimoPedido: null, primeiroReceb: null, ultimoReceb: null, rms: new Set() } };
  for (const nome of Object.keys(FAMILIAS)) {
    porFamilia[nome] = {
      familia: nome, label: FAMILIAS[nome].label, unidade: FAMILIAS[nome].unidade,
      escopo: 0, cotado: 0, recebido: 0, itens: 0,
      primeiraRm: null, ultimoPedido: null, primeiroReceb: null, ultimoReceb: null, rms: new Set(),
    };
  }

  const geral = porFamilia.TODAS;
  for (const it of itens) {
    const f = familiaMaterial(it.descricao);
    const g = porFamilia[f];
    const val = pesoNaFamilia(it, f);
    g.escopo += val;
    g.itens++;

    // o bucket geral conta ITEM, seja qual for a família
    geral.escopo++;
    geral.itens++;
    if (it.rm?.numero) geral.rms.add(it.rm.numero);
    if (it.rm?.createdAt && (!geral.primeiraRm || it.rm.createdAt < geral.primeiraRm)) geral.primeiraRm = it.rm.createdAt;
    if (it.rm?.numero) g.rms.add(it.rm.numero);
    if (it.rm?.createdAt && (!g.primeiraRm || it.rm.createdAt < g.primeiraRm)) g.primeiraRm = it.rm.createdAt;

    // COTADO: saiu da cotação — virou pedido ou foi atendido pelo estoque
    const saiu = it.status === "PEDIDO_GERADO" || it.status === "ATENDIDO_ESTOQUE" || !!it.atendidoEstoqueEm;
    if (saiu) {
      g.cotado += val;
      geral.cotado++;
      const dt = it.pedidoOmie?.createdAt || it.atendidoEstoqueEm;
      if (dt && (!g.ultimoPedido || dt > g.ultimoPedido)) g.ultimoPedido = dt;
      if (dt && (!geral.ultimoPedido || dt > geral.ultimoPedido)) geral.ultimoPedido = dt;
    }

    // RECEBIDO: no aço vale o kg proporcional; nas outras famílias o item conta quando fecha
    const rec = (it.recebimentos || []).reduce((a, r) => a + (Number(r.qtdRecebida) || 0), 0);
    const pedido = Number(it.peso) || 0;
    if (f === "ACO" && pedido > 0) {
      g.recebido += Math.min(rec, pedido);
      if (rec >= pedido * FECHADO) geral.recebido++; // no geral o item fecha ou não fecha
    } else if (rec > 0 && (pedido <= 0 || rec >= pedido * FECHADO)) {
      g.recebido += val;
      geral.recebido++;
    }
    for (const r of it.recebimentos || []) {
      if (!r.dataRecebimento) continue;
      if (!g.primeiroReceb || r.dataRecebimento < g.primeiroReceb) g.primeiroReceb = r.dataRecebimento;
      if (!g.ultimoReceb || r.dataRecebimento > g.ultimoReceb) g.ultimoReceb = r.dataRecebimento;
    }
  }
  for (const g of Object.values(porFamilia)) { g.listaRms = [...g.rms].sort(); g.rms = g.rms.size; }

  // Pedido de compra do cliente — só existe quando a OP tem faturamento direto
  const rmsFd = itens.filter((i) => i.rm?.faturamentoDireto);
  const pedidosFd = rmsFd.map((i) => i.pedidoOmie?.createdAt).filter(Boolean);
  const fd = {
    temFd: rmsFd.length > 0,
    itens: rmsFd.length,
    primeiro: pedidosFd.length ? new Date(Math.min(...pedidosFd)) : null,
    ultimo: pedidosFd.length ? new Date(Math.max(...pedidosFd)) : null,
    completo: rmsFd.length > 0 && pedidosFd.length === rmsFd.length,
  };

  return { porFamilia, fd };
}

/** % de uma linha, já com o denominador congelado em `qtdePlanejada`. */
function calcular(tarefa, escopoAgora, feito) {
  // congela na primeira vez que a linha é calculada com escopo > 0
  const base = Number(tarefa.qtdePlanejada) > 0 ? Number(tarefa.qtdePlanejada) : escopoAgora;
  if (!(base > 0)) return null;
  const pct = Math.min(100, Math.round((feito / base) * 1000) / 10);
  return { base, feito: Math.round(feito * 10) / 10, pct, cresceu: Math.max(0, Math.round((escopoAgora - base) * 10) / 10) };
}


/**
 * RECORTE DE ESCOPO — de quando pra frente as RMs contam pra ESTE cronograma.
 *
 * Vitor (19/08/2026), ao criar o cronograma "PORT COCHERE - REFORÇO" da OP-84: "poderia trazer o
 * progresso total do setor de compras — só se lembre que estamos falando das RMs mais recentes".
 *
 * O aviso é necessário porque uma OP pode ganhar um cronograma NOVO pra um escopo novo. A OP-84
 * tem 12 RMs: oito do escopo original (28/05 a 08/07) e quatro do reforço (18 e 19/08). Sem
 * recorte, o cronograma do reforço nasceria mostrando as compras da obra original como se fossem
 * dele — 100% de aço comprado antes de o reforço existir.
 *
 * A regra: contam as RMs emitidas a partir de **15 dias antes de o cronograma ser criado** (a
 * folga cobre a RM que sai pouco antes de o plano ser desenhado). Se esse corte não deixar RM
 * nenhuma, ele é ignorado e valem todas — é o caso do cronograma feito depois, pra uma obra que já
 * comprou tudo; ali o corte só apagaria a realidade.
 *
 * Como isso é heurística e não certeza, as RMs que entraram saem escritas na `observacao` da
 * linha. Se o recorte errar, dá pra ver na tela qual foi.
 */
const GRACA_DIAS = 15;

export async function recorteDeEscopo(prisma, opId, criadoEm) {
  if (!criadoEm) return null;
  const corte = new Date(criadoEm);
  corte.setDate(corte.getDate() - GRACA_DIAS);

  const [total, depois] = await Promise.all([
    prisma.rM.count({ where: { opId } }),
    prisma.rM.count({ where: { opId, createdAt: { gte: corte } } }),
  ]);
  // sem RM anterior ao corte não há dois escopos: não recorta nada
  if (depois === 0 || depois === total) return null;
  return corte;
}

/**
 * Aplica o avanço nas linhas de SUPRIMENTOS do cronograma da OP.
 * @returns {Promise<{atualizadas:number, linhas:[]}>}
 */
export async function aplicarAvancoSuprimentos(prisma, opId) {
  const crono = await prisma.cronograma.findFirst({
    where: { opId, ativo: true },
    select: { id: true, titulo: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (!crono) return { atualizadas: 0, linhas: [] };

  const tarefas = await prisma.cronogramaTarefa.findMany({
    where: { cronogramaId: crono.id, departamento: "SUPRIMENTOS", isSummary: false },
    select: { id: true, nome: true, qtdePlanejada: true, percentualRealizado: true, dataInicioReal: true, dataFimReal: true },
  });
  if (!tarefas.length) return { atualizadas: 0, linhas: [] };

  const desde = await recorteDeEscopo(prisma, opId, crono.createdAt);
  const { porFamilia, fd } = await situacaoSuprimentos(prisma, opId, desde);
  const linhas = [];
  let atualizadas = 0;

  for (const t of tarefas) {
    const cot = ehLinhaCotacao(t.nome);
    const rec = ehLinhaRecebimento(t.nome);
    let dados = null;

    if (ehLinhaPedidoCliente(t.nome)) {
      // linha do cliente: 100% quando todo item de FD já tem pedido
      if (!fd.temFd) continue;
      dados = { pct: fd.completo ? 100 : 0, base: fd.itens, feito: fd.completo ? fd.itens : 0,
        inicio: fd.primeiro, fim: fd.completo ? fd.ultimo : null, cresceu: 0, obs: null };
    } else if (cot || rec) {
      // sem família no nome = linha genérica, cobre TODOS os materiais
      const f = familiaDaLinha(t.nome) || "TODAS";
      const g = porFamilia[f];
      if (!g || g.escopo <= 0) continue; // família sem material nesta OP: não força 0% na tela
      const c = calcular(t, g.escopo, cot ? g.cotado : g.recebido);
      if (!c) continue;
      dados = {
        pct: c.pct, base: c.base, feito: c.feito, cresceu: c.cresceu,
        inicio: cot ? g.primeiraRm : g.primeiroReceb,
        fim: c.pct >= 100 ? (cot ? g.ultimoPedido : g.ultimoReceb) : null,
        // ⚠ quando a família se mede em ITENS, escopo e contagem de itens são a mesma coisa:
        // escrever os dois dava "3 itens · 3 itens" na tela
        obs: [
          (g.listaRms || []).join(", ") || `${g.rms} RM(s)`,
          g.unidade === "itens" ? `${g.itens} itens` : `${g.itens} itens · ${Math.round(g.escopo)} ${g.unidade}`,
          c.cresceu > 0 ? `escopo cresceu ${c.cresceu} ${g.unidade} depois do congelamento` : null,
        ].filter(Boolean).join(" · "),
      };
    } else continue;

    await prisma.cronogramaTarefa.update({
      where: { id: t.id },
      data: {
        percentualRealizado: dados.pct,
        qtdePlanejada: dados.base,
        qtdeRealizada: dados.feito ?? 0,
        // as datas REAIS não mexem no previsto — o atraso continua sendo derivado
        dataInicioReal: t.dataInicioReal || dados.inicio || null,
        dataFimReal: dados.fim || t.dataFimReal || null,
        ...(dados.obs ? { observacao: dados.obs } : {}),
      },
    });
    atualizadas++;
    linhas.push({ nome: t.nome, pct: dados.pct, base: dados.base, feito: dados.feito, cresceu: dados.cresceu });
  }

  // ⚠ o sumário do departamento não sobe sozinho: sem este rollup as linhas mostravam 100% e o
  // "▸ Suprimentos" continuava em 0%, que é o número que aparece na visão fechada do cronograma.
  if (atualizadas > 0) {
    const { rollupPercentualDepartamentos } = await import("./cronograma-recalcular");
    await rollupPercentualDepartamentos(crono.id, ["SUPRIMENTOS"]);
  }

  return { atualizadas, linhas, desde, cronograma: crono.titulo };
}
