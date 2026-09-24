// Planilha de perfis e parafusos do Omie para o Tekla (SERVIDOR › Engenharia › Workspace ›
// Materiais OMIE - Tekla). GET = cron (CRON_SECRET), POST = botão/uso manual.
// Vitor (24/09/2026): "sempre que um novo tipo de perfil for cadastrado no Omie, cadastrou vc cria
// uma planilha nova". Inativar e corrigir descrição também geram arquivo (a limpeza dos duplicados tem
// de chegar ao Tekla). A regra mora em lib/materiais-tekla-publicar.js.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { comTravaDeCron } from "@/lib/cron-trava";
import { publicarMateriaisTekla } from "@/lib/materiais-tekla-publicar";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const JOB = "materiais-tekla";
const mudancas = (r) => [r.novos && `${r.novos} novo(s)`, r.sairam && `${r.sairam} fora do cadastro`, r.alterados && `${r.alterados} com descrição alterada`]
  .filter(Boolean).join(", ") || "sem mudança";
const texto = (r) => (r.publicado
  ? `${r.arquivo} · ${r.perfis} perfis, ${r.parafusos} parafusos · ${r.anterior ? mudancas(r) : "primeira planilha"}`
  : `cadastro sem mudança (${r.perfis} perfis, ${r.parafusos} parafusos)`);

// ⚠ TRAVA: cron e botão ao mesmo tempo publicariam DOIS arquivos com o mesmo conteúdo
const publicar = (op) => comTravaDeCron(prisma, JOB, () => publicarMateriaisTekla(op));

export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const r = await publicar({});
    if (!r) return NextResponse.json({ ok: true, ocupado: true });
    await registrarExecucao(JOB, { ok: true, mensagem: texto(r), duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await registrarExecucao(JOB, { ok: false, mensagem: e.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "ENGENHARIA"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const corpo = await req.json().catch(() => ({}));
  try {
    const r = await publicar({ forcar: corpo?.forcar === true });
    if (!r) return NextResponse.json({ error: "Já existe uma publicação em andamento. Tente de novo em instantes." }, { status: 409 });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "PUBLICAR_MATERIAIS_TEKLA", entity: "MateriaisTekla", entityId: r.arquivo || "sem-novidade", diff: { ...r, forcar: corpo?.forcar === true } },
    }).catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Falha ao publicar a planilha" }, { status: 502 });
  }
}
