// GET /api/comercial/kickoff-destinatarios — usuários ativos agrupados por
// módulo/setor, para a seleção de destinatários do e-mail de Kick Off
// (marca os setores → resolve os e-mails de quem tem aquele módulo).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const LABELS = {
  COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras",
  PRODUCAO: "Produção", ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro",
  EXPEDICAO: "Expedição", RH: "RH", PLANEJAMENTO: "Planejamento", PCP: "PCP",
  REQUISICOES: "Requisições",
};

export async function GET() {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const users = await prisma.user.findMany({
    where: { ativo: true, email: { not: null } },
    select: { name: true, email: true, tipo: true, modulos: { select: { modulo: true } } },
  });

  const setores = {};
  for (const u of users) {
    const mods = u.tipo === "ADMIN" ? [] : u.modulos.map((m) => m.modulo);
    for (const m of mods) {
      if (!setores[m]) setores[m] = { modulo: m, label: LABELS[m] || m, emails: [] };
      if (u.email && !setores[m].emails.some((e) => e.email === u.email)) {
        setores[m].emails.push({ nome: u.name, email: u.email });
      }
    }
  }

  // Ordena pela ordem do fluxo da fábrica
  const ordem = ["COMERCIAL", "ENGENHARIA", "PLANEJAMENTO", "PCP", "COMPRAS", "PRODUCAO", "ALMOXARIFADO", "EXPEDICAO", "FINANCEIRO", "RH", "REQUISICOES"];
  const lista = Object.values(setores).sort((a, b) => ordem.indexOf(a.modulo) - ordem.indexOf(b.modulo));

  return NextResponse.json({ setores: lista });
}
