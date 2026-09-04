// ─── O QUE O CLIENTE PODE SABER SOBRE UMA PEÇA ────────────────────────────────
//
// Vitor (03/09/2026): "conseguimos colocar o Torguinho na tela do cliente para ele perguntar sobre
// uma peça e informar o peso dela, quantas peças temos no projeto, se já foi expedida e a data e o
// romaneio (…) claro que vamos limitar a isso para eles, nada além disso".
//
// ⚠⚠ ESTE ARQUIVO É A PORTA, E É UMA SÓ. O painel do modelo 3D no portal e o Torguinho do cliente
// respondem pelas MESMAS funções daqui. Se cada um montasse a própria consulta, a regra do que pode
// sair viveria em dois lugares — e bastaria um deles esquecer um campo para o cliente ver custo,
// fornecedor ou nota fiscal. Campo novo entra aqui, para os dois ao mesmo tempo.
//
// ⚠⚠ FALTA DE DADO SE DIZ "SEM INFORMAÇÃO", NUNCA SE EXPLICA. Vitor: "se por acaso não estiver
// apontado no CMR deixar como sem informação para não levantar suspeita". É a mesma regra dos
// documentos ao cliente (ver lib/data-book): o que falta do nosso lado se resolve internamente, não
// se narra num portal. Nada aqui deve devolver "não apontado", "pendente de conferência" ou
// qualquer frase que transforme um buraco nosso em texto na tela do cliente.
import { prisma } from "@/lib/prisma";
import { rastreioDaOp, rastreioDaPeca, rastreioDoConjunto } from "@/lib/rastreio-peca";
import { dedupLpcLe } from "@/lib/pecas-producao";

