import "server-only";
import { prisma } from "./prisma";

// REVISÃO DO DATA BOOK — o que permite mudar um documento já emitido.
//
// Vitor (19/08/2026): "os data books emitidos não mexa em nada, é um documento. E sempre depois de
// emitido você não deve permitir salvar sem gerar uma revisão; e se for revisão, fazer o histórico
// da revisão e enviar para assinatura de todos novamente".
//
// A razão é simples e séria: um data book emitido foi assinado e provavelmente já está com o
// cliente. Se o conteúdo muda por baixo, o PDF que ele tem na mão deixa de ser o que o portal
// mostra — e numa auditoria as duas versões aparecem como se fossem a mesma. A revisão reconcilia:
// muda o número (R00 → R01), registra POR QUE mudou, e derruba todas as assinaturas.
//
// 🚫 As assinaturas NÃO são preservadas. Quem assinou a R00 não assinou a R01 — aproveitar a
// assinatura anterior seria atribuir a alguém a aprovação de um documento que essa pessoa não viu.

/** Estados em que o data book é DOCUMENTO, não rascunho. */
// ⚠⚠ `EM_ASSINATURA` FALTAVA AQUI, E ERA O BURACO MAIS SÉRIO DO MÓDULO. O status é gravado ao
// iniciar a cadeia de assinaturas (assinaturas/route.js) e a string aparecia UMA única vez no
// repositório inteiro — nesse write. Como não estava neste conjunto, `estaFechado()` devolvia
// false e as 9 rotas de seção continuavam aceitando alteração ENQUANTO o Elaborador, o Inspetor,
// o Responsável Técnico e por fim o CLIENTE assinavam.
//
// E o link que o cliente recebe regenera o PDF a cada clique (assinar/[token]/pdf), então o que
// foi assinado e o que o cliente baixa depois podiam ser documentos diferentes — sem revisão,
// sem rastro. Um data book que está sendo assinado é, por definição, um documento fechado.
export const ESTADOS_FECHADOS = new Set(["EMITIDO", "EM_ASSINATURA", "ENVIADO_CLIENTE", "ACEITO"]);

/** true se o data book já saiu do rascunho e exige revisão pra mudar. */
export function estaFechado(book) {
  return !!book?.emitidoEm || ESTADOS_FECHADOS.has(String(book?.status || ""));
}

/** Rótulo R00, R01… — é assim que a revisão aparece no PDF e na capa. */
export const rotuloRevisao = (n) => `R${String(Math.max(0, Number(n) || 0)).padStart(2, "0")}`;

/**
 * Erro pronto pra rota que tentou alterar um data book fechado.
 * Centralizado pra que toda rota dê a MESMA resposta — se cada uma inventar a sua, uma vai
 * esquecer e virar a porta dos fundos.
 */
export function erroPrecisaRevisao(book) {
  return {
    error: `Este data book está ${String(book?.status || "emitido").toLowerCase().replace(/_/g, " ")} (${rotuloRevisao(book?.revisao)}). ` +
      "Para alterar, gere uma nova revisão — o histórico fica registrado e as assinaturas são colhidas de novo.",
    precisaRevisao: true,
    revisaoAtual: book?.revisao ?? 0,
  };
}

/**
 * Abre uma revisão: incrementa o número, volta pra montagem e zera as assinaturas.
 *
 * @param {string} dataBookId
 * @param {{motivo:string, userId?:string, userNome?:string}} opts
 */
export async function abrirRevisao(dataBookId, { motivo, userId = null, userNome = null }) {
  const book = await prisma.dataBookQualidade.findUnique({
    where: { id: dataBookId },
    select: { id: true, opNumero: true, status: true, emitidoEm: true, revisao: true },
  });
  if (!book) throw Object.assign(new Error("Data book não encontrado"), { status: 404 });
  if (!estaFechado(book)) {
    throw Object.assign(new Error("Este data book ainda está em montagem — não há o que revisar."), { status: 400 });
  }
  const texto = String(motivo || "").trim();
  // ⚠ motivo é OBRIGATÓRIO: revisão sem motivo é mudança sem rastro, que é justamente o que a
  // revisão existe pra evitar.
  if (texto.length < 5) {
    throw Object.assign(new Error("Descreva o motivo da revisão (o que mudou e por quê)."), { status: 400 });
  }

  const nova = (book.revisao || 0) + 1;

  const [, , assinaturas] = await prisma.$transaction([
    prisma.dataBookRevisao.create({
      data: {
        dataBookId, revisao: nova, revisaoAnterior: book.revisao || 0,
        motivo: texto.slice(0, 1000),
        statusAnterior: book.status,
        emitidoEmAnterior: book.emitidoEm,
        criadoPorId: userId, criadoPorNome: userNome,
      },
    }),
    prisma.dataBookQualidade.update({
      where: { id: dataBookId },
      data: {
        revisao: nova,
        status: "EM_MONTAGEM",
        emitidoEm: null,
        // o aceite do cliente era da revisão anterior — não vale pra esta
        aceiteEm: null, aceiteNome: null, aceiteIp: null, enviadoClienteEm: null,
      },
    }),
    prisma.dataBookAssinatura.updateMany({
      where: { dataBookId },
      data: { status: "PENDENTE", enviadoEm: null, assinadoEm: null, assinadoNome: null, ip: null },
    }),
  ]);

  await prisma.dataBookRevisao.updateMany({
    where: { dataBookId, revisao: nova },
    data: { assinaturasZeradas: assinaturas.count },
  });

  return { revisao: nova, rotulo: rotuloRevisao(nova), assinaturasZeradas: assinaturas.count };
}
