// GET  /api/producao/pecas/importar-lpc-revisao            → varre o SharePoint
//        e lista, por obra, a revisão disponível × a carregada no portal.
//      ?op=OP-078  restringe a uma subpasta (mais rápido).
// POST /api/producao/pecas/importar-lpc-revisao { obra }   → importa a revisão
//        MAIS ALTA dessa obra, mesclando e preservando o progresso (avisa conflitos).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { scanLpcPorObra, baixarLpcRows } from "@/lib/sharepoint-lpc";
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
  let user;
  try { user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: statusDo(e) }); }

  const { searchParams } = new URL(req.url);
  const opFiltro = (searchParams.get("op") || "").trim();
  const obraFiltro = (searchParams.get("obra") || "").trim();

  let scan;
  try { scan = await scanLpcPorObra({ opFiltro, obraFiltro }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: statusDo(e) }); }

  // Revisões já carregadas no portal (para mostrar atual × disponível)
  const carregadas = await prisma.lpcRevisao.findMany({
    where: scan.lista.length ? { opNumero: { in: scan.lista.map((x) => x.obra) } } : undefined,
  });
  const atualPorObra = new Map(carregadas.map((c) => [c.opNumero, c]));

  const lista = scan.lista.map((x) => {
    const atual = atualPorObra.get(x.obra);
    return {
      obra: x.obra,
      revDisponivel: x.rev,
      arquivo: x.nome,
      pasta: x.pasta,
      modificado: x.modificado,
      revAtual: atual ? atual.revisao : null,
      itensAtual: atual ? atual.itens : null,
      novidade: !atual || x.rev > atual.revisao, // tem revisão nova p/ importar
    };
  });

  return NextResponse.json({ pastaVarrida: scan.pastaVarrida, totalXlsx: scan.totalXlsx, lista });
}

const schema = z.object({
  obra: z.string().min(1, "Informe a obra"),
  permitirDowngrade: z.boolean().optional(), // confirma reimportar revisão menor que a carregada
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: statusDo(e) }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const obra = body.obra.trim().toUpperCase();

  let scan;
  try { scan = await scanLpcPorObra({ obraFiltro: obra }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: statusDo(e) }); }

  const item = scan.lista.find((x) => x.obra === obra);
  if (!item) {
    return NextResponse.json({ error: `Nenhum LPC encontrado para ${obra} no SharePoint (pasta ${scan.pastaVarrida}).` }, { status: 404 });
  }

  // Guarda anti-downgrade: não rebaixa a revisão carregada sem confirmação explícita.
  const atual = await prisma.lpcRevisao.findUnique({ where: { opNumero: obra } });
  if (atual && item.rev < atual.revisao && !body.permitirDowngrade) {
    return NextResponse.json({
      error: `O SharePoint tem R${String(item.rev).padStart(2, "0")}, abaixo da revisão carregada R${String(atual.revisao).padStart(2, "0")}. Confirme se realmente quer rebaixar.`,
      downgrade: true, revDisponivel: item.rev, revAtual: atual.revisao,
    }, { status: 409 });
  }

  let parsed;
  try {
    const rows = await baixarLpcRows(scan.driveId, item.id);
    parsed = parseLPC(rows);
    if (parsed.erro) throw new Error(parsed.erro);
  } catch (e) {
    return NextResponse.json({ error: `Falha ao ler ${item.nome}: ${e.message}` }, { status: 422 });
  }

  const resultado = await importarLpcMerge(parsed, { userId: user.id, revisao: item.rev, arquivo: item.nome });
  if (resultado.erro) return NextResponse.json({ error: resultado.erro }, { status: 422 });

  return NextResponse.json({ ok: true, arquivo: item.nome, ...resultado });
}
