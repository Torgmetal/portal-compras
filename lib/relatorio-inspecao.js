import "server-only";
import { valoresIniciaisInspecao } from "./padroes-inspecao";
import { procedimentoDoTipo } from "./importar-procedimentos";
import { prisma } from "./prisma";
import { tipoNoEscopo } from "./qualidade-escopo";
import { TIPO, codigoRelatorio, TIPO_LABEL } from "./qualidade-campo";
import { estaFechado } from "./databook-revisao";

/** A base pública do portal — o data book busca os anexos por fetch no servidor. */

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
 *
 * ⚠⚠ E "APAGADO" INCLUI O QUE JÁ NÃO ESTÁ NA TABELA. Esta função lia só o maior número dos
 * relatórios VIVOS — apagado o RIP-089-001, o próximo nascia 001 de novo, e o PDF do apagado
 * continuava na pasta da obra. Vitor (15/09/2026): "o relatório de pintura por alguma razão
 * ficaram numerados como 001 dois relatórios". Na OP-089 o 001 foi criado três vezes (22/08,
 * 25/08 e 14/09) e a pasta ficou com "RIP-089-001 … .pdf" e "RIP-089-001 … 1.pdf". O AuditLog
 * guarda o código de todo relatório criado e excluído: é ele que diz o maior número JÁ EMITIDO.
 */
export async function proximoNumero(opNumero, tipo) {
  const [ultimo, emitidos] = await Promise.all([
    prisma.relatorioInspecao.findFirst({
      where: { opNumero, tipo },
      orderBy: { numero: "desc" },
      select: { numero: true },
    }),
    numerosJaEmitidos(opNumero, tipo),
  ]);
  return Math.max(ultimo?.numero || 0, ...emitidos) + 1;
}

