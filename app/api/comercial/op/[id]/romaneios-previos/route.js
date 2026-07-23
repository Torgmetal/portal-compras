// GET  — romaneios prévios da OP + o próximo número sugerido.
// POST — cria um a partir das marcas escolhidas na Lista de Expedição.
//        Numeração SEQUENCIAL ao último romaneio EMITIDO (lido dos romaneios da
//        pasta e já gravado em cada marca) — assim o prévio continua a série.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"];

/** maior nº entre os romaneios já EMITIDOS (marcasJson) e os prévios existentes */
async function proximoNumero(opId, opNumero) {
  const listas = await prisma.listaExpedicao.findMany({
    where: { OR: [{ opId }, { opNumero: String(opNumero) }] },
    select: { marcasJson: true },
  });
  // Os nº vêm com sufixo/prefixo de revisão ("01 R1", "12.R1", "R07", "R3").
  // Vale o PRIMEIRO grupo de dígitos — tirar todos os não-dígitos juntaria a
  // revisão ao número ("01 R1" → 011) e estouraria a sequência.
  let maior = 0;
  for (const l of listas) {
    for (const m of Array.isArray(l.marcasJson) ? l.marcasJson : []) {
      for (const n of String(m.romaneio || "").split(",")) {
        const v = parseInt(String(n).match(/\d+/)?.[0] ?? "", 10);
        if (Number.isFinite(v) && v > maior) maior = v;
      }
    }
  }
  const ultPrevio = await prisma.romaneioPrevio.findFirst({ where: { opId }, orderBy: { numero: "desc" }, select: { numero: true } });
  return Math.max(maior, ultPrevio?.numero || 0) + 1;
}

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const [previos, proximo] = await Promise.all([
    prisma.romaneioPrevio.findMany({ where: { opId: op.id }, orderBy: { numero: "desc" } }),
    proximoNumero(op.id, op.numero),
  ]);
  return NextResponse.json({ success: true, previos, proximoNumero: proximo });
}

const schema = z.object({
  itens: z.array(z.object({
    frente: z.string().optional().nullable(),
    marca: z.string().min(1),
    descricao: z.string().optional().nullable(),
    qte: z.number().nullable().optional(),
    pesoTotal: z.number().nullable().optional(),
  })).min(1, "Selecione ao menos uma peça."),
  dataPrevista: z.string().nullable().optional(),
  local: z.string().max(300).nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
  loteId: z.string().nullable().optional(),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // dedupe por marca e soma o peso
  const porMarca = new Map();
  for (const it of body.itens) {
    const k = it.marca.trim().toUpperCase();
    if (k && !porMarca.has(k)) porMarca.set(k, { frente: it.frente || null, marca: it.marca.trim(), descricao: it.descricao || null, qte: it.qte ?? null, pesoTotal: it.pesoTotal ?? 0 });
  }
  const itens = [...porMarca.values()];
  const pesoKg = itens.reduce((s, i) => s + (i.pesoTotal || 0), 0);

  // corrida por número: tenta o próximo e sobe se colidir com a unique
  let criado = null;
  let n = await proximoNumero(op.id, op.numero);
  for (let tent = 0; tent < 5 && !criado; tent++) {
    try {
      criado = await prisma.romaneioPrevio.create({
        data: {
          opId: op.id, opNumero: String(op.numero), numero: n, itens, pesoKg,
          dataPrevista: body.dataPrevista ? new Date(body.dataPrevista) : null,
          local: body.local?.trim() || null, observacao: body.observacao?.trim() || null,
          loteId: body.loteId ? (await prisma.loteExpedicao.findFirst({ where: { id: body.loteId, opId: op.id }, select: { id: true } }))?.id ?? null : null,
          criadoPorId: user.id,
        },
      });
    } catch (e) {
      if (String(e?.code) === "P2002") n++; else throw e;
    }
  }
  if (!criado) return NextResponse.json({ error: "Não foi possível numerar o romaneio prévio." }, { status: 409 });

  await prisma.auditLog.create({ data: { userId: user.id, action: "CRIAR_ROMANEIO_PREVIO", entity: "OP", entityId: op.id, diff: { numero: criado.numero, itens: itens.length, pesoKg } } }).catch(() => {});
  return NextResponse.json({ success: true, previo: criado });
}
