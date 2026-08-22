// GET — as RNCs abertas da OP, para o inspetor consultar e complementar no chão de fábrica.
//
// Vitor (21/08/2026): "após o login no portal pelo inspetor de campo, crie dois campos RNC /
// Preenchimento de Relatórios".
//
// ⚠ O CAMPO CONSULTA E EVIDENCIA, NÃO DECIDE. Disposição (retrabalhar, refugar, aprovar por
// concessão), causa raiz e plano de ação são da Qualidade com a Engenharia — o inspetor constata e
// registra. Por isso aqui só se lê e se anexa foto.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String(new URL(req.url).searchParams.get("opNumero") || "").trim();
  if (!opNumero) return NextResponse.json({ rncs: [] });

  const rncs = await prisma.naoConformidade.findMany({
    where: { opNumero, status: { not: "ENCERRADA" } },
    select: {
      id: true, numero: true, ano: true, data: true, status: true, descricao: true,
      desenhoProjetoMarca: true, processoArea: true, disposicao: true, elaborador: true,
      relatorioInspecaoId: true, fotos: true,
    },
    orderBy: [{ ano: "desc" }, { numero: "desc" }],
    take: 40,
  });

  // o código do relatório que originou, quando houver — é o que liga a RNC ao que o inspetor mediu
  const ids = rncs.map((r) => r.relatorioInspecaoId).filter(Boolean);
  const rels = ids.length
    ? await prisma.relatorioInspecao.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true } })
    : [];
  const porId = new Map(rels.map((r) => [r.id, r.codigo]));

  return NextResponse.json({
    rncs: rncs.map((r) => ({
      ...r,
      titulo: `RNC ${String(r.numero).padStart(3, "0")}/${String(r.ano).slice(-2)}`,
      relatorioCodigo: r.relatorioInspecaoId ? porId.get(r.relatorioInspecaoId) || null : null,
      fotos: Array.isArray(r.fotos) ? r.fotos.length : 0,
    })),
  });
}
