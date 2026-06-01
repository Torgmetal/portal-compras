import { NextResponse } from "next/server";
import { prisma, waitMesTables } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/mes/rastreabilidade-op?obra=T64
//
// Cruza PecaConjunto com MesApontamento para uma OP.
//
// IMPORTANTE — sub-OPs:
//   Dentro de T64 existem T64A, T64B, T64C no Syneco.
//   Todas compartilham opNumero="064" no PecaConjunto.
//   Buscamos MesApontamento com obra STARTS WITH "T64" para capturar todas.
//
// Match entre peça e apontamento:
//   1º PecaConjunto.marca === MesApontamento.opSka  (case-insensitive)
//   2º PecaConjunto.descricao === MesApontamento.descricaoItem  (fallback)

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

  // Extrai base numérica: "T64A" → "T64" → "064"
  const m = obra.match(/^(T\d+)/i);
  const obraBase  = m ? m[1].toUpperCase() : obra; // "T64"
  const opNumero  = m ? String(parseInt(m[1].slice(1))).padStart(3, "0") : obra; // "064"

  // Busca paralela — apontamentos usam startsWith para pegar T64, T64A, T64B, T64C
  const [pecas, apontamentos] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where:   { opNumero },
      orderBy: [{ item: "asc" }, { marca: "asc" }],
    }),
    prisma.mesApontamento.findMany({
      where: { obra: { startsWith: obraBase, mode: "insensitive" } },
      select: {
        id: true, opSka: true, obra: true, descricaoItem: true, setor: true,
        status: true, produzidoKg: true, produzidoUn: true,
        dataInicio: true, dataFim: true, maquina: true, operador: true,
      },
      orderBy: { dataInicio: "asc" },
    }),
  ]);

  // Agrupa apontamentos por chave de match (marca/opSka e descricaoItem)
  const apontPorMarca = {}; // chave: opSka normalizado
  const apontPorDesc  = {}; // chave: descricaoItem normalizado

  for (const a of apontamentos) {
    const k = (a.opSka || "").trim().toLowerCase();
    if (k) {
      if (!apontPorMarca[k]) apontPorMarca[k] = [];
      apontPorMarca[k].push(a);
    }
    const d = (a.descricaoItem || "").trim().toLowerCase();
    if (d) {
      if (!apontPorDesc[d]) apontPorDesc[d] = [];
      apontPorDesc[d].push(a);
    }
  }

  // Status Syneco dominante para uma lista de apontamentos
  function calcularStatus(apont) {
    if (!apont || apont.length === 0) return "Não Iniciada";
    const ss = apont.map(a => a.status || "");
    if (ss.includes("Produzindo"))         return "Produzindo";
    if (ss.includes("Finalizado Total"))   return "Finalizado Total";
    if (ss.includes("Finalizado Parcial")) return "Finalizado Parcial";
    if (ss.includes("Finalizado"))         return "Finalizado";
    return "Produzindo";
  }

  const result = pecas.map(p => {
    const marcaKey = (p.marca || "").trim().toLowerCase();
    const descKey  = (p.descricao || "").trim().toLowerCase();

    // Match: primeiro por marca (opSka), depois por descrição
    const apont = apontPorMarca[marcaKey] || apontPorDesc[descKey] || [];

    const setoresVisitados = [...new Set(apont.map(a => a.setor).filter(Boolean))];
    const ultimo = apont.length > 0 ? apont[apont.length - 1] : null;

    // Soma de UN produzidas (relevante para parciais)
    const produzidoUn = apont.reduce((s, a) => s + (a.produzidoUn || 0), 0);
    const produzidoKg = apont.reduce((s, a) => s + (a.produzidoKg || 0), 0);

    const statusSyneco = calcularStatus(apont);

    return {
      id:                p.id,
      marca:             p.marca,
      item:              p.item,
      descricao:         p.descricao,

      // Quantidades — TOTAL (portal) vs PRODUZIDO (Syneco)
      qte:               p.qte,          // total planejado (PecaConjunto.qte)
      pesoUnitKg:        p.pesoUnitKg,
      pesoTotalKg:       p.pesoTotalKg,
      produzidoUn,                        // produzido no Syneco (soma dos apontamentos)
      produzidoKg,

      // Status Syneco
      statusSyneco,
      setoresVisitados,
      totalApontamentos: apont.length,
      ultimoSetor:       ultimo?.setor      || null,
      ultimaData:        ultimo?.dataInicio || null,
      ultimoStatus:      ultimo?.status     || null,

      // Status portal (PENDENTE, CORTE, etc.)
      statusPortal:      p.status,
    };
  });

  const contagens = { naoIniciada: 0, produzindo: 0, finalizado: 0, parcial: 0 };
  for (const p of result) {
    const s = p.statusSyneco;
    if (s === "Não Iniciada")                         contagens.naoIniciada++;
    else if (s === "Produzindo")                      contagens.produzindo++;
    else if (s === "Finalizado" || s.includes("Total")) contagens.finalizado++;
    else if (s.includes("Parcial"))                   contagens.parcial++;
  }

  return NextResponse.json({
    obra: obraBase,
    opNumero,
    total:     pecas.length,
    totalApontamentos: apontamentos.length,
    contagens,
    pecas: result,
  });
}
