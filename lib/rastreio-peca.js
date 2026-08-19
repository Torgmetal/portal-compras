import "server-only";
import { prisma } from "./prisma";
import { casarPerfilComOmie } from "./casar-omie";

// CASAMENTO DE RASTREABILIDADE — qual CORRIDA/LOTE foi usada em cada peça.
//
// Ideia do Vitor (18/08/2026): "de acordo com as quantidades que temos na LPC dos materiais que
// formam os conjuntos vs o que damos entrada no CMR você já não consegue destinar quais
// rastreabilidades foram usadas para cada perfil que compõe o conjunto? usando a data que foi
// entregue vs a data que foi aberto o apontamento?" — dá, e na maioria das vezes sem precisar
// de rateio nenhum: cada material costuma ter UMA corrida só na OP.
//
// DEMANDA  = peças da LPC com perfil (croqui/avulsa), com a data em que foram CORTADAS
//            (Syneco op. 10/20; fallback corteConcluidoEm / dataProducao).
// OFERTA   = entradas do CMR daquela OP (corrida, certificado, NF, pedido, peso, data).
// REGRA    = a peça só pode ter saído de material RECEBIDO ATÉ o dia em que foi cortada; entre os
//            candidatos, consome em FIFO (o mais antigo primeiro), pelo peso.
//
// REGRA DE ATRIBUIÇÃO (definida pelo Vitor em 18/08/2026):
//
//   • O **R** (nº de rastreabilidade do CMR) é quem manda — é ELE que puxa corrida/lote,
//     certificado, NF, pedido e fornecedor. Toda a linguagem do portal fala em R primeiro;
//     corrida é atributo do R, não o contrário.
//   • **FIFO**: entre as entradas disponíveis no dia do corte vale a de ENTREGA MAIS ANTIGA (o
//     material que chegou primeiro é consumido primeiro), gastando o peso recebido antes de
//     passar pra próxima. É política declarada de consumo, não chute — por isso substitui o
//     "provável" que o Vitor barrou (aquilo escolhia e chamava de dúvida; isto segue uma regra).
//   • **Só peça CORTADA ganha R.** Peça ainda em aberto fica sem R até ser cortada — não consome
//     material e não pode reivindicar lote nenhum.
//
//   R_DEFINIDO       → a peça foi cortada e o FIFO apontou a entrada (`criterio` diz se era a
//                      única candidata ou se veio do FIFO). `semCorrida` avisa quando aquele R
//                      está no CMR sem a corrida preenchida — o R vale, falta lançar a corrida.
//   AGUARDANDO_CORTE → peça em aberto: sem R por enquanto, e de propósito.
//   ESTOQUE          → cortada ANTES de qualquer entrega desta OP → veio de sobra/estoque.
//   SEM_MATERIAL     → nenhuma entrada desse perfil no CMR desta OP.
//
// PREMISSA declarada (e verdadeira na Torg): o material é comprado e recebido POR OP (RM por OP,
// CMR com a coluna OBRA), então o aço daquela OP é o candidato.

export const SITUACAO_RASTREIO = {
  R_DEFINIDO: { label: "R definido", cor: "emerald" },
  AGUARDANDO_CORTE: { label: "aguarda corte", cor: "slate" },
  ESTOQUE: { label: "cortada antes da entrega", cor: "amber", alerta: true },
  SEM_MATERIAL: { label: "sem material no CMR", cor: "slate", alerta: true },
};

const soDia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function linhaCmr(c) {
  return {
    // Nº DA RASTREABILIDADE (coluna "ÍNDICE R" do CMR) — é por ele que o Almoxarifado/Qualidade
    // acha o material e o certificado; vem SEMPRE na frente da corrida e do lote. (Vitor 18/08.)
    rastreio: c.importRef || null,
    corrida: c.numeroCorrida || null,
    certificado: c.numeroDocumento || null,
    norma: c.norma || null,
    nf: c.nfNumero || null,
    pedido: c.pedidoCompra || null,
    fornecedor: c.fornecedor || null,
    material: c.nome,
    recebidoEm: c.dataRecebimento ? c.dataRecebimento.toISOString() : null,
    pesoKg: Number(c.pesoKg) || 0,
  };
}

/**
 * Casamento de rastreabilidade de UMA OP.
 * @returns {{ porMarca: Map<string, obj>, resumo: obj }}
 */
