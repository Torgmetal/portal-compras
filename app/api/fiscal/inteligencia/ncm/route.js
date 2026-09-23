import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAcesso } from "@/lib/session";
import { buscarNcm, referenciaAtiva } from "@/lib/fiscal/consulta";

// Busca de NCM na TIPI ativa — por código ou por descrição.
// ⚠ Só LEITURA: nada aqui muda alíquota. Quem importa é o cron/painel, restrito a ADMIN.
const schema = z.object({ q: z.string().max(120).optional(), limite: z.coerce.number().int().min(1).max(50).optional() });

export async function GET(req) {
  try {
    await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const { searchParams } = new URL(req.url);
  let p;
  try {
    p = schema.parse({ q: searchParams.get("q") ?? undefined, limite: searchParams.get("limite") ?? undefined });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues[0]?.message ?? "Parâmetros inválidos." }, { status: 400 });
  }
  // ⚠ Sem termo, a tela ainda precisa saber DE QUANDO é a referência que ela está servindo.
  if (!p.q) return NextResponse.json({ success: true, resultados: [], referencia: await referenciaAtiva() });
  return NextResponse.json({ success: true, ...(await buscarNcm(p.q, { limite: p.limite ?? 25 })) });
}
