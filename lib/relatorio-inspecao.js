import "server-only";
import { prisma } from "./prisma";
import { TIPO, codigoRelatorio, TIPO_LABEL } from "./qualidade-campo";

// AS FOTOS DO CELULAR VIRANDO DOCUMENTO.
//
// Vitor (21/08/2026): "não quero que só apareça no pdf, precisa aparecer na estruturação; e
// lembre-se, precisamos solicitar assinatura desses relatórios".
//
// "Estruturação" é a lista de seções do data book no portal. Um relatório que só existisse no PDF
// final seria invisível até a hora de gerar o livro — e é justamente ali que se confere o que falta.
// Por isso o relatório vira um `DocumentoQualidade` e é VINCULADO à seção: aparece na lista, conta
// como anexado, e entra no PDF pelo mesmo caminho de qualquer outro documento.

/**
 * Próximo número da série. Por OBRA e por TIPO — cada formulário tem a sua sequência.
 *
 * ⚠ Não reaproveita número de relatório apagado. Buraco na sequência é aceitável; número repetido
 * apontando pra dois documentos diferentes é o que a ISO não perdoa.
 */
export async function proximoNumero(opNumero, tipo) {
  const ultimo = await prisma.relatorioInspecao.findFirst({
    where: { opNumero, tipo },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return (ultimo?.numero || 0) + 1;
}

/**
 * Cria o relatório a partir das fotos escolhidas e as marca como usadas.
 *
 * @param {{opId?:string, opNumero:string, tipo:string, fotoIds:string[], titulo?:string,
 *          observacoes?:string, inspetor?:string, user:object}} p
 */
export async function criarRelatorio({ opId, opNumero, tipo, fotoIds, titulo, observacoes, inspetor, user }) {
  if (!opNumero || !tipo) throw Object.assign(new Error("OP e tipo são obrigatórios."), { status: 400 });
  const ids = [...new Set((fotoIds || []).filter(Boolean))];
  if (!ids.length) throw Object.assign(new Error("Escolha ao menos uma foto."), { status: 400 });

  // ⚠ só entram fotos DESTA OP e DESTE tipo que ainda não estão em outro relatório — senão a mesma
  // evidência apareceria em dois documentos, cada um afirmando ser o registro daquela inspeção.
  const fotos = await prisma.fotoInspecao.findMany({
    where: { id: { in: ids }, opNumero, tipo, relatorioId: null },
    select: { id: true },
  });
  if (!fotos.length) throw Object.assign(new Error("Nenhuma das fotos está disponível (podem já estar em outro relatório)."), { status: 409 });

  const numero = await proximoNumero(opNumero, tipo);
  const codigo = codigoRelatorio(tipo, opNumero, numero);

  const rel = await prisma.relatorioInspecao.create({
    data: {
      numero, codigo, opId: opId || null, opNumero, tipo,
      titulo: (titulo || "").trim() || null,
      observacoes: (observacoes || "").trim() || null,
      inspetor: (inspetor || "").trim() || user?.name || null,
      criadoPorId: user?.id || null, criadoPorNome: user?.name || null,
    },
  });

  await prisma.fotoInspecao.updateMany({
    where: { id: { in: fotos.map((f) => f.id) } },
    data: { relatorioId: rel.id },
  });

  return { ...rel, fotos: fotos.length };
}

/**
 * Coloca o relatório na seção do data book da OP — é o que o faz aparecer na estruturação.
 *
 * Devolve `{ vinculado:false, motivo }` quando não há onde colocar, em vez de estourar: o relatório
 * continua válido e assinável mesmo sem data book montado ainda.
 */
export async function vincularNoDataBook(rel, arquivoUrl) {
  const numeroSecao = TIPO[rel.tipo]?.secao;
  if (!numeroSecao) return { vinculado: false, motivo: "Este tipo de relatório não tem seção fixa no data book." };

  const book = await prisma.dataBookQualidade.findFirst({
    where: { opNumero: rel.opNumero },
    select: { id: true, status: true, emitidoEm: true, revisao: true },
  });
  if (!book) return { vinculado: false, motivo: `A OP-${rel.opNumero} ainda não tem data book criado.` };

  const secao = await prisma.dataBookSecao.findFirst({
    where: { dataBookId: book.id, numero: numeroSecao },
    select: { id: true, titulo: true, estado: true },
  });
  if (!secao) return { vinculado: false, motivo: `O data book da OP-${rel.opNumero} não tem a seção ${numeroSecao}.` };

  // documento já existe? (re-emissão do mesmo relatório atualiza, não duplica)
  let documentoId = rel.documentoId;
  const dados = {
    nome: `${rel.codigo} — ${rel.titulo || TIPO_LABEL[rel.tipo]}`,
    // o `tipo` é o que faz o documento ser reconhecido como desta seção depois
    tipo: `Anexo — ${secao.titulo}`,
    categoria: "RELATORIO",
    origem: "inspecao_campo",
    numeroDocumento: rel.codigo,
    arquivoUrl: arquivoUrl || null,
    opNumero: rel.opNumero,
    dataEmissao: rel.emitidoEm || new Date(),
    ativo: true,
  };

  if (documentoId) {
    await prisma.documentoQualidade.update({ where: { id: documentoId }, data: dados }).catch(() => {});
  } else {
    const doc = await prisma.documentoQualidade.create({ data: dados, select: { id: true } });
    documentoId = doc.id;
    await prisma.relatorioInspecao.update({ where: { id: rel.id }, data: { documentoId } });
  }

  await prisma.dataBookSecaoDoc.createMany({
    data: [{ secaoId: secao.id, documentoId }],
    skipDuplicates: true,
  });
  if (secao.estado !== "ANEXADO") {
    await prisma.dataBookSecao.update({ where: { id: secao.id }, data: { estado: "ANEXADO" } });
  }

  return { vinculado: true, secao: numeroSecao, secaoTitulo: secao.titulo, documentoId };
}
