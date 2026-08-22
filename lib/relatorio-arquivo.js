import "server-only";
import { prisma } from "./prisma";
import { uploadFileToFolder, acharPastaOp } from "./sharepoint";
import { baixarDesenho } from "./relatorio-dimensional";
import { gerarPDFdoRelatorio } from "./relatorio-render";
import { TIPO_LABEL } from "./qualidade-campo";

// ─── BACKUP DO RELATÓRIO NA PASTA DA OBRA ─────────────────────────────────────
// Vitor (22/08/2026): "além de tudo, salvar os relatórios em PDF na pasta da qualidade
// de cada OP para podermos garantir o backup" — apontando para
//   OP-XXX / 8. Qualidade / 3. Relatórios de Inspeção
//
// ⚠ O PORTAL NÃO É O ARQUIVO DA OBRA. Hoje o relatório vive no banco e o PDF é gerado
// sob demanda: se o portal sair do ar, ou se o registro for apagado, não sobra papel
// nenhum. A pasta da OP no servidor é onde a Torg guarda o que a obra produziu há anos —
// é lá que o auditor e o cliente vão procurar, e é lá que o documento tem de estar.
//
// ⚠ ARQUIVA NA APROVAÇÃO, não a cada salvamento. Rascunho que muda dez vezes por dia
// encheria a pasta de versões e ninguém saberia qual vale. O que se guarda é o
// documento fechado.

const PASTA_QUALIDADE = "8. Qualidade";
// O padrão novo, conforme a OP-000 PADRÃO que o Vitor apontou.
const SUBPASTA_PADRAO = "3. Relatórios de Inspeção";

/**
 * Onde guardar, nesta obra.
 *
 * ⚠ AS OBRAS NÃO TÊM A MESMA ARRUMAÇÃO. A OP-089 já segue o molde novo
 * ("1. PIT", "2. PLP", "3. Relatórios de Inspeção"); a OP-067 é do molde antigo e tem
 * pastas por tipo ("Relatório Dimensional", "Relatórios de Pintura", "Relatórios de US").
 * Criar a pasta padrão à força na obra antiga espalharia o mesmo assunto por dois
 * lugares — e quem procura o relatório de pintura da OP-067 continuaria olhando na
 * pasta de sempre.
 *
 * Então: usa a pasta de relatórios que JÁ existe; só cria a padrão quando não há
 * nenhuma. Assim a obra nova nasce no molde e a antiga não é reorganizada por um robô.
 */
async function subpastaDeRelatorios(driveId, pastaQualidade, tipo) {
  const { listChildrenByPath } = await import("./sharepoint");
  const filhos = await listChildrenByPath(driveId, pastaQualidade).catch(() => []);
  const pastas = filhos.filter((c) => c.folder).map((c) => c.name);

  // 1) a pasta genérica de relatórios de inspeção, com ou sem o número na frente
  const generica = pastas.find((n) => /relat[óo]rios?\s+de\s+inspe/i.test(n));
  if (generica) return generica;

  // 2) no molde antigo, a pasta do TIPO daquele relatório
  const porTipo = {
    DIMENSIONAL: /dimensional/i, PRE_MONTAGEM: /dimensional|pr[ée].?montagem/i,
    PINTURA: /pintura/i, ULTRASSOM: /\bus\b|ultrass/i,
    VISUAL_SOLDA: /solda/i, LP: /penetrante|\blp\b/i,
  }[tipo];
  const doTipo = porTipo && pastas.find((n) => porTipo.test(n));
  if (doTipo) return doTipo;

  return SUBPASTA_PADRAO;
}

/** Nome estável: código + tipo. Reprocessar sobrescreve? Não — o Graph renomeia. */
function nomeArquivo(rel) {
  const tipo = TIPO_LABEL[rel.tipo] || "Relatório de inspeção";
  const rev = rel.revisao ? ` R${String(rel.revisao).padStart(2, "0")}` : "";
  return `${rel.codigo}${rev} - ${tipo}.pdf`.replace(/[\\/:*?"<>|]/g, "_");
}

/**
 * Gera o PDF e guarda na pasta da obra.
 *
 * Devolve `{ ok, url, nome }` ou `{ ok: false, erro }`. NUNCA lança: o arquivamento é
 * consequência da aprovação, não condição dela — falhar aqui não pode desfazer o que o
 * inspetor aprovou. O erro volta para quem chamou registrar e avisar.
 */
export async function arquivarRelatorioNaObra(relatorioId) {
  try {
    const rel = await prisma.relatorioInspecao.findUnique({ where: { id: relatorioId } });
    if (!rel) return { ok: false, erro: "Relatório não encontrado." };

    const pastaOp = await acharPastaOp(rel.opNumero);
    if (!pastaOp) return { ok: false, erro: `Pasta da OP-${rel.opNumero} não encontrada no servidor.` };

    const [fotos, op, assinaturas] = await Promise.all([
      prisma.fotoInspecao.findMany({
        where: { relatorioId: rel.id },
        orderBy: { capturadaEm: "asc" },
        select: { url: true, marca: true, origemMarca: true, observacao: true, capturadaEm: true, autorNome: true },
      }),
      prisma.oP.findFirst({ where: { numero: rel.opNumero }, select: { cliente: true, obra: true, refCliente: true } }),
      rel.envioAssinaturaId
        ? prisma.assinaturaDocumento.findMany({
            where: { envioId: rel.envioAssinaturaId },
            select: { nome: true, setor: true, assinadoEm: true, ip: true },
            orderBy: { nome: "asc" },
          })
        : Promise.resolve(null),
    ]);

    const bytes = await gerarPDFdoRelatorio({
      rel, fotos, assinaturas,
      cliente: op?.cliente || null, obra: op?.obra || null, refCliente: op?.refCliente || null,
      desenhoBytes: (d) => baixarDesenho(d?.caminho || d?.url),
    });

    const driveId = process.env.SHAREPOINT_DRIVE_ID;
    const sub = await subpastaDeRelatorios(driveId, `${pastaOp}/${PASTA_QUALIDADE}`, rel.tipo);
    const destino = `${pastaOp}/${PASTA_QUALIDADE}/${sub}`;
    const r = await uploadFileToFolder({
      folderPath: destino,
      fileName: nomeArquivo(rel),
      buffer: Buffer.from(bytes),
      contentType: "application/pdf",
    });

    await prisma.relatorioInspecao.update({
      where: { id: rel.id },
      data: { arquivoUrl: r.webUrl || null, arquivadoEm: new Date() },
    }).catch(() => { /* o arquivo está lá; a marca no banco é conveniência */ });

    return { ok: true, url: r.webUrl, nome: r.name, pasta: destino };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}
