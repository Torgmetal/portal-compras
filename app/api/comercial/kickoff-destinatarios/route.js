// GET /api/comercial/kickoff-destinatarios — usuários ativos agrupados por
// módulo/setor, para a seleção de destinatários do e-mail de Kick Off
// (marca os setores → resolve os e-mails de quem tem aquele módulo).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const LABELS = {
  DIRETORIA: "Diretoria/Admin",
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

  // email é obrigatório no modelo User — sem filtro de null
  const users = await prisma.user.findMany({
    where: { ativo: true },
    select: { name: true, email: true, tipo: true, modulos: { select: { modulo: true } } },
  });

  const setores = {};
  const add = (grupo, u) => {
    if (!setores[grupo]) setores[grupo] = { modulo: grupo, label: LABELS[grupo] || grupo, emails: [] };
    if (u.email && !setores[grupo].emails.some((e) => e.email === u.email)) {
      setores[grupo].emails.push({ nome: u.name, email: u.email });
    }
  };
  for (const u of users) {
    // ADMINs não têm módulos — entram no grupo Diretoria pra serem selecionáveis
    if (u.tipo === "ADMIN") { add("DIRETORIA", u); continue; }
    for (const m of u.modulos.map((x) => x.modulo)) add(m, u);
  }
  for (const s of Object.values(setores)) s.emails.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  // Ordena pela ordem do fluxo da fábrica
  const ordem = ["DIRETORIA", "COMERCIAL", "ENGENHARIA", "PLANEJAMENTO", "PCP", "COMPRAS", "PRODUCAO", "ALMOXARIFADO", "EXPEDICAO", "FINANCEIRO", "RH", "REQUISICOES"];
  const lista = Object.values(setores).sort((a, b) => ordem.indexOf(a.modulo) - ordem.indexOf(b.modulo));

  return NextResponse.json({ setores: lista });
}
