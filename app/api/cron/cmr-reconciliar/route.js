// Cron Vercel — reconcilia a planilha CMR do ano (SharePoint) com o portal, nos DOIS sentidos.
// Pega rastreios digitados direto no Excel do servidor e reenvia ao Excel o que faltar lá.
// A LÓGICA vive em lib/cmr-reconciliar (a mesma do botão manual — nunca divergem).
//   ⚠ Vitor (26/08/2026): "alguns R da planilha ja foram preenchidos e não está puxando" — o
//   almoxarifado NUMERA o R antes de receber (casca só com o índice). A lib COMPLETA a casca
//   (só campos vazios) e importa só linhas COM descrição. Ver comentários lá.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { reconciliarCmr } from "@/lib/cmr-reconciliar";
import { log } from "@/lib/log";

const registro = log("api/cron/cmr-reconciliar");

export const runtime = "nodejs";
// ⚠⚠ 60 s MATAVA A RODADA SEM DEIXAR RASTRO (26/09/2026). Desde que a planilha é achada listando a
// árvore da rastreabilidade (a busca do Graph está em 500 — ver lib/cmr-localizar), a reconciliação
// procura o arquivo DUAS vezes (ler e reenviar) sobre uma planilha de ~17 MB; a sincronização do
// mesmo arquivo já levava 62 s. Morta por tempo, a função nem chega ao `registrarExecucao` do catch:
// o monitor só vê "sem sucesso há N h". Mesmo teto da sincronização.
export const maxDuration = 300;

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  const ano = new Date().getFullYear();
  try {
    await aquecerBanco(prisma);
    await aquecerBanco(prismaDirect).catch(() => {});
    const r = await reconciliarCmr(prisma, ano, { userId: null });
    await registrarExecucao("cmr-reconciliar", { ok: true, duracaoMs: Date.now() - t0, mensagem: `Excel→portal ${r.importados} novo(s) · ${r.completados} completado(s) · portal→Excel ${r.enviados}` });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    registro.erro("[cron cmr-reconciliar] erro:", e?.message);
    await registrarExecucao("cmr-reconciliar", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
