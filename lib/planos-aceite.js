import "server-only";
import { PIT_PADRAO } from "./pit-padroes";

// ─── ACEITE DO CLIENTE NO PIT E NO PLP ────────────────────────────────────────
// Vitor (26/08/2026): "não quero que gere apenas o excel, quero que mande para assinatura como te
// disse, e será através de um e-mail que será enviado, e já fique mostrando o status no portal do
// cliente; o PIT também deve conter o aceite por parte do cliente, não pode deixar de ter esse
// aceite".
//
// ⚠⚠ SÃO OS DOIS DOCUMENTOS QUE O CLIENTE APROVA ANTES DE FABRICAR. O PIT diz o que vai ser
// inspecionado e com que critério; o PLP diz como a peça vai ser preparada e pintada. Emitir sem o
// aceite é fabricar contra um plano que o cliente ainda pode recusar — e a recusa, quando vem,
// chega depois da peça pronta.
//
// ⚠ REAPROVEITA O MOTOR QUE JÁ EXISTE (EnvioAssinatura / AssinaturaDocumento / /assinar/[token]),
// o mesmo do Plano de Treinamentos e do Cronograma de Auditoria. O que muda é que estes dois são
// DE UMA OBRA — daí a coluna `opNumero` no envio.
//
// ⚠ O NÚMERO E A REVISÃO SÃO OS DO DOCUMENTO, não um contador do portal. O PLP tem o seu ("PLP Nº
// T112, Rev 0", da planilha controlada) e o PIT tem `OP.pitRevisao`. Inventar numeração aqui foi
// exatamente o erro que o portal do cliente cometeu com a lista de expedição (26/08).
export const DOCS = {
  PLP: {
    tipo: "PLP", nome: "Plano de Pintura", sigla: "PLP",
    resumo: "Preparação de superfície, esquema de pintura e as cores por item.",
  },
  PIT: {
    tipo: "PIT", nome: "Plano de Inspeção e Testes", sigla: "PIT",
    resumo: "O que é inspecionado em cada etapa, com critério de aceitação e percentual.",
  },
};

/** "T112" — o número do documento nesta obra. O zero à esquerda cai; "T67" seria outra obra. */
export const numeroDoDoc = (sigla, opNumero) => `${sigla} T${String(opNumero || "").replace(/\D/g, "").padStart(3, "0")}`;

/** A revisão como INTEIRO, que é o que o envio guarda. "0" → 0 · "R01" → 1 · "Rev. 2" → 2 */
export const revisaoInt = (v) => {
  const m = String(v ?? "").match(/\d+/);
  return m ? Math.min(99, parseInt(m[0], 10)) : 0;
};

/**
 * O documento pronto para enviar: título, revisão e o SNAPSHOT do que o cliente vai aceitar.
 *
 * ⚠ O SNAPSHOT É O DOCUMENTO. Depois de enviado, o PLP pode mudar de cor e o PIT de padrão — o que
 * o cliente aceitou não pode mudar junto. É a mesma razão do snapshot do Plano de Treinamentos.
 */
/**
 * O cabeçalho da obra, como ele tem de sair em QUALQUER documento controlado.
 *
 * Vitor (26/08/2026): "as informações de número do pedido, local da obra, cliente, número da OP —
 * várias você consegue puxar do portal ou da pasta da OP, deixe isso certo já".
 *
 * ⚠ UM LUGAR SÓ. O Excel do PLP montava isto por conta própria; se o PDF que o cliente aceita
 * montasse de novo, os dois divergiriam no dia em que um deles mudasse — e o que ele aceitou não
 * seria o que a gente emitiu.
 */
