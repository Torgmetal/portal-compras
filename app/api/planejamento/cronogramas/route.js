import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getAccessToken, listFolderChildren, downloadFileByPath } from "@/lib/sharepoint";
import { parseMpp, extrairOpNumero } from "@/lib/mpp-parser";
import { sincronizarCronogramaSyneco, avancosDasTarefas } from "@/lib/cronograma-syneco";

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
        select: { id: true, nome: true, departamento: true, percentualRealizado: true, dataFimPrevista: true, isSummary: true, outlineLevel: true, duracaoDias: true, area: true },
      },
    },
    // ⚠ ordenado no JS logo abaixo: `opNumero` é TEXTO, então o banco põe "T113" antes de "115"
    // e a lista sai fora de ordem. (Vitor 19/08: "os cronogramas precisam ficar em ordem numérica".)
  });

  // ORDEM NUMÉRICA, do mais novo pro mais antigo — ignorando o prefixo T e o zero à esquerda.
  const numeroDaOp = (s) => { const m = String(s || "").match(/(\d+)/); return m ? parseInt(m[1], 10) : -1; };
  cronogramas.sort((a, b) => numeroDaOp(b.op?.numero || b.opNumero) - numeroDaOp(a.op?.numero || a.opNumero)
    || String(b.opNumero).localeCompare(String(a.opNumero), "pt-BR", { numeric: true }));

  const DEPT_ORDER = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];
  const now = new Date();

  // ── O RESUMO POR SETOR SAI DAS TAREFAS REAIS, SEMPRE ─────────────────────────────────────
  //
  // Vitor (19/08/2026): "esse resumo das áreas está ficando zerado ou errado, poderia verificar?".
  // Estava, e por dois motivos que se somavam:
  //
  // 1. O chip lia o `percentualRealizado` GRAVADO na linha-resumo. Só que o avanço da Fabricação
  //    é calculado NA LEITURA, a partir do Syneco (ver lib/cronograma-syneco.js) — nunca é
  //    gravado. Resultado: filha em 45% e resumo em 0%, pra sempre. Suprimentos tinha o mesmo
  //    problema ao contrário: só atualizava quando o sync do CMR rodava, então o número era o da
  //    última vez que alguém sincronizou.
  //
  // 2. Quando não havia linha-resumo, a conta era média SIMPLES dos percentuais — uma tarefa de
  //    1 dia pesando igual a uma de 10.
  //
  // Agora é sempre derivado: aplica o Syneco nas linhas de Fabricação e pondera por DURAÇÃO.
  // A linha-resumo continua existindo no cronograma (é dela que sai o Gantt), mas deixou de ser
  // fonte pro chip — quem manda são as tarefas.
  //
  // O arquivo já dizia isso no cálculo de atrasados ("não do summary que pode estar
  // desatualizado"); faltava aplicar ao percentual.
  const comOp = cronogramas.filter((c) => c.opId && (c.op?.numero || c.opNumero));
  const syncPorOp = new Map(
    await Promise.all(
      comOp.map(async (c) => {
        try {
          const tarefasFab = c.tarefas.filter((t) => !t.isSummary && t.departamento === "FABRICACAO");
          if (!tarefasFab.length) return [c.id, null];
          const sync = await sincronizarCronogramaSyneco(prisma, c.opId, c.op?.numero || c.opNumero);
          return [c.id, avancosDasTarefas(tarefasFab, sync)];
        } catch (e) {
          // ⚠ Syneco fora do ar não pode derrubar a listagem — mas o catch mudo escondeu por
          // semanas que as duas funções nem estavam importadas: o ReferenceError caía aqui e a
          // lista saía sem avanço nenhum, como se a fábrica não tivesse produzido.
          console.error("[cronogramas] avanço do Syneco falhou:", e?.message);
          return [c.id, null];
        }
      })
    )
  );

  const result = cronogramas.map((c) => {
    const realTasks = c.tarefas.filter((t) => !t.isSummary);
    const avancos = syncPorOp.get(c.id);

    // percentual efetivo da tarefa: Fabricação vem do Syneco quando há; o resto é o gravado
    const pctDe = (t) => {
      const av = avancos?.get(t.id);
      if (av && !av.ambigua && av.realizado != null) return av.realizado;
      return t.percentualRealizado || 0;
    };

    const porDept = {};
    for (const t of realTasks) {
      const d = t.departamento || "OUTROS";
      const g = (porDept[d] ||= { peso: 0, soma: 0, n: 0, atrasado: false });
      // ⚠ pondera por DURAÇÃO: tarefa sem duração entra com peso 1 pra não sumir da conta
      const peso = Number(t.duracaoDias) > 0 ? Number(t.duracaoDias) : 1;
      g.peso += peso;
      g.soma += peso * pctDe(t);
      g.n++;
      if (t.dataFimPrevista && t.dataFimPrevista < now && pctDe(t) < 100) g.atrasado = true;
    }

    const deptSummary = DEPT_ORDER
      .filter((d) => porDept[d])
      .concat(Object.keys(porDept).filter((d) => !DEPT_ORDER.includes(d)))
      .map((d) => ({
        nome: d,
        departamento: d,
        percentual: porDept[d].peso > 0 ? Math.round(porDept[d].soma / porDept[d].peso) : 0,
        tarefas: porDept[d].n,
        atrasado: porDept[d].atrasado,
      }));

    const atrasados = realTasks.filter((t) => t.dataFimPrevista && t.dataFimPrevista < now && pctDe(t) < 100).length;
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
