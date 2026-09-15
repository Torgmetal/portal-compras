import "server-only";
import { prisma } from "./prisma";
import { completarImagens } from "./assinatura-cadastro";
import { baixarDesenho, garantirDesenhos } from "./relatorio-dimensional";
import { usaCotas } from "./qualidade-campo";
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

/**
 * Reconhece um documento cuja fonte é um relatório de inspeção.
 *
 * ⚠ Olha só o CAMINHO, nunca o host — é isso que faz os registros com `localhost` gravado
 * funcionarem sem precisar migrar dado, e que deixa o campo imune ao ambiente de quem gravou.
 * Aceita tanto a URL absoluta antiga quanto o caminho relativo que passou a ser gravado.
 *
 * @param {string|null} arquivoUrl
 * @returns {{relatorioId:string, revisao:number|null}|null}
 */
export function refDeInspecao(arquivoUrl) {
  const bruto = String(arquivoUrl || "").trim();
  if (!bruto) return null;
  const m = bruto.match(/\/api\/qualidade\/inspecoes\/([A-Za-z0-9_-]+)\/pdf(\?[^#]*)?/);
  if (!m) return null;
  const rev = (m[2] || "").match(/[?&]revisao=(\d+)/);
  return { relatorioId: m[1], revisao: rev ? Number(rev[1]) : null };
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
        select: { email: true, nome: true, setor: true, assinadoEm: true, ip: true, imagemUrl: true },
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
 * @param {{revisao?:number|null}} opts
 * @returns {Promise<Buffer>}
 */
export async function pdfDoRelatorio(relatorioId, { revisao = null } = {}) {
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id: relatorioId } });
  if (!rel) throw Object.assign(new Error("Relatório não encontrado"), { status: 404 });
  if (usaCotas(rel.tipo)) rel.desenhos = await garantirDesenhos(rel);

  const { fotos, assinaturas } = await anexosDo(rel, relatorioId);

  if (revisao != null) aplicarRevisao(rel, revisao);

  const op = await prisma.oP.findFirst({
    where: { numero: rel.opNumero }, select: { cliente: true, obra: true, refCliente: true },
  });
  const bytes = await gerarPDFdoRelatorio({
    rel, fotos, assinaturas,
    cliente: op?.cliente || null, obra: op?.obra || null, refCliente: op?.refCliente || null,
    desenhoBytes: (d) => baixarDesenho(d?.caminho || d?.url),
  });
  return { bytes: Buffer.from(bytes), nome: `${rel.codigo}.pdf` };
}
