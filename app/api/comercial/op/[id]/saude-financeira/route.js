// GET — saúde financeira da OP: verba estimada × realizada por família, custos informados na
// planilha de estudo e o resumo pra auditoria (Vitor, 19/08/2026).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";
import { saudeFinanceiraOP } from "@/lib/saude-financeira-op";
import { log } from "@/lib/log";

const registro = log("api/comercial/op/[id]/saude-financeira");

export const runtime = "nodejs";
export const maxDuration = 60;

// Mesma blindagem da aba Financeiro: ADMIN, COMERCIAL/FINANCEIRO e allowlist da Diretoria.
async function gateFinanceiro() {
  const user = await requireUser();
  const mods = user.modulos || [];
  if (user.tipo === "ADMIN" || mods.includes("COMERCIAL") || mods.includes("FINANCEIRO") || (await temAcessoDiretoria(user.email))) return user;
  throw new Error("Forbidden");
}

export async function GET(_req, { params }) {
  try {
    await gateFinanceiro();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const existe = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  try {
    return NextResponse.json(await saudeFinanceiraOP(params.id));
  } catch (e) {
    registro.erro("[saude-financeira]", e?.message);
    return NextResponse.json({ error: "Falha ao montar a saúde financeira." }, { status: 500 });
  }
}
