import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getAccessToken, listFolderChildren, downloadFileByPath } from "@/lib/sharepoint";
import { parseMpp, extrairOpNumero } from "@/lib/mpp-parser";

export const maxDuration = 60;

/**
 * Limpa o titulo do cronograma removendo prefixos redundantes de OP,
 * prefixo CR-, sufixo de revisao (-R00) e extensao de arquivo.
 * Ex: "OP-085-CR-DANPOWER-ENC 325-Precipitador-R00.mpp" → "DANPOWER - ENC 325 - Precipitador"
 *     "OP071 - DANPOWER - ENC 0326" → "DANPOWER - ENC 0326"
 */
function limparTituloCronograma(titulo) {
  if (!titulo) return titulo;
  let t = titulo;
  // Remove extensao .mpp / .xml
  t = t.replace(/\.(mpp|xml)$/i, "");
  // Remove sufixo de revisao: -R00, -R01, etc
  t = t.replace(/[-\s]*R\d{2,3}$/i, "");
  // Remove prefixo OP com numero: "OP-085-", "OP085-", "OP-085 ", "OP085 - ", "T085-", "T085 "
  t = t.replace(/^(?:OP|T)[-\s]?\d{2,4}[-\s]*/i, "");
  // Remove prefixo CR- (Cronograma)
  t = t.replace(/^CR[-\s]*/i, "");
  // Substitui hifens entre palavras por " - " limpo
  t = t.replace(/\s*-\s*/g, " - ").trim();
  // Remove " - " no inicio se sobrou
  t = t.replace(/^-\s*/, "").trim();
  return t || titulo; // fallback pro original se ficou vazio
}

/**
 * Segunda passada do import: liga as predecessoras. As tarefas são criadas em
 * bloco (nested create, sem id ainda), então aqui mapeamos UID (MS Project) → id
 * da CronogramaTarefa e gravamos antecessoraIds (que guardam ids). Sem isso o
 * vínculo do .mpp se perde e o Gantt reexportado sai sem as linhas de ligação.
 */
async function vincularAntecessoras(cronogramaId, parsedTarefas) {
  if (!parsedTarefas.some((t) => (t.predecessorUids || []).length)) return 0;
  const tarefas = await prisma.cronogramaTarefa.findMany({
    where: { cronogramaId },
    select: { id: true, uidMpp: true },
  });
  const uidToId = new Map(tarefas.map((t) => [t.uidMpp, t.id]));
  const updates = [];
  for (const t of parsedTarefas) {
    const id = uidToId.get(t.uidMpp);
    const preds = (t.predecessorUids || []).map((u) => uidToId.get(u)).filter((pid) => pid && pid !== id);
    if (id && preds.length) {
      updates.push(prisma.cronogramaTarefa.update({ where: { id }, data: { antecessoraIds: preds } }));
    }
  }
  if (updates.length) await prisma.$transaction(updates);
  return updates.length;
}

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const ativoParam = searchParams.get("ativo");
  const filtroAtivo = ativoParam === "false" ? false : true;

  // Auto-link unlinked cronogramas to OPs (somente ativos)
  if (filtroAtivo) {
    const unlinked = await prisma.cronograma.findMany({ where: { ativo: true, opId: null } });
    if (unlinked.length > 0) {
      const opNums = unlinked.map((c) => c.opNumero.replace(/^T0*/, "").padStart(3, "0"));
      const ops = await prisma.oP.findMany({ where: { numero: { in: opNums } }, select: { id: true, numero: true } });
      const opMap = Object.fromEntries(ops.map((o) => [o.numero, o.id]));
      for (const c of unlinked) {
        const num = c.opNumero.replace(/^T0*/, "").padStart(3, "0");
        if (opMap[num]) {
          await prisma.cronograma.update({ where: { id: c.id }, data: { opId: opMap[num] } });
        }
      }
    }
  }

  const cronogramas = await prisma.cronograma.findMany({
    where: { ativo: filtroAtivo },
    include: {
      op: { select: { id: true, numero: true, cliente: true, obra: true, status: true } },
      tarefas: {
        where: { outlineLevel: { gte: 1 } },
        select: { id: true, nome: true, departamento: true, percentualRealizado: true, dataFimPrevista: true, isSummary: true, outlineLevel: true },
      },
    },
    orderBy: { opNumero: "desc" },
  });

  const DEPT_ORDER = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];
  const now = new Date();
  const result = cronogramas.map((c) => {
    const summaryTasks = c.tarefas.filter((t) => t.isSummary && t.outlineLevel === 1);
    const realTasks = c.tarefas.filter((t) => !t.isSummary);

    let deptSummary;
    if (summaryTasks.length > 0) {
      // Tem summaries — usa eles, mas valida atrasado pelas tarefas reais
      deptSummary = summaryTasks.map((t) => ({
        nome: t.nome,
        departamento: t.departamento,
        percentual: t.percentualRealizado,
        atrasado: realTasks.some((r) => r.departamento === t.departamento && r.dataFimPrevista && r.dataFimPrevista < now && r.percentualRealizado < 100),
      }));
    } else {
      // Sem summaries — calcula resumo a partir das tarefas reais agrupadas por departamento
      const porDept = {};
      for (const t of realTasks) {
        const d = t.departamento || "OUTROS";
        if (!porDept[d]) porDept[d] = { pcts: [], atrasado: false };
        porDept[d].pcts.push(t.percentualRealizado || 0);
        if (t.dataFimPrevista && t.dataFimPrevista < now && t.percentualRealizado < 100) {
          porDept[d].atrasado = true;
        }
      }
      deptSummary = DEPT_ORDER
        .filter((d) => porDept[d])
        .concat(Object.keys(porDept).filter((d) => !DEPT_ORDER.includes(d)))
        .map((d) => ({
          nome: d,
          departamento: d,
          percentual: porDept[d].pcts.length > 0
            ? Math.round(porDept[d].pcts.reduce((a, b) => a + b, 0) / porDept[d].pcts.length)
            : 0,
          atrasado: porDept[d].atrasado,
        }));
    }

    // Conta tarefas reais atrasadas (não summaries)
    const atrasados = realTasks.filter((t) => t.dataFimPrevista && t.dataFimPrevista < now && t.percentualRealizado < 100).length;
    // Remove tarefas do response pra não pesar
    const { tarefas, ...rest } = c;
    return { ...rest, deptSummary, atrasados };
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
      const op = await prisma.oP.findUnique({ where: { numero: opNum } })
        || await prisma.oP.findFirst({ where: { numero: { endsWith: opNum } } });

      const existing = await prisma.cronograma.findUnique({ where: { sharepointPath: fullPath } });

      if (existing) {
        await prisma.cronogramaTarefa.deleteMany({ where: { cronogramaId: existing.id } });
        await prisma.cronograma.update({
          where: { id: existing.id },
          data: {
            titulo: limparTituloCronograma(parsed.titulo || file.name),
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
        const nAnt = await vincularAntecessoras(existing.id, parsed.tarefas);
        results.push({ arquivo: file.name, status: "atualizado", op: opNumFormatted, tarefas: parsed.tarefas.length, antecessoras: nAnt });
      } else {
        const novo = await prisma.cronograma.create({
          data: {
            opNumero: opNumFormatted,
            opId: op?.id || null,
            nomeArquivo: file.name,
            titulo: limparTituloCronograma(parsed.titulo || file.name),
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
        const nAnt = await vincularAntecessoras(novo.id, parsed.tarefas);
        results.push({ arquivo: file.name, status: "criado", op: opNumFormatted, tarefas: parsed.tarefas.length, antecessoras: nAnt });
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
