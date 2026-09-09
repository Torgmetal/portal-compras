// GET  /api/pcp/gantt → tudo que está programado nos três setores, em lotes (setor+recurso+OP+dia)
// POST /api/pcp/gantt → grava o que foi arrastado/quebrado no quadro
//   { blocos: [{ setor, ids[], recurso|null, dia "YYYY-MM-DD" }] }
//
// ⚠⚠ POR QUE UMA ROTA SÓ EM VEZ DE TRÊS. O quadro mexe nos três setores na mesma sessão e o usuário
// aperta "Salvar" uma vez; mandar por setor faria metade gravar e metade não sem ninguém saber. As
// rotas antigas continuam existindo para as telas delas — esta é a do quadro.
//
// ⚠ A DE MONTAGEM NÃO PODIA SER REUTILIZADA: /api/producao/pecas/liberar-montagem carrega a trava de
// prontidão (todos os croquis cortados), que é o portão para o conjunto DESCER pela primeira vez.
// Remanejar o que já está programado não pode passar por esse portão de novo — a peça já desceu.
import { programarRetornos } from "@/lib/terceiros-programacao";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { lotesProgramados, aplicarRemanejo, SETORES_GANTT } from "@/lib/gantt-pcp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

export async function GET() {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const lotes = await lotesProgramados();
  // peça na bancada de obra que o PCP tirou do quadro — vai à parte, para a tela listar sem desenhar
  const foraDoQuadro = Object.entries(lotes.foraDoQuadro || {}).flatMap(([setor, arr]) =>
    arr.map((p) => ({ ...p, setor })));
  return NextResponse.json({ lotes, foraDoQuadro, hoje: new Date().toISOString().slice(0, 10) });
}

const schema = z.object({
  blocos: z.array(z.object({
    setor: z.enum(SETORES_GANTT),
    ids: z.array(z.string()).min(1),
    recurso: z.string().trim().max(60).nullable(),
    dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  })).min(1, "Nada para salvar").max(400),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const temRetorno = body.blocos.some(b=>b.ids.some(id=>id.startsWith("retorno:")));
  const temPeca = body.blocos.some(b=>b.ids.some(id=>!id.startsWith("retorno:")));
  if(temRetorno&&temPeca)return NextResponse.json({error:"Salve os retornos de terceiros separadamente das outras programações."},{status:400});
  let r;
  try {r = temRetorno ? await programarRetornos(body.blocos,user) : await aplicarRemanejo(body.blocos, user);}
  catch(e){return NextResponse.json({error:e.message},{status:400});}

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "PCP_GANTT_REMANEJAR", entity: "PecaConjunto",
      entityId: `${r.total} peças`,
      diff: {
        porSetor: r.porSetor, blocos: body.blocos.length,
        // amostra legível para quem for auditar depois: setor, recurso e dia de cada bloco
        destinos: body.blocos.slice(0, 40).map((b) => `${b.setor} · ${b.recurso || "sem recurso"} · ${b.dia} · ${b.ids.length} peça(s)`),
      },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, ...r });
}