export async function rastreioDaOp(opNumero, opId) {
  const num = String(opNumero || "").trim();
  const vazio = { porMarca: new Map(), resumo: { pecas: 0, certa: 0, provavel: 0, semCorrida: 0, estoque: 0, semMaterial: 0, kgTotal: 0, kgRastreado: 0 } };
  if (!num || !opId) return vazio;

  const [cmr, pecas, ordens] = await Promise.all([
    prisma.documentoQualidade.findMany({
      where: { categoria: "MATERIAL", opNumero: num },
      select: { importRef: true, nome: true, numeroCorrida: true, numeroDocumento: true, norma: true, fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true, pesoKg: true },
      orderBy: [{ dataRecebimento: "asc" }],
    }),
    prisma.pecaConjunto.findMany({
      where: { opId, perfil: { not: null } },
      select: { marca: true, perfil: true, qte: true, pesoTotalKg: true, tipoPeca: true, corteConcluidoEm: true, dataProducao: true },
    }),
    // data em que a peça foi cortada, pelo Syneco (op. 10 Corte / 20 Preparação)
    prisma.mesOrdem.findMany({
      where: { opId, produzidoUn: { gt: 0 }, OR: [{ setor: { contains: "orte", mode: "insensitive" } }, { setor: { contains: "repara", mode: "insensitive" } }] },
      select: { item: true, dataInicio: true },
    }),
  ]);
  if (!pecas.length) return vazio;

  const cortadoEm = new Map();
  for (const o of ordens) {
    if (!o.item || !o.dataInicio) continue;
    const d = cortadoEm.get(o.item);
    if (!d || o.dataInicio < d) cortadoEm.set(o.item, o.dataInicio);
  }
  const dataDeCorte = (p) => cortadoEm.get(p.marca) || p.corteConcluidoEm || p.dataProducao || null;

  // ── perfil → entradas do CMR (uma passada de matcher por perfil distinto) ───────────────────
  const comoItens = cmr.map((c) => ({ codigo: null, descricao: c.nome, _c: c }));
  const porPerfil = new Map();
  for (const p of pecas) {
    const k = String(p.perfil).trim().toUpperCase();
    if (porPerfil.has(k)) continue;
    const hit = comoItens.length ? casarPerfilComOmie(p.perfil, comoItens) : null;
    porPerfil.set(k, hit ? cmr.filter((c) => c.nome === hit.descricao) : []);
  }

  // ── agrupa as peças pelo MATERIAL que consomem (não pelo perfil: perfis diferentes podem
  //    sair da mesma chapa/barra) e roda o FIFO dentro de cada grupo ───────────────────────────
  const grupos = new Map(); // chave do material → { entradas:[{...c, saldo}], pecas:[] }
  const semMaterial = [];
  for (const p of pecas) {
    const ents = porPerfil.get(String(p.perfil).trim().toUpperCase()) || [];
    if (!ents.length) { semMaterial.push(p); continue; }
    const chave = ents[0].nome;
    const g = grupos.get(chave) || { entradas: ents.map((c) => ({ c, saldo: Number(c.pesoKg) || 0 })), pecas: [] };
    g.pecas.push(p);
    grupos.set(chave, g);
  }

  const porMarca = new Map();
  const resumo = { pecas: pecas.length, definido: 0, porFifo: 0, semCorridaNoCmr: 0, aguardandoCorte: 0, estoque: 0, semMaterial: semMaterial.length, kgTotal: 0, kgDefinido: 0 };
  for (const p of pecas) resumo.kgTotal += Number(p.pesoTotalKg) || 0;

  for (const p of semMaterial) {
    porMarca.set(p.marca, { situacao: "SEM_MATERIAL", perfil: p.perfil, cortadoEm: soDia(dataDeCorte(p)), usadas: [], candidatas: [] });
  }

  for (const g of grupos.values()) {
    // Confronto de QUANTIDADE do material (LPC × CMR): não define R nenhum — o peso do CMR é bruto
    // e o da peça é líquido. Serve pra apontar recebimento que falta chegar ou falta lançar.
    const balanco = {
      recebidoKg: Math.round(g.entradas.reduce((a, e) => a + (Number(e.c.pesoKg) || 0), 0)),
      demandaLpcKg: Math.round(g.pecas.reduce((a, x) => a + (Number(x.pesoTotalKg) || 0), 0)),
    };
    balanco.demandaAcimaDoRecebido = balanco.demandaLpcKg > balanco.recebidoKg + 1;

    // SÓ AS CORTADAS consomem material e ganham R. As em aberto ficam de fora do FIFO —
    // senão uma peça que ainda nem foi cortada "gastaria" o lote de quem já cortou.
    const cortadas = g.pecas.filter((x) => dataDeCorte(x)).sort((a, b) => dataDeCorte(a) - dataDeCorte(b));
    for (const p of g.pecas) {
      if (dataDeCorte(p)) continue;
      porMarca.set(p.marca, { situacao: "AGUARDANDO_CORTE", perfil: p.perfil, cortadoEm: null, balanco, usadas: [], candidatas: g.entradas.map((e) => linhaCmr(e.c)) });
      resumo.aguardandoCorte++;
    }

    for (const p of cortadas) {
      const corte = dataDeCorte(p);
      const kg = Number(p.pesoTotalKg) || 0;
      const base = { perfil: p.perfil, cortadoEm: soDia(corte), balanco };
      // Disponível no dia do corte: a peça não pode ter saído de aço que ainda não tinha chegado.
      // Entrada SEM corrida entra normalmente — quem identifica é o R, a corrida é atributo dele.
      const disp = g.entradas.filter((e) => !e.c.dataRecebimento || e.c.dataRecebimento <= corte);
      if (!disp.length) {
        porMarca.set(p.marca, { situacao: "ESTOQUE", ...base, usadas: [], candidatas: g.entradas.map((e) => linhaCmr(e.c)) });
        resumo.estoque++;
        continue;
      }
      // FIFO: a ENTREGA MAIS ANTIGA primeiro, gastando o peso recebido antes de passar à próxima.
      // (g.entradas já vem ordenada por dataRecebimento asc.)
      let falta = kg, usadas = [];
      for (const e of disp) {
        if (falta <= 0.01) break;
        if (e.saldo <= 0) continue;
        const tira = Math.min(e.saldo, falta);
        e.saldo -= tira; falta -= tira;
        usadas.push({ ...linhaCmr(e.c), consumidoKg: Math.round(tira * 10) / 10 });
      }
      // Saldo do CMR esgotado = cortou-se mais desse material do que o CMR registra ter chegado
      // (recebimento não lançado). O R continua sendo o do último disponível — com alerta.
      const saldoEsgotado = falta > 0.01;
      if (!usadas.length) usadas = [{ ...linhaCmr(disp[disp.length - 1].c), consumidoKg: 0 }];
      const criterio = disp.length === 1 ? "unica" : "fifo";
      const semCorrida = usadas.some((u) => !u.corrida);
      porMarca.set(p.marca, {
        situacao: "R_DEFINIDO", ...base, criterio, semCorrida, saldoEsgotado, usadas,
        // as outras entradas do material ficam visíveis: é o que mostra POR QUE o FIFO escolheu
        candidatas: disp.map((e) => linhaCmr(e.c)),
      });
      resumo.definido++;
      if (criterio === "fifo") resumo.porFifo++;
      if (semCorrida) resumo.semCorridaNoCmr++;
      resumo.kgDefinido += kg;
    }
  }
  return { porMarca, resumo };
}

/**
 * Rastreabilidade de um CONJUNTO: as corridas dos CROQUIS que o compõem — é isso que o Vitor
 * pediu ("quais rastreabilidades foram usadas para cada perfil que compõe o conjunto").
 * Conjunto sem croqui (avulsa/GC) devolve o rastreio da própria marca.
 */
export async function rastreioDoConjunto(opNumero, opId, marcaConjunto) {
  const { porMarca } = await rastreioDaOp(opNumero, opId);
  const links = await prisma.conjuntoCroqui.findMany({
    where: { conjunto: { opId, marca: marcaConjunto } },
    select: { croqui: { select: { marca: true, perfil: true, qte: true, pesoTotalKg: true } } },
  });
  if (!links.length) {
    const r = porMarca.get(marcaConjunto);
    return r ? [{ marca: marcaConjunto, ...r }] : [];
  }
  return links
    .map((l) => ({ marca: l.croqui.marca, perfil: l.croqui.perfil, qte: l.croqui.qte, pesoTotalKg: l.croqui.pesoTotalKg, ...(porMarca.get(l.croqui.marca) || { situacao: "SEM_MATERIAL", usadas: [], candidatas: [] }) }))
    .sort((a, b) => String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }));
}
