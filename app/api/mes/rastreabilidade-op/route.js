import { NextResponse } from "next/server";
import { prisma, waitMesTables } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/mes/rastreabilidade-op?obra=T87
//
// Lê de MesOrdem (dataset 150 — planejado vs produzido por peça/operação).
// Cada "peça" = um par (op, item), agregado pelas operações (corte, montagem…).
// Peça NÃO INICIADA = produzido = 0 em todas as operações.
//
// Mantém o mesmo formato de resposta que a tela já consome.

export async function GET(req) {
  await waitMesTables();
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const { searchParams } = new URL(req.url);
  const obra = (searchParams.get("obra") || "").trim();
  if (!obra) return NextResponse.json({ pecas: [], total: 0, erro: "obra obrigatória" });

  const m = obra.match(/^(T\d+)/i);
  const obraBase = m ? m[1].toUpperCase() : obra.toUpperCase();

  // Todas as linhas de ordem da obra (inclui sub-OPs T87A, T87B via startsWith)
  const linhas = await prisma.mesOrdem.findMany({
    where: { obra: { startsWith: obraBase, mode: "insensitive" } },
    orderBy: [{ op: "asc" }, { operacao: "asc" }],
  });

  // Agrupa por peça (op + item)
  const porPeca = new Map(); // chave "op|item" → linhas[]
  for (const l of linhas) {
    const chave = `${l.op}|${l.item}`;
    if (!porPeca.has(chave)) porPeca.set(chave, []);
    porPeca.get(chave).push(l);
  }

  // Hierarquia de setores (mais avançado primeiro) para o "setor de referência"
  const ordemSetor = ["expedição", "pintura", "jato", "acabamento", "solda", "montagem", "dobra", "corte", "usinagem"];
  const normSetor = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const rankSetor = (s) => { const i = ordemSetor.indexOf(normSetor(s)); return i === -1 ? 99 : i; };

  function statusSyneco(ops, totalProd) {
    if (totalProd === 0) return "Não Iniciada";
    const ss = ops.map(o => o.status || "");
    if (ss.includes("Produzindo"))         return "Produzindo";
    if (ss.includes("Finalizado Parcial")) return "Finalizado Parcial";
    if (ss.includes("Finalizado Total"))   return "Finalizado Total";
    if (ss.includes("Finalizado"))         return "Finalizado";
    return "Produzindo";
  }

  const pecas = [...porPeca.entries()].map(([chave, ops]) => {
    const [op, item] = chave.split("|");
    const descricao = ops.find(o => o.descItem)?.descItem || null;

    const planejadoUn = Math.max(...ops.map(o => o.planejadoUn || 0), 0);
    const produzidoUn = Math.max(...ops.map(o => o.produzidoUn || 0), 0);
    // Peso da peça: usa o maior pesoPlanejado entre as operações (mesmo valor repetido por setor)
    const pesoTotalKg = Math.max(...ops.map(o => o.pesoPlanejado || 0), 0);

    const setoresComProd = ops.filter(o => (o.produzidoUn || 0) > 0);
    const setoresVisitados = [...new Set(setoresComProd.map(o => o.setor).filter(Boolean))];

    // Setor/último apontamento = setor mais avançado com produção
    const ref = [...setoresComProd].sort((a, b) => rankSetor(a.setor) - rankSetor(b.setor))[0] || null;

    return {
      id:           ops[0].id,
      marca:        op,
      item,
      descricao,
      qte:          planejadoUn,
      pesoUnitKg:   planejadoUn > 0 ? pesoTotalKg / planejadoUn : 0,
      pesoTotalKg,
      produzidoUn,
      produzidoKg:  Math.max(...ops.map(o => o.pesoProduzido || 0), 0),

      statusSyneco:      statusSyneco(ops, produzidoUn),
      setoresVisitados,
      totalApontamentos: setoresComProd.length,
      ultimoSetor:       ref?.setor      || null,
      ultimaData:        ref?.dataFim || ref?.dataInicio || null,
      ultimoStatus:      ref?.status     || null,
      statusPortal:      null,
    };
  }).sort((a, b) => (a.marca || "").localeCompare(b.marca || "", undefined, { numeric: true }));

  const contagens = { naoIniciada: 0, produzindo: 0, finalizado: 0, parcial: 0 };
  for (const p of pecas) {
    const s = p.statusSyneco;
    if (s === "Não Iniciada")                           contagens.naoIniciada++;
    else if (s === "Produzindo")                        contagens.produzindo++;
    else if (s === "Finalizado" || s.includes("Total")) contagens.finalizado++;
    else if (s.includes("Parcial"))                     contagens.parcial++;
  }

  // Peso total da obra (soma do peso por peça — máx por operação evita duplicar entre setores)
  const pesoTotalPlanejado = pecas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);
  const pesoTotalProduzido = pecas.reduce((s, p) => s + (p.produzidoKg || 0), 0);

  return NextResponse.json({
    obra: obraBase,
    modoFallback: false,
    total: pecas.length,
    totalApontamentos: linhas.length,
    pesoTotalPlanejado,
    pesoTotalProduzido,
    contagens,
    pecas,
  });
}
