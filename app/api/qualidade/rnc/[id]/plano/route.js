// POST /api/qualidade/rnc/[id]/plano — cria (ou retorna) o plano de ação 5W2H
// vinculado à RNC. Nº do plano = nº da RNC; origem = "RNC-NNN/AA" (aparece na aba
// Plano de Ação do módulo RNC). Usado quando a RNC é procedente e cabe ação.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { numRNC } from "@/lib/nao-conformidade";

export const runtime = "nodejs";

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rnc = await prisma.naoConformidade.findUnique({ where: { id: params.id }, select: { id: true, numero: true, ano: true, descricao: true, planoAcaoId: true } });
  if (!rnc) return NextResponse.json({ error: "RNC não encontrada" }, { status: 404 });
  if (rnc.planoAcaoId) return NextResponse.json({ success: true, id: rnc.planoAcaoId, jaExistia: true });

  const titulo = `${numRNC(rnc.numero, rnc.ano)} — ${(rnc.descricao || "Não conformidade").slice(0, 70)}`;
  const item = { oque: "", porque: "", onde: "", quem: "", quando: "", como: "", quanto: "", status: "A_FAZER", acompanhamento: "" };
  const plano = await prisma.planoAcao.create({
    data: { numero: rnc.numero, titulo, origem: numRNC(rnc.numero, rnc.ano), status: "EM_ANDAMENTO", itens: [item], createdById: user.id },
    select: { id: true },
  });
  await prisma.naoConformidade.update({ where: { id: rnc.id }, data: { planoAcaoId: plano.id } });
  return NextResponse.json({ success: true, id: plano.id });
}
