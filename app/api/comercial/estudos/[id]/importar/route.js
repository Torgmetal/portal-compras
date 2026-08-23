// Importa o quantitativo de uma LQC preenchida para dentro do estudo.
//
// Vitor (23/08/2026): "a possibilidade de importarmos áreas levantadas nessa planilha e
// importarmos ela no portal, para preencher apenas os custos".
//
// ⚠ O QUANTITATIVO NÃO SE REDIGITA. Medir a estrutura, separar por área e tirar o coeficiente de
// superfície é trabalho feito com o projeto na mão — no Excel, uma vez. O que muda toda semana é
// o custo, e é aí que o portal serve. Redigitar 11 áreas para conferir um preço é o motivo nº 1
// de uma ferramenta nova não ser usada.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { importarLqc } from "@/lib/lqc-importar";
import { calcularLqc } from "@/lib/lqc";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const estudo = await prisma.estudoFabricacao.findUnique({ where: { id } });
  if (!estudo) return NextResponse.json({ error: "Estudo não encontrado." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!arquivo || typeof arquivo.arrayBuffer !== "function")
    return NextResponse.json({ error: "Envie a planilha." }, { status: 400 });

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const lido = importarLqc(buffer);
  if (!lido.ok) return NextResponse.json({ error: lido.erro }, { status: 422 });

  // ⚠ o preço do aço já cotado vem junto — se o estudo importado tem os R$/kg preenchidos, não
  // faz sentido o portal perguntar de novo. Custo que o usuário já digitou aqui não é
  // sobrescrito: a importação traz o quantitativo, não apaga trabalho.
  const c = estudo.composicao || {};
  const resumos = lido.resumos.map((r) => ({ ...r, precoKg: lido.precosPorArea[r.area] ?? null }));
  // ⚠ o esquema de pintura também vem do estudo — produto, cor, sólidos e película são decisão de
  // PROJETO, não de custo. Só entra se o portal ainda não tiver um: importação não apaga trabalho.
  const tintas = (c.tintas?.length ? c.tintas : lido.tintas) || [];
  const composicao = { ...c, resumos, tintas };
  const resultado = calcularLqc({ ...composicao, preMontagem: estudo.preMontagem });

  const salvo = await prisma.estudoFabricacao.update({
    where: { id },
    data: { composicao, resultado, metodo: resumos[0]?.metodo || estudo.metodo },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "IMPORTAR_LQC", entity: "EstudoFabricacao", entityId: id,
      diff: { arquivo: arquivo.name || null, areas: lido.resumo.areas, pesoKg: lido.resumo.pesoKg, camadas: lido.tintas?.length || 0 } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, estudo: salvo, resultado, resumo: lido.resumo, avisos: lido.avisos });
}
