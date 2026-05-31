import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getAccessToken, listFolderChildren, downloadFileByPath } from "@/lib/sharepoint";
import { parseMpp, extrairOpNumero } from "@/lib/mpp-parser";

export const maxDuration = 60;

export async function GET() {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const cronogramas = await prisma.cronograma.findMany({
    where: { ativo: true },
    include: {
      op: { select: { id: true, numero: true, cliente: true, obra: true } },
      tarefas: {
        where: { isSummary: true, outlineLevel: 1 },
        select: { id: true, nome: true, departamento: true, percentualRealizado: true, dataFimPrevista: true },
      },
    },
    orderBy: { opNumero: "desc" },
  });

  const now = new Date();
  const result = cronogramas.map((c) => {
    const deptSummary = c.tarefas.map((t) => ({
      nome: t.nome,
      departamento: t.departamento,
      percentual: t.percentualRealizado,
      atrasado: t.dataFimPrevista && t.dataFimPrevista < now && t.percentualRealizado < 100,
    }));
    const atrasados = deptSummary.filter((d) => d.atrasado).length;
    return { ...c, deptSummary, atrasados };
  });

  return NextResponse.json(result);
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const folderPath = "/Planejamento/Workspace/1. Cronogramas";

  let items;
  try {
    items = await listFolderChildren(driveId, folderPath);
  } catch (e) {
    return NextResponse.json({ success: false, error: "Erro ao acessar SharePoint: " + e.message }, { status: 500 });
  }

  const mppFiles = items.filter((i) => i.file && i.name.toLowerCase().endsWith(".mpp"));
  // Skip duplicate/backup files
  const filtered = mppFiles.filter((f) => !f.name.includes("DESKTOP-"));

  const results = [];
  for (const file of filtered) {
    const fullPath = `${folderPath}/${file.name}`;
    const opNum = extrairOpNumero(file.name);
    if (!opNum) {
      results.push({ arquivo: file.name, status: "ignorado", motivo: "Numero OP nao encontrado no nome" });
      continue;
    }

    try {
      const buffer = await downloadFileByPath({ driveId, fullPath });
      const parsed = await parseMpp(buffer);

      const opNumFormatted = `T${opNum}`;
      const op = await prisma.oP.findUnique({ where: { numero: opNumFormatted } });

      const existing = await prisma.cronograma.findUnique({ where: { sharepointPath: fullPath } });

      if (existing) {
        await prisma.cronogramaTarefa.deleteMany({ where: { cronogramaId: existing.id } });
        await prisma.cronograma.update({
          where: { id: existing.id },
          data: {
            titulo: parsed.titulo || file.name,
            dataInicio: parsed.dataInicio,
            dataFim: parsed.dataFim,
            ultimoSync: new Date(),
            opId: op?.id || null,
            tarefas: {
              create: parsed.tarefas.map((t) => ({
                uidMpp: t.uidMpp,
                nome: t.nome,
                departamento: t.departamento,
                dataInicioPrevista: t.dataInicioPrevista,
                dataFimPrevista: t.dataFimPrevista,
                percentualPrevisto: t.percentualPrevisto,
                percentualRealizado: t.percentualRealizado,
                qtdePlanejada: t.qtdePlanejada,
                qtdeRealizada: t.qtdeRealizada,
                isSummary: t.isSummary,
                outlineLevel: t.outlineLevel,
              })),
            },
          },
        });
        results.push({ arquivo: file.name, status: "atualizado", op: opNumFormatted, tarefas: parsed.tarefas.length });
      } else {
        await prisma.cronograma.create({
          data: {
            opNumero: opNumFormatted,
            opId: op?.id || null,
            nomeArquivo: file.name,
            titulo: parsed.titulo || file.name,
            sharepointPath: fullPath,
            dataInicio: parsed.dataInicio,
            dataFim: parsed.dataFim,
            tarefas: {
              create: parsed.tarefas.map((t) => ({
                uidMpp: t.uidMpp,
                nome: t.nome,
                departamento: t.departamento,
                dataInicioPrevista: t.dataInicioPrevista,
                dataFimPrevista: t.dataFimPrevista,
                percentualPrevisto: t.percentualPrevisto,
                percentualRealizado: t.percentualRealizado,
                qtdePlanejada: t.qtdePlanejada,
                qtdeRealizada: t.qtdeRealizada,
                isSummary: t.isSummary,
                outlineLevel: t.outlineLevel,
              })),
            },
          },
        });
        results.push({ arquivo: file.name, status: "criado", op: opNumFormatted, tarefas: parsed.tarefas.length });
      }
    } catch (e) {
      results.push({ arquivo: file.name, status: "erro", motivo: e.message?.slice(0, 200) });
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "SYNC_CRONOGRAMAS",
      entity: "Cronograma",
      entityId: "batch",
      diff: { results },
    },
  });

  return NextResponse.json({ success: true, results });
}
