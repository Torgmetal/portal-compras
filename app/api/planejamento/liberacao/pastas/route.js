// POST /api/planejamento/liberacao/pastas {liberacaoId}
//
// Monta, dentro de 2.5.2.4 (NC1 e IGS), a pasta do dia programado com os arquivos de máquina das
// peças liberadas, separados por tipo de perfil. Vitor (26/08/2026).
//
// ⚠ ROTA SEPARADA, E NÃO DENTRO DO POST DA LIBERAÇÃO. Copiar ~200 arquivos no SharePoint é lento e
// pode falhar por rede; se isso morasse na gravação, uma indisponibilidade do Graph derrubaria a
// liberação — que é a verdade do portal e não depende de pasta nenhuma. Aqui a liberação já está
// gravada e isto é um passo que se pode repetir.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { montarPastaDoDia } from "@/lib/pastas-liberacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { liberacaoId } = await req.json().catch(() => ({}));
  if (!liberacaoId) return NextResponse.json({ error: "Informe a liberação." }, { status: 400 });

  const lib = await prisma.liberacaoProducao.findUnique({
    where: { id: liberacaoId },
    select: { id: true, opId: true, opNumero: true, frente: true, dataProgramada: true, pecaIds: true },
  });
  if (!lib) return NextResponse.json({ error: "Liberação não encontrada." }, { status: 404 });
  if (!lib.dataProgramada) return NextResponse.json({ error: "Esta liberação não tem dia programado — sem data não há pasta para criar." }, { status: 400 });

  const ids = Array.isArray(lib.pecaIds) ? lib.pecaIds : [];
  const pecas = ids.length
    ? await prisma.pecaConjunto.findMany({ where: { id: { in: ids } }, select: { marca: true, perfil: true } })
    : await prisma.pecaConjunto.findMany({ where: { opId: lib.opId, fonte: "LPC_IMPORT", opNumero: lib.frente }, select: { marca: true, perfil: true } });
  if (!pecas.length) return NextResponse.json({ error: "Esta liberação não tem peças." }, { status: 400 });

  const dia = lib.dataProgramada.toISOString().slice(0, 10);
  try {
    const r = await montarPastaDoDia(lib.opNumero, dia, pecas);
    await prisma.auditLog.create({
      data: { userId: user?.id || null, action: "PASTA_DIA_MAQUINA", entity: "LiberacaoProducao", entityId: lib.id,
        diff: { op: lib.opNumero, dia, pasta: r.pasta, arquivos: r.arquivos, grupos: r.grupos.length, semArquivo: r.semArquivoTotal } },
    }).catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Falha ao montar a pasta do dia." }, { status: 502 });
  }
}
