import "server-only";
import { prisma } from "./prisma";
import { ORDEM_FIFO_CMR } from "@/lib/cmr-origens";
import { casarPerfilComOmie, descricoesEquivalentes } from "./casar-omie";
import { classificarMaterial } from "./databook-secoes";
import { dedupLpcLe } from "@/lib/pecas-producao";

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

// ⚠⚠ TINTA NÃO É MATÉRIA-PRIMA DE PEÇA. Vitor (28/08/2026), olhando a OP-106: "outro ponto errado
// que notei foi que você trouxe tinta junto com o material". O CMR guarda tudo que entra com
// certificado — aço, tinta, diluente, catalisador, arame — e o rastreio de PEÇA só pode olhar para o
// que vira peça. Tinta e consumível de solda têm seção própria no data book (§15 e §06) e motor
// próprio (o arame vem por `consumiveisPorConjunto`); deixá-los aqui é oferecer diluente como
// candidato à origem de uma chapa.
export const ehMateriaPrimaDePeca = (nome) => !["TINTA", "CONSUMIVEL", "ABRASIVO"].includes(classificarMaterial(nome));

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

  const [cmrBruto, pecasBrutas, ordens, trocas] = await Promise.all([
    prisma.documentoQualidade.findMany({
      where: { categoria: "MATERIAL", opNumero: num },
      select: { importRef: true, nome: true, numeroCorrida: true, numeroDocumento: true, norma: true, fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true, pesoKg: true },
      orderBy: ORDEM_FIFO_CMR,
    }),
    prisma.pecaConjunto.findMany({
      where: { opId, perfil: { not: null } },
      // ⚠ `fonte` entra no select por causa do dedup abaixo — sem ela não dá para saber qual linha
      // é a da LPC.
      select: { marca: true, perfil: true, qte: true, pesoTotalKg: true, tipoPeca: true, fonte: true, corteConcluidoEm: true, dataProducao: true },
    }),
    // data em que a peça foi cortada, pelo Syneco (op. 10 Corte / 20 Preparação)
    prisma.mesOrdem.findMany({
      where: { opId, produzidoUn: { gt: 0 }, OR: [{ setor: { contains: "orte", mode: "insensitive" } }, { setor: { contains: "repara", mode: "insensitive" } }] },
      select: { item: true, dataInicio: true },
    }),
    // R TROCADO na separação: o Almoxarifado tirou um fardo diferente do que o FIFO indicou.
    // Onde existe registro, ele MANDA — deixa de ser regra de consumo e vira fato observado.
    prisma.trocaRastreabilidade.findMany({ where: { opNumero: num }, select: { perfil: true, rIndicado: true, rUsado: true, escopo: true, trocadoPorNome: true, createdAt: true } }).catch(() => []),
  ]);
  if (!pecasBrutas.length) return vazio;
  // ⚠⚠ A MESMA MARCA NA LPC E NA LE CONTAVA DUAS VEZES. Vitor (04/09/2026): "será que esse problema
  // não está relacionado à duplicação das suas listas? pois não faltou material". Estava: a demanda
  // do rastreio somava as duas linhas, o FIFO gastava o dobro do peso e as últimas peças ficavam
  // sem R com o material inteiro no pátio. Medido na base: 6 obras com peça de perfil na LE, a pior
  // é a OP-089 com 157 marcas em dobro (a 105 tem 71, a 102 tem 19).
  //
  // ⚠ No fluxo de produção vale a linha da LPC — é a mesma regra do despacho e da TV
  // (lib/pecas-producao). OP que só tem LE continua inteira.
  const pecas = dedupLpcLe(pecasBrutas);

  // tinta, diluente, catalisador e arame ficam de fora do rastreio de PEÇA (ver acima)
  const cmr = cmrBruto.filter((c) => ehMateriaPrimaDePeca(c.nome));

  const trocaPorPerfil = new Map((trocas || []).map((t) => [String(t.perfil).trim().toUpperCase(), t]));
  // O R trocado pode ser de OUTRA OP — é justamente o caso: o fardo mais acessível na prateleira
  // veio de outro lote. Busca a entrada do CMR pelo R, sem filtrar por OP.
  const entradaPorR = new Map();
  const rsTrocados = [...new Set((trocas || []).map((t) => t.rUsado).filter(Boolean))];
  if (rsTrocados.length) {
    const linhasR = await prisma.documentoQualidade.findMany({
      where: { categoria: "MATERIAL", importRef: { in: rsTrocados } },
      select: { importRef: true, nome: true, numeroCorrida: true, numeroDocumento: true, norma: true, fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true, pesoKg: true },
    });
    for (const l of linhasR) if (!entradaPorR.has(l.importRef)) entradaPorR.set(l.importRef, l);
  }
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
    // ⚠ a MESMA chapa escrita de outra forma (6,30 / 6.35 / 6,40) entra no mesmo bolo — senão o aço
    // gravado com a outra grafia fica fora do FIFO e a peça sai sem R. Ver descricoesEquivalentes.
    const nomes = hit ? descricoesEquivalentes(p.perfil, hit.descricao, comoItens) : [];
    porPerfil.set(k, nomes.length ? cmr.filter((c) => nomes.includes(c.nome)) : []);
  }

  // ── agrupa as peças pelo MATERIAL que consomem (não pelo perfil: perfis diferentes podem
  //    sair da mesma chapa/barra) e roda o FIFO dentro de cada grupo ───────────────────────────
  const grupos = new Map(); // chave do material → { entradas:[{...c, saldo}], pecas:[] }
  const semMaterial = [];
  for (const p of pecas) {
    const k = String(p.perfil).trim().toUpperCase();
    let ents = porPerfil.get(k) || [];
    if (!ents.length) {
      // ⚠ MATERIAL DE ESTOQUE. Vitor (22/08/2026): "alguns materiais usamos de estoque" — a OP não
      // recebeu esse perfil, e por isso a peça caía em SEM_MATERIAL. Mas se alguém REGISTROU de
      // onde o material veio (troca por OP+perfil, apontada na conferência de rastreabilidade),
      // essa entrada é a fonte: o aço existe, só entrou por outra obra. Sem isto, a OP-067 ficava
      // com 391 marcas do mesmo tubo sem R, tendo a entrada dele lançada sob a OP-079.
      const t = trocaPorPerfil.get(k);
      const c = t?.rUsado ? entradaPorR.get(t.rUsado) : null;
      if (c) ents = [c];
    }
    if (!ents.length) { semMaterial.push(p); continue; }
    const chave = ents[0].nome;
    const g = grupos.get(chave) || { entradas: ents.map((c) => ({ c, saldo: Number(c.pesoKg) || 0 })), pecas: [] };
    g.pecas.push(p);
    grupos.set(chave, g);
  }

  const porMarca = new Map();
  // ── A MARCA NÃO É ÚNICA DENTRO DA OP ────────────────────────────────────────────────────────
  //
  // Vitor (20/08/2026), sobre a §02 do data book: "você colocar dois certificados na mesma peça...
  // está bagunçado". Investigando, apareceu coisa pior: a mesma marca existe DUAS VEZES na OP-067,
  // em sub-obras diferentes e com perfis diferentes —
  //
  //     T67CT-P42  ·  CH16.00X120     (obra T67)
  //     T67CT-P42  ·  U200X50X3.75    (obra T67CT)
  //
  // Como o mapa era só por marca, o segundo sobrescrevia o primeiro e a chapa de 16mm herdava o R
  // do perfil dobrado. São 3 marcas em 4.122 na OP-067 — pouco, mas o erro é grave: sai R errado no
  // carimbo do desenho e no data book, que é exatamente onde ninguém pode errar.
  //
  // `porMarcaPerfil` desempata por marca+perfil. `porMarca` continua existindo pra quem só tem a
  // marca (a separação do PCP, a tela de rastreio), e `marcasAmbiguas` avisa quais são duvidosas.
  const porMarcaPerfil = new Map();
  const chaveMP = (marca, perfil) => `${String(marca || "").trim().toUpperCase()}|${String(perfil || "").trim().toUpperCase()}`;
  const perfisPorMarca = new Map();
  for (const p of pecas) {
    const k = String(p.marca || "").trim().toUpperCase();
    const set = perfisPorMarca.get(k) || new Set();
    set.add(String(p.perfil || "").trim().toUpperCase());
    perfisPorMarca.set(k, set);
  }
  const marcasAmbiguas = new Set([...perfisPorMarca.entries()].filter(([, v]) => v.size > 1).map(([k]) => k));
  const resumo = { pecas: pecas.length, definido: 0, porFifo: 0, porTroca: 0, semCorridaNoCmr: 0, aguardandoCorte: 0, estoque: 0, semMaterial: semMaterial.length, kgTotal: 0, kgDefinido: 0 };
  for (const p of pecas) resumo.kgTotal += Number(p.pesoTotalKg) || 0;

  for (const p of semMaterial) {
    porMarca.set(p.marca, { situacao: "SEM_MATERIAL", perfil: p.perfil, cortadoEm: soDia(dataDeCorte(p)), usadas: [], candidatas: [] });
    porMarcaPerfil.set(chaveMP(p.marca, p.perfil), porMarca.get(p.marca));
  }

  for (const g of grupos.values()) {
    // Confronto de QUANTIDADE do material (LPC × CMR): não define R nenhum — o peso do CMR é bruto
    // e o da peça é líquido. Serve pra apontar recebimento que falta chegar ou falta lançar.
    const balanco = {
      recebidoKg: Math.round(g.entradas.reduce((a, e) => a + (Number(e.c.pesoKg) || 0), 0)),
      demandaLpcKg: Math.round(g.pecas.reduce((a, x) => a + (Number(x.pesoTotalKg) || 0), 0)),
    };
    balanco.demandaAcimaDoRecebido = balanco.demandaLpcKg > balanco.recebidoKg + 1;

    // ⚠ ORIGEM DECLARADA VALE PARA TODA PEÇA DO PERFIL — cortada, em corte ou terceirizada.
    // Vitor (22/08/2026): "pode usar o R da mesma maneira, vamos ignorar o FIFO nesse caso para
    // podermos fechar o data book".
    //
    // É coerente com o que a declaração significa: quem registra a origem não está dizendo "esta
    // peça saiu deste fardo", e sim "TODO este perfil, nesta OP, veio deste lote". Com isso não
    // sobra o que o FIFO decida — e a peça terceirizada, que nunca passa pelo corte aqui e por
    // isso jamais teria data, para de ficar eternamente sem rastreio (eram 277 só no tubo da
    // OP-067, 1.713 no portal inteiro).
    //
    // ⚠ o `criterio: "troca"` é o que mantém isso auditável: a §02 do data book marca a linha como
    // origem registrada, e a TrocaRastreabilidade guarda quem declarou e quando. Não é o portal
    // inferindo — é gente assumindo, com nome.
    const pendentes = [];
    for (const p of g.pecas) {
      const troca = trocaPorPerfil.get(String(p.perfil).trim().toUpperCase());
      const cTroca = troca?.rUsado
        ? (entradaPorR.get(troca.rUsado) || g.entradas.find((e) => e.c.importRef === troca.rUsado)?.c)
        : null;
      // ⚠ SEM_R não atropela o FIFO: a peça segue o caminho normal e a declaração só entra depois,
      // no que ficou sem R. Ver o comentário do campo `escopo` no schema.
      if (!cTroca || troca.escopo === "SEM_R") { pendentes.push(p); continue; }
      const kg = Number(p.pesoTotalKg) || 0;
      const usadas = [{ ...linhaCmr(cTroca), consumidoKg: Math.round(kg * 10) / 10 }];
      const semCorridaT = usadas.some((u) => !u.corrida);
      porMarca.set(p.marca, {
        situacao: "R_DEFINIDO", perfil: p.perfil, cortadoEm: soDia(dataDeCorte(p)), balanco,
        criterio: "troca", semCorrida: semCorridaT, saldoEsgotado: false, usadas,
        troca: { rIndicado: troca.rIndicado || null, por: troca.trocadoPorNome || null, em: troca.createdAt ? troca.createdAt.toISOString() : null },
        candidatas: g.entradas.map((e) => linhaCmr(e.c)),
      });
      porMarcaPerfil.set(chaveMP(p.marca, p.perfil), porMarca.get(p.marca));
      resumo.definido++; resumo.porTroca = (resumo.porTroca || 0) + 1;
      if (semCorridaT) resumo.semCorridaNoCmr++;
      resumo.kgDefinido += kg;
    }

    // SÓ AS CORTADAS consomem material e ganham R. As em aberto ficam de fora do FIFO —
    // senão uma peça que ainda nem foi cortada "gastaria" o lote de quem já cortou.
    const cortadas = pendentes.filter((x) => dataDeCorte(x)).sort((a, b) => dataDeCorte(a) - dataDeCorte(b));
    for (const p of pendentes) {
      if (dataDeCorte(p)) continue;
      porMarca.set(p.marca, { situacao: "AGUARDANDO_CORTE", perfil: p.perfil, cortadoEm: null, balanco, usadas: [], candidatas: g.entradas.map((e) => linhaCmr(e.c)) });
      porMarcaPerfil.set(chaveMP(p.marca, p.perfil), porMarca.get(p.marca));
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
      porMarcaPerfil.set(chaveMP(p.marca, p.perfil), porMarca.get(p.marca));
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
      // (a troca já foi decidida no topo do laço — aqui só resta o consumo por regra)
      const criterio = disp.length === 1 ? "unica" : "fifo";
      const semCorrida = usadas.some((u) => !u.corrida);
      porMarca.set(p.marca, {
        situacao: "R_DEFINIDO", ...base, criterio, semCorrida, saldoEsgotado, usadas,
        // as outras entradas do material ficam visíveis: é o que mostra POR QUE o FIFO escolheu
        candidatas: disp.map((e) => linhaCmr(e.c)),
      });
      porMarcaPerfil.set(chaveMP(p.marca, p.perfil), porMarca.get(p.marca));
      resumo.definido++;
      if (criterio === "fifo") resumo.porFifo++;
      if (semCorrida) resumo.semCorridaNoCmr++;
      resumo.kgDefinido += kg;
    }

    // ── A DECLARAÇÃO "SEM_R" ENTRA POR ÚLTIMO, só onde o CMR da OP não respondeu ────────────────
    // Peça cortada antes da entrega (ESTOQUE), perfil sem material (SEM_MATERIAL) e peça que nunca
    // passa pelo corte aqui (AGUARDANDO_CORTE, terceirizada) recebem a origem declarada. Quem já
    // tem R vindo do CMR desta OP fica como está — é rastreio bom, e apagá-lo seria trocar um
    // certificado certo por um declarado.
    const SEM_R = new Set(["ESTOQUE", "SEM_MATERIAL", "AGUARDANDO_CORTE"]);
    for (const p of g.pecas) {
      const troca = trocaPorPerfil.get(String(p.perfil).trim().toUpperCase());
      if (troca?.escopo !== "SEM_R" || !troca.rUsado) continue;
      const atual = porMarca.get(p.marca);
      if (!atual || !SEM_R.has(atual.situacao)) continue;
      const cTroca = entradaPorR.get(troca.rUsado) || g.entradas.find((e) => e.c.importRef === troca.rUsado)?.c;
      if (!cTroca) continue;
      const kg = Number(p.pesoTotalKg) || 0;
      const usadas = [{ ...linhaCmr(cTroca), consumidoKg: Math.round(kg * 10) / 10 }];
      const semCorridaT = usadas.some((u) => !u.corrida);
      if (atual.situacao === "AGUARDANDO_CORTE") resumo.aguardandoCorte--;
      else if (atual.situacao === "ESTOQUE") resumo.estoque--;
      porMarca.set(p.marca, {
        ...atual, situacao: "R_DEFINIDO", criterio: "troca", semCorrida: semCorridaT, saldoEsgotado: false, usadas,
        troca: { rIndicado: troca.rIndicado || null, por: troca.trocadoPorNome || null, em: troca.createdAt ? troca.createdAt.toISOString() : null, escopo: "SEM_R" },
      });
      porMarcaPerfil.set(chaveMP(p.marca, p.perfil), porMarca.get(p.marca));
      resumo.definido++; resumo.porTroca = (resumo.porTroca || 0) + 1;
      if (semCorridaT) resumo.semCorridaNoCmr++;
      resumo.kgDefinido += kg;
    }
  }
  return { porMarca, porMarcaPerfil, marcasAmbiguas, resumo };
}