export async function dadosDaObra(prisma, opNumero) {
  const op = await prisma.oP.findFirst({
    where: { numero: opNumero },
    select: {
      id: true, numero: true, cliente: true, clienteRazaoSocial: true, obra: true, refCliente: true,
      clienteCidade: true, clienteUF: true, pitPadrao: true, pitRevisao: true, clienteContatos: true,
    },
  });
  if (!op) return null;
  const kick = await prisma.oPKickOff.findFirst({
    where: { opId: op.id },
    select: { pedidoCompraCliente: true, entregaEndereco: true },
    orderBy: { updatedAt: "desc" },
  }).catch(() => null);
  // ⚠ o local cai para a cidade/UF do cliente só quando o Kick Off não tem endereço de entrega —
  // é a melhor aproximação disponível, e vazio é melhor que errado.
  return {
    ...op,
    // razão social é o nome que vai em documento controlado; o apelido fica de reserva
    cliente: op.clienteRazaoSocial || op.cliente,
    local: kick?.entregaEndereco || [op.clienteCidade, op.clienteUF].filter(Boolean).join(" - ") || "",
    pedidoCliente: kick?.pedidoCompraCliente || "",
  };
}

export async function montarPlano(prisma, doc, opNumero) {
  const def = DOCS[doc];
  if (!def) return { erro: "Documento desconhecido." };

  const op = await dadosDaObra(prisma, opNumero);
  if (!op) return { erro: `OP-${opNumero} não encontrada.` };

  if (doc === "PIT") {
    if (!op.pitPadrao || !PIT_PADRAO[op.pitPadrao]) {
      return { erro: "Escolha o padrão do PIT antes de enviar para aceite do cliente." };
    }
    const padrao = PIT_PADRAO[op.pitPadrao];
    const revisao = revisaoInt(op.pitRevisao);
    return {
      op, revisao,
      numero: numeroDoDoc("PIT", op.numero),
      titulo: `${numeroDoDoc("PIT", op.numero)} — Plano de Inspeção e Testes · ${op.obra || op.cliente || ""}`.trim(),
      snapshot: {
        doc: "PIT", opNumero: op.numero, padrao: op.pitPadrao, revisao: op.pitRevisao || "0",
        numero: numeroDoDoc("PIT", op.numero), nomePadrao: padrao.nome, snqc: !!padrao.snqc,
        linhas: padrao.linhas,
        obra: op.obra || null, cliente: op.cliente || null, local: op.local || null,
        refCliente: op.refCliente || null, pedidoCliente: op.pedidoCliente || null,
      },
    };
  }

  const plp = await prisma.planoPintura.findUnique({ where: { opNumero } });
  if (!plp) {
    return { erro: "Esta obra ainda não tem o plano de pintura. Leia o PLP da pasta da obra ou preencha o plano antes de enviar." };
  }
  const revisao = revisaoInt(plp.revisao);
  return {
    op, revisao,
    numero: numeroDoDoc("PLP", op.numero),
    titulo: `${numeroDoDoc("PLP", op.numero)} — Plano de Pintura · ${op.obra || op.cliente || ""}`.trim(),
    snapshot: {
      doc: "PLP", opNumero: op.numero, revisao: plp.revisao || "0", numero: numeroDoDoc("PLP", op.numero),
      preparoMetodo: plp.preparoMetodo, grauLimpeza: plp.grauLimpeza, abrasivo: plp.abrasivo,
      rugosidadeMin: plp.rugosidadeMin, rugosidadeMax: plp.rugosidadeMax, metodoAplicacao: plp.metodoAplicacao,
      demaos: plp.demaos || [], itens: plp.itens || [], espessuraTotal: plp.espessuraTotal,
      observacoes: plp.observacoes || null,
      obra: op.obra || null, cliente: op.cliente || null, local: op.local || null,
      refCliente: op.refCliente || null, pedidoCliente: op.pedidoCliente || null,
    },
  };
}

/**
 * Como está o aceite dos dois documentos nesta obra.
 *
 * ⚠ VALE O ÚLTIMO ENVIO DE CADA DOCUMENTO. Um PIT aceito na revisão 0 não vale para a revisão 1 —
 * e o portal do cliente precisa dizer "aguardando aceite" quando a revisão nova saiu, mesmo com a
 * anterior aceita, senão a tela afirma um aceite que não existe para o documento vigente.
 */
