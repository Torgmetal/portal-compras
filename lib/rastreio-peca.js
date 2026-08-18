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
// O resultado é honesto sobre o que NÃO dá pra afirmar — nenhum caso vira "certo" por comodidade:
//   CERTA        → sobrou um candidato só (o material tem 1 corrida na OP, ou a data eliminou o resto)
//   PROVAVEL     → mais de um candidato possível; o FIFO escolheu, mas as outras ficam listadas
//   SEM_CORRIDA  → o material chegou, mas o CMR não tem a corrida preenchida (falha de lançamento)
//   ESTOQUE      → a peça foi cortada ANTES de qualquer entrega desta OP → veio de sobra/estoque
//   SEM_MATERIAL → nenhuma entrada desse perfil no CMR desta OP

export const SITUACAO_RASTREIO = {
  CERTA: { label: "corrida definida", cor: "emerald" },
  PROVAVEL: { label: "corrida provável", cor: "sky" },
  SEM_CORRIDA: { label: "sem corrida no CMR", cor: "amber" },
  ESTOQUE: { label: "cortada antes da entrega", cor: "amber" },
  SEM_MATERIAL: { label: "sem material no CMR", cor: "slate" },
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
  const resumo = { pecas: pecas.length, certa: 0, provavel: 0, semCorrida: 0, estoque: 0, semMaterial: semMaterial.length, kgTotal: 0, kgRastreado: 0 };
  for (const p of pecas) resumo.kgTotal += Number(p.pesoTotalKg) || 0;

  for (const p of semMaterial) {
    porMarca.set(p.marca, { situacao: "SEM_MATERIAL", perfil: p.perfil, cortadoEm: soDia(dataDeCorte(p)), usadas: [], candidatas: [] });
  }

  for (const g of grupos.values()) {
    // FIFO de verdade: as peças cortadas primeiro consomem o material que chegou primeiro.
    // Peça sem data de corte vai pro fim (ainda não cortada — não consome saldo de ninguém).
    const fila = [...g.pecas].sort((a, b) => {
      const da = dataDeCorte(a), db = dataDeCorte(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
    for (const p of fila) {
      const corte = dataDeCorte(p);
      const kg = Number(p.pesoTotalKg) || 0;
      // Só entra no rateio material RECEBIDO ATÉ o dia do corte (a peça não pode ter saído de
      // aço que ainda não tinha chegado). Sem data de corte, todas as entradas são candidatas.
      const noPrazo = g.entradas.filter((e) => !corte || !e.c.dataRecebimento || e.c.dataRecebimento <= corte);
      if (!noPrazo.length) {
        porMarca.set(p.marca, { situacao: "ESTOQUE", perfil: p.perfil, cortadoEm: soDia(corte), usadas: [], candidatas: g.entradas.map((e) => linhaCmr(e.c)) });
        resumo.estoque++;
        continue;
      }
      const comCorrida = noPrazo.filter((e) => e.c.numeroCorrida);
      if (!comCorrida.length) {
        porMarca.set(p.marca, { situacao: "SEM_CORRIDA", perfil: p.perfil, cortadoEm: soDia(corte), usadas: noPrazo.map((e) => linhaCmr(e.c)), candidatas: [] });
        resumo.semCorrida++;
        continue;
      }
      // Consome em FIFO pelo peso. Uma peça pode atravessar duas entradas — aí as duas corridas
      // ficam listadas (é o que o Data Book precisa dizer: "saiu de uma destas").
      let falta = kg, usadas = [];
      for (const e of comCorrida) {
        if (falta <= 0) break;
        if (e.saldo <= 0) continue;
        const tira = Math.min(e.saldo, falta);
        e.saldo -= tira; falta -= tira;
        usadas.push({ ...linhaCmr(e.c), consumidoKg: Math.round(tira * 10) / 10 });
      }
      // Saldo do CMR esgotado: cortou-se mais desse material do que o CMR registra ter chegado
      // (recebimento não lançado, ou material de sobra). Não inventa — marca e devolve a última.
      const saldoEsgotado = falta > 0.01;
      if (!usadas.length) usadas = [{ ...linhaCmr(comCorrida[comCorrida.length - 1].c), consumidoKg: 0 }];
      // CERTA quando não havia escolha REAL: uma única corrida entre os candidatos (o mesmo lote
      // pode vir em duas linhas do CMR — NF/peso diferentes, mesma corrida: continua sendo uma só).
      // `saldoEsgotado` é OUTRO assunto — a corrida continua certa, o que não fecha é a QUANTIDADE
      // (cortou-se mais do que o CMR registra ter chegado); vai como alerta à parte.
      const corridasDistintas = new Set(comCorrida.map((e) => e.c.numeroCorrida));
      const certa = corridasDistintas.size === 1;
      porMarca.set(p.marca, {
        situacao: certa ? "CERTA" : "PROVAVEL",
        perfil: p.perfil, cortadoEm: soDia(corte), usadas, saldoEsgotado,
        candidatas: certa ? [] : comCorrida.map((e) => linhaCmr(e.c)),
      });
      if (certa) resumo.certa++; else resumo.provavel++;
      resumo.kgRastreado += kg;
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
