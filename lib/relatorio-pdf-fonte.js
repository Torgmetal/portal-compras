import "server-only";
import { prisma } from "./prisma";
import { completarImagens } from "./assinatura-cadastro";
import { baixarDesenho, garantirDesenhos } from "./relatorio-dimensional";
import { usaCotas, TIPO_LABEL } from "./qualidade-campo";
import { gerarPDFdoRelatorio } from "./relatorio-render";

// ─── O PDF DO RELATÓRIO DE INSPEÇÃO, MONTADO AQUI DENTRO ─────────────────────
//
// ⚠⚠ O DOCUMENTO DE INSPEÇÃO NÃO TEM ARQUIVO — TEM UMA RECEITA. Ele não guarda binário: o PDF é
// remontado a partir do relatório e do snapshot da revisão (ver a rota do PDF). Para o data book,
// isso foi resolvido gravando em `arquivoUrl` uma URL ABSOLUTA da própria rota do portal, e o
// gerador buscava por `fetch`. Três coisas quebraram nisso, juntas (15/09/2026):
//
//   1. A URL carrega o host de QUEM GRAVOU. Fechar a inspeção rodando `npm run dev` — que escreve
//      no banco de PRODUÇÃO — gravou `http://localhost:3000/...` num documento de produção.
//   2. A rota do PDF exige sessão. Um `fetch` server-side não leva cookie: 401.
//   3. O proxy de download só sabe buscar Blob ou SharePoint, então respondia 400 "Arquivo
//      inválido" — foi o que o Matheus viu no botão do olho.
//
// A saída é não sair pela rede: quem precisa dos bytes chama `pdfDoRelatorio` e monta o mesmo
// documento em memória. Sem host, sem sessão, sem ambiente.

/** A origem que um documento PRECISA ter para que sua fonte seja um relatório de inspeção. */
export const ORIGEM_INSPECAO = "inspecao_campo";

const CAMINHO_PDF = /^\/api\/qualidade\/inspecoes\/([A-Za-z0-9_-]+)\/pdf\/?$/;

/**
 * Reconhece um documento cuja fonte é um relatório de inspeção.
 *
 * ⚠ Olha só o CAMINHO, nunca o host — é isso que faz os registros com `localhost` gravado
 * funcionarem sem precisar migrar dado, e que deixa o campo imune ao ambiente de quem gravou.
 * Aceita tanto a URL absoluta antiga quanto o caminho relativo que passou a ser gravado.
 *
 * ⚠⚠ O CASAMENTO É DO `pathname` INTEIRO, ANCORADO — e isso é um conserto de segurança (parecer do
 * Codex, 15/09/2026). A primeira versão procurava o trecho em QUALQUER lugar da string, então
 * `https://…blob…/anexo.pdf#/api/qualidade/inspecoes/<id>/pdf` — uma URL de Blob perfeitamente
 * válida, com o caminho escondido no FRAGMENTO — passava a ser servida como relatório interno. Um
 * documento da obra A podia anunciar um anexo e entregar o relatório da obra B, inclusive dentro
 * do livro montado e do portal do cliente. Sem âncora no fim, `…/pdf-qualquer-coisa` também casava.
 *
 * @param {string|null} arquivoUrl
 * @returns {{relatorioId:string, revisao:number|null}|null}
 */
export function refDeInspecao(arquivoUrl) {
  const bruto = String(arquivoUrl || "").trim();
  if (!bruto) return null;
  let u;
  // A base fictícia só existe para o caminho relativo (`/api/...`) virar URL; ela nunca é usada —
  // o host segue ignorado de propósito.
  try { u = new URL(bruto, "http://portal.invalido"); } catch { return null; }

  const m = u.pathname.match(CAMINHO_PDF);
  if (!m) return null;

  // ⚠ Revisão só entra inteira. `?revisao=abc` valia como "folha vigente" e entregava um documento
  // DIFERENTE do pedido, calado — é o oposto do que este arquivo existe para garantir.
  const rev = u.searchParams.get("revisao");
  if (rev !== null && !/^\d+$/.test(rev)) return null;
  return { relatorioId: m[1], revisao: rev === null ? null : Number(rev) };
}