/** Os números que o AuditLog registra para esta OP+tipo (criados e excluídos) — vazio se a consulta falhar. */
async function numerosJaEmitidos(opNumero, tipo) {
  const prefixo = codigoRelatorio(tipo, opNumero, 0).replace(/000$/, "");
  const logs = await prisma.auditLog.findMany({
    where: { entity: "RelatorioInspecao", diff: { path: ["codigo"], string_starts_with: prefixo } },
    select: { diff: true },
  }).catch(() => []);
  return (Array.isArray(logs) ? logs : [])
    .map((l) => String(l?.diff?.codigo || ""))
    .filter((c) => c.startsWith(prefixo))
    .map((c) => parseInt(c.slice(prefixo.length), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Cria o relatório a partir das fotos escolhidas e as marca como usadas.
 *
 * @param {{opId?:string, opNumero:string, tipo:string, fotoIds:string[], titulo?:string,
 *          observacoes?:string, inspetor?:string, user:object}} p
 */
export async function criarRelatorio({ opId, opNumero, tipo, fotoIds, titulo, observacoes, inspetor, user }) {
  if (!opNumero || !tipo) throw Object.assign(new Error("OP e tipo são obrigatórios."), { status: 400 });

  // ⚠ O ESCOPO DA OBRA MANDA. Obra que só faz certificado e pintura não abre relatório de
  // ultrassom nem por engano — e o motivo tem que aparecer, senão vira "o botão não funciona".
  {
    const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { escopoQualidade: true } });
    if (op && !tipoNoEscopo(op, tipo)) {
      throw Object.assign(
        new Error(`A OP-${opNumero} não prevê este relatório. Ajuste o escopo de qualidade na OP se isso mudou.`),
        { status: 409 },
      );
    }
  }
  const ids = [...new Set((fotoIds || []).filter(Boolean))];
  if (!ids.length) throw Object.assign(new Error("Escolha ao menos uma foto."), { status: 400 });

  // ⚠ só entram fotos DESTA OP e DESTE tipo que ainda não estão em outro relatório — senão a mesma
  // evidência apareceria em dois documentos, cada um afirmando ser o registro daquela inspeção.
  const fotos = await prisma.fotoInspecao.findMany({
    where: { id: { in: ids }, opNumero, tipo, relatorioId: null },
    select: { id: true, equipamentos: true },
  });
  if (!fotos.length) throw Object.assign(new Error("Nenhuma das fotos está disponível (podem já estar em outro relatório)."), { status: 409 });

  // ── INSTRUMENTOS UTILIZADOS ────────────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026): "ele seleciona os equipamentos que está usando para compor no relatório".
  // O inspetor marca no celular, foto a foto; aqui vira a lista única do documento (a mesma trena
  // aparece em vinte fotos e no relatório tem de aparecer uma vez).
  //
  // ⚠ Usa o SNAPSHOT gravado na foto, não o cadastro de hoje: se o certificado foi renovado depois
  // da inspeção, o relatório continua mostrando o que estava valendo no dia.
  const porId = new Map();
  for (const f of fotos) {
    for (const e of Array.isArray(f.equipamentos) ? f.equipamentos : []) {
      if (e?.id && !porId.has(e.id)) porId.set(e.id, e);
    }
  }
  const instrumentos = [...porId.values()];

  const numero = await proximoNumero(opNumero, tipo);
  const codigo = codigoRelatorio(tipo, opNumero, numero);

  const semente = await valoresIniciaisInspecao(opNumero, tipo);
  const proc = await procedimentoDoTipo(tipo);
  const rel = await prisma.relatorioInspecao.create({
    data: {
      numero, codigo, opId: opId || null, opNumero, tipo,
      resultados: { ...semente, procedimento: proc?.nome || null, procedimentoId: proc?.id || null },
      titulo: (titulo || "").trim() || null,
      observacoes: (observacoes || "").trim() || null,
      inspetor: (inspetor || "").trim() || user?.name || null,
      equipamentos: instrumentos.length ? instrumentos : undefined,
      criadoPorId: user?.id || null, criadoPorNome: user?.name || null,
    },
  });

  await prisma.fotoInspecao.updateMany({
    where: { id: { in: fotos.map((f) => f.id) } },
    data: { relatorioId: rel.id },
  });

  return { ...rel, fotos: fotos.length, instrumentos: instrumentos.length, instrumentosVencidos: instrumentos.filter((e) => e.vencido).length };
}

/**
 * Anexa uma REVISÃO ENCERRADA ao data book, ao lado da vigente.
 *
 * Vitor (21/08/2026): "nos casos dos relatórios que foram reprovados você deve mencionar no data
 * book tanto o reprovado quanto o aprovado, evidenciando o retrabalho".
 *
 * ⚠ É UM DOCUMENTO À PARTE, não uma versão que substitui. O data book precisa mostrar a sequência —
 * reprovou, reparou, reinspecionou, aprovou. Guardar só a versão aprovada esconderia o retrabalho,
 * que é justamente o que o cliente e o auditor querem ver documentado.
 *
 * ⚠ O nome diz o resultado. "EVS-089-001 R00 (reprovado)" ao lado de "EVS-089-001 R01" é legível
 * numa lista; sem o rótulo, os dois anexos pareceriam duplicata e alguém apagaria um.
 */
export async function anexarRevisaoNoDataBook(rel, revisaoFechada) {
  const numeroSecao = TIPO[rel.tipo]?.secao;
  if (!numeroSecao || !revisaoFechada) return { vinculado: false, motivo: "sem seção para este tipo" };

  const book = await prisma.dataBookQualidade.findFirst({ where: { opNumero: rel.opNumero }, select: { id: true } });
  if (!book) return { vinculado: false, motivo: `A OP-${rel.opNumero} ainda não tem data book criado.` };
  const secao = await prisma.dataBookSecao.findFirst({
    where: { dataBookId: book.id, numero: numeroSecao }, select: { id: true, titulo: true, estado: true },
  });
  if (!secao) return { vinculado: false, motivo: `O data book não tem a seção ${numeroSecao}.` };

  const rot = `R${String(revisaoFechada.revisao ?? 0).padStart(2, "0")}`;
  const resultado = (revisaoFechada.resultadoInspecao || "").toLowerCase();
  const numeroDoc = `${rel.codigo} ${rot}`;

  // reimportar a mesma revisão não deve duplicar
  const existente = await prisma.documentoQualidade.findFirst({
    where: { categoria: "RELATORIO", numeroDocumento: numeroDoc },
    select: { id: true },
  });

  const dados = {
    nome: `${rel.codigo} ${rot} — ${TIPO_LABEL[rel.tipo]}${resultado ? ` (${resultado})` : ""}`,
    tipo: `Anexo — ${secao.titulo}`,
    categoria: "RELATORIO",
    origem: "inspecao_campo",
    numeroDocumento: numeroDoc,
    opNumero: rel.opNumero,
    dataEmissao: revisaoFechada.emEm ? new Date(revisaoFechada.emEm) : new Date(),
    observacao: `Revisão encerrada como ${revisaoFechada.resultadoInspecao || "—"}. Evidência do retrabalho.`,
    // ⚠⚠ CAMINHO RELATIVO, E NÃO URL ABSOLUTA (15/09/2026). Era absoluta porque o data book buscava
    // o arquivo por `fetch` no servidor — mas a URL levava junto o HOST DE QUEM GRAVOU: fechar a
    // inspeção rodando `npm run dev`, que escreve no banco de PRODUÇÃO, gravou
    // `http://localhost:3000/...` num documento de produção, e ninguém viu. Hoje ninguém mais busca
    // isto pela rede: `lib/relatorio-pdf-fonte.js` monta o mesmo PDF em memória, e lê só o CAMINHO
    // (inclusive dos registros antigos, com host errado ou não). `?revisao=N` reconstrói a folha
    // daquela rodada a partir do snapshot, sem guardar um binário por revisão.
    arquivoUrl: `/api/qualidade/inspecoes/${rel.id}/pdf?revisao=${revisaoFechada.revisao ?? 0}`,
    ativo: true,
  };

  const doc = existente
    ? await prisma.documentoQualidade.update({ where: { id: existente.id }, data: dados, select: { id: true } })
    : await prisma.documentoQualidade.create({ data: dados, select: { id: true } });

  // ⚠ REGISTRA, NÃO PÕE NO LIVRO. Quem abre revisão ou reinspeciona está devolvendo o relatório a
  // rascunho: a rodada encerrada só entra no data book JUNTO com o relatório assinado por todos
  // (`vincularNoDataBook`), e só se for retrabalho ou tiver sido assinada — ver `revisaoEntraNoLivro`.
  return { vinculado: false, registrado: true, secao: numeroSecao, documentoId: doc.id, rotulo: rot };
}

// ─── SÓ RELATÓRIO ASSINADO ENTRA NO DATA BOOK ─────────────────────────────────────────────────
//
// ⚠⚠ Vitor (25/09/2026), no data book da OP-112: "ainda está puxando relatórios em rascunho e
// falamos de puxar apenas os que estiverem assinados". O relatório entrava no livro na CRIAÇÃO, de
// novo ao ser enviado, e ficava lá durante a revisão — com o PDF, que é gerado ao vivo, mostrando o
// rascunho. Medido em 25/09: 5 rascunhos e 4 relatórios com assinatura incompleta em livros abertos.
// É a regra que o PIT/PLP já seguia (26/08: "anexar ao Data Book depois de todos terem aprovado").
//
// Agora esta função SINCRONIZA: assinado por todos → entra (com as rodadas encerradas que o
// acompanham); qualquer outro estado → sai do livro, se estava. Quem põe no livro é a última
// assinatura (`aoConcluirAssinaturas`); criar, editar, enviar e abrir revisão só podem tirar.
//
// ⚠ Livro FECHADO não recebe nem perde nada — documento emitido só muda por revisão
// (lib/databook-revisao.js). Antes esta função nem olhava isso. E sem onde colocar (OP sem data
// book) devolve `{ vinculado:false, motivo }` em vez de estourar: o relatório segue assinável.

/** Todas as assinaturas do envio feitas (e ao menos uma). */
export async function assinaturaCompleta(db, envioId) {
  if (!envioId) return false;
  const ass = await db.assinaturaDocumento.findMany({ where: { envioId }, select: { assinadoEm: true } });
  return ass.length > 0 && ass.every((a) => a.assinadoEm);
}

/**
 * A rodada encerrada acompanha o relatório assinado? A REPROVADA (ou com exame complementar) sim —
 * é o retrabalho, que tem de aparecer (Vitor, 21/08/2026). A assinada por todos também. A versão
 * corrigida no meio do caminho, sem as assinaturas, não: é rascunho que ficou para trás.
 */
export function revisaoEntraNoLivro(snap) {
  if (["REPROVADO", "REC"].includes(snap?.resultadoInspecao)) return true;
  const ass = Array.isArray(snap?.assinaturas) ? snap.assinaturas : [];
  return ass.length > 0 && ass.every((a) => a.assinadoEm);
}

// os documentos das rodadas encerradas deste relatório ("RIP-112-001 R00", …), com a rodada de cada um
async function docsDasRevisoes(rel) {
  const docs = await prisma.documentoQualidade.findMany({
    where: { categoria: "RELATORIO", origem: "inspecao_campo", numeroDocumento: { startsWith: `${rel.codigo} R` } },
    select: { id: true, numeroDocumento: true },
  });
  const revisoes = Array.isArray(rel.revisoes) ? rel.revisoes : [];
  return docs.map((d) => ({
    id: d.id,
    snap: revisoes.find((r) => `${rel.codigo} R${String(r?.revisao ?? 0).padStart(2, "0")}` === d.numeroDocumento) || null,
  }));
}

// tira do livro (aberto) e devolve a seção a pendente se ela ficou vazia
async function tirarDoLivro(bookId, secao, ids) {
  if (!ids.length) return;
  await prisma.dataBookSecaoDoc.deleteMany({ where: { documentoId: { in: ids }, secao: { dataBookId: bookId } } });
  if (secao.estado === "ANEXADO" && !(await prisma.dataBookSecaoDoc.count({ where: { secaoId: secao.id } }))) {
    await prisma.dataBookSecao.update({ where: { id: secao.id }, data: { estado: "PENDENTE" } });
  }
}

// cria ou atualiza o documento que representa o relatório no livro
async function documentoDoRelatorio(rel, secao, arquivoUrl) {
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
  if (rel.documentoId) {
    // ⚠⚠ SEM ARQUIVO NA MÃO, O ARQUIVO QUE JÁ ESTÁ FICA. A edição do título chama esta função com
    // `null` só para o NOME acompanhar — e o null era gravado em `arquivoUrl`, soltando o PDF do
    // data book até alguém reenviar para assinatura (achado da varredura de 23/09/2026).
    const { arquivoUrl: _semArquivo, ...soOsDados } = dados;
    await prisma.documentoQualidade.update({ where: { id: rel.documentoId }, data: arquivoUrl ? dados : soOsDados }).catch(() => {});
    return rel.documentoId;
  }
  const doc = await prisma.documentoQualidade.create({ data: dados, select: { id: true } });
  await prisma.relatorioInspecao.update({ where: { id: rel.id }, data: { documentoId: doc.id } });
  return doc.id;
}

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

  const documentoId = await documentoDoRelatorio(rel, secao, arquivoUrl);
  if (estaFechado(book)) return { vinculado: false, motivo: `O data book da OP-${rel.opNumero} está emitido — só muda por revisão.`, documentoId };

  const revisoes = await docsDasRevisoes(rel);
  if (!(await assinaturaCompleta(prisma, rel.envioAssinaturaId))) {
    await tirarDoLivro(book.id, secao, [documentoId, ...revisoes.map((d) => d.id)]);
    return { vinculado: false, aguardaAssinatura: true, secao: numeroSecao, secaoTitulo: secao.titulo, documentoId, motivo: "entra no data book quando todos assinarem" };
  }

  const acompanham = revisoes.filter((d) => revisaoEntraNoLivro(d.snap)).map((d) => d.id);
  await tirarDoLivro(book.id, secao, revisoes.filter((d) => !revisaoEntraNoLivro(d.snap)).map((d) => d.id));
  await prisma.dataBookSecaoDoc.createMany({
    data: [documentoId, ...acompanham].map((id) => ({ secaoId: secao.id, documentoId: id })),
    skipDuplicates: true,
  });
  if (secao.estado !== "ANEXADO") {
    await prisma.dataBookSecao.update({ where: { id: secao.id }, data: { estado: "ANEXADO" } });
  }
  return { vinculado: true, secao: numeroSecao, secaoTitulo: secao.titulo, documentoId };
}

