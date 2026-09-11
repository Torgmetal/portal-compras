// Revisão de um relatório de inspeção JÁ ENVIADO para assinatura.
//
// Vitor (11/09/2026), sobre o relatório de pintura da OP-106: "na hora que as pessoas estão indo
// para assinar não tem como revisar, apenas o botão para assinar direto; poderia voltar as
// assinaturas desse relatório e permitir que eu consiga editar as peças informadas".
//
// A regra é a mesma do data book: documento assinado NÃO se edita por baixo de quem assinou. O que
// existe é ABRIR REVISÃO: a rodada assinada fica congelada em `revisoes` (com quem assinou e
// quando), o relatório sobe de R00 para R01, destrava para edição e o ciclo de assinatura recomeça
// do zero. O PDF da revisão antiga continua disponível em `?revisao=N`, reconstruído do snapshot.
//
// Quem abre: a Qualidade/ADMIN pelo portal, ou QUALQUER assinante pelo link de assinatura ("pedir
// revisão" em vez de assinar — mesma porta que o PLP e o PIT já tinham).
import { prisma } from "@/lib/prisma";
import { anexarRevisaoNoDataBook } from "@/lib/relatorio-inspecao";

/** O que fica congelado da rodada que fechou. Puro — testável sem banco. */
export function montarSnapshotRevisao(rel, assinaturas = [], { motivo = "", porQuem = "", origem = "PORTAL", agora = new Date() } = {}) {
  return {
    revisao: rel.revisao ?? 0,
    status: rel.status,
    resultadoInspecao: rel.resultadoInspecao ?? null,
    inspetor: rel.inspetor ?? null,
    linhas: Array.isArray(rel.linhas) ? rel.linhas : [],
    resultados: rel.resultados ?? null,
    marcas: Array.isArray(rel.marcas) ? rel.marcas : [],
    emEm: rel.emitidoEm ? new Date(rel.emitidoEm).toISOString() : null,
    envioAssinaturaId: rel.envioAssinaturaId ?? null,
    assinaturas: assinaturas.map((a) => ({ nome: a.nome, setor: a.setor ?? null, email: a.email ?? null, assinadoEm: a.assinadoEm ? new Date(a.assinadoEm).toISOString() : null })),
    fechadaEm: agora.toISOString(),
    motivo: String(motivo || "").slice(0, 1000),
    porQuem: String(porQuem || "").slice(0, 120),
    origem, // PORTAL (Qualidade/ADMIN) | ASSINANTE (pedido pelo link)
  };
}

/**
 * Abre a revisão seguinte de um relatório. Devolve { relatorio, snapshot, assinaturas }.
 * @param {string} relatorioId
 * @param {{ motivo?: string, porQuem?: string, porQuemId?: string|null, origem?: "PORTAL"|"ASSINANTE" }} opts
 */
export async function abrirRevisaoRelatorio(relatorioId, { motivo = "", porQuem = "", porQuemId = null, origem = "PORTAL" } = {}) {
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id: relatorioId } });
  if (!rel) throw new Error("Relatório não encontrado.");
  if (!rel.envioAssinaturaId) throw new Error("Este relatório não foi enviado para assinatura — é só editar e salvar.");

  const assinaturas = await prisma.assinaturaDocumento.findMany({
    where: { envioId: rel.envioAssinaturaId },
    select: { nome: true, setor: true, email: true, assinadoEm: true },
  });
  const snapshot = montarSnapshotRevisao(rel, assinaturas, { motivo, porQuem, origem });
  const revisoes = [...(Array.isArray(rel.revisoes) ? rel.revisoes : []).filter((r) => r?.revisao !== snapshot.revisao), snapshot];

  const relatorio = await prisma.relatorioInspecao.update({
    where: { id: rel.id },
    data: {
      revisoes,
      revisao: (rel.revisao ?? 0) + 1,
      // destrava: sem envio, sem emissão — o conteúdo volta a ser rascunho editável
      envioAssinaturaId: null,
      status: "RASCUNHO",
      emitidoEm: null,
    },
  });

  // os links da rodada antiga passam a dizer "documento em revisão" em vez de aceitar assinatura
  await prisma.envioAssinatura.update({ where: { id: rel.envioAssinaturaId }, data: { status: "REVISAO_PEDIDA" } }).catch(() => {});

  // a rodada fechada fica no data book AO LADO da vigente (reprovou/revisou → reinspecionou), como
  // já era com as reprovações — o retrabalho tem de aparecer, não sumir
  await anexarRevisaoNoDataBook(relatorio, snapshot).catch(() => {});

  await prisma.auditLog.create({
    data: {
      userId: porQuemId, action: "ABRIR_REVISAO_RELATORIO_INSPECAO", entity: "RelatorioInspecao", entityId: rel.id,
      diff: { codigo: rel.codigo, de: `R${String(snapshot.revisao).padStart(2, "0")}`, para: `R${String(relatorio.revisao).padStart(2, "0")}`, origem, porQuem, motivo: snapshot.motivo, assinaturasCongeladas: snapshot.assinaturas.filter((a) => a.assinadoEm).length },
    },
  }).catch(() => {});

  return { relatorio, snapshot, assinaturas };
}
