// POST /api/planejamento/liberacao/pasta {opId} → confere a pasta da OP agora e grava
//
// ⚠ POR QUE UMA ROTA NOVA. A conferência já existia em /api/diretoria/fluxo/pasta, mas aquela rota
// é da Diretoria — allowlist própria, onde nem ADMIN entra (lib/diretoria.js). Quem libera é o
// Planejamento, e sem poder reconferir o portão do desenho viraria uma parede: barra a liberação
// por um retrato de ontem e não oferece jeito de atualizar.
//
// ⚠ A CONTA NÃO É COPIADA: `conferirPastaDaOp` é a mesma que o cron e o painel usam. Duas cópias
// divergiriam no primeiro ajuste de critério, e aí a tela barraria por um número e o painel da
// Diretoria mostraria outro.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { conferirPastaDaOp } from "@/lib/pasta-engenharia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opId } = await req.json().catch(() => ({}));
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  try {
    const r = await conferirPastaDaOp(prisma, opId);
    if (r.erro) return NextResponse.json({ error: r.erro }, { status: 502 });
    return NextResponse.json({
      ok: true, veredito: r.veredito, checadoEm: new Date().toISOString(),
      marcas: r.lista?.marcas || 0, semDesenho: (r.semDesenho || []).length,
      pdfs: r.arquivos?.pdfs || 0, pdfsEnvio: r.arquivos?.pdfsEnvio || 0,
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Falha ao conferir a pasta." }, { status: 500 });
  }
}
