// Cron Vercel — reconcilia a planilha CMR do ano (SharePoint) com o portal, nos DOIS sentidos.
// Pega rastreios digitados direto no Excel do servidor e reenvia ao Excel o que faltar lá.
// Roda 1x/dia (config em vercel.json). Autenticação via Bearer CRON_SECRET.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { CMR_CAT, prefixoAno, mapearLancamento, aprenderReferencias } from "@/lib/cmr";
import { lerLinhasCmr, appendLinhasCmr } from "@/lib/cmr-sharepoint";

export const runtime = "nodejs";
export const maxDuration = 60;
const so = (v) => (v == null ? "" : String(v).trim());
function parseObs(o) { const s = so(o); const m = s.match(/^Tipo:\s*(RC|R)\b\s*(\|\s*)?/i); return m ? { rc: m[1].toUpperCase(), obs: s.slice(m[0].length).trim() } : { rc: "", obs: s }; }

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  const ano = new Date().getFullYear();
  const pre = prefixoAno(ano);
  try {
    await aquecerBanco(prisma);
    await aquecerBanco(prismaDirect).catch(() => {});

    const [sheet, dbRows] = await Promise.all([
      lerLinhasCmr(ano),
      prisma.documentoQualidade.findMany({
        where: { categoria: CMR_CAT, importRef: { startsWith: pre } },
        select: { importRef: true, nome: true, norma: true, opNumero: true, numeroCorrida: true, numeroDocumento: true, fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true, pesoKg: true, quantidade: true, observacao: true },
      }),
    ]);
    const dbSet = new Set(dbRows.map((r) => so(r.importRef)));
    const sheetSet = new Set(sheet.map((r) => so(r.indiceR)).filter(Boolean));
    const doExcel = sheet.filter((r) => r.indiceR && !dbSet.has(r.indiceR));
    const doPortal = dbRows.filter((r) => !sheetSet.has(so(r.importRef)));

    let importados = 0;
    for (const r of doExcel) {
      try { const d = mapearLancamento(r, r.indiceR, null); d.origem = "planilha_sharepoint"; await prisma.documentoQualidade.create({ data: d }); importados++; } catch {}
    }
    await aprenderReferencias(doExcel).catch(() => {});

    let enviados = 0;
    if (doPortal.length) {
      const linhas = doPortal.map((r) => { const { rc, obs } = parseObs(r.observacao); return { rc, indiceR: so(r.importRef), descricao: so(r.nome), certificado: so(r.numeroDocumento), loteCorrida: so(r.numeroCorrida), especificacao: so(r.norma), pedidoCompra: so(r.pedidoCompra), dataRecebimento: r.dataRecebimento, nf: so(r.nfNumero), fornecedor: so(r.fornecedor), obra: so(r.opNumero), qtd: r.quantidade, pesoLitro: r.pesoKg, observacao: obs }; });
      try { const rr = await appendLinhasCmr(ano, linhas); enviados = rr.anexadas || 0; } catch {}
    }

    await registrarExecucao("cmr-reconciliar", { ok: true, duracaoMs: Date.now() - t0, mensagem: `Excel→portal ${importados} · portal→Excel ${enviados}` });
    return NextResponse.json({ ok: true, ano, importados, enviados });
  } catch (e) {
    console.error("[cron cmr-reconciliar] erro:", e?.message);
    await registrarExecucao("cmr-reconciliar", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
