import { notificarMateriaisRecebidos } from "@/lib/recebimento-notificacoes";
// PATCH  /api/compras/cmr/[id] — edita um lançamento CMR já gravado (o índice R não muda).
// DELETE /api/compras/cmr/[id] — exclui um lançamento CMR (DocumentoQualidade MATERIAL).
// Os dois gravam AuditLog e refletem na planilha do SharePoint (a edição reescreve a linha do R;
// a exclusão limpa, mantendo o índice reservado pra a reconciliação não re-importar).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CMR_CAT, camposEditaveisCmr, aprenderReferencias } from "@/lib/cmr";
import { atualizarLinhaCmr, limparLinhaCmr } from "@/lib/cmr-sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];

export async function DELETE(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const doc = await prisma.documentoQualidade.findUnique({
    where: { id: params.id },
    select: { id: true, categoria: true, importRef: true, nome: true, fornecedor: true, nfNumero: true, opNumero: true, numeroDocumento: true, pesoKg: true, quantidade: true },
  });
  if (!doc || doc.categoria !== CMR_CAT) return NextResponse.json({ success: false, error: "Lançamento não encontrado." }, { status: 404 });

  await prisma.documentoQualidade.delete({ where: { id: doc.id } });

  // Log da exclusão (quem, quando, o quê) — visível na tela.
  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "CMR_EXCLUIR", entity: "DocumentoQualidade", entityId: doc.id,
      diff: { importRef: doc.importRef, nome: doc.nome, fornecedor: doc.fornecedor, nf: doc.nfNumero, obra: doc.opNumero, certificado: doc.numeroDocumento, pesoKg: doc.pesoKg, quantidade: doc.quantidade },
    },
  }).catch(() => {});

  // Limpa a linha na planilha (best-effort) pra a reconciliação não trazer de volta.
  let planilha = null;
  try {
    const ano = anoDoIndice(doc.importRef);
    if (ano) planilha = await limparLinhaCmr(ano, doc.importRef);
  } catch (e) { planilha = { ok: false, erro: e.message }; }

  return NextResponse.json({ success: true, importRef: doc.importRef, planilha });
}

const edicaoSchema = z.object({
  rc: z.string().max(10).nullable().optional(),
  descricao: z.string().min(1, "Descrição obrigatória").max(300),
  especificacao: z.string().max(120).nullable().optional(),
  certificado: z.string().max(120).nullable().optional(),
  loteCorrida: z.string().max(120).nullable().optional(),
  pedidoCompra: z.string().max(60).nullable().optional(),
  dataRecebimento: z.union([z.string(), z.number()]).nullable().optional(),
  validade: z.union([z.string(), z.number()]).nullable().optional(),
  nf: z.string().max(60).nullable().optional(),
  fornecedor: z.string().max(120).nullable().optional(),
  obra: z.string().max(60).nullable().optional(),
  qtd: z.union([z.string(), z.number()]).nullable().optional(),
  pesoLitro: z.union([z.string(), z.number()]).nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
});

// O que entra no `antes`/`depois` do AuditLog — os campos que a edição pode mexer.
const RASTREADOS = ["nome", "norma", "opNumero", "numeroCorrida", "numeroDocumento", "fornecedor",
                    "pedidoCompra", "nfNumero", "dataRecebimento", "dataValidade", "pesoKg",
                    "quantidade", "observacao"];
const soOsQueMudaram = (antes, depois) => {
  const a = {}, d = {};
  for (const k of RASTREADOS) {
    const x = antes[k] instanceof Date ? antes[k].toISOString() : antes[k];
    const y = depois[k] instanceof Date ? depois[k].toISOString() : depois[k];
    if (String(x ?? "") !== String(y ?? "")) { a[k] = x ?? null; d[k] = y ?? null; }
  }
  return { antes: a, depois: d, mudou: Object.keys(d).length };
};

// Ano do índice R ("260123" → 2026). Índice fora do formato → null, e a planilha não é tocada.
function anoDoIndice(importRef) {
  const ano = 2000 + Number(String(importRef || "").slice(0, 2));
  return importRef && ano >= 2000 && ano < 2100 ? ano : null;
}

// Reescreve a linha do R na planilha. Best-effort: NUNCA desfaz o que já foi gravado no portal —
// o toast avisa e o botão "Sincronizar planilha" resolve depois.
async function espelharNaPlanilha(importRef, body) {
  const ano = anoDoIndice(importRef);
  if (!ano) return null;
  try {
    return await atualizarLinhaCmr(ano, importRef, {
      rc: body.rc, descricao: body.descricao, certificado: body.certificado,
      loteCorrida: body.loteCorrida, especificacao: body.especificacao,
      pedidoCompra: body.pedidoCompra, dataRecebimento: body.dataRecebimento,
      nf: body.nf, fornecedor: body.fornecedor, obra: body.obra,
      qtd: body.qtd, pesoLitro: body.pesoLitro, observacao: body.observacao,
    });
  } catch (e) { return { ok: false, erro: e.message }; }
}

/**
 * EDITA UM LANÇAMENTO JÁ GRAVADO.
 *
 * ⚠⚠ MATHEUS (11/09/2026): "às vezes falta informações e ele vai preencher depois de ter lançado a
 * linha". Sem isto a saída era excluir e relançar, que QUEIMA O ÍNDICE R — e o R já foi anotado no
 * material e na planilha do servidor. Corrigir um campo não pode custar a rastreabilidade da peça.
 *
 * ⚠ O ÍNDICE R NÃO ENTRA NO CORPO, nem por engano: `camposEditaveisCmr` o remove. Ver o comentário
 * longo lá — trocar o R não corrige um campo, aponta o registro para outro material.
 */
export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = edicaoSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const antes = await prisma.documentoQualidade.findUnique({ where: { id: params.id } });
  if (!antes || antes.categoria !== CMR_CAT) return NextResponse.json({ success: false, error: "Lançamento não encontrado." }, { status: 404 });

  const data = camposEditaveisCmr(body);
  const diff = soOsQueMudaram(antes, data);
  // ⚠ Nada mudou = nada a fazer. Sem esta saída, abrir e fechar a edição gravaria uma linha de log
  // e um PATCH no SharePoint a cada vez, enchendo a auditoria de ruído onde não houve mudança.
  if (!diff.mudou) return NextResponse.json({ success: true, importRef: antes.importRef, semMudanca: true });

  const depois = await prisma.documentoQualidade.update({ where: { id: antes.id }, data });
  if (!antes.nome?.trim() || antes.nome === "(sem descrição)") await notificarMateriaisRecebidos([depois], user.id);

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "CMR_EDITAR", entity: "DocumentoQualidade", entityId: antes.id,
      diff: { importRef: antes.importRef, antes: diff.antes, depois: diff.depois },
    },
  }).catch(() => {});
  await aprenderReferencias([body]).catch(() => {});

  const planilha = await espelharNaPlanilha(antes.importRef, body);
  return NextResponse.json({ success: true, importRef: depois.importRef, item: depois, planilha });
}
