import { NextResponse } from "next/server";
import { prisma, waitMesTables } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/mes/rastreabilidade-op?obra=T64
//
// Cruza PecaConjunto (LE importada) com MesApontamento (Syneco) para uma OP.
//
// Sub-OPs: T64A, T64B, T64C compartilham opNumero="064".
// Busca MesApontamento com obra STARTS WITH "T64".
//
// Fallback: se PecaConjunto estiver vazio (LE não importada),
// monta peças virtuais a partir dos opSka únicos do Syneco.
// Nesse modo não há "Não Iniciadas" — apenas o que o Syneco registrou.

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

  // Extrai base numérica: "T64A" → obraBase="T64", opNumero="064"
  const m = obra.match(/^(T\d+)/i);
  const obraBase = m ? m[1].toUpperCase() : obra.toUpperCase();
  const opNumero = m ? String(parseInt(m[1].slice(1))).padStart(3, "0") : obra;

  // Busca paralela: PecaConjunto + todos os apontamentos para obraBase* (sem filtro de data)
  const [pecasDB, apontamentos] = await Promise.all([
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

  // Agrupa apontamentos por opSka e por descricaoItem (para matching)
  const apontPorMarca = {}; // { "T64K1": [...] }
  const apontPorDesc  = {}; // { "VIGA HEA 200": [...] }

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

  function calcularStatus(apont) {
    if (!apont || apont.length === 0) return "Não Iniciada";
    const ss = apont.map(a => a.status || "");
    if (ss.includes("Produzindo"))         return "Produzindo";
    if (ss.includes("Finalizado Total"))   return "Finalizado Total";
    if (ss.includes("Finalizado Parcial")) return "Finalizado Parcial";
    if (ss.includes("Finalizado"))         return "Finalizado";
    return "Produzindo";
  }

  function buildPecaResult(id, marca, item, descricao, qte, pesoUnitKg, pesoTotalKg, statusPortal, apont) {
    const setoresVisitados = [...new Set(apont.map(a => a.setor).filter(Boolean))];
    const ultimo = apont.length > 0 ? apont[apont.length - 1] : null;
    const produzidoUn = apont.reduce((s, a) => s + (a.produzidoUn || 0), 0);
    const produzidoKg = apont.reduce((s, a) => s + (a.produzidoKg || 0), 0);
    return {
      id, marca, item, descricao,
      qte,           // null = desconhecido (modo fallback)
      pesoUnitKg, pesoTotalKg,
      produzidoUn,
      produzidoKg,
      statusSyneco:      calcularStatus(apont),
      setoresVisitados,
      totalApontamentos: apont.length,
      ultimoSetor:       ultimo?.setor      || null,
      ultimaData:        ultimo?.dataInicio || null,
      ultimoStatus:      ultimo?.status     || null,
      statusPortal:      statusPortal || null,
    };
  }

  // ── Modo A: tem PecaConjunto ──────────────────────────────────────────────
  // Cross-reference: marca ↔ opSka (direto), fallback: descricao ↔ descricaoItem
  let result, modoFallback = false;

  if (pecasDB.length > 0) {
    result = pecasDB.map(p => {
      const marcaKey = (p.marca || "").trim().toLowerCase();
      const descKey  = (p.descricao || "").trim().toLowerCase();
      const apont = apontPorMarca[marcaKey] || apontPorDesc[descKey] || [];
      return buildPecaResult(
        p.id, p.marca, p.item, p.descricao,
        p.qte, p.pesoUnitKg, p.pesoTotalKg, p.status, apont
      );
    });

  // ── Modo B: sem PecaConjunto → monta peças virtuais do Syneco ────────────
  // Não há "Não Iniciadas" nesse modo (só mostramos o que o Syneco tem)
  } else {
    modoFallback = true;
    const pecasVirtuais = new Map(); // opSka → { apont[] }

    for (const a of apontamentos) {
      const chave = (a.opSka || "").trim() || `sem-codigo-${a.id}`;
      if (!pecasVirtuais.has(chave)) pecasVirtuais.set(chave, []);
      pecasVirtuais.get(chave).push(a);
    }

    result = [...pecasVirtuais.entries()].map(([opSka, apont]) => {
      const desc = apont[0]?.descricaoItem || null;
      return buildPecaResult(
        `v-${opSka}`, opSka, null, desc,
        null, null, null, null, apont
      );
    }).sort((a, b) => (a.marca || "").localeCompare(b.marca || ""));
  }

  const contagens = { naoIniciada: 0, produzindo: 0, finalizado: 0, parcial: 0 };
  for (const p of result) {
    const s = p.statusSyneco;
    if (s === "Não Iniciada")                           contagens.naoIniciada++;
    else if (s === "Produzindo")                        contagens.produzindo++;
    else if (s === "Finalizado" || s.includes("Total")) contagens.finalizado++;
    else if (s.includes("Parcial"))                     contagens.parcial++;
  }

  return NextResponse.json({
    obra: obraBase,
    opNumero,
    modoFallback,       // true = LE não importada, peças do Syneco
    total:     result.length,
    totalApontamentos: apontamentos.length,
    contagens,
    pecas: result,
  });
}
