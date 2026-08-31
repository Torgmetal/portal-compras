// GRD — Controle de liberação de desenhos (guia de remessa de documentos).
// GET                → todas as OPs que já tiveram desenho emitido/impresso, com o resumo.
// GET ?opNumero=097  → as liberações daquela OP (o que já foi impresso, com o R do papel).
//
// A GRD nasce quando o desenho é IMPRESSO (emitir/abrir não é liberação) e a reimpressão soma
// no contador da mesma linha. Cada linha guarda o SNAPSHOT do R que estava carimbado no papel
// — é isso que prova o que foi pro chão de fábrica, mesmo que o CMR mude depois. (Vitor 19/08.)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "QUALIDADE", "COMERCIAL"];

// O R que estava carimbado: a GRD guarda o array do rastreioDoConjunto (1 linha = peça;
// N = croquis do conjunto). Resume pra caber numa coluna.
function resumoRastreio(rastreio) {
  const itens = Array.isArray(rastreio) ? rastreio : [];
  if (!itens.length) return { rs: [], comR: 0, total: 0, texto: "—" };
  const rs = [...new Set(itens.flatMap((i) => (i.usadas || []).map((u) => u.rastreio)).filter(Boolean))];
  const comR = itens.filter((i) => i.situacao === "R_DEFINIDO").length;
  const texto = !rs.length
    ? "sem R no papel"
    : itens.length === 1
      ? `R ${rs[0]}`
      : `${comR}/${itens.length} com R · ${rs.slice(0, 3).map((r) => `R ${r}`).join(" · ")}${rs.length > 3 ? " …" : ""}`;
  return { rs, comR, total: itens.length, texto };
}

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = new URL(req.url).searchParams.get("opNumero");

  // ── Detalhe de UMA OP ────────────────────────────────────────────────────────────────────
  if (opNumero) {
    const num = String(opNumero).replace(/\D/g, "").padStart(3, "0");
    const op = await prisma.oP.findFirst({ where: { numero: num }, select: { id: true, numero: true, obra: true, cliente: true } });
    const linhas = await prisma.grdLiberacao.findMany({
      where: { opNumero: num },
      orderBy: [{ ultimaImpressaoEm: "desc" }, { createdAt: "desc" }],
      select: {
        id: true, marca: true, arquivo: true, formato: true, setor: true, rastreio: true, historico: true,
        impressoes: true, ultimaImpressaoEm: true, createdAt: true,
        liberadoPorNome: true, impressoItemId: true, impressoUrl: true, documentoId: true,
      },
    });
    // Cobertura de rastreabilidade das PEÇAS da OP (o quadro geral, além do que já foi impresso).
    // ⚠ A COBERTURA SAIU DE VEZ, não só da tela. Vitor (26/08/2026): "não precisa dessa
    // informação". Ela contava o estado de rastreio de TODAS as peças da OP — uma pergunta da
    // Qualidade, não da GRD, que é sobre o que foi impresso. E era cara: `rastreioDaOp` varre a
    // obra inteira a cada abertura. Deixar de mostrar e continuar calculando seria o pior dos dois.

    // ⚠ AS GUIAS JÁ EMITIDAS VÊM JUNTO. Vitor (31/08/2026): "a GRD do PCP só aparece se eu
    // reimprimir ela". Eu gravava a guia e não devolvia em lugar nenhum — o documento existia e a
    // tela não sabia. Sem isto, "ver a guia" só acontecia reemitindo, o que cria uma segunda guia
    // da mesma entrega.
    const guias = await prisma.grdRemessaPcp.findMany({
      where: { opNumero: num },
      orderBy: { emitidoEm: "desc" },
      select: {
        id: true, numero: true, ano: true, setor: true, qtdDocs: true,
        emitidoEm: true, emitidoPorNome: true,
        recebidoPorNome: true, recebidoPorEmail: true, enviadoEm: true,
      },
    });

    return NextResponse.json({
      guias,
      // opId vai junto: a tela abre o modal de desenhos da marca direto daqui (Vitor 19/08 —
      // "preciso entender os que der problema e abrir ele para saber do que se trata").
      op: op ? { id: op.id, numero: op.numero, obra: op.obra, cliente: op.cliente } : { numero: num },
      // ⚠ o histórico vai do mais RECENTE para o mais antigo: quem abre a GRD quer a última cópia
      linhas: linhas.map((l) => ({
        ...l, resumoR: resumoRastreio(l.rastreio), rastreio: undefined,
        copias: (Array.isArray(l.historico) ? l.historico : []).slice().reverse(),
        historico: undefined,
      })),
    });
  }

  // ── Lista das OPs ────────────────────────────────────────────────────────────────────────
  const grds = await prisma.grdLiberacao.findMany({
    select: { opNumero: true, marca: true, impressoes: true, ultimaImpressaoEm: true, createdAt: true, documentoId: true, impressoItemId: true, setor: true },
  });
  const porOp = new Map();
  for (const g of grds) {
    const o = porOp.get(g.opNumero) || { opNumero: g.opNumero, grds: 0, impressoes: 0, marcas: new Set(), setores: new Set(), noDataBook: 0, carimbados: 0, ultimaEm: null };
    o.grds++;
    o.impressoes += g.impressoes || 1;
    o.marcas.add(g.marca);
    if (g.setor) o.setores.add(g.setor);
    if (g.documentoId) o.noDataBook++;
    if (g.impressoItemId) o.carimbados++;
    const q = g.ultimaImpressaoEm || g.createdAt;
    if (q && (!o.ultimaEm || q > o.ultimaEm)) o.ultimaEm = q;
    porOp.set(g.opNumero, o);
  }
  const nums = [...porOp.keys()];
  const ops = nums.length
    ? await prisma.oP.findMany({ where: { numero: { in: nums } }, select: { numero: true, obra: true, cliente: true, status: true } })
    : [];
  const info = new Map(ops.map((o) => [o.numero, o]));
  // Total de marcas da OP (denominador da cobertura de emissão: quantas já foram pro papel).
  //
  // ⚠⚠ MARCA É CONJUNTO + AVULSA, NÃO TUDO. Vitor (26/08/2026): "garanta que está importando as
  // peças avulsa que vamos chamar de MARCA e os CONJUNTOS". O denominador contava a tabela inteira
  // — croqui, item comprado e a linha da Lista de Expedição junto — e um denominador inflado faz a
  // cobertura parecer pior do que é: a OP-105 mostrava 19 de 237 quando o universo real é bem menor.
  const totMarcas = nums.length
    ? await prisma.pecaConjunto.groupBy({
        by: ["opNumero"],
        where: { opNumero: { in: nums }, tipoPeca: { not: "CROQUI" } },
        _count: { _all: true },
      })
    : [];
  const totPorOp = new Map(totMarcas.map((t) => [t.opNumero, t._count._all]));

  const lista = [...porOp.values()]
    .map((o) => ({
      opNumero: o.opNumero,
      obra: info.get(o.opNumero)?.obra || null,
      cliente: info.get(o.opNumero)?.cliente || null,
      status: info.get(o.opNumero)?.status || null,
      grds: o.grds, impressoes: o.impressoes,
      marcas: o.marcas.size, marcasNaOp: totPorOp.get(o.opNumero) || null,
      setores: [...o.setores].sort(),
      noDataBook: o.noDataBook, carimbados: o.carimbados,
      ultimaEm: o.ultimaEm ? o.ultimaEm.toISOString() : null,
    }))
    .sort((a, b) => String(b.ultimaEm || "").localeCompare(String(a.ultimaEm || "")));

  return NextResponse.json({
    ops: lista,
    totais: {
      ops: lista.length,
      grds: lista.reduce((a, x) => a + x.grds, 0),
      impressoes: lista.reduce((a, x) => a + x.impressoes, 0),
      noDataBook: lista.reduce((a, x) => a + x.noDataBook, 0),
    },
  });
}
