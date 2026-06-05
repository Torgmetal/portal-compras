// POST /api/producao/pecas/importar-lpc
// Recebe { rows: [...], opNumero?: string, sobrescrever?: boolean }
// Parseia LPC, cria PecaConjunto + ConjuntoCroqui
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseLPC } from "@/lib/parse-lpc";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { rows, opNumero: opForcada, sobrescrever } = body;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Envie 'rows' como array da planilha parseada" }, { status: 400 });
  }

  const parsed = parseLPC(rows, { opNumeroForcado: opForcada || null });
  if (parsed.erro) {
    return NextResponse.json({ error: parsed.erro }, { status: 400 });
  }

  const opNumero = parsed.opNumero;
  if (!opNumero) {
    return NextResponse.json({ error: "Nao foi possivel detectar o numero da OP. Informe manualmente." }, { status: 400 });
  }

  const totalPecas = parsed.conjuntos.length + parsed.croquis.length + parsed.avulsas.length;
  if (totalPecas === 0) {
    return NextResponse.json({ error: "Nenhuma peca encontrada na planilha." }, { status: 400 });
  }

  // Resolve OP no banco
  const op = await prisma.oP.findUnique({ where: { numero: opNumero } });

  // Sobrescrever: deleta pecas LPC anteriores (cascade deleta ConjuntoCroqui)
  if (sobrescrever) {
    await prisma.pecaConjunto.deleteMany({
      where: { opNumero, fonte: "LPC_IMPORT" },
    });
  }

  const pieceIds = new Map(); // marca -> id
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  // --- Upsert conjuntos ---
  for (const c of parsed.conjuntos) {
    try {
      const existing = await prisma.pecaConjunto.findUnique({
        where: { opNumero_marca: { opNumero, marca: c.marca } },
      });
      if (existing) {
        await prisma.pecaConjunto.update({
          where: { id: existing.id },
          data: {
            descricao: c.descricao,
            qte: c.qte,
            pesoUnitKg: c.pesoUnitKg,
            pesoTotalKg: c.pesoTotalKg,
            tipoPeca: "CONJUNTO",
            areaPinturaM2: c.areaPinturaM2,
          },
        });
        pieceIds.set(c.marca, existing.id);
        atualizados++;
      } else {
        const created = await prisma.pecaConjunto.create({
          data: {
            opId: op?.id || null,
            opNumero,
            marca: c.marca,
            descricao: c.descricao,
            qte: c.qte,
            pesoUnitKg: c.pesoUnitKg,
            pesoTotalKg: c.pesoTotalKg,
            tipoPeca: "CONJUNTO",
            areaPinturaM2: c.areaPinturaM2,
            status: "PENDENTE",
            fonte: "LPC_IMPORT",
          },
        });
        pieceIds.set(c.marca, created.id);
        criados++;
      }
    } catch {
      ignorados++;
    }
  }

  // --- Upsert croquis (ja deduplicados pelo parser) ---
  for (const cr of parsed.croquis) {
    try {
      const existing = await prisma.pecaConjunto.findUnique({
        where: { opNumero_marca: { opNumero, marca: cr.marca } },
      });
      if (existing) {
        await prisma.pecaConjunto.update({
          where: { id: existing.id },
          data: {
            descricao: cr.descricao,
            material: cr.material,
            perfil: cr.perfil,
            qte: cr.qte,
            comprimentoMm: cr.comprimentoMm,
            pesoUnitKg: cr.pesoUnitKg,
            pesoTotalKg: cr.pesoTotalKg,
            tipoPeca: "CROQUI",
            areaPinturaM2: cr.areaPinturaM2,
            statusPrep: existing.statusPrep || "PENDENTE",
          },
        });
        pieceIds.set(cr.marca, existing.id);
        atualizados++;
      } else {
        const created = await prisma.pecaConjunto.create({
          data: {
            opId: op?.id || null,
            opNumero,
            marca: cr.marca,
            descricao: cr.descricao,
            material: cr.material,
            perfil: cr.perfil,
            qte: cr.qte,
            comprimentoMm: cr.comprimentoMm,
            pesoUnitKg: cr.pesoUnitKg,
            pesoTotalKg: cr.pesoTotalKg,
            tipoPeca: "CROQUI",
            areaPinturaM2: cr.areaPinturaM2,
            statusPrep: "PENDENTE",
            status: "PENDENTE",
            fonte: "LPC_IMPORT",
          },
        });
        pieceIds.set(cr.marca, created.id);
        criados++;
      }
    } catch {
      ignorados++;
    }
  }

  // --- Upsert avulsas ---
  for (const a of parsed.avulsas) {
    try {
      const existing = await prisma.pecaConjunto.findUnique({
        where: { opNumero_marca: { opNumero, marca: a.marca } },
      });
      if (existing) {
        await prisma.pecaConjunto.update({
          where: { id: existing.id },
          data: {
            descricao: a.descricao,
            material: a.material,
            perfil: a.perfil,
            qte: a.qte,
            comprimentoMm: a.comprimentoMm,
            pesoUnitKg: a.pesoUnitKg,
            pesoTotalKg: a.pesoTotalKg,
            areaPinturaM2: a.areaPinturaM2,
          },
        });
        pieceIds.set(a.marca, existing.id);
        atualizados++;
      } else {
        const created = await prisma.pecaConjunto.create({
          data: {
            opId: op?.id || null,
            opNumero,
            marca: a.marca,
            descricao: a.descricao,
            material: a.material,
            perfil: a.perfil,
            qte: a.qte,
            comprimentoMm: a.comprimentoMm,
            pesoUnitKg: a.pesoUnitKg,
            pesoTotalKg: a.pesoTotalKg,
            areaPinturaM2: a.areaPinturaM2,
            status: "PENDENTE",
            fonte: "LPC_IMPORT",
          },
        });
        pieceIds.set(a.marca, created.id);
        criados++;
      }
    } catch {
      ignorados++;
    }
  }

  // --- Criar relacoes ConjuntoCroqui ---
  // Limpar juncoes existentes dos conjuntos importados
  const conjuntoIds = parsed.conjuntos.map((c) => pieceIds.get(c.marca)).filter(Boolean);
  if (conjuntoIds.length > 0) {
    await prisma.conjuntoCroqui.deleteMany({
      where: { conjuntoId: { in: conjuntoIds } },
    });
  }

  let relacoesCriadas = 0;
  for (const rel of parsed.relacoes) {
    const conjuntoId = pieceIds.get(rel.conjuntoMarca);
    const croquiId = pieceIds.get(rel.croquiMarca);
    if (conjuntoId && croquiId) {
      try {
        await prisma.conjuntoCroqui.create({
          data: {
            conjuntoId,
            croquiId,
            qtdNoConjunto: rel.qtdNoConjunto,
          },
        });
        relacoesCriadas++;
      } catch {
        // unique constraint — nao deveria acontecer apos deleteMany
      }
    }
  }

  // Audit log (nao-fatal — nao pode abortar uma importacao bem-sucedida)
  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "IMPORTAR_LPC",
        entity: "PecaConjunto",
        entityId: opNumero,
        diff: {
          opNumero,
          obra: parsed.obra,
          cliente: parsed.cliente,
          conjuntos: parsed.conjuntos.length,
          croquis: parsed.croquis.length,
          avulsas: parsed.avulsas.length,
          relacoes: relacoesCriadas,
          criados,
          atualizados,
          ignorados,
          sobrescrever: !!sobrescrever,
          pesoTotal: parsed.pesoTotal,
          areaTotal: parsed.areaTotal,
        },
      },
    });
  } catch (auditErr) {
    console.error("[importar-lpc] falha no audit log:", auditErr?.message);
  }

  return NextResponse.json({
    ok: true,
    opNumero,
    opEncontrada: !!op,
    obra: parsed.obra,
    cliente: parsed.cliente,
    conjuntos: parsed.conjuntos.length,
    croquis: parsed.croquis.length,
    avulsas: parsed.avulsas.length,
    relacoes: relacoesCriadas,
    criados,
    atualizados,
    ignorados,
    pesoTotal: parsed.pesoTotal,
    areaTotal: parsed.areaTotal,
  });

  } catch (e) {
    console.error("[importar-lpc] erro inesperado:", e?.message, e?.stack);
    return NextResponse.json(
      { error: e?.message || "Erro interno ao importar LPC" },
      { status: 500 }
    );
  }
}
