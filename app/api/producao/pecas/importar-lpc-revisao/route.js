// GET  /api/producao/pecas/importar-lpc-revisao            → lista as pastas de OP (nível 1)
// GET  ?op=<pasta da OP>                                   → busca os LPC dessa OP (por obra, rev mais alta)
// POST { pasta, obra, permitirDowngrade? }                 → importa a revisão dessa obra (merge, preserva progresso)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { listarPastasOp, buscarLpcDaOp, baixarLpcRows, resolveServidorDriveId } from "@/lib/sharepoint-lpc";
import { parseLPC } from "@/lib/parse-lpc";
import { importarLpcMerge } from "@/lib/importar-lpc-merge";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

function statusDo(e) {
  if (e.message === "Unauthorized") return 401;
  if (e.message === "Forbidden") return 403;
  return e.status || 500;
}

export async function GET(req) {
  try { await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: statusDo(e) }); }

  const opPasta = (new URL(req.url).searchParams.get("op") || "").trim();

  // Sem ?op → só lista as pastas de OP (rápido: 1 request ao Graph).
  if (!opPasta) {
    try {
      const { ops, base } = await listarPastasOp();
      return NextResponse.json({ base, ops });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: statusDo(e) });
    }
  }

  // Com ?op → busca os LPC dessa OP e cruza com a revisão carregada.
  try {
    const driveId = await resolveServidorDriveId();
    if (!driveId) return NextResponse.json({ error: "Drive SERVIDOR não resolvido." }, { status: 503 });
    const achados = await buscarLpcDaOp(driveId, opPasta);
    const carregadas = achados.length
      ? await prisma.lpcRevisao.findMany({ where: { opNumero: { in: achados.map((a) => a.obra) } } })
      : [];
    const atual = new Map(carregadas.map((c) => [c.opNumero, c]));
    const obras = achados.map((a) => {
      const at = atual.get(a.obra);
      return {
        obra: a.obra, revDisponivel: a.rev, arquivo: a.nome,
        revAtual: at ? at.revisao : null, itensAtual: at ? at.itens : null,
        novidade: !at || a.rev > at.revisao,
      };
    });
    return NextResponse.json({ pasta: opPasta, obras });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: statusDo(e) });
  }
}

const schema = z.object({
  pasta: z.string().min(1, "Informe a pasta da OP"),
  obra: z.string().min(1, "Informe a obra"),
  permitirDowngrade: z.boolean().optional(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: statusDo(e) }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const obra = body.obra.trim().toUpperCase();

  let driveId, achados;
  try {
    driveId = await resolveServidorDriveId();
    if (!driveId) return NextResponse.json({ error: "Drive SERVIDOR não resolvido." }, { status: 503 });
    achados = await buscarLpcDaOp(driveId, body.pasta);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: statusDo(e) });
  }

  const item = achados.find((a) => a.obra === obra);
  if (!item) return NextResponse.json({ error: `Nenhum LPC da obra ${obra} encontrado na pasta ${body.pasta}.` }, { status: 404 });

  // Guarda anti-downgrade: não rebaixa a revisão carregada sem confirmação.
  const atual = await prisma.lpcRevisao.findUnique({ where: { opNumero: obra } });
  if (atual && item.rev < atual.revisao && !body.permitirDowngrade) {
    return NextResponse.json({
      error: `O SharePoint tem R${String(item.rev).padStart(2, "0")}, abaixo da carregada R${String(atual.revisao).padStart(2, "0")}.`,
      downgrade: true, revDisponivel: item.rev, revAtual: atual.revisao,
    }, { status: 409 });
  }

  let parsed;
  try {
    const rows = await baixarLpcRows(driveId, item.id);
    parsed = parseLPC(rows);
    if (parsed.erro) throw new Error(parsed.erro);
  } catch (e) {
    return NextResponse.json({ error: `Falha ao ler ${item.nome}: ${e.message}` }, { status: 422 });
  }

  const resultado = await importarLpcMerge(parsed, { userId: user.id, revisao: item.rev, arquivo: item.nome });
  if (resultado.erro) return NextResponse.json({ error: resultado.erro }, { status: 422 });

  return NextResponse.json({ ok: true, arquivo: item.nome, ...resultado });
}