/**
 * A fonte de um DOCUMENTO — o ponto único por onde o relatório de inspeção pode ser servido.
 *
 * ⚠⚠ RECEBE O DOCUMENTO, NÃO A URL, DE PROPÓSITO. Casar o caminho não basta: quem pode gravar
 * `arquivoUrl` (ADMIN/QUALIDADE, pela tela de documentos) poderia apontar deliberadamente para a
 * rota interna. Então valem três amarrações juntas, e nenhuma delas é dispensável:
 *   1. o caminho, ancorado (`refDeInspecao`);
 *   2. a ORIGEM do documento — só o que a própria inspeção gravou (`inspecao_campo`);
 *   3. a OBRA — conferida contra o relatório em `pdfDoRelatorio({ exigirOp })`.
 *
 * ⚠ Sem `opNumero` no documento a terceira amarração não tem como acontecer, e aqui isso RECUSA em
 * vez de liberar: um `select` futuro que esqueça o campo dá erro visível de arquivo, nunca um
 * anexo servido sem conferência.
 */
export function fonteDeInspecao(doc) {
  if (!doc || doc.origem !== ORIGEM_INSPECAO || !doc.opNumero) return null;
  const ref = refDeInspecao(doc.arquivoUrl);
  return ref ? { ...ref, exigirOp: doc.opNumero } : null;
}

// ─── A CÓPIA DA PASTA DA OBRA É O PRÓPRIO RELATÓRIO ──────────────────────────────────────────
//
// ⚠⚠ Vitor (24/09/2026): "Relatório de EVS e LP da OP-102 está puxando os relatórios sem assinatura".
// O relatório é arquivado na pasta da obra NA APROVAÇÃO (lib/relatorio-arquivo.js) — antes das
// assinaturas — e a cópia não acompanha o que vem depois. Quem monta o data book escolhe o arquivo
// pelo navegador do servidor, e na OP-102 a §12 ficou com as cópias de 21/09: o Alexandre saía
// "aguardando assinatura" no livro enquanto o portal já tinha as duas assinaturas. Medido em
// 24/09/2026: 7 documentos de data book nessa situação (OP-102: EVS-102-001, RLP-102-001…004;
// OP-089: RIP-089-001/002).
//
// A cópia é reconhecida pelo que o próprio arquivamento grava — nome `<código>[ Rnn] - <tipo>` e a
// pasta "8. Qualidade" da obra — e aí sai o relatório do portal, o mesmo da rota, com as assinaturas
// de agora. As amarrações de `fonteDeInspecao` continuam: ORIGEM (só o que veio do servidor), OBRA
// (o relatório é buscado pelo código DENTRO da obra do documento, e `pdfDoRelatorio` confere de
// novo) e, aqui, a REVISÃO: a cópia de uma revisão que não é a vigente continua sendo o arquivo,
// porque o relatório de hoje é outra folha.
const NOME_DA_COPIA = /^([A-Z]{2,5}-\d{2,4}-\d{2,4})(?: R(\d{2}))? - (.+)$/;

/**
 * Lê no documento o que o arquivamento grava. Puro — testável sem banco.
 * @returns {{codigo:string, revisao:number, rotulo:string}|null}
 */
export function copiaArquivadaDe(doc) {
  if (!doc || doc.origem !== "servidor" || !doc.opNumero) return null;
  const m = String(doc.nome || "").trim().replace(/\.pdf$/i, "").match(NOME_DA_COPIA);
  if (!m || !Object.values(TIPO_LABEL || {}).includes(m[3])) return null;
  let caminho = "";
  try { caminho = decodeURIComponent(new URL(String(doc.arquivoUrl || doc.sharepointUrl || "")).pathname); } catch { return null; }
  if (!caminho.includes("/8. Qualidade/")) return null;
  return { codigo: m[1], revisao: m[2] ? Number(m[2]) : 0, rotulo: m[3] };
}

/**
 * A fonte de um documento que é a CÓPIA ARQUIVADA de um relatório de inspeção — ou null.
 * @returns {Promise<{relatorioId:string, revisao:null, exigirOp:string}|null>}
 */
export async function fonteDeCopiaArquivada(doc) {
  const copia = copiaArquivadaDe(doc);
  if (!copia) return null;
  const rel = await prisma.relatorioInspecao.findFirst({
    where: { codigo: copia.codigo, opNumero: String(doc.opNumero) },
    select: { id: true, tipo: true, revisao: true },
  }).catch(() => null);
  if (!rel || TIPO_LABEL[rel.tipo] !== copia.rotulo || (rel.revisao ?? 0) !== copia.revisao) return null;
  return { relatorioId: rel.id, revisao: null, exigirOp: String(doc.opNumero) };
}

