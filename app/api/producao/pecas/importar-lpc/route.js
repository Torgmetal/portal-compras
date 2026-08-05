// POST /api/producao/pecas/importar-lpc
// Recebe { rows: [...], opNumero?: string, sobrescrever?: boolean }
// Parseia LPC, cria PecaConjunto + ConjuntoCroqui
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseLPC } from "@/lib/parse-lpc";
import { classificarMaquina } from "@/lib/maquina-corte";

export const runtime = "nodejs";
export const maxDuration = 300; // LPC grande faz upsert peça a peça; 60s estourava (timeout → HTML → "token JSON")

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "ENGENHARIA"]);
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

  const { rows, opNumero: opForcada, sobrescrever, arquivoNome } = body;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Envie 'rows' como array da planilha parseada" }, { status: 400 });
  }

  // A CHAVE da lista é a FASE (ex.: T83F), NÃO a OP (083): cada fase é uma lista
  // própria (T83F e T83D coexistem). Prioridade: fase no nome do arquivo
  // (T83F-LPC) > fase/OP selecionada > detecção automática pela marca.
  const faseArquivo = String(arquivoNome || "").toUpperCase().match(/T\d+[A-Z]*/)?.[0] || null;
  const chave = faseArquivo || opForcada || null;
  const parsed = parseLPC(rows, { opNumeroForcado: chave });
  if (parsed.erro) {
    return NextResponse.json({ error: parsed.erro }, { status: 400 });
  }

  const opNumero = parsed.opNumero;
  if (!opNumero) {
    return NextResponse.json({ error: "Não consegui detectar a fase/OP. Nomeie o arquivo com a fase (ex.: T83F-LPC) ou selecione a OP e importe de novo." }, { status: 400 });
  }

  const totalPecas = parsed.conjuntos.length + parsed.croquis.length + parsed.avulsas.length;
  if (totalPecas === 0) {
    return NextResponse.json({ error: "Nenhuma peca encontrada na planilha." }, { status: 400 });
  }

  // Resolve o opId pela OP correspondente aos DÍGITOS (todas as fases da OP —
  // T83F, T83D… — compartilham o mesmo opId). Usa a OP selecionada, senão os
  // dígitos da fase. Sem isso, a chave por fase (T83F) não acharia a OP.
  const digitosDe = (s) => (String(s || "").match(/\d+/) || [])[0];
  const cands = new Set();
  for (const src of [opForcada, opNumero]) { const d = digitosDe(src); if (d) { cands.add(d); cands.add(d.padStart(3, "0")); cands.add(String(Number(d))); } }
  const op = cands.size ? await prisma.oP.findFirst({ where: { numero: { in: [...cands] } } }) : null;

  // Diff da revisão (o que mudou vs a lista anterior): snapshot das marcas+peso
  // ANTES do upsert. incluídas = novas; removidas = sumiram; alteradas = peso mudou.
  const antesPecas = await prisma.pecaConjunto.findMany({ where: { opNumero, fonte: "LPC_IMPORT" }, select: { marca: true, pesoTotalKg: true } });
  const pesoAntes = new Map(antesPecas.map((p) => [p.marca, Number(p.pesoTotalKg) || 0]));
  const novasPecas = new Map();
  for (const c of [...parsed.conjuntos, ...parsed.croquis, ...parsed.avulsas]) novasPecas.set(c.marca, Number(c.pesoTotalKg) || 0);
  const diffIncluidas = [], diffAlteradas = [];
  for (const [marca, peso] of novasPecas) {
    if (!pesoAntes.has(marca)) diffIncluidas.push({ marca, peso });
    else if (Math.abs(pesoAntes.get(marca) - peso) > 0.01) diffAlteradas.push({ marca, de: pesoAntes.get(marca), para: peso });
  }
  const diffRemovidas = [...pesoAntes.entries()].filter(([m]) => !novasPecas.has(m)).map(([marca, peso]) => ({ marca, peso }));
  const diff = {
    incluidas: diffIncluidas, removidas: diffRemovidas, alteradas: diffAlteradas,
    nIncluidas: diffIncluidas.length, nRemovidas: diffRemovidas.length, nAlteradas: diffAlteradas.length,
  };

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
            observacao: c.observacao ?? undefined, // undefined = não mexe (preserva no update; null no create)
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
            observacao: c.observacao ?? undefined, // undefined = não mexe (preserva no update; null no create)
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
      const maq = classificarMaquina(cr.descricao, cr.pesoUnitKg, cr.comprimentoMm);
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
            observacao: cr.observacao ?? undefined,
            statusPrep: existing.statusPrep || "PENDENTE",
            maquina: maq || existing.maquina,
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
            observacao: cr.observacao ?? undefined,
            statusPrep: "PENDENTE",
            status: "PENDENTE",
            fonte: "LPC_IMPORT",
            maquina: maq,
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
      const maq = classificarMaquina(a.descricao, a.pesoUnitKg, a.comprimentoMm);
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
            observacao: a.observacao ?? undefined,
            maquina: maq || existing.maquina,
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
            observacao: a.observacao ?? undefined,
            status: "PENDENTE",
            fonte: "LPC_IMPORT",
            maquina: maq,
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
    diff,
  });

  } catch (e) {
    console.error("[importar-lpc] erro inesperado:", e?.message, e?.stack);
    return NextResponse.json(
      { error: e?.message || "Erro interno ao importar LPC" },
      { status: 500 }
    );
  }
}