/**
 * Busca o rastreio de uma peça. Com o PERFIL em mãos, usa marca+perfil — é o que resolve a marca
 * repetida em sub-obras diferentes (ver `marcasAmbiguas` acima). Sem perfil, cai no mapa por marca.
 */
export function rastreioDaPeca(res, marca, perfil) {
  if (!res) return null;
  if (perfil && res.porMarcaPerfil) {
    const exato = res.porMarcaPerfil.get(`${String(marca || "").trim().toUpperCase()}|${String(perfil).trim().toUpperCase()}`);
    if (exato) return exato;
  }
  const r = res.porMarca?.get(marca) || null;
  // ⚠ marca ambígua sem perfil pra desempatar: devolve, mas marcado. Melhor o consumidor saber que
  // a resposta pode ser da peça homônima do que exibir um R com cara de certeza.
  if (r && res.marcasAmbiguas?.has(String(marca || "").trim().toUpperCase())) return { ...r, ambigua: true };
  return r;
}

/**
 * Rastreabilidade de um CONJUNTO: as corridas dos CROQUIS que o compõem — é isso que o Vitor
 * pediu ("quais rastreabilidades foram usadas para cada perfil que compõe o conjunto").
 * Conjunto sem croqui (avulsa/GC) devolve o rastreio da própria marca.
 */