/**
 * ⚠⚠ O ANEXO DE UMA OBRA NÃO SERVE O RELATÓRIO DE OUTRA. É a amarração que vale mesmo: o portal do
 * cliente já filtra o documento por `opNumero`, mas o `arquivoUrl` dele podia apontar para um
 * relatório de qualquer obra — e aí o cliente da obra A baixaria o relatório da B.
 */
function conferirObra(rel, exigirOp) {
  if (exigirOp && String(rel.opNumero) !== String(exigirOp)) {
    throw Object.assign(new Error("Este anexo aponta para um relatório de outra obra."), { status: 409 });
  }
}

/**
 * Devolve o relatório ao estado daquela revisão, a partir do snapshot.
 *
 * ⚠ Reconstruído, não guardado: congelar o PDF exigiria manter um binário por revisão para
 * sempre, e ele poderia acabar contando história diferente do registro.
 */
function aplicarRevisao(rel, revisao) {
  const antiga = (Array.isArray(rel.revisoes) ? rel.revisoes : []).find((r) => r.revisao === Number(revisao));
  if (!antiga) {
    throw Object.assign(new Error(`Revisão R${String(revisao).padStart(2, "0")} não encontrada neste relatório.`), { status: 404 });
  }
  rel.linhas = antiga.linhas || [];
  rel.resultados = antiga.resultados || rel.resultados;
  rel.inspetor = antiga.inspetor || rel.inspetor;
  rel.revisao = antiga.revisao;
  rel.resultadoInspecao = antiga.resultadoInspecao;
}

/** Cliente, obra e referência do cliente — o cabeçalho que o render carimba na folha. */
async function cabecalhoDaObra(opNumero) {
  const op = await prisma.oP.findFirst({
    where: { numero: opNumero }, select: { cliente: true, obra: true, refCliente: true },
  });
  return { cliente: op?.cliente || null, obra: op?.obra || null, refCliente: op?.refCliente || null };
}

/** Fotos e assinaturas do relatório — o que o render precisa além do próprio registro. */
async function anexosDo(rel, relatorioId) {
  const fotos = await prisma.fotoInspecao.findMany({
    where: { relatorioId },
    orderBy: { capturadaEm: "asc" },
    select: { url: true, marca: true, origemMarca: true, observacao: true, capturadaEm: true, autorNome: true, evidencia: true },
  });
  // ⚠ quem assinou antes de ter imagem no cadastro ganha a imagem de agora — ver
  // lib/assinatura-imagem.js. Sem isto, anexar a assinatura depois não mudava o documento.
  const assinaturas = rel.envioAssinaturaId
    ? await completarImagens(await prisma.assinaturaDocumento.findMany({
        where: { envioId: rel.envioAssinaturaId },
        select: { id: true, email: true, nome: true, setor: true, assinadoEm: true, ip: true, imagemUrl: true },
        orderBy: { nome: "asc" },
      }))
    : null;
  return { fotos, assinaturas };
}

/**
 * Os bytes do PDF do relatório — a MESMA montagem que a rota serve.
 *
 * ⚠ `revisao` reconstrói a folha daquela rodada a partir do snapshot em `rel.revisoes`, como a
 * rota faz: é o que evidencia o retrabalho (o reprovado e o aprovado) sem guardar um binário por
 * revisão, que teria de ser mantido em pé para sempre e poderia divergir do registro.
 *
 * @param {string} relatorioId
 * @param {{revisao?:number|null, exigirOp?:string|null}} opts
 * @returns {Promise<Buffer>}
 */
export async function pdfDoRelatorio(relatorioId, { revisao = null, exigirOp = null } = {}) {
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id: relatorioId } });
  if (!rel) throw Object.assign(new Error("Relatório não encontrado"), { status: 404 });

  conferirObra(rel, exigirOp);
  if (usaCotas(rel.tipo)) rel.desenhos = await garantirDesenhos(rel);

  const { fotos, assinaturas } = await anexosDo(rel, relatorioId);

  if (revisao != null) aplicarRevisao(rel, revisao);

  const bytes = await gerarPDFdoRelatorio({
    rel, fotos, assinaturas, ...(await cabecalhoDaObra(rel.opNumero)),
    desenhoBytes: (d) => baixarDesenho(d?.caminho || d?.url),
  });
  return { bytes: Buffer.from(bytes), nome: `${rel.codigo}.pdf` };
}
