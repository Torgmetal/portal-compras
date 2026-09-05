// Cron Vercel — casa os PDFs da pasta "Certificados Digitalizados" com os documentos do CMR.
//
// ⚠⚠ POR QUE VIROU CRON. Vitor (05/09/2026): "por que não está dando para baixar os certificados?
// o Eduardo disse que anexou na pasta". Ele tinha anexado mesmo — o "R 261274 á 277.pdf" estava lá.
// O que faltava era alguém CLICAR no botão de casar, na tela da Qualidade. Medido naquele dia:
// **162 certificados com PDF na pasta e sem vínculo no portal** — 22 da OP-113, 22 da 094, 21 da
// 112, 18 da 089. O cliente abria a rastreabilidade e via a lista sem download; o data book, idem.
//
// Casar é idempotente e só preenche vazio (o UPDATE exige `sharepointItemId IS NULL`), então rodar
// sozinho não tem risco: nunca troca o PDF de um documento que já tem arquivo.
//
// ⚠ A LÓGICA É A MESMA do botão manual (`lib/match-certificados`) — nunca divergem.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { casarCertificados } from "@/lib/match-certificados";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const r = await casarCertificados();
    await registrarExecucao("casar-certificados", {
      ok: true, duracaoMs: Date.now() - t0,
      mensagem: `${r.casados} certificado(s) vinculado(s) · ${r.totalPdfs} PDF(s) na pasta`,
    }).catch(() => {});
    return NextResponse.json({ ok: true, ...r, ms: Date.now() - t0 });
  } catch (e) {
    await registrarExecucao("casar-certificados", { ok: false, duracaoMs: Date.now() - t0, mensagem: e?.message || "erro" }).catch(() => {});
    return NextResponse.json({ ok: false, error: e?.message || "erro" }, { status: 500 });
  }
}
