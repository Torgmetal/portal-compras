import { NextResponse } from "next/server";
import { requireAcesso } from "@/lib/session";
import { buscarCfop, operacoesDoCfop, OPERACOES, CST_IPI, FAMILIA } from "@/lib/fiscal/cfop";

// Consulta de CFOP + a biblioteca de operações reais da TORG.
// ⚠⚠ Os verbetes são RESUMO OPERACIONAL, não a tabela oficial do CONFAZ — cada um sai com
// `validado: false` e a tela diz isso. Ver o cabeçalho de lib/fiscal/cfop.js.
export async function GET(req) {
  try {
    await requireAcesso({ modulos: ["FISCAL"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").slice(0, 120);
  const familia = searchParams.get("familia") || null;
  const achados = buscarCfop(q, { familia });
  return NextResponse.json({
    success: true,
    familias: Object.values(FAMILIA),
    cstIpi: CST_IPI,
    resultados: achados.map((c) => ({ ...c, operacoes: operacoesDoCfop(c.codigo).map((o) => ({ id: o.id, titulo: o.titulo, cliente: o.cliente })) })),
    operacoes: q ? undefined : OPERACOES,
  });
}
