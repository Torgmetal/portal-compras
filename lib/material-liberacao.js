import "server-only";
import { prisma } from "@/lib/prisma";
import { casarPerfilComOmie } from "@/lib/casar-omie";
import { ORDEM_FIFO_CMR } from "@/lib/cmr-origens";

// A TRAVA DE MATERIAL — o passo que o PCP roda antes de imprimir.
//
// Vitor (25/08/2026), a sequência: "o planejamento solta a lista, pcp recebe a solicitação, manda
// separar o material, analisa se está tudo em estoque, caso seja usado um material de estoque
// informa o R usado, e caso não tenha o material não libera aquele projeto para preparar. Avaliou
// isso, imprime os desenhos para o setor já marcando o R e imprime marcando na GRD".
//
// ⚠⚠ TRÊS ESTADOS, NÃO DOIS. "Tem ou não tem" é o que faria a trava parar a fábrica: medido em
// 25/08/2026, dos perfis que não casam com o CMR da própria obra, 180 EXISTEM no CMR de outra e
// só 97 não existem em lugar nenhum. Os 180 são material de estoque — comprado sob outra OP e
// usado aqui, que é rotina da casa. Bloqueá-los seria travar 2 de cada 3 casos por engano.
//
//   NA_OP      casa no CMR da própria obra   → segue, R por FIFO
//   ESTOQUE    casa no CMR de OUTRA obra     → segue, mas o PCP tem de informar QUAL R usou
//   SEM_MATERIAL  não casa em CMR nenhum     → NÃO LIBERA
//
// ⚠ E "SEM MATERIAL" NÃO É UMA COISA SÓ. Vitor (25/08/2026): "coloque material aguardando entrega
// se já tiver pedido emitido, ou não comprado se não tiver nem RM desse material ou pedido".
// A diferença é quem resolve: aguardando entrega é o fornecedor, não comprado é o Compras. Dizer
// só "não há entrada no CMR" manda o PCP procurar quem não sabe.
//
//   AGUARDANDO_ENTREGA  tem RM com pedido emitido → o material vem, é prazo
//   SOLICITADO          tem RM, pedido não saiu   → está no Compras
//   NAO_COMPRADO        não tem nem RM            → ninguém pediu ainda
//
// ⚠ A CHEGADA DO MATERIAL É O CMR. Vitor confirmou, e o código concorda: o cron
// /api/cron/cmr-reconciliar sincroniza a planilha do SharePoint com o portal todos os dias, nos
// dois sentidos, e é dali que nasce o índice R. Não se usa `EstoqueFisico` aqui — Vitor
// (25/08/2026): "sobre o estoque físico, ignorar isso via portal, como não temos o estoque real".

export const ESTADOS = ["NA_OP", "ESTOQUE", "SEM_MATERIAL"];
// por que não tem material — o sub-estado diz de quem é a bola
export const FALTA = {
  AGUARDANDO_ENTREGA: "aguardando entrega",
  // ⚠ "cotação" é a palavra do Vitor (26/08/2026) para RM aberta sem pedido emitido — antes estava
  // "solicitado, pedido não emitido", que descreve o estado mas não é como a casa fala dele.
  SOLICITADO: "cotação",
  NAO_COMPRADO: "não comprado",
};
// status de RMItem que significam "o pedido saiu"
const COM_PEDIDO = ["PEDIDO_GERADO", "ATENDIDO_ESTOQUE"];

/**
 * Classifica os perfis de um conjunto de peças contra o CMR.
 * @param {string} opNumero
 * @param {Array} pecas  [{ id, marca, perfil, qte, pesoTotalKg }]
 * @returns {Promise<{porPerfil:Map, porPeca:Map, resumo:object}>}
 */
