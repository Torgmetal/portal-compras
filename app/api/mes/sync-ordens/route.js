import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, waitMesTables } from "@/lib/prisma";

// Recebe ordens planejadas do SKA dataset 150 (TORG_Production_Traceability_Detalhado).
// Cada linha = uma peça/operação/obra com Planejado vs Produzido.
// Auth: Bearer MES_SYNC_API_KEY (mesma do /api/mes/sync).

export const maxDuration = 60;

const ordemSchema = z.object({
  obra:          z.string(),
  op:            z.string(),
  operacao:      z.string(),
  item:          z.string(),
  setor:         z.string().nullable().optional(),
  descItem:      z.string().nullable().optional(),
  maquina:       z.string().nullable().optional(),
  operador:      z.string().nullable().optional(),
  planejadoUn:   z.number().default(0),
  produzidoUn:   z.number().default(0),
  rejeitadoUn:   z.number().default(0),
  saldoUn:       z.number().default(0),
  pesoPlanejado: z.number().default(0),
  pesoProduzido: z.number().default(0),
  saldoRestante: z.number().default(0),
  status:        z.string().nullable().optional(),
  productionId:  z.number().int().nullable().optional(),
  dataInicio:    z.string().nullable().optional(),
  dataFim:       z.string().nullable().optional(),
});

const bodySchema = z.object({
  ordens:     z.array(ordemSchema).min(1).max(10000),
  dataInicio: z.string().optional(),
  dataFim:    z.string().optional(),
  duracaoMs:  z.number().int().optional(),
});

// Converte código Obra do SKA → número de OP do portal (T87 → 087)
function obraParaNumeroOP(obra) {
  if (!obra) return obra;
  const m = obra.match(/^T(\d+)/i);
  if (!m) return obra;
  return String(parseInt(m[1])).padStart(3, "0");
}

function parseData(s) {
  if (!s) return null;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [datePart, timePart] = s.split(" ");
    const [dd, mm, yyyy] = datePart.split("/");
    return new Date(`${yyyy}-${mm}-${dd}T${timePart || "00:00:00"}.000Z`);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req) {
  await waitMesTables();
  const apiKey = process.env.MES_SYNC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MES_SYNC_API_KEY não configurada" }, { status: 503 });
  if ((req.headers.get("authorization") || "").slice(7) !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 });
  }

  const inicio = Date.now();

  // Mapa obra → opId do portal
  const obrasUnicas = [...new Set(body.ordens.map(o => o.obra).filter(Boolean))];
  const numerosPortal = [...new Set(obrasUnicas.map(obraParaNumeroOP))];
  const ops = await prisma.oP.findMany({
    where: { numero: { in: numerosPortal } },
    select: { id: true, numero: true },
  });
  const opMapPorNumero = Object.fromEntries(ops.map(o => [o.numero, o.id]));
  const opIdDaObra = (obra) => opMapPorNumero[obraParaNumeroOP(obra)] || null;

  const syncLog = await prisma.mesSyncLog.create({
    data: {
      sucesso: false,
      dataInicio: parseData(body.dataInicio) || new Date(),
      dataFim:    parseData(body.dataFim) || new Date(),
      totalLinhas: body.ordens.length,
    },
  });

  let criados = 0, atualizados = 0;
  try {
    const LOTE = 10; // respeita pool de conexões Neon (limit=5)
    for (let i = 0; i < body.ordens.length; i += LOTE) {
      const lote = body.ordens.slice(i, i + LOTE);
      await Promise.all(lote.map(async (o) => {
        const data = {
          obra: o.obra, op: o.op, operacao: o.operacao, item: o.item,
          setor: o.setor || null, descItem: o.descItem || null,
          maquina: o.maquina || null, operador: o.operador || null,
          planejadoUn: o.planejadoUn ?? 0, produzidoUn: o.produzidoUn ?? 0,
          rejeitadoUn: o.rejeitadoUn ?? 0, saldoUn: o.saldoUn ?? 0,
          pesoPlanejado: o.pesoPlanejado ?? 0, pesoProduzido: o.pesoProduzido ?? 0,
          saldoRestante: o.saldoRestante ?? 0,
          status: o.status || null, productionId: o.productionId ?? null,
          dataInicio: parseData(o.dataInicio), dataFim: parseData(o.dataFim),
          opId: opIdDaObra(o.obra), syncRunId: syncLog.id,
        };
        const res = await prisma.mesOrdem.upsert({
          where: { obra_op_operacao_item: { obra: o.obra, op: o.op, operacao: o.operacao, item: o.item } },
          create: data,
          update: data,
        });
        if (res.createdAt.getTime() === res.updatedAt.getTime()) criados++;
        else atualizados++;
      }));
    }

    await prisma.mesSyncLog.update({
      where: { id: syncLog.id },
      data: { sucesso: true, criados, atualizados, duracaoMs: body.duracaoMs ?? (Date.now() - inicio) },
    });
    return NextResponse.json({ ok: true, criados, atualizados, syncId: syncLog.id });
  } catch (e) {
    await prisma.mesSyncLog.update({
      where: { id: syncLog.id },
      data: { sucesso: false, erro: e?.message || "erro", duracaoMs: Date.now() - inicio },
    }).catch(() => {});
    return NextResponse.json({ error: "Erro interno: " + e?.message }, { status: 500 });
  }
}
