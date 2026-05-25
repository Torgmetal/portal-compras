import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Endpoint de recebimento de dados do MES SKA/Syneco.
// Chamado pelo agente local (scripts/mes-sync-agent.js) via HTTPS a cada hora.
// Auth: Bearer token fixo via MES_SYNC_API_KEY no .env
//
// Dataset usado: 242 — "04.4 Rastreabilidade de OP e Item [TORG] - Produção"
// Campos-chave: ProductionID (único), Obra (= OP portal), Peso (KG), Produzido (UN)

const apontamentoSchema = z.object({
  productionId:  z.number().int(),             // ProductionID do SKA — chave de upsert
  dataInicio:    z.string(),                    // "25/05/2026 14:47:37" ou ISO
  dataFim:       z.string().nullable().optional(),
  obra:          z.string(),                    // = número da OP no portal (T70, T78...)
  opSka:         z.string().nullable().optional(), // código peça interno SKA (1SOC-001...)
  setor:         z.string().nullable().optional(),
  maquina:       z.string().nullable().optional(),
  codigoMaquina: z.string().nullable().optional(),
  operacao:      z.string().nullable().optional(),
  descricaoItem: z.string().nullable().optional(),
  operador:      z.string().nullable().optional(),
  status:        z.string().nullable().optional(),
  produzidoUn:   z.number().default(0),
  rejeitado:     z.number().default(0),
  retrabalhado:  z.number().default(0),
  produzidoKg:   z.number().default(0),
});

const bodySchema = z.object({
  apontamentos: z.array(apontamentoSchema).min(1).max(10000),
  dataInicio:   z.string(),
  dataFim:      z.string(),
  duracaoMs:    z.number().int().optional(),
});

// Converte código Obra do SKA para número de OP do portal
// T64 → 064 | T64E → 064 | T64A → 064 | T70 → 070 | T100 → 100
// Sufixos de letra (A, B, C, E...) indicam partes do projeto — mesma OP
function obraParaNumeroOP(obra) {
  if (!obra) return obra;
  const m = obra.match(/^T(\d+)/i);
  if (!m) return obra;
  return String(parseInt(m[1])).padStart(3, "0");
}

// Converte string "DD/MM/YYYY HH:mm:ss" ou ISO para Date
function parseData(s) {
  if (!s) return null;
  // Formato BR: "25/05/2026 14:47:37"
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [datePart, timePart] = s.split(" ");
    const [dd, mm, yyyy] = datePart.split("/");
    const time = timePart || "00:00:00";
    return new Date(`${yyyy}-${mm}-${dd}T${time}`);
  }
  return new Date(s);
}

export async function POST(req) {
  const apiKey = process.env.MES_SYNC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MES_SYNC_API_KEY não configurada" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  if (auth.slice(7) !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 });
  }

  const inicio = Date.now();
  let criados = 0, atualizados = 0;

  // Pré-carrega mapa obra → opId
  // Obra no SKA usa prefixo T (T64, T70...) — portal usa número com zero (064, 070...)
  const obrasUnicas = [...new Set(body.apontamentos.map((a) => a.obra).filter(Boolean))];
  const numerosPortal = [...new Set(obrasUnicas.map(obraParaNumeroOP))];
  const ops = await prisma.oP.findMany({
    where: { numero: { in: numerosPortal } },
    select: { id: true, numero: true },
  });
  // opMap: chave = numero do portal (064) → id
  const opMapPorNumero = Object.fromEntries(ops.map((o) => [o.numero, o.id]));
  // opMap: chave = obra SKA (T64) → id  (para lookup direto no loop)
  const opMap = Object.fromEntries(
    obrasUnicas.map((obra) => [obra, opMapPorNumero[obraParaNumeroOP(obra)] || null])
  );

  const syncLog = await prisma.mesSyncLog.create({
    data: {
      sucesso: false,
      dataInicio: parseData(body.dataInicio) || new Date(),
      dataFim:    parseData(body.dataFim) || new Date(),
      totalLinhas: body.apontamentos.length,
    },
  });

  try {
    const LOTE = 200;
    for (let i = 0; i < body.apontamentos.length; i += LOTE) {
      const lote = body.apontamentos.slice(i, i + LOTE);
      await Promise.all(
        lote.map(async (ap) => {
          const opId = opMap[ap.obra] || null;
          const dataInicioDate = parseData(ap.dataInicio);
          const dataFimDate    = ap.dataFim ? parseData(ap.dataFim) : null;

          if (!dataInicioDate) return; // ignora registros sem data

          const data = {
            productionId:  ap.productionId,
            dataInicio:    dataInicioDate,
            dataFim:       dataFimDate,
            obra:          ap.obra,
            opSka:         ap.opSka         || null,
            setor:         ap.setor         || null,
            maquina:       ap.maquina       || null,
            codigoMaquina: ap.codigoMaquina || null,
            operacao:      ap.operacao      || null,
            descricaoItem: ap.descricaoItem || null,
            operador:      ap.operador      || null,
            status:        ap.status        || null,
            produzidoUn:   ap.produzidoUn   ?? 0,
            rejeitado:     ap.rejeitado     ?? 0,
            retrabalhado:  ap.retrabalhado  ?? 0,
            produzidoKg:   ap.produzidoKg   ?? 0,
            opId,
            syncRunId: syncLog.id,
          };

          const result = await prisma.mesApontamento.upsert({
            where:  { productionId: ap.productionId },
            create: data,
            update: {
              dataFim:      data.dataFim,
              status:       data.status,
              produzidoUn:  data.produzidoUn,
              rejeitado:    data.rejeitado,
              retrabalhado: data.retrabalhado,
              produzidoKg:  data.produzidoKg,
              opId:         data.opId,
              syncRunId:    data.syncRunId,
            },
          });
          // Prisma upsert não informa se foi create ou update — comparamos datas
          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            criados++;
          } else {
            atualizados++;
          }
        })
      );
    }

    const duracaoMs = Date.now() - inicio;
    await prisma.mesSyncLog.update({
      where: { id: syncLog.id },
      data: { sucesso: true, criados, atualizados, duracaoMs: body.duracaoMs ?? duracaoMs },
    });

    return NextResponse.json({ ok: true, criados, atualizados, syncId: syncLog.id });
  } catch (e) {
    console.error("[mes/sync] erro:", e?.message);
    await prisma.mesSyncLog.update({
      where: { id: syncLog.id },
      data: { sucesso: false, erro: e?.message || "erro desconhecido", duracaoMs: Date.now() - inicio },
    }).catch(() => {});
    return NextResponse.json({ error: "Erro interno: " + e?.message }, { status: 500 });
  }
}

export async function GET(req) {
  const apiKey = process.env.MES_SYNC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "não configurado" }, { status: 503 });
  const auth = req.headers.get("authorization") || "";
  if (auth.slice(7) !== apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ultimo = await prisma.mesSyncLog.findFirst({ orderBy: { criadoEm: "desc" } });
  return NextResponse.json({ ultimoSync: ultimo });
}
