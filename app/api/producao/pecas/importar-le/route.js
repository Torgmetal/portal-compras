// POST /api/producao/pecas/importar-le
// Recebe { rows: [...] } parseado no client (evita limite 4.5MB do Vercel)
// e { opNumero?: string } pra forcar a OP caso o cabecalho nao tenha.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseFormularioLE } from "@/lib/parse-le-form21";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  // Resolve opId — busca no banco se parsed.opNumero é string valida
  let op = null;
  try {
    if (parsed.opNumero) {
      op = await prisma.oP.findUnique({ where: { numero: String(parsed.opNumero) } });
    }
  } catch (e) {
    console.error("[importar-le] findUnique OP erro:", e?.message);
  }

  // Se sobrescrever, deleta todas as pecas da OP primeiro
  if (sobrescrever) {
    await prisma.pecaConjunto.deleteMany({
      where: { opNumero: String(parsed.opNumero), fonte: "LE_IMPORT" },
    });
  }

  let criados = 0, atualizados = 0, ignorados = 0;
  for (const p of parsed.pecas) {
    try {
      const existente = await prisma.pecaConjunto.findUnique({
        where: { opNumero_marca: { opNumero: parsed.opNumero, marca: p.marca } },
      });
      if (existente) {
        // So' atualiza os campos basicos, preserva status/dataConcluida
        await prisma.pecaConjunto.update({
          where: { id: existente.id },
          data: {
            item: p.item,
            descricao: p.descricao,
            qte: p.qte,
            pesoUnitKg: p.pesoUnitKg,
            pesoTotalKg: p.pesoTotalKg,
          },
        });
        atualizados++;
      } else {
        await prisma.pecaConjunto.create({
          data: {
            opId: op?.id || null,
            opNumero: parsed.opNumero,
            item: p.item,
            marca: p.marca,
            descricao: p.descricao,
            qte: p.qte,
            pesoUnitKg: p.pesoUnitKg,
            pesoTotalKg: p.pesoTotalKg,
            fluxoEspecial: p.fluxoEspecial,
            status: "PENDENTE",
            fonte: "LE_IMPORT",
          },
        });
        criados++;
      }
    } catch (e) {
      ignorados++;
    }
  }

  return NextResponse.json({
    ok: true,
    opNumero: parsed.opNumero,
    opEncontrada: !!op,
    totalNoArquivo: parsed.pecas.length,
    criados,
    atualizados,
    ignorados,
    pesoTotal: parsed.pesoTotal,
    qteTotal: parsed.qteTotal,
  });
}
