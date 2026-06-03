import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, prismaDirect, waitMesTables } from "@/lib/prisma";

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

  let processados = 0;

  // Statement CONSTANTE com UNNEST + arrays como parâmetros.
  // Crucial: como o SQL nunca muda (só os parâmetros), o Postgres cacheia
  // UM ÚNICO plano e o reusa para todo lote — evita o "out of memory" em
  // CachedPlanQuery que acontecia quando cada lote gerava um SQL diferente.
  const SQL_UPSERT = `
    INSERT INTO "MesOrdem" (
      "id","obra","op","operacao","item","setor","descItem","maquina","operador",
      "planejadoUn","produzidoUn","rejeitadoUn","saldoUn","pesoPlanejado","pesoProduzido","saldoRestante",
      "status","productionId","dataInicio","dataFim","opId","syncRunId","createdAt","updatedAt"
    )
    SELECT gen_random_uuid()::text, t.*, NOW(), NOW()
    FROM UNNEST(
      $1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
      $9::float8[],$10::float8[],$11::float8[],$12::float8[],$13::float8[],$14::float8[],$15::float8[],
      $16::text[],$17::int[],$18::timestamptz[],$19::timestamptz[],$20::text[],$21::text[]
    ) AS t
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
  `;

  // Converte um lote em 21 parâmetros — cada um é um LITERAL de array Postgres
  // em TEXTO (ex: '{"a","b",NULL}'). Passar como texto + cast ::tipo[] no SQL
  // evita o erro de "improper binary format" da codificação de arrays do Prisma.
  const litEl   = (e) => e == null ? "NULL" : `"${String(e).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const pgArray = (arr) => `{${arr.map(litEl).join(",")}}`;
  const numArr  = (lote, f) => lote.map(o => Number.isFinite(o[f]) ? o[f] : 0);
  const txtArr  = (lote, f) => lote.map(o => (o[f] == null || o[f] === "") ? null : String(o[f]));
  const paramsDe = (lote) => [
    pgArray(txtArr(lote, "obra")), pgArray(txtArr(lote, "op")), pgArray(txtArr(lote, "operacao")), pgArray(txtArr(lote, "item")),
    pgArray(txtArr(lote, "setor")), pgArray(txtArr(lote, "descItem")), pgArray(txtArr(lote, "maquina")), pgArray(txtArr(lote, "operador")),
    pgArray(numArr(lote, "planejadoUn")), pgArray(numArr(lote, "produzidoUn")), pgArray(numArr(lote, "rejeitadoUn")), pgArray(numArr(lote, "saldoUn")),
    pgArray(numArr(lote, "pesoPlanejado")), pgArray(numArr(lote, "pesoProduzido")), pgArray(numArr(lote, "saldoRestante")),
    pgArray(txtArr(lote, "status")),
    pgArray(lote.map(o => (o.productionId == null || !Number.isFinite(o.productionId)) ? null : Math.trunc(o.productionId))),
    pgArray(lote.map(o => { const d = parseData(o.dataInicio); return d ? d.toISOString() : null; })),
    pgArray(lote.map(o => { const d = parseData(o.dataFim);    return d ? d.toISOString() : null; })),
    pgArray(lote.map(o => opIdDaObra(o.obra))),
    pgArray(lote.map(() => syncLog.id)),
  ];

  const ehOOM = (e) => /53200|out of memory/i.test(e?.message || "");

  // Upsert resiliente: se o Neon estourar memória (OOM), divide o lote pela
  // metade e tenta de novo recursivamente — degrada em vez de abortar.
  async function upsertResiliente(lote, tentativa = 0) {
    if (lote.length === 0) return;
    try {
      // Conexão DIRETA (sem pooler) + statement constante (1 plano só).
      await prismaDirect.$executeRawUnsafe(SQL_UPSERT, ...paramsDe(lote));
      processados += lote.length;
    } catch (e) {
      if (ehOOM(e) && lote.length > 1) {
        const meio = Math.ceil(lote.length / 2);
        // pausa para o Neon liberar memória antes de reprocessar (cresce com a profundidade)
        await new Promise(r => setTimeout(r, 400 + 200 * tentativa));
        await upsertResiliente(lote.slice(0, meio), tentativa + 1);
        await upsertResiliente(lote.slice(meio), tentativa + 1);
      } else if (ehOOM(e) && tentativa < 8) {
        // lote já unitário mas ainda OOM → espera (crescente) e repete
        await new Promise(r => setTimeout(r, 700 * (tentativa + 1)));
        await upsertResiliente(lote, tentativa + 1);
      } else {
        throw e;
      }
    }
  }

  try {
    // Sub-lotes pequenos para o INSERT em massa (com auto-split em OOM).
    const SUB = 50;
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
      await upsertResiliente(lote);
      // pausa curta entre chunks: alivia a pressão de memória da compute do Neon
      await new Promise(r => setTimeout(r, 40));
    }

    await prisma.mesSyncLog.update({
      where: { id: syncLog.id },
      data: { sucesso: true, atualizados: processados, duracaoMs: body.duracaoMs ?? (Date.now() - inicio) },
    });
    return NextResponse.json({ ok: true, processados, syncId: syncLog.id });
  } catch (e) {
    await prisma.mesSyncLog.update({
      where: { id: syncLog.id },
      data: { sucesso: false, erro: e?.message || "erro", duracaoMs: Date.now() - inicio },
    }).catch(() => {});
    return NextResponse.json({ error: "Erro interno: " + e?.message }, { status: 500 });
  }
}
