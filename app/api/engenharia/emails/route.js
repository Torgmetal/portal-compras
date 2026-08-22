// GET — lista os e-mails já lidos das caixas da Engenharia (Fase 1: validação crua).
// POST — dispara a sincronização manual (pra testar sem esperar o cron).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";
import { sincronizarEmailsEngenharia, caixasEngenharia } from "@/lib/ingest-emails-engenharia";
import { casarEmailsPendentes, rematchTudo } from "@/lib/match-email-op";
import { classificarMarcosIA } from "@/lib/classificar-email-ia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // sync manual pode puxar um bloco grande do histórico

// Conteúdo sensível (correspondência de projeto) → SÓ ADMIN ou DIRETORIA. Usado pela
// aba Indicadores → Engenharia → E-mails e como gatilho de sync/diagnóstico.
async function exigirDiretoria() {
  const user = await requireUser(); // lança "Unauthorized" se não houver sessão
  const diretor = user.tipo === "ADMIN" || (await temAcessoDiretoria(user.email).catch(() => false));
  if (!diretor) { const e = new Error("Forbidden"); e.status = 403; throw e; }
  return user;
}

export async function GET(req) {
  try { await exigirDiretoria(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.status || (e.message === "Unauthorized" ? 401 : 403) }); }

  const sp = new URL(req.url).searchParams;
  const caixa = sp.get("caixa") || null;
  const direcao = sp.get("direcao") || null; // ENTRADA | SAIDA
  const busca = (sp.get("busca") || "").trim();
  const soIfc = sp.get("ifc") === "1";
  const limite = Math.min(Number(sp.get("limite") || 100), 300);

  const where = {};
  if (caixa) where.caixa = caixa;
  if (direcao) where.direcao = direcao;
  if (soIfc) where.temAnexoIfc = true;
  if (busca) where.OR = [
    { assunto: { contains: busca, mode: "insensitive" } },
    { de: { contains: busca, mode: "insensitive" } },
  ];

  const [eventos, syncs, total] = await Promise.all([
    prisma.obraEmailEvento.findMany({
      where,
      orderBy: [{ recebidoEm: "desc" }, { criadoEm: "desc" }],
      take: limite,
      select: {
        id: true, caixa: true, pasta: true, direcao: true, de: true, deNome: true, para: true,
        assunto: true, snippet: true, recebidoEm: true, enviadoEm: true, temAnexo: true,
        temAnexoIfc: true, anexos: true, conversationId: true, opId: true,
      },
    }),
    prisma.obraEmailSync.findMany({ orderBy: [{ caixa: "asc" }, { pasta: "asc" }] }),
    prisma.obraEmailEvento.count({ where }),
  ]);

  return NextResponse.json({ success: true, eventos, syncs, total, caixas: caixasEngenharia() });
}

export async function POST(req) {
  let user;
  try { user = await exigirDiretoria(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.status || (e.message === "Unauthorized" ? 401 : 403) }); }

  // ?reprocessar=1 → backfill do histórico: re-casa TODOS (regras novas + thread) e
  // reclassifica as TAGS por IA (taxonomia nova). Operação pesada, sob demanda.
  const reprocessar = new URL(req.url).searchParams.get("reprocessar") === "1";
  try {
    if (reprocessar) {
      const rematch = await rematchTudo();
      const ia = await classificarMarcosIA(200, 20, true).catch((e) => ({ classificados: 0, marcos: 0, erro: e.message }));
      await prisma.auditLog.create({ data: { userId: user.id, action: "REPROCESSAR_EMAILS_ENGENHARIA", entity: "ObraEmailEvento", entityId: "-", diff: { rematch, iaMarcos: ia.marcos } } }).catch(() => {});
      return NextResponse.json({ success: true, reprocessado: true, rematch, ia });
    }
    const r = await sincronizarEmailsEngenharia();
    const match = await casarEmailsPendentes().catch(() => ({ casados: 0 }));
    const ia = await classificarMarcosIA().catch(() => ({ classificados: 0, marcos: 0 }));
    await prisma.auditLog.create({ data: { userId: user.id, action: "SYNC_EMAILS_ENGENHARIA", entity: "ObraEmailEvento", entityId: "-", diff: { gravados: r.gravados, casados: match.casados, iaMarcos: ia.marcos } } }).catch(() => {});
    return NextResponse.json({ success: true, ...r, match, ia });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
