import { NextResponse } from "next/server";
import { prisma, waitMesTables } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/mes/rastreabilidade-op?obra=T64
// Retorna todas as PecaConjunto de uma OP cruzadas com os apontamentos do Syneco.
// Cada peça aparece com: status Syneco, setores, última atualização.
// Peças sem nenhum apontamento = "Não Iniciada".

export async function GET(req) {
  await waitMesTables();
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const { searchParams } = new URL(req.url);
  const obra = (searchParams.get("obra") || "").trim(); // "T64"
  if (!obra) return NextResponse.json({ pecas: [], total: 0, erro: "obra obrigatória" });

  // Converte T64 → "064" para buscar no portal
  const m = obra.match(/^T(\d+)/i);
  const opNumero = m ? String(parseInt(m[1])).padStart(3, "0") : obra;

  // Busca paralela: PecaConjunto + todos os apontamentos Syneco dessa obra (sem filtro de data)
  const [pecas, apontamentos] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where:   { opNumero },
      orderBy: [{ item: "asc" }, { marca: "asc" }],
    }),
    prisma.mesApontamento.findMany({
      where:   { obra },
      select: {
        id: true, opSka: true, descricaoItem: true, setor: true,
        status: true, produzidoKg: true, produzidoUn: true,
        dataInicio: true, dataFim: true, maquina: true, operador: true,
      },
      orderBy: { dataInicio: "asc" },
    }),
  ]);

  // Agrupa apontamentos por opSka (marca da peça no Syneco)
  // Match primário: PecaConjunto.marca === MesApontamento.opSka (case-insensitive)
  // Match fallback: PecaConjunto.descricao === MesApontamento.descricaoItem
  const apontPorMarca = {}; // { "T64K1": [apontamento, ...] }
  const apontPorDesc  = {}; // { "VIGA HEA 200": [apontamento, ...] }

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

  // Calcula status Syneco para cada peça
  function calcularStatus(apont) {
    if (!apont || apont.length === 0) return "Não Iniciada";
    const statuses = apont.map(a => a.status || "");
    if (statuses.includes("Produzindo")) return "Produzindo";
    if (statuses.includes("Finalizado Total")) return "Finalizado Total";
    if (statuses.includes("Finalizado Parcial")) return "Finalizado Parcial";
    if (statuses.includes("Finalizado")) return "Finalizado";
    return "Produzindo"; // tem apontamento mas sem status reconhecido
  }

  const result = pecas.map(p => {
    const marcaKey = (p.marca || "").trim().toLowerCase();
    const descKey  = (p.descricao || "").trim().toLowerCase();

    // Tenta match por marca primeiro, depois por descrição
    const apont = apontPorMarca[marcaKey] || apontPorDesc[descKey] || [];

    // Setores únicos visitados, em ordem cronológica
    const setoresVisitados = [...new Set(apont.map(a => a.setor).filter(Boolean))];

    // Último apontamento (mais recente)
    const ultimo = apont.length > 0 ? apont[apont.length - 1] : null;

    return {
      // Dados da peça
      id:           p.id,
      marca:        p.marca,
      item:         p.item,
      descricao:    p.descricao,
      qte:          p.qte,
      pesoUnitKg:   p.pesoUnitKg,
      pesoTotalKg:  p.pesoTotalKg,
      statusPortal: p.status,   // status do portal (PENDENTE, CORTE, etc.)

      // Status Syneco
      statusSyneco:     calcularStatus(apont),
      setoresVisitados,
      totalApontamentos: apont.length,
      ultimoSetor:       ultimo?.setor       || null,
      ultimaData:        ultimo?.dataInicio  || null,
      ultimoStatus:      ultimo?.status      || null,
      produzidoKg:       apont.reduce((s, a) => s + (a.produzidoKg || 0), 0),
    };
  });

  // Contagens por status
  const contagens = { naoIniciada: 0, produzindo: 0, finalizado: 0, parcial: 0 };
  for (const p of result) {
    if (p.statusSyneco === "Não Iniciada")       contagens.naoIniciada++;
    else if (p.statusSyneco === "Produzindo")     contagens.produzindo++;
    else if (p.statusSyneco.includes("Total") || p.statusSyneco === "Finalizado") contagens.finalizado++;
    else if (p.statusSyneco.includes("Parcial"))  contagens.parcial++;
  }

  return NextResponse.json({
    obra,
    opNumero,
    total:     pecas.length,
    contagens,
    pecas:     result,
  });
}
