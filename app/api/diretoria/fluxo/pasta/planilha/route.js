// POST /api/diretoria/fluxo/pasta/planilha { opIds?: string[] } — os dados da planilha de desenhos.
//
// Vitor (25/08/2026): "preciso de uma forma de extrair planilha na parte dos desenhos das pastas...
// de todas as OPs e por seleção de OP também".
//
// ⚠ LÊ O QUE O CRON GRAVOU, não varre o SharePoint. Exportar 30 obras varrendo daria minutos de
// espera para uma planilha que o cron já tem pronta desde a madrugada. Cada linha carrega o
// `checadoEm` para quem estiver lendo saber de quando é o retrato.
//
// ⚠ DUAS ABAS DE PROPÓSITO: o resumo responde "quais obras estão furadas" e o detalhe responde
// "quais peças". Numa aba só, 6.000 marcas afogam as 30 linhas que interessam primeiro.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TETO_ITENS = 20_000; // acima disso o navegador não monta a planilha

export async function POST(req) {
  try { await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opIds } = await req.json().catch(() => ({}));
  const escolhidas = Array.isArray(opIds) && opIds.length ? opIds : null;

  const ops = await prisma.oP.findMany({
    where: {
      ...(escolhidas ? { id: { in: escolhidas } } : { status: { notIn: ["ENCERRADA", "CANCELADA"] } }),
    },
    select: {
      id: true, numero: true, cliente: true, obra: true, refCliente: true, emProducao: true,
      pastaEngenharia: true,
    },
    orderBy: { numero: "asc" },
  });

  const resumo = [], itens = [];
  for (const o of ops) {
    const p = o.pastaEngenharia;
    resumo.push({
      numero: o.numero, cliente: o.cliente || "", obra: o.obra || "", refCliente: o.refCliente || "",
      emProducao: !!o.emProducao,
      veredito: p ? (p.erro ? "ERRO" : p.veredito) : null,
      baixada: !!p?.baixada, baixaMotivo: p?.baixaMotivo || "", baixadaPorNome: p?.baixadaPorNome || "",
      erro: p?.erro || "",
      marcas: p?.marcas || 0,
      conjuntosCom: p?.conjuntosCom || 0, conjuntosTotal: p?.conjuntosTotal || 0,
      croquisCom: p?.croquisCom || 0, croquisTotal: p?.croquisTotal || 0,
      pdfs: p?.pdfs || 0,
      pdfsEnvio: p?.detalhe?.pdfsEnvio || 0,
      soEnvio: p?.detalhe?.soEnvio || 0,
      nc1: p?.nc1 || 0, igs: p?.igs || 0,
      foraPadrao: p?.foraPadrao || 0,
      checadoEm: p?.checadoEm ? p.checadoEm.toISOString() : null,
    });
    for (const x of p?.detalhe?.semDesenho || []) {
      if (itens.length >= TETO_ITENS) break;
      itens.push({
        numero: o.numero, cliente: o.cliente || "",
        marca: x.marca, conjunto: !!x.conjunto, nc1: !!x.nc1, foraPadrao: x.foraPadrao || "",
        soEnvio: !!x.soEnvio,
      });
    }
  }

  const naoConferidas = resumo.filter((r) => !r.veredito).length;
  return NextResponse.json({
    resumo, itens,
    truncado: itens.length >= TETO_ITENS,
    naoConferidas,
    geradoEm: new Date().toISOString(),
  });
}