export async function statusDosPlanos(prisma, opNumero) {
  const envios = await prisma.envioAssinatura.findMany({
    where: { opNumero, tipo: { in: ["PLP", "PIT"] } },
    orderBy: { enviadoEm: "desc" },
    select: {
      id: true, tipo: true, revisao: true, titulo: true, enviadoEm: true,
      assinaturas: { select: { nome: true, email: true, setor: true, assinadoEm: true, ip: true }, orderBy: { nome: "asc" } },
    },
    take: 40,
  });
  const porDoc = {};
  for (const doc of ["PIT", "PLP"]) {
    const meus = envios.filter((e) => e.tipo === doc);
    const ultimo = meus[0] || null;
    const aceitas = (ultimo?.assinaturas || []).filter((a) => a.assinadoEm);
    porDoc[doc] = {
      enviado: !!ultimo,
      envioId: ultimo?.id || null,
      titulo: ultimo?.titulo || null,
      revisao: ultimo?.revisao ?? null,
      enviadoEm: ultimo?.enviadoEm || null,
      total: ultimo?.assinaturas?.length || 0,
      aceites: aceitas.length,
      // ⚠ UM ACEITE BASTA: quem assina é o inspetor do cliente, não um colegiado. Exigir todos faria
      // um e-mail de cópia sem resposta segurar um plano já aprovado por quem responde por ele.
      aceito: aceitas.length > 0,
      aceitoEm: aceitas[0]?.assinadoEm || null,
      aceitoPor: aceitas[0]?.nome || null,
      pendentes: (ultimo?.assinaturas || []).filter((a) => !a.assinadoEm).map((a) => a.nome || a.email),
      historico: meus.map((e) => ({
        id: e.id, revisao: e.revisao, enviadoEm: e.enviadoEm,
        aceito: e.assinaturas.some((a) => a.assinadoEm),
        quem: e.assinaturas.filter((a) => a.assinadoEm).map((a) => ({ nome: a.nome, em: a.assinadoEm })),
      })),
    };
  }
  return porDoc;
}

/**
 * O Excel do plano — o entregável de verdade, o mesmo que a aba da Qualidade emite.
 *
 * ⚠ SAI DO SNAPSHOT quando existe um envio. O anexo do e-mail e o arquivo que a página de aceite
 * oferece têm de ser o documento ENVIADO, não o cadastro de hoje: se o PLP mudar de cor depois do
 * envio, quem abrir o link tem de ver o que aceitou.
 */
export async function excelDoPlano(prisma, doc, opNumero, { snapshot = null, usuario = null } = {}) {
  const op = await dadosDaObra(prisma, opNumero);
  if (!op) return null;

  if (doc === "PIT") {
    const { gerarPitExcel } = await import("./pit-excel");
    const padrao = snapshot?.padrao || op.pitPadrao;
    if (!padrao || !PIT_PADRAO[padrao]) return null;
    return {
      nome: `PIT-T${opNumero}.xlsx`,
      bytes: await gerarPitExcel({ op, padrao, revisao: snapshot?.revisao || op.pitRevisao || "0", usuario }),
    };
  }

  const { gerarPlpExcel } = await import("./plp-excel");
  const plp = snapshot
    ? {
        revisao: snapshot.revisao, preparoMetodo: snapshot.preparoMetodo, grauLimpeza: snapshot.grauLimpeza,
        abrasivo: snapshot.abrasivo, rugosidadeMin: snapshot.rugosidadeMin, rugosidadeMax: snapshot.rugosidadeMax,
        metodoAplicacao: snapshot.metodoAplicacao, demaos: snapshot.demaos || [], itens: snapshot.itens || [],
        espessuraTotal: snapshot.espessuraTotal, observacoes: snapshot.observacoes,
      }
    : await prisma.planoPintura.findUnique({ where: { opNumero } });
  if (!plp) return null;
  return { nome: `PLP-T${opNumero}.xlsx`, bytes: await gerarPlpExcel({ plp, op, usuario }) };
}
