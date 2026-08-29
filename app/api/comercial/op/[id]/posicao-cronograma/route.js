// GET /api/comercial/op/[id]/posicao-cronograma — o dossiê da obra em PDF.
//
// Vitor (29/08/2026), sobre a TMSA: "temos que mostrar um histórico para ele do problema que a
// engenharia deles causou (...) e tenho que buscar informação com uma equipe que não marca nada".
// O portal marca: envio do cronograma com data, hora e nomes; tarefa com data real; bloqueio com
// motivo; correspondência arquivada. Este documento junta tudo numa ordem só.
//
// ⚠ MESMO GATE DO CARD DE E-MAILS (Diretoria): o dossiê traz a correspondência com o cliente, que
// é o conteúdo mais sensível da OP. O botão vive naquele card, e o acesso acompanha.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";
import { gerarPosicaoCronogramaPDF } from "@/lib/posicao-cronograma-pdf";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const diretor = user.tipo === "ADMIN" || (await temAcessoDiretoria(user.email).catch(() => false));
  if (!diretor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let out;
  try { out = await gerarPosicaoCronogramaPDF(params.id); }
  catch (e) { return NextResponse.json({ error: e?.message || "Falha ao gerar o documento." }, { status: 400 }); }

  return new NextResponse(Buffer.from(out.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(out.nome, "inline"),
      "Cache-Control": "no-store",
    },
  });
}
