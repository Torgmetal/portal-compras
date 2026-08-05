// Detalhe / edição / exclusão de uma RNC.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const rnc = await prisma.naoConformidade.findUnique({ where: { id: params.id } });
  if (!rnc) return NextResponse.json({ error: "RNC não encontrada" }, { status: 404 });
  let plano = null;
  if (rnc.planoAcaoId) plano = await prisma.planoAcao.findUnique({ where: { id: rnc.planoAcaoId }, select: { id: true, numero: true, titulo: true, status: true, itens: true } });
  return NextResponse.json({ rnc, plano });
}

const dstr = z.string().optional().nullable();
const schema = z.object({
  data: dstr, cliente: dstr, opNumero: dstr, opId: dstr, desenhoProjetoMarca: dstr,
  origem: dstr, fornecedor: dstr, processoArea: dstr, descricao: dstr, analise: dstr,
  fotos: z.array(z.object({ url: z.string().url(), legenda: dstr })).optional(),
  disposicao: dstr, elaborador: dstr, resultadoReinspecao: dstr, abrangencia: dstr,
  necessitaAcao: dstr, motivoNaoAcao: dstr, causas: dstr,
  cincoPorques: z.array(z.object({ porque: z.string(), resposta: dstr })).optional(),
  planoAcaoId: dstr, prazoResposta: dstr, realizadoEm: dstr, acompanhadoPor: dstr,
  acompanhamento: dstr, avaliacaoEficacia: dstr, encerradaPor: dstr,
  status: z.enum(["ABERTA", "EM_ACAO", "RESPONDIDA", "ENCERRADA"]).optional(),
  pertinente: z.boolean().optional(), recorrente: z.boolean().optional(), rncAnteriorId: dstr,
  anexoUrl: dstr, programa: dstr, jobCliente: dstr, numeroCliente: dstr,
  respostaCliente: dstr,
  evidencias: z.array(z.object({ tipo: dstr, descricao: dstr, url: dstr })).optional(),
});

const asDate = (s) => (s ? new Date(s.length <= 10 ? s + "T12:00:00Z" : s) : null);
const TXT = new Set(["cliente", "opNumero", "opId", "desenhoProjetoMarca", "origem", "fornecedor", "processoArea", "descricao", "analise", "disposicao", "elaborador", "resultadoReinspecao", "abrangencia", "necessitaAcao", "motivoNaoAcao", "causas", "planoAcaoId", "acompanhadoPor", "acompanhamento", "avaliacaoEficacia", "encerradaPor", "rncAnteriorId", "anexoUrl", "programa", "jobCliente", "numeroCliente", "respostaCliente"]);
const DATES = new Set(["data", "prazoResposta", "realizadoEm"]);

export async function PATCH(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const atual = await prisma.naoConformidade.findUnique({ where: { id: params.id }, select: { id: true, encerradaEm: true } });
  if (!atual) return NextResponse.json({ error: "RNC não encontrada" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  for (const k of Object.keys(body)) {
    if (body[k] === undefined) continue;
    if (TXT.has(k)) data[k] = (body[k]?.trim?.() ?? body[k]) || null;
    else if (DATES.has(k)) data[k] = asDate(body[k]);
    else data[k] = body[k]; // fotos, cincoPorques, evidencias, status, pertinente, recorrente
  }
  // Encerramento: ao virar ENCERRADA, carimba encerradaEm (uma vez); ao reabrir, limpa.
  if (body.status === "ENCERRADA" && !atual.encerradaEm) data.encerradaEm = new Date();
  if (body.status && body.status !== "ENCERRADA") data.encerradaEm = null;

  await prisma.naoConformidade.update({ where: { id: atual.id }, data });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.naoConformidade.delete({ where: { id: params.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "EXCLUIR_RNC", entity: "NaoConformidade", entityId: params.id, diff: {} } }).catch(() => {});
  return NextResponse.json({ success: true });
}
