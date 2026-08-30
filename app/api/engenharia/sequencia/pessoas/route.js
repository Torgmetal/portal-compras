// GET /api/engenharia/sequencia/pessoas — quem pode ser dono de uma tarefa do setor.
//
// ⚠⚠ QUEM TEM O MÓDULO DO SETOR — e só. Vitor (29/08/2026): "na distribuição das tarefas da
// engenharia deixar apenas o Mike, John, Diego, Guilherme; quando for cadastrado novo usuário da
// engenharia o mesmo deve aparecer".
//
// A regra do módulo atende as duas metades do pedido: enxuga a lista (a versão anterior trazia
// TODOS os ADMINs — Caio, Fabrine, Matheus e o próprio Vitor apareciam sem trabalhar no setor) e
// mantém a lista viva sozinha, porque usuário novo da Engenharia nasce com o módulo.
//
// ⚠ Para incluir alguém, dá-se o MÓDULO — não se abre exceção no código. Foi o que se fez com o
// Guilherme (ADMIN, que não carregava módulo nenhum): para quem é ADMIN o módulo não muda acesso
// algum, já que o middleware libera tudo antes de olhar módulo. Lista com nome escrito na mão
// desatualiza no dia seguinte e ninguém lembra de onde mexer.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try { await requireRole(["ADMIN", "ENGENHARIA", "PLANEJAMENTO", "PCP", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const modulo = new URL(req.url).searchParams.get("modulo") || "ENGENHARIA";
  const pessoas = await prisma.user.findMany({
    where: { ativo: true, tipo: { in: ["ADMIN", "USUARIO"] }, modulos: { some: { modulo } } },
    select: { id: true, name: true, setor: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ success: true, pessoas });
}
