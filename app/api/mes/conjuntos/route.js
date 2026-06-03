import { NextResponse } from "next/server";
import { prisma, waitMesTables } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/mes/conjuntos?obra=T78
//
// Visão por ETAPA: lista CONJUNTOS e PEÇAS ÚNICAS de uma obra com a etapa atual
// de cada um no Syneco, lendo direto de MesOrdem (dataset 150).
//
// Modelo real de produção (validado com os dados):
//   - No CORTE o Syneco aponta MARCAS (peças individuais, ex: "T78A-P128").
//   - Da MONTAGEM em diante são CONJUNTOS (ex: "T78A59").
//   - Peça única (viga) pula a montagem: Corte → Jato → Pintura.
//
// "Etapa atual" = setor mais avançado (na hierarquia) com produção (produzido > 0).
// "Concluído"   = a operação mais avançada PLANEJADA da peça está totalmente produzida.

// Fluxo produtivo, do início ao fim (rank menor = mais cedo)
const FLUXO = ["Corte", "Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura", "Expedição"];
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const FLUXO_NORM = FLUXO.map(norm);
const rankSetor = (s) => { const i = FLUXO_NORM.indexOf(norm(s)); return i === -1 ? -1 : i; };

// Marca individual (componente) tem traço; conjunto/peça única não.
const ehMarca = (op) => /-/.test(op || "");

export async function GET(req) {
  await waitMesTables();
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const { searchParams } = new URL(req.url);
  const obra = (searchParams.get("obra") || "").trim();
  if (!obra) return NextResponse.json({ error: "obra obrigatória" }, { status: 400 });

  const m = obra.match(/^(T\d+)/i);
  const baseObra = m ? m[1].toUpperCase() : obra.toUpperCase();

  const linhas = await prisma.mesOrdem.findMany({
    where: { obra: { startsWith: baseObra, mode: "insensitive" } },
    select: {
      id: true, op: true, item: true, descItem: true, setor: true, operacao: true,
      planejadoUn: true, produzidoUn: true, pesoPlanejado: true, pesoProduzido: true,
      dataFim: true, dataInicio: true,
    },
    orderBy: [{ op: "asc" }, { operacao: "asc" }],
  });

  // Agrupa por OP (a marca/conjunto)
  const porOp = new Map();
  for (const l of linhas) {
    if (!porOp.has(l.op)) porOp.set(l.op, []);
    porOp.get(l.op).push(l);
  }

  const itens = [...porOp.entries()].map(([op, ops]) => {
    const descricao = ops.find(o => o.descItem)?.descItem || null;
    const planejadoUn = Math.max(...ops.map(o => o.planejadoUn || 0), 0);
    const produzidoUn = Math.max(...ops.map(o => o.produzidoUn || 0), 0);
    const pesoTotalKg = Math.max(...ops.map(o => o.pesoPlanejado || 0), 0);
    const produzidoKg = Math.max(...ops.map(o => o.pesoProduzido || 0), 0);

    // Setores com produção, ordenados do mais cedo pro mais avançado
    const comProd = ops.filter(o => (o.produzidoUn || 0) > 0);
    const setoresVisitados = [...new Set(comProd.map(o => o.setor).filter(Boolean))]
      .sort((a, b) => rankSetor(a) - rankSetor(b));
    const refAvancado = [...comProd].sort((a, b) => rankSetor(b.setor) - rankSetor(a.setor))[0] || null;

    // Operação planejada mais avançada (independente de produção)
    const opMaisAvancada = [...ops].sort((a, b) => rankSetor(b.setor) - rankSetor(a.setor))[0] || null;
    const concluido = !!(opMaisAvancada
      && (opMaisAvancada.produzidoUn || 0) > 0
      && (opMaisAvancada.produzidoUn || 0) >= (opMaisAvancada.planejadoUn || 0));

    const iniciada = comProd.length > 0;
    const etapaAtual = !iniciada ? "Não iniciada"
      : concluido ? "Concluído"
      : (refAvancado?.setor || "Não iniciada");
    const etapaRank = !iniciada ? -1 : concluido ? 99 : rankSetor(refAvancado?.setor);

    // Classificação: MARCA (traço) | CONJUNTO (passa por montagem/solda) | PEÇA ÚNICA
    const setoresPlanejados = new Set(ops.map(o => norm(o.setor)));
    const temMontagem = setoresPlanejados.has(norm("Montagem")) || setoresPlanejados.has(norm("Solda"));
    const tipo = ehMarca(op) ? "MARCA" : temMontagem ? "CONJUNTO" : "PEÇA ÚNICA";

    const pct = planejadoUn > 0 ? Math.min(100, Math.round((produzidoUn / planejadoUn) * 100)) : 0;

    return {
      id: ops[0].id, marca: op, descricao, tipo,
      planejadoUn, produzidoUn, pct, pesoTotalKg, produzidoKg,
      etapaAtual, etapaRank, concluido,
      setoresVisitados,
      ultimaData: refAvancado?.dataFim || refAvancado?.dataInicio || null,
    };
  }).sort((a, b) => (b.etapaRank - a.etapaRank) || (a.marca || "").localeCompare(b.marca || "", undefined, { numeric: true }));

  // Itens "principais" = conjuntos + peças únicas; marcas cortadas ficam à parte
  const principais = itens.filter(i => i.tipo !== "MARCA");
  const marcas = itens.filter(i => i.tipo === "MARCA");

  // Buckets por etapa (só dos principais — é o que o filtro lateral controla)
  const ordemBuckets = ["Não iniciada", ...FLUXO, "Concluído"];
  const etapasMap = new Map(ordemBuckets.map(e => [e, { etapa: e, count: 0, peso: 0 }]));
  for (const i of principais) {
    const b = etapasMap.get(i.etapaAtual) || etapasMap.get("Não iniciada");
    b.count++; b.peso += i.pesoTotalKg || 0;
  }
  const etapas = [...etapasMap.values()].filter(e => e.count > 0);

  const pesoTotalPlanejado = principais.reduce((s, i) => s + (i.pesoTotalKg || 0), 0);
  const pesoTotalProduzido = principais.reduce((s, i) => s + (i.produzidoKg || 0), 0);

  return NextResponse.json({
    obra: baseObra,
    baseObra,
    pesoTotalPlanejado,
    pesoTotalProduzido,
    contagens: {
      total: principais.length,
      conjuntos: principais.filter(i => i.tipo === "CONJUNTO").length,
      pecasUnicas: principais.filter(i => i.tipo === "PEÇA ÚNICA").length,
      marcas: marcas.length,
      concluidos: principais.filter(i => i.concluido).length,
      naoIniciados: principais.filter(i => i.etapaAtual === "Não iniciada").length,
    },
    etapas,
    principais,
    marcas,
  });
}
