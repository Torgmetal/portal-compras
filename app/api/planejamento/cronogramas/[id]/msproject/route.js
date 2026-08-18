// GET /api/planejamento/cronogramas/[id]/msproject — exporta o cronograma em
// XML do MS Project (MSPDI). O cliente abre no Project dele pra validar/comparar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarCronogramaMSProjectXML } from "@/lib/cronograma-msproject-xml";
import { aplicarAvancoSyneco } from "@/lib/cronograma-syneco";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const cronograma = await prisma.cronograma.findUnique({
    where: { id: params.id },
    include: { tarefas: true, op: { select: { id: true, numero: true } } },
  });
  if (!cronograma) return NextResponse.json({ success: false, error: "Cronograma não encontrado" }, { status: 404 });

  // Mesmo avanço do Syneco que a tela mostra (senão o XML sai com o % armazenado, defasado).
  cronograma.tarefas = await aplicarAvancoSyneco(prisma, cronograma.op?.id, cronograma.op?.numero, cronograma.tarefas);

  let out;
  try { out = gerarCronogramaMSProjectXML(cronograma, cronograma.tarefas); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o XML: " + (e?.message || "erro") }, { status: 500 }); }

  await prisma.auditLog.create({ data: { userId: user.id, action: "EXPORTAR_CRONOGRAMA_MSPROJECT", entity: "Cronograma", entityId: cronograma.id, diff: { tarefas: cronograma.tarefas.length } } }).catch(() => {});

  return new Response(out.xml, {
    status: 200,
    // no-store: sem isso o navegador pode reaproveitar um download antigo da MESMA URL
    // (heurística de cache) e o arquivo sai sem as linhas novas do cronograma.
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${out.filename}"`, "Cache-Control": "no-store" },
  });
}
