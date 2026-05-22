// POST /api/producao/controle/importar
// Apenas CADASTRA PecaConjunto em lote (catálogo). Vinculação ao dia é feita depois via "Adicionar peças".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao — apenas ADMIN" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { rows, setor } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha para importar" }, { status: 400 });
  }

  // 1. Normaliza todas as linhas
  const linhas = [];
  for (const row of rows) {
    const marca = String(row.marca || "").trim();
    if (!marca) continue;

    const descricao = String(row.desc || "").trim() || null;
    const opNumero = String(row.op || "").trim() || "SEM-OP";
    const qte = parseInt(row.qte) || 1;

    const puRaw = parseFloat(String(row.pesoUnit || "").replace(",", "."));
    const ptRaw = parseFloat(String(row.pesoTotal || "").replace(",", "."));
    let pesoUnitKg = isNaN(puRaw) ? 0 : puRaw;
    let pesoTotalKg = isNaN(ptRaw) ? 0 : ptRaw;
    if (pesoTotalKg > 0 && pesoUnitKg === 0 && qte > 0) pesoUnitKg = pesoTotalKg / qte;
    if (pesoUnitKg > 0 && pesoTotalKg === 0) pesoTotalKg = pesoUnitKg * qte;

    const prURaw = parseFloat(String(row.precoUnit || "").replace(",", "."));
    const prTRaw = parseFloat(String(row.precoTotal || "").replace(",", "."));
    let precoUnitario = isNaN(prURaw) ? 0 : prURaw;
    let precoTotal = isNaN(prTRaw) ? 0 : prTRaw;
    if (precoTotal > 0 && precoUnitario === 0 && qte > 0) precoUnitario = precoTotal / qte;
    if (precoUnitario > 0 && precoTotal === 0) precoTotal = precoUnitario * qte;

    linhas.push({ marca, descricao, opNumero, qte, pesoUnitKg, pesoTotalKg, precoUnitario, precoTotal });
  }

  if (linhas.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha válida encontrada" }, { status: 400 });
  }

  // 2. Busca peças já existentes
  const chaves = [...new Set(linhas.map((l) => `${l.opNumero}||${l.marca}`))];
  const existentes = await prisma.pecaConjunto.findMany({
    where: {
      OR: chaves.map((ch) => {
        const [opNumero, marca] = ch.split("||");
        return { opNumero, marca };
      }),
    },
    select: { id: true, opNumero: true, marca: true },
  });
  const existenteSet = new Set(existentes.map((p) => `${p.opNumero}||${p.marca}`));

  // 3. Filtra só as novas
  const novasUnicas = new Map();
  for (const l of linhas) {
    const chave = `${l.opNumero}||${l.marca}`;
    if (!existenteSet.has(chave) && !novasUnicas.has(chave)) {
      novasUnicas.set(chave, l);
    }
  }

  let criadas = 0;
  const jaExistiam = existenteSet.size;

  if (novasUnicas.size > 0) {
    // 4. Busca OPs existentes para linkar
    const opsUnicos = [...new Set([...novasUnicas.values()].map((l) => l.opNumero).filter((n) => n !== "SEM-OP"))];
    const opsExistentes = opsUnicos.length > 0
      ? await prisma.oP.findMany({ where: { numero: { in: opsUnicos } }, select: { id: true, numero: true } })
      : [];
    const opMap = new Map(opsExistentes.map((o) => [o.numero, o.id]));

    // 5. Cria em lotes de 50
    const novasArray = [...novasUnicas.values()];
    for (let i = 0; i < novasArray.length; i += 50) {
      const batch = novasArray.slice(i, i + 50);
      const result = await prisma.pecaConjunto.createMany({
        data: batch.map((l) => ({
          opId: opMap.get(l.opNumero) || null,
          opNumero: l.opNumero,
          marca: l.marca,
          descricao: l.descricao,
          qte: l.qte,
          pesoUnitKg: l.pesoUnitKg,
          pesoTotalKg: l.pesoTotalKg,
          precoUnitario: l.precoUnitario,
          precoTotal: l.precoTotal,
          status: setor || "PENDENTE",
          fonte: "PLANILHA_IMPORT",
        })),
        skipDuplicates: true,
      });
      criadas += result.count;
    }
  }

  return NextResponse.json({
    ok: true,
    criadas,
    jaExistiam,
    totalLinhas: linhas.length,
  });
}