export async function analisarMaterial(opNumero, pecas) {
  const perfis = [...new Set(pecas.map((p) => String(p.perfil || "").trim()).filter(Boolean))];
  if (!perfis.length) return { porPerfil: new Map(), porPeca: new Map(), resumo: vazio() };

  const [cmrDaOp, cmrGeral, trocas, rmItens] = await Promise.all([
    prisma.documentoQualidade.findMany({
      where: { categoria: "MATERIAL", opNumero: String(opNumero) },
      select: { importRef: true, nome: true, numeroCorrida: true, pesoKg: true, dataRecebimento: true },
      orderBy: ORDEM_FIFO_CMR,
    }),
    prisma.documentoQualidade.findMany({
      where: { categoria: "MATERIAL" },
      select: { importRef: true, nome: true, numeroCorrida: true, opNumero: true, pesoKg: true },
      distinct: ["nome"],
    }),
    // R já informado pelo PCP para um perfil desta obra — a resposta de "qual R você usou"
    // ⚠ a amarração vem do módulo compartilhado — a mesma que o PCP e a separação leem
    (await import("./r-amarrado")).amarracoesDaOp(String(opNumero)),
    // ⚠ a RM diz se o material foi ao menos PEDIDO. Sem isto, "não há entrada no CMR" trata igual
    // o aço que chega semana que vem e o que ninguém comprou.
    prisma.rMItem.findMany({
      where: { rm: { op: { numero: String(opNumero) } }, canceladoEm: null },
      select: { descricao: true, status: true, pedidoOmieId: true, qtd: true, unidade: true,
                pedidoOmie: { select: { numeroPedido: true, codigoPedido: true, fornecedorNome: true, createdAt: true } } },
    }),
  ]);

  const jaInformado = trocas; // perfil (caixa alta) → { r, por, motivo }
  const itensOp = cmrDaOp.map((c) => ({ codigo: null, descricao: c.nome, _c: c }));
  // ⚠ uma descrição por linha distinta: casar contra as 22 linhas repetidas seria o mesmo trabalho
  // várias vezes, e o matcher escolhe UMA descrição de qualquer jeito.
  const itensRm = [...new Map(rmItens.map((x) => [x.descricao, { codigo: null, descricao: x.descricao }])).values()];
  const itensGeral = cmrGeral.map((c) => ({ codigo: null, descricao: c.nome, _c: c }));

  // ⚠ DE QUEM É A BOLA — vale para QUALQUER perfil, não só para o que não tem material nenhum.
  // Vitor (26/08/2026) tirou o estado "estoque" da vista do Planejamento: "não sabemos quanto tem
  // de estoque mesmo". Sem confiar no estoque, o que sobra para dizer é a compra — e ela precisa
  // estar disponível também no perfil que só aparece no CMR de outra obra.
  const faltaDoPerfil = (pf) => {
    const naRm = itensRm.length ? casarPerfilComOmie(pf, itensRm) : null;
    const linhas = naRm ? rmItens.filter((x) => x.descricao === naRm.descricao) : [];
    const comPedido = linhas.filter((x) => x.pedidoOmieId || COM_PEDIDO.includes(x.status));
    const falta = comPedido.length ? "AGUARDANDO_ENTREGA" : linhas.length ? "SOLICITADO" : "NAO_COMPRADO";
    const ped = comPedido[0]?.pedidoOmie;
    return {
      falta, faltaRotulo: FALTA[falta],
      rm: linhas.length ? { descricao: naRm.descricao, linhas: linhas.length,
        pedido: ped ? { numero: ped.numeroPedido || ped.codigoPedido, fornecedor: ped.fornecedorNome,
                        em: ped.createdAt ? ped.createdAt.toISOString() : null } : null } : null,
    };
  };

  // ⚠⚠ O R AMARRADO À MÃO VALE COMO ENTREGA — MAS SÓ DENTRO DA PRÓPRIA OBRA.
  // Vitor (26/08/2026), sobre o Z da OP-105: "nesse caso pode casar esse recebimento por hora".
  //
  // O caso: a Engenharia escreve `Z150X70X76X40X6.40`, Compras comprou e o Almoxarifado recebeu
  // como `PERFIL DOBRADO Z 150X70X76X32X6.35` (a RM diz "DESENHO EM ANEXO" — o dobrado é feito por
  // desenho, e o texto das duas pontas não bate). O aço está no pátio com R, e o portal lia "não
  // comprado" em 8.422 kg porque casa por descrição.
  //
  // `TrocaRastreabilidade` já era o caminho oficial de dizer "usei o R X neste perfil"; ela só não
  // mudava o ESTADO, então a amarração ficava decorativa — informava e continuava travando.
  //
  // ⚠ SÓ COM R DESTA OBRA. Vitor (25/08/2026): "não vamos criar uma maneira de burlarmos e informar
  // um material que não era destinado a essa obra". Amarrar a um R que já é da obra não abre buraco
  // nenhum: o material já é dela, só está escrito com outro nome. R de fora continua sem passar.
  const rsDaOp = new Set(cmrDaOp.map((c) => String(c.importRef || "").trim()).filter(Boolean));

  const porPerfil = new Map();
  for (const pf of perfis) {
    const k = pf.toUpperCase();
    const informado = jaInformado.get(k);
    const rAmarrado = informado?.r && rsDaOp.has(informado.r) ? informado.r : null;
    if (rAmarrado) {
      const ent = cmrDaOp.find((c) => String(c.importRef || "").trim() === rAmarrado);
      porPerfil.set(k, {
        perfil: pf, estado: "NA_OP", descricaoCmr: ent?.nome || null,
        rs: [rAmarrado], rInformado: rAmarrado,
        // ⚠ a tela precisa poder DIZER que veio de amarração humana — entrega conferida e entrega
        // declarada não são a mesma coisa, mesmo valendo o mesmo para liberar.
        porTroca: true, trocaPor: informado.por || null, trocaMotivo: informado.motivo || null,
      });
      continue;
    }
    const naOp = itensOp.length ? casarPerfilComOmie(pf, itensOp) : null;
    if (naOp) {
      const ents = cmrDaOp.filter((c) => c.nome === naOp.descricao);
      porPerfil.set(k, {
        perfil: pf, estado: "NA_OP", descricaoCmr: naOp.descricao,
        rs: ents.map((c) => c.importRef).filter(Boolean),
        rInformado: informado?.r || null,
      });
      continue;
    }
    const geral = itensGeral.length ? casarPerfilComOmie(pf, itensGeral) : null;
    if (geral) {
      const ents = cmrGeral.filter((c) => c.nome === geral.descricao);
      porPerfil.set(k, {
        perfil: pf, estado: "ESTOQUE", descricaoCmr: geral.descricao,
        rs: ents.map((c) => c.importRef).filter(Boolean),
        opsDoMaterial: [...new Set(ents.map((c) => c.opNumero).filter(Boolean))],
        rInformado: informado?.r || null,
        // ⚠ o estado de COMPRA vai junto: para o PCP isto é "existe material igual, informe o R";
        // para o Planejamento, que não vê o estoque, o que vale é se o aço DESTA obra foi comprado.
        ...faltaDoPerfil(pf),
      });
      continue;
    }
    // ── não tem material: de quem é a bola? ──
    porPerfil.set(k, {
      perfil: pf, estado: "SEM_MATERIAL",
      descricaoCmr: null, rs: [], rInformado: null,
      ...faltaDoPerfil(pf),
    });
  }

  const porPeca = new Map();
  for (const p of pecas) {
    const v = porPerfil.get(String(p.perfil || "").trim().toUpperCase());
    porPeca.set(p.id, v || { perfil: p.perfil, estado: "SEM_MATERIAL", rs: [], rInformado: null });
  }

  return { porPerfil, porPeca, resumo: resumir(pecas, porPeca) };
}

