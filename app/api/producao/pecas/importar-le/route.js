// POST /api/producao/pecas/importar-le
// Recebe { rows: [...] } parseado no client (evita limite 4.5MB do Vercel)
// e { opNumero?: string } pra forcar a OP caso o cabecalho nao tenha.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseFormularioLE } from "@/lib/parse-le-form21";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 300; // LE grande faz upsert peca a peca; 60s estourava (timeout -> HTML/504)

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "EXPEDICAO", "ENGENHARIA", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

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

  // Reconstroi um worksheet a partir das rows e parseia
  let parsed;
  try {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    parsed = parseFormularioLE(buffer, { opNumeroForcado: opForcada || null });
  } catch (e) {
    return NextResponse.json({ error: "Falha ao processar planilha: " + e.message }, { status: 400 });
  }

  const opNumero = String(parsed.opNumero);

  // Resolve opId — busca no banco se parsed.opNumero é string valida.
  // A FORM21 traz o número sem zero à esquerda ("78"), mas a OP é "078": tenta
  // exato e, se falhar, casa pelo número ignorando zero à esquerda/sufixo.
  let op = null;
  try {
    if (parsed.opNumero) {
      op = await prisma.oP.findUnique({ where: { numero: opNumero } });
      if (!op) {
        const m = opNumero.match(/\d+/);
        const alvo = m ? parseInt(m[0], 10) : null;
        if (alvo != null) {
          const cands = await prisma.oP.findMany({ select: { id: true, numero: true } });
          const casa = cands.filter((o) => { const mm = String(o.numero).match(/\d+/); return mm && parseInt(mm[0], 10) === alvo; });
          if (casa.length === 1) op = casa[0]; // só liga quando o match é único
        }
      }
    }
  } catch (e) {
    console.error("[importar-le] findUnique OP erro:", e?.message);
  }

  // Diff da revisão (o que mudou vs a LE anterior): snapshot marcas+peso ANTES do
  // upsert (e antes do sobrescrever). incluídas = novas; removidas = sumiram;
  // alteradas = peso mudou.
  const antesLE = await prisma.pecaConjunto.findMany({
    where: { opNumero, fonte: "LE_IMPORT" },
    select: { marca: true, pesoTotalKg: true },
  });
  const pesoAntes = new Map(antesLE.map((p) => [p.marca, Number(p.pesoTotalKg) || 0]));
  const novasPecas = new Map();
  for (const p of parsed.pecas) novasPecas.set(p.marca, Number(p.pesoTotalKg) || 0);
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

  // Se sobrescrever, deleta todas as pecas LE da OP primeiro
  if (sobrescrever) {
    await prisma.pecaConjunto.deleteMany({
      where: { opNumero, fonte: "LE_IMPORT" },
    });
  }

  // Upsert em lote: 1 findMany (marca -> id) em vez de um findUnique por peca —
  // corta metade dos round-trips ao Neon (era isso que estourava os 60s -> 504).
  // Depois do sobrescrever pra o mapa refletir o estado ja deletado.
  const existentes = await prisma.pecaConjunto.findMany({
    where: { opNumero },
    select: { id: true, marca: true },
  });
  const idPorMarca = new Map(existentes.map((e) => [e.marca, e.id]));

  let criados = 0, atualizados = 0, ignorados = 0;
  for (const p of parsed.pecas) {
    try {
      const existId = idPorMarca.get(p.marca);
      if (existId) {
        // So' atualiza os campos basicos, preserva status/dataConcluida
        await prisma.pecaConjunto.update({
          where: { id: existId },
          data: {
            item: p.item,
            descricao: p.descricao,
            qte: p.qte,
            pesoUnitKg: p.pesoUnitKg,
            pesoTotalKg: p.pesoTotalKg,
            ...(p.observacao ? { observacao: p.observacao } : {}), // só sobrescreve se a lista trouxer
          },
        });
        atualizados++;
      } else {
        const novo = await prisma.pecaConjunto.create({
          data: {
            opId: op?.id || null,
            opNumero,
            item: p.item,
            marca: p.marca,
            descricao: p.descricao,
            qte: p.qte,
            pesoUnitKg: p.pesoUnitKg,
            pesoTotalKg: p.pesoTotalKg,
            fluxoEspecial: p.fluxoEspecial,
            observacao: p.observacao || null,
            status: "PENDENTE",
            fonte: "LE_IMPORT",
          },
        });
        idPorMarca.set(p.marca, novo.id); // marca repetida na mesma planilha vira update
        criados++;
      }
    } catch (e) {
      ignorados++;
    }
  }

  // Peso REAL da LE da OP = soma das peças LE_IMPORT no banco (deduplicadas por
  // marca), NÃO a soma bruta do arquivo. O FORM 21 lista conjunto + componentes,
  // então parsed.pesoTotal dobra (Vitor 29/07: OP 104 = 13,6 t, não 27,2). A LE é
  // a fonte canônica do peso da OP.
  const aggLE = await prisma.pecaConjunto.aggregate({ where: { opNumero, fonte: "LE_IMPORT" }, _sum: { pesoTotalKg: true } });
  const pesoRealLE = Math.round((aggLE._sum.pesoTotalKg || 0) * 100) / 100;

  return NextResponse.json({
    ok: true,
    opNumero: parsed.opNumero,
    opEncontrada: !!op,
    obra: parsed.obra || null,
    totalNoArquivo: parsed.pecas.length,
    criados,
    atualizados,
    ignorados,
    pesoTotal: pesoRealLE, // peso real da LE (deduplicado), não a soma bruta do arquivo
    qteTotal: parsed.qteTotal,
    diff,
  });
}
