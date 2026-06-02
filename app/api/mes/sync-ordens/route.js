import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, waitMesTables } from "@/lib/prisma";

// Recebe ordens planejadas do SKA dataset 150 (snapshot planejado vs produzido).
// Upsert EM MASSA via INSERT ... ON CONFLICT (1 SQL por lote) — rápido.
// Auth: Bearer MES_SYNC_API_KEY.

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
  ordens:     z.array(ordemSchema).min(1).max(20000),
  dataInicio: z.string().optional(),
  dataFim:    z.string().optional(),
  duracaoMs:  z.number().int().optional(),
});

function obraParaNumeroOP(obra) {
  if (!obra) return obra;
  const m = obra.match(/^T(\d+)/i);
  return m ? String(parseInt(m[1])).padStart(3, "0") : obra;
}

function parseData(s) {
  if (!s) return null;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [d, t] = s.split(" ");
    const [dd, mm, yyyy] = d.split("/");
    const dt = new Date(`${yyyy}-${mm}-${dd}T${t || "00:00:00"}.000Z`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

// Escaping seguro para SQL
const q   = (s) => s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
const ts  = (d) => d ? `'${d.toISOString()}'::timestamp` : "NULL";
const n   = (v) => Number.isFinite(v) ? String(v) : "0";
const ni  = (v) => (v == null || !Number.isFinite(v)) ? "NULL" : String(Math.trunc(v));

export async function POST(req) {
  await waitMesTables();
  const apiKey = process.env.MES_SYNC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MES_SYNC_API_KEY não configurada" }, { status: 503 });
  if ((req.headers.get("authorization") || "").slice(7) !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try { body = bodySchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 }); }

  const inicio = Date.now();

  // Mapa obra → opId do portal
  const obrasUnicas = [...new Set(body.ordens.map(o => o.obra).filter(Boolean))];
  const numerosPortal = [...new Set(obrasUnicas.map(obraParaNumeroOP))];
  const ops = await prisma.oP.findMany({ where: { numero: { in: numerosPortal } }, select: { id: true, numero: true } });
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
    // Sub-lotes de 200 para o INSERT em massa.
    // (1000 estourava a memória do Neon — "out of memory" code 53200.)
    const SUB = 200;
    for (let i = 0; i < body.ordens.length; i += SUB) {
      // Dedup dentro do lote pela chave (evita "ON CONFLICT afetar linha 2x no mesmo comando")
      const vistos = new Set();
      const lote = [];
      for (const o of body.ordens.slice(i, i + SUB)) {
        const k = `${o.obra}|${o.op}|${o.operacao}|${o.item}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        lote.push(o);
      }

      const valores = lote.map(o => {
        const di = parseData(o.dataInicio), df = parseData(o.dataFim);
        return `(gen_random_uuid()::text, ${q(o.obra)}, ${q(o.op)}, ${q(o.operacao)}, ${q(o.item)}, ` +
          `${q(o.setor)}, ${q(o.descItem)}, ${q(o.maquina)}, ${q(o.operador)}, ` +
          `${n(o.planejadoUn)}, ${n(o.produzidoUn)}, ${n(o.rejeitadoUn)}, ${n(o.saldoUn)}, ` +
          `${n(o.pesoPlanejado)}, ${n(o.pesoProduzido)}, ${n(o.saldoRestante)}, ` +
          `${q(o.status)}, ${ni(o.productionId)}, ${ts(di)}, ${ts(df)}, ${q(opIdDaObra(o.obra))}, ${q(syncLog.id)}, NOW(), NOW())`;
      }).join(",");

      const res = await prisma.$queryRawUnsafe(`
        INSERT INTO "MesOrdem" (
          "id","obra","op","operacao","item","setor","descItem","maquina","operador",
          "planejadoUn","produzidoUn","rejeitadoUn","saldoUn","pesoPlanejado","pesoProduzido","saldoRestante",
          "status","productionId","dataInicio","dataFim","opId","syncRunId","createdAt","updatedAt"
        )
        VALUES ${valores}
        ON CONFLICT ("obra","op","operacao","item") DO UPDATE SET
          "setor"         = EXCLUDED."setor",
          "descItem"      = EXCLUDED."descItem",
          "maquina"       = EXCLUDED."maquina",
          "operador"      = EXCLUDED."operador",
          "planejadoUn"   = EXCLUDED."planejadoUn",
          "produzidoUn"   = EXCLUDED."produzidoUn",
          "rejeitadoUn"   = EXCLUDED."rejeitadoUn",
          "saldoUn"       = EXCLUDED."saldoUn",
          "pesoPlanejado" = EXCLUDED."pesoPlanejado",
          "pesoProduzido" = EXCLUDED."pesoProduzido",
          "saldoRestante" = EXCLUDED."saldoRestante",
          "status"        = EXCLUDED."status",
          "productionId"  = EXCLUDED."productionId",
          "dataInicio"    = EXCLUDED."dataInicio",
          "dataFim"       = EXCLUDED."dataFim",
          "opId"          = EXCLUDED."opId",
          "syncRunId"     = EXCLUDED."syncRunId",
          "updatedAt"     = NOW()
        RETURNING (xmax = 0) AS inserted
      `);
      for (const r of res) { if (r.inserted) criados++; else atualizados++; }
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