function vazio() {
  return { pecas: 0, kg: 0, naOp: 0, estoque: 0, semMaterial: 0, kgSemMaterial: 0,
           estoqueSemR: 0, liberaveis: 0, kgLiberavel: 0, pronto: true,
           aguardandoEntrega: 0, solicitado: 0, naoComprado: 0 };
}

function resumir(pecas, porPeca) {
  const r = vazio();
  for (const p of pecas) {
    const v = porPeca.get(p.id);
    const kg = Number(p.pesoTotalKg) || 0;
    r.pecas++; r.kg += kg;
    if (v.estado === "NA_OP") { r.naOp++; r.liberaveis++; r.kgLiberavel += kg; }
    else if (v.estado === "ESTOQUE") {
      r.estoque++;
      // ⚠ estoque SEM o R informado não passa: é a pergunta que o Vitor pediu para ser feita.
      // Deixar passar sem resposta perderia a rastreabilidade justo no caso em que ela é manual.
      if (v.rInformado) { r.liberaveis++; r.kgLiberavel += kg; } else r.estoqueSemR++;
    } else {
      r.semMaterial++; r.kgSemMaterial += kg;
      if (v.falta === "AGUARDANDO_ENTREGA") r.aguardandoEntrega++;
      else if (v.falta === "SOLICITADO") r.solicitado++;
      else r.naoComprado++;
    }
  }
  r.kg = Math.round(r.kg); r.kgLiberavel = Math.round(r.kgLiberavel); r.kgSemMaterial = Math.round(r.kgSemMaterial);
  r.pronto = r.semMaterial === 0 && r.estoqueSemR === 0;
  return r;
}

// ⚠ COMO O PLANEJAMENTO LÊ ISTO. Vitor (26/08/2026): "não sabemos quanto tem de estoque mesmo,
// sendo assim deixe apenas o filtro do aguardando entrega, cotação ou não comprado". Quem não vê o
// estoque só pode contar com o que chegou NESTA obra; o resto é estado de compra.
//
// ⚠ O PCP CONTINUA VENDO "ESTOQUE" — ele está na frente do rack e informa o R usado, que é a etapa
// que o Vitor desenhou em 25/08. As duas telas leem o mesmo cálculo com olhos diferentes, de
// propósito: a diferença é o que cada uma consegue verificar.
export function statusMaterialPlanejamento(v) {
  if (!v) return null;
  return v.estado === "NA_OP" ? "ENTREGUE" : v.falta || "NAO_COMPRADO";
}
export const STATUS_PLAN = {
  ENTREGUE: "entregue",
  AGUARDANDO_ENTREGA: "aguardando entrega",
  SOLICITADO: "cotação",
  NAO_COMPRADO: "não comprado",
};

/** as peças que PODEM ir para a impressão */
export function pecasLiberaveis(pecas, porPeca) {
  return pecas.filter((p) => {
    const v = porPeca.get(p.id);
    return v && (v.estado === "NA_OP" || (v.estado === "ESTOQUE" && v.rInformado));
  });
}