export async function rastreioDoConjunto(opNumero, opId, marcaConjunto) {
  const res = await rastreioDaOp(opNumero, opId);
  const { porMarca } = res;
  const links = await prisma.conjuntoCroqui.findMany({
    where: { conjunto: { opId, marca: marcaConjunto } },
    // qtdNoConjunto: quantas vezes ESTA posição entra NESTE conjunto. `croqui.qte` é o total da
    // peça na OP inteira — no T83D32 dava P8 = 87 onde a LISTA DE MATERIAIS do desenho diz 6.
    select: { qtdNoConjunto: true, croqui: { select: { marca: true, perfil: true, qte: true, pesoTotalKg: true } } },
  });
  if (!links.length) {
    // Croqui/avulsa: o `porMarca` não carrega a quantidade, e sem ela a coluna QTD. do croqui
    // saía em branco mesmo com o R definido.
    const r = porMarca.get(marcaConjunto);
    if (!r) return [];
    const pc = await prisma.pecaConjunto.findFirst({
      where: { opId, marca: marcaConjunto },
      select: { qte: true, pesoTotalKg: true },
    });
    return [{ marca: marcaConjunto, qte: pc?.qte ?? null, pesoTotalKg: pc?.pesoTotalKg ?? null, ...r }];
  }
  return links
    // ⚠ marca+perfil, não só marca: é ESTE carimbo que vai pro chão de fábrica, e a marca repetida
    // em sub-obras diferentes faria a peça sair com o R da homônima.
    .map((l) => ({ marca: l.croqui.marca, perfil: l.croqui.perfil, qte: l.croqui.qte, qtdNoConjunto: l.qtdNoConjunto, pesoTotalKg: l.croqui.pesoTotalKg, ...(rastreioDaPeca(res, l.croqui.marca, l.croqui.perfil) || { situacao: "SEM_MATERIAL", usadas: [], candidatas: [] }) }))
    .sort((a, b) => String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }));
}
