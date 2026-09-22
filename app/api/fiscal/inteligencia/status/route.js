import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { referenciaAtiva } from "@/lib/fiscal/consulta";

// O painel de Atualizações Tributárias: o que está ativo, quando foi verificado, e o que falhou.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAcesso({ modulos: ["FISCAL"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const [referencia, historico, ultimaOk] = await Promise.all([
    referenciaAtiva(),
    prisma.fiscalSincronizacao.findMany({ orderBy: { iniciadaEm: "desc" }, take: 12 }),
    // ⚠⚠ "ÚLTIMA VERIFICAÇÃO" E "ÚLTIMA IMPORTAÇÃO" SÃO COISAS DIFERENTES, e a tela precisa das
    // duas: se a fonte está fora do ar há três dias, a referência continua a mesma — o que mudou
    // é que ninguém confere desde então. Mostrar só uma delas esconde exatamente isso.
    prisma.fiscalSincronizacao.findFirst({
      where: { status: { in: ["IMPORTADA", "SEM_MUDANCA"] } }, orderBy: { iniciadaEm: "desc" },
    }),
  ]);

  return NextResponse.json({
    success: true,
    referencia,
    ultimaVerificacaoOk: ultimaOk?.iniciadaEm ?? null,
    historico: historico.map((h) => ({
      id: h.id, fonte: h.fonte, disparo: h.disparo, status: h.status,
      iniciadaEm: h.iniciadaEm, terminadaEm: h.terminadaEm, mensagem: h.mensagem,
    })),
  });
}
