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
    const porR = new Map(dbRows.map((r) => [so(r.importRef), r]));
    const sheetSet = new Set(sheet.map((r) => so(r.indiceR)).filter(Boolean));
    const doExcel = sheet.filter((r) => r.indiceR && !porR.has(so(r.indiceR)));
    const doPortal = dbRows.filter((r) => !sheetSet.has(so(r.importRef)));

    // ⚠⚠ O R QUE JÁ EXISTIA NUNCA MAIS ERA LIDO — e era esse o furo. Vitor (26/08/2026): "alguns R
    // da planilha ja foram preenchidos e não está puxando".
    //
    // O almoxarifado NUMERA O R ANTES DE RECEBER: a linha nasce na planilha só com o índice. O cron
    // importava essa casca, e quando a linha era preenchida de verdade o R já constava no portal —
    // `!dbSet.has(...)` deixava a linha de fora para sempre. Medido: 33 R preenchidos na planilha e
    // vazios aqui, em 8 obras (083, 085, 094, 0102, 0105, 0112, 0113, 0115). Para o Planejamento
    // isso lia como "material não comprado" no aço que estava no pátio com certificado.
    //
    // ⚠ SÓ PREENCHE O QUE ESTÁ VAZIO AQUI. A planilha não sobrescreve o que alguém digitou no
    // portal: se o campo tem valor dos dois lados e diferem, quem manda é o portal (é a tela onde a
    // pessoa vê o que está fazendo). O que a planilha faz é COMPLETAR a casca.
    const VAZIO_NOME = (v) => !so(v) || so(v) === "(sem descrição)";
    const CAMPOS = ["nome", "norma", "opNumero", "numeroCorrida", "numeroDocumento", "fornecedor",
                    "pedidoCompra", "nfNumero", "dataRecebimento", "pesoKg", "quantidade"];
    let completados = 0;
    for (const r of sheet) {
      const atual = porR.get(so(r.indiceR));
      if (!atual || !so(r.descricao)) continue;
      const d = mapearLancamento(r, r.indiceR, null);
      const patch = {};
      for (const c of CAMPOS) {
        const novo = d[c];
        const velho = atual[c];
        const velhoVazio = c === "nome" ? VAZIO_NOME(velho) : velho == null || so(velho) === "";
        if (velhoVazio && novo != null && so(novo) !== "") patch[c] = novo;
      }
      if (!Object.keys(patch).length) continue;
      // ⚠ updateMany porque `importRef` NÃO é único no schema — só indexado. Um `update` por chave
      // composta nem existe aqui, e a planilha pode ter o mesmo R em duas linhas.
      try { const u = await prisma.documentoQualidade.updateMany({ where: { categoria: CMR_CAT, importRef: so(r.indiceR) }, data: patch }); completados += u.count ? 1 : 0; } catch {}
    }

    let importados = 0;
    for (const r of doExcel) {
      // ⚠ casca sem descrição não vira registro: é R reservado, ainda sem material. Criar aqui só
      // recriaria o problema acima — e um R sem descrição não casa com perfil nenhum.
      if (!so(r.descricao)) continue;
      try { const d = mapearLancamento(r, r.indiceR, null); d.origem = "planilha_sharepoint"; await prisma.documentoQualidade.create({ data: d }); importados++; } catch {}
    }
    await aprenderReferencias(doExcel).catch(() => {});

    let enviados = 0;
    if (doPortal.length) {
      const linhas = doPortal.map((r) => { const { rc, obs } = parseObs(r.observacao); return { rc, indiceR: so(r.importRef), descricao: so(r.nome), certificado: so(r.numeroDocumento), loteCorrida: so(r.numeroCorrida), especificacao: so(r.norma), pedidoCompra: so(r.pedidoCompra), dataRecebimento: r.dataRecebimento, nf: so(r.nfNumero), fornecedor: so(r.fornecedor), obra: so(r.opNumero), qtd: r.quantidade, pesoLitro: r.pesoKg, observacao: obs }; });
      try { const rr = await appendLinhasCmr(ano, linhas); enviados = rr.anexadas || 0; } catch {}
    }

    await registrarExecucao("cmr-reconciliar", { ok: true, duracaoMs: Date.now() - t0, mensagem: `Excel→portal ${importados} novo(s) · ${completados} completado(s) · portal→Excel ${enviados}` });
    return NextResponse.json({ ok: true, ano, importados, completados, enviados });
  } catch (e) {
    console.error("[cron cmr-reconciliar] erro:", e?.message);
    await registrarExecucao("cmr-reconciliar", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