/**
 * A última assinatura de um envio. Relatório de inspeção entra no data book aqui — com o PDF pelo
 * CAMINHO relativo (ver o comentário de `anexarRevisaoNoDataBook`: URL absoluta levava o host de quem
 * gravou). O PIT/PLP segue o caminho dele, na rota de assinatura.
 */
export async function aoConcluirAssinaturas(envio) {
  if (envio?.tipo !== "RELATORIO_INSPECAO" || !envio.snapshot?.relatorioId) return null;
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id: envio.snapshot.relatorioId } });
  if (!rel) return null;
  return vincularNoDataBook(rel, `/api/qualidade/inspecoes/${rel.id}/pdf`);
}

/**
 * Anexar À MÃO também segue a regra: documento de relatório que ainda não foi assinado por todos
 * (ou rodada encerrada que não acompanha o relatório) é recusado, com o motivo. Devolve a mensagem,
 * ou null quando pode entrar.
 */
export async function bloqueioRelatorioNaoAssinado(db, documentoId) {
  const doc = await db.documentoQualidade.findUnique({ where: { id: documentoId }, select: { id: true, categoria: true, origem: true, numeroDocumento: true } });
  if (doc?.categoria !== "RELATORIO" || doc.origem !== "inspecao_campo") return null;
  const [codigo, rotulo] = String(doc.numeroDocumento || "").split(" ");
  const rel = await db.relatorioInspecao.findFirst({ where: { codigo }, select: { envioAssinaturaId: true, revisoes: true } });
  if (!rel) return null;
  const aguarda = "Este relatório ainda não foi assinado por todos — ele entra sozinho no data book quando a última assinatura for feita.";
  if (!(await assinaturaCompleta(db, rel.envioAssinaturaId))) return aguarda;
  if (!rotulo) return null;
  const snap = (Array.isArray(rel.revisoes) ? rel.revisoes : []).find((r) => `R${String(r?.revisao ?? 0).padStart(2, "0")}` === rotulo);
  return revisaoEntraNoLivro(snap) ? null : "Esta rodada do relatório não foi assinada e não é retrabalho — fica fora do data book.";
}