// A cadeia de fabricação como o cliente entende. Não mostramos bancada, operador nem apontamento
// bruto: só onde a peça está.
// ⚠⚠ O CORTE ESTAVA FORA DA CADEIA — e é onde a maior parte da obra está. Vitor (04/09/2026):
// "não dá a opção para o cliente ver em qual parte da produção a peça dele está". A peça cortada e
// ainda não montada não casava com nenhum setor desta lista, e o portal respondia "sem informação"
// sabendo exatamente onde ela estava.
//
// ⚠ A ORDEM É A DA ROTA e importa: a etapa mostrada é a ÚLTIMA da lista em que houve apontamento
// (busca de trás para frente). Corte tem de vir primeiro para não roubar a vez da montagem.
//
// ⚠ O Syneco separa a operação 10 (Corte) da 20 (Preparação); as duas são o mesmo setor para quem
// olha de fora, e por isso as duas entram — quem manda no rótulo é `ETAPA_CLIENTE`.
const CADEIA = ["Corte", "Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];

// ⚠ o nome que o CLIENTE lê. A fábrica fala "preparação"; "corte" e "preparação" são a mesma coisa
// para ele, e "pintura" é a última etapa antes de embarcar — por isso vira "pronta".
const ETAPA_CLIENTE = { Corte: "preparação", "Preparação": "preparação" };
const SEM = "sem informação";

const norm = (m) => String(m || "").toUpperCase().replace(/\s/g, "");

/** As peças da obra que o cliente pode ver: as que estão nas listas (LPC/LE). */
async function pecasDaObra(opId) {
  const brutas = await prisma.pecaConjunto.findMany({
    where: { opId, OR: [{ naLPC: true }, { naLE: true }] },
    select: { id: true, marca: true, perfil: true, qte: true, pesoTotalKg: true, tipoPeca: true, fonte: true },
  });
  // ⚠⚠ A MESMA MARCA NAS DUAS LISTAS ESTAVA SENDO SOMADA — e isso saía para o CLIENTE. Vitor
  // (04/09/2026): "na tela do cliente (…) ainda tem informação duplicada". A marca T89A1 tem linha
  // na LPC (1x, 171,88 kg) e na LE (1x, 162,48 kg); somando, o portal mostrava 2 peças e 334 kg
  // onde há uma peça de ~165. São 249 marcas assim na OP-089 e 91 na OP-105.
  //
  // ⚠ Vale a linha da LPC, a mesma regra do resto do portal (lib/pecas-producao) — e ela é a que
  // traz `tipoPeca` confiável, que é quem decide se o rastreio vai pelos croquis do conjunto ou
  // pela peça. A diferença de peso entre as duas listas é a folga de projeto, ~5%.
  return dedupLpcLe(brutas);
}

/**
 * Onde cada marca está na fábrica, pelo que o chão de fábrica lançou.
 * @returns {Promise<Map<string, string>>} marca → setor (só quem tem produção lançada)
 */
export async function setorDasMarcas(marcas) {
  if (!marcas?.length) return new Map();
  const ordens = await prisma.mesOrdem.findMany({
    where: { item: { in: marcas }, setor: { in: CADEIA } },
    select: { item: true, setor: true, produzidoUn: true },
  });
  const feitos = new Map();
  for (const o of ordens) {
    if ((o.produzidoUn || 0) <= 0) continue;
    if (!feitos.has(o.item)) feitos.set(o.item, new Set());
    feitos.get(o.item).add(o.setor);
  }
  const out = new Map();
  for (const [m, s] of feitos) {
    const onde = [...CADEIA].reverse().find((x) => s.has(x));
    if (onde) out.set(m, onde);
  }
  return out;
}

/** O que já embarcou, por peça: romaneio e data. */
export async function expedicaoDasPecas(pecaIds) {
  if (!pecaIds?.length) return new Map();
  const itens = await prisma.romaneioItem.findMany({
    where: { pecaConjuntoId: { in: pecaIds } },
    select: {
      pecaConjuntoId: true, qtd: true,
      romaneio: { select: { numero: true, data: true } },
    },
  });
  const out = new Map();
  for (const i of itens) {
    if (!i.romaneio) continue;
    const lista = out.get(i.pecaConjuntoId) || [];
    lista.push({ romaneio: i.romaneio.numero, data: i.romaneio.data, qtd: i.qtd || 1 });
    out.set(i.pecaConjuntoId, lista);
  }
  for (const l of out.values()) l.sort((a, b) => new Date(a.data) - new Date(b.data));
  return out;
}

/**
 * O dossiê de UMA marca, na medida do cliente.
 *
 * ⚠ nada de R interno sem certificado, custo, fornecedor, nota fiscal ou nome de quem apontou.
 */
export async function pecaParaCliente({ opId, opNumero, marca, mostrar }) {
  // ⚠ o que sai da COMPRA é opcional por portal (seções RASTREIO_NF e RASTREIO_RM). Quem decide é
  // quem publica; aqui só se obedece — e o padrão de quem não passa nada é mostrar, para a rota que
  // ainda não conhece a opção não esconder dado sem querer.
  const verNf = mostrar?.nf !== false;
  const verRm = mostrar?.rm !== false;
  const alvo = norm(marca);
  if (!alvo) return null;

  const todas = await pecasDaObra(opId);
  const minhas = todas.filter((p) => norm(p.marca) === alvo);
  if (!minhas.length) return null;

  const qtd = minhas.reduce((t, p) => t + (p.qte || 0), 0) || minhas.length;
  const pesoKg = minhas.reduce((t, p) => t + (p.pesoTotalKg || 0), 0) || null;

  const setores = await setorDasMarcas([minhas[0].marca]);
  const exp = await expedicaoDasPecas(minhas.map((p) => p.id));
  const embarques = [...exp.values()].flat();

  // ── rastreabilidade ──
  // ⚠⚠ R, CORRIDA, CERTIFICADO, NORMA, NF DE COMPRA E O PESO COMPRADO. Vitor (04/09/2026): "não está
  // trazendo o número da Rastreabilidade" — e ele tem razão de cobrar: o R é o que aparece no
  // carimbo do desenho e na §02 do data book, então o cliente já o conhece; escondê-lo aqui fazia
  // a mesma peça ter dois vocabulários. É o que um data book mostra e o que o cliente tem como
  // conferir.
  //
  // ⚠⚠ A NF E O PESO ENTRARAM DEPOIS, e a regra anterior era o contrário. Vitor (04/09/2026):
  // "precisamos colocar no painel do cliente a opção de mostrar a NF de compra, a quantidade do que
  // compramos em kg". É a mesma informação que já vai no data book §02 — o cliente confere a
  // origem do aço da obra dele.
  //
  // ⚠ E O PEDIDO DE COMPRA + A RM. Vitor (04/09/2026): "o pedido de compra é importante mostrar
  // sim, o bom também era listar a RM que foi solicitada, para ficar fácil ver de onde foi
  // solicitado". São os dois números que fecham a cadeia documental da peça: RM (o que a obra
  // pediu) → pedido (o que foi comprado) → NF → R → corrida → certificado.
  //
  // ⚠⚠ SÓ O NÚMERO DA RM, NUNCA O CONTEÚDO. `RMItem` guarda `valorTotal`, `valorDiaria` e
  // `atendidoEstoquePreco` — abrir a RM no portal do cliente entregaria o nosso custo de compra.
  // O número identifica e permite pedir; o documento fica do lado de dentro.
  //
  // ⚠ FORNECEDOR CONTINUA FORA: quem vendeu é a nossa negociação, e o `linhaCmr` traz tudo junto —
  // por isso a escolha aqui é campo a campo, nunca espalhamento do objeto.
  //
  // ⚠ conjunto rastreia pelos CROQUIS que o compõem, marca avulsa rastreia por ela mesma.
  let rastreio = [];
  try {
    if (minhas[0].tipoPeca === "CONJUNTO") {
      const linhas = await rastreioDoConjunto(opNumero, opId, minhas[0].marca);
      for (const l of linhas) {
        for (const u of l.usadas || []) {
          if (!u?.corrida && !u?.certificado) continue;
          rastreio.push({ r: u.rastreio || null, material: l.perfil || null, corrida: u.corrida || null, certificado: u.certificado || null, norma: u.norma || null, nf: u.nf || null, compradoKg: u.pesoKg || null, pedido: u.pedido || null });
        }
      }
    } else {
      const res = await rastreioDaOp(opNumero, opId);
      for (const p of minhas) {
        const r = rastreioDaPeca(res, p.marca, p.perfil);
        for (const u of r?.usadas || []) {
          if (!u?.corrida && !u?.certificado) continue;
          rastreio.push({ r: u.rastreio || null, material: p.perfil || null, corrida: u.corrida || null, certificado: u.certificado || null, norma: u.norma || null, nf: u.nf || null, compradoKg: u.pesoKg || null, pedido: u.pedido || null });
        }
      }
    }
    // ⚠ a mesma corrida aparece uma vez por peça do conjunto; o cliente quer a lista de materiais,
    // não o extrato de consumo.
    const vistos = new Set();
    rastreio = rastreio.filter((r) => {
      const k = `${r.material}|${r.r}|${r.corrida}|${r.certificado}`;
      if (vistos.has(k)) return false;
      vistos.add(k); return true;
    });
    // ⚠ A RM VEM PELO PEDIDO, não por campo próprio: o CMR guarda o nº do pedido de compra, o
    // PedidoOmie guarda a cotação que o gerou e a cotação sabe de qual RM saiu. É a corrente que já
    // existe; sem ela o cliente teria o pedido e não saberia de onde a obra pediu.
    const pedidos = verRm ? [...new Set(rastreio.map((x) => x.pedido).filter(Boolean))] : [];
    if (pedidos.length) {
      const rmPorPedido = new Map();
      try {
        const peds = await prisma.pedidoOmie.findMany({
          where: { numeroPedido: { in: pedidos } },
          select: { numeroPedido: true, cotacao: { select: { rm: { select: { numero: true } } } } },
        });
        for (const pd of peds) {
          const n = pd.cotacao?.rm?.numero;
          if (n && !rmPorPedido.has(pd.numeroPedido)) rmPorPedido.set(pd.numeroPedido, n);
        }
      } catch { /* sem a corrente, a linha fica só com o pedido */ }
      for (const x of rastreio) x.rm = x.pedido ? rmPorPedido.get(x.pedido) || null : null;
    }
    // ⚠ apaga DEPOIS do dedup: a chave de deduplicação usa o R, não estes campos, então tirar antes
    // não muda a lista — e tirar aqui garante que nada escape por um caminho novo.
    for (const x of rastreio) {
      if (!verNf) { x.nf = null; x.compradoKg = null; }
      if (!verRm) { x.rm = null; x.pedido = null; }
    }
  } catch { rastreio = []; }

  const relatorios = await relatoriosDaMarca(opNumero, minhas[0].marca);

  const setor = setores.get(minhas[0].marca) || null;
  const expedida = embarques.length > 0;

  return {
    marca: minhas[0].marca,
    tipo: minhas[0].tipoPeca === "CONJUNTO" ? "conjunto" : minhas[0].tipoPeca === "CROQUI" ? "peça" : "marca",
    perfil: minhas[0].perfil || null,
    qtd,
    pesoKg,
    // ⚠ a etapa é uma palavra, não um relatório de apontamento. Sem lançamento, "sem informação".
    etapa: expedida ? "expedida" : setor === "Pintura" ? "pronta"
      : setor ? `em ${ETAPA_CLIENTE[setor] || setor.toLowerCase()}` : SEM,
    expedicao: expedida
      ? embarques.map((e) => ({ romaneio: e.romaneio, data: e.data, qtd: e.qtd }))
      : [],
    rastreio: rastreio.length ? rastreio : SEM,
    relatorios: relatorios.length ? relatorios : SEM,
  };
}

/** Os relatórios de inspeção EMITIDOS que cobrem a marca. */
export async function relatoriosDaMarca(opNumero, marca) {
  const rels = await prisma.relatorioInspecao.findMany({
    where: { opNumero, status: "EMITIDO" },
    select: { codigo: true, tipo: true, marcas: true, emitidoEm: true, createdAt: true, revisao: true },
    orderBy: { createdAt: "desc" },
    take: 400,
  });
  const alvo = norm(marca);
  return rels
    .filter((r) => (Array.isArray(r.marcas) ? r.marcas : []).some((m) => norm(m) === alvo))
    .map((r) => ({ codigo: r.codigo, tipo: r.tipo, data: r.emitidoEm || r.createdAt, revisao: r.revisao ?? null }));
}

/**
 * O panorama da obra: quantas marcas em cada etapa, e o que já embarcou.
 * É o que responde "faça uma lista de tudo que está em corte, de tudo que está na montagem".
 */
export async function panoramaDaObra({ opId, opNumero }) {
  const todas = await pecasDaObra(opId);
  const marcas = [...new Set(todas.map((p) => p.marca).filter(Boolean))];
  const setores = await setorDasMarcas(marcas);
  const exp = await expedicaoDasPecas(todas.map((p) => p.id));

  const expedidas = new Set();
  for (const p of todas) if (exp.has(p.id)) expedidas.add(norm(p.marca));

  const porEtapa = {};
  const pesoDaMarca = new Map();
  for (const p of todas) {
    const k = norm(p.marca);
    pesoDaMarca.set(k, (pesoDaMarca.get(k) || 0) + (p.pesoTotalKg || 0));
  }
  for (const m of marcas) {
    const k = norm(m);
    const etapa = expedidas.has(k) ? "expedida" : setores.get(m) ? setores.get(m).toLowerCase() : SEM;
    const e = (porEtapa[etapa] = porEtapa[etapa] || { marcas: [], pesoKg: 0 });
    e.marcas.push(m);
    e.pesoKg += pesoDaMarca.get(k) || 0;
  }

  const romaneios = new Map();
  for (const lista of exp.values()) {
    for (const r of lista) {
      const cur = romaneios.get(r.romaneio) || { romaneio: r.romaneio, data: r.data, marcas: 0 };
      cur.marcas += 1;
      romaneios.set(r.romaneio, cur);
    }
  }

  return {
    opNumero,
    totalMarcas: marcas.length,
    pesoTotalKg: [...pesoDaMarca.values()].reduce((a, b) => a + b, 0) || null,
    etapas: Object.entries(porEtapa).map(([etapa, v]) => ({
      etapa, marcas: v.marcas.length, pesoKg: Math.round(v.pesoKg) || null,
      // ⚠ a lista vai truncada: o Torguinho responde conversa, não despeja 900 marcas no chat.
      exemplos: v.marcas.slice(0, 40),
    })).sort((a, b) => b.marcas - a.marcas),
    romaneios: [...romaneios.values()].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 40),
  };
}

/** As marcas de uma etapa (para "lista tudo que está na montagem"). */
export async function marcasDaEtapa({ opId, etapa }) {
  const todas = await pecasDaObra(opId);
  const marcas = [...new Set(todas.map((p) => p.marca).filter(Boolean))];
  const setores = await setorDasMarcas(marcas);
  const exp = await expedicaoDasPecas(todas.map((p) => p.id));
  const expedidas = new Set();
  for (const p of todas) if (exp.has(p.id)) expedidas.add(norm(p.marca));

  const alvo = String(etapa || "").toLowerCase();
  const peso = new Map();
  for (const p of todas) peso.set(norm(p.marca), (peso.get(norm(p.marca)) || 0) + (p.pesoTotalKg || 0));

  return marcas
    .filter((m) => {
      const e = expedidas.has(norm(m)) ? "expedida" : (setores.get(m) || SEM).toLowerCase();
      return e === alvo;
    })
    .map((m) => ({ marca: m, pesoKg: Math.round(peso.get(norm(m)) || 0) || null }))
    .sort((a, b) => String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }));
}
