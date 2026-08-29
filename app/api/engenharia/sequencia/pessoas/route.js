// GET /api/engenharia/sequencia/pessoas — quem pode ser dono de uma tarefa do setor.
//
// ⚠⚠ TRÊS CAMINHOS PARA ENTRAR NA LISTA, e nenhum deles sozinho basta:
//   · tem o MÓDULO do setor (o caso normal — Diego, John, Gabriel);
//   · é ADMIN (enxerga tudo por definição e não carrega módulo nenhum — era por isso que o
//     Guilherme não aparecia: Vitor pediu em 29/08/2026 para incluí-lo);
//   · tem o SETOR no cadastro, mesmo sem o módulo (quem trabalha ali mas usa o portal por outra
//     porta).
//
// ⚠ Ser DONO de uma tarefa não dá acesso a nada: é só um nome no cronograma. Por isso a lista pode
// ser mais larga que a de quem entra no módulo — o contrário (dar o módulo para alguém virar dono)
// mudaria a permissão da pessoa, que é efeito colateral que ninguém pediu.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try { await requireRole(["ADMIN", "ENGENHARIA", "PLANEJAMENTO", "PCP", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const modulo = new URL(req.url).searchParams.get("modulo") || "ENGENHARIA";
  const rotulo = { ENGENHARIA: "Engenharia", PLANEJAMENTO: "Planejamento", PCP: "PCP", PRODUCAO: "Produção" }[modulo] || modulo;
  const pessoas = await prisma.user.findMany({
    where: {
      ativo: true, tipo: { in: ["ADMIN", "USUARIO"] },
      OR: [
        { modulos: { some: { modulo } } },
        { tipo: "ADMIN" },
        { setor: { equals: rotulo, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, setor: true, tipo: true, modulos: { select: { modulo: true } } },
    orderBy: { name: "asc" },
  });
  // do setor primeiro — é quem a Engenharia escolhe no dia a dia; o resto fica no fim da lista
  const doSetor = (p) => p.modulos.some((m) => m.modulo === modulo) || String(p.setor || "").toLowerCase() === rotulo.toLowerCase();
  pessoas.sort((a, b) => (doSetor(b) ? 1 : 0) - (doSetor(a) ? 1 : 0) || a.name.localeCompare(b.name));
  return NextResponse.json({ success: true, pessoas: pessoas.map(({ id, name, setor }) => ({ id, name, setor })) });
}
