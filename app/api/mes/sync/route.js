import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Endpoint de recebimento de dados do MES SKA/Syneco.
// Chamado pelo agente local (scripts/mes-sync-agent.js) via HTTPS a cada hora.
// Auth: Bearer token fixo via MES_SYNC_API_KEY no .env

const apontamentoSchema = z.object({
  dataApontamento: z.string(), // "2026-05-25" ISO date
  turno:           z.number().int(),
  opNumero:        z.string(),
  obra:            z.string().nullable().optional(),
  setor:           z.string().nullable().optional(),
  maquina:         z.string().nullable().optional(),
  operacao:        z.string().nullable().optional(),
  codigoPeca:      z.string().nullable().optional(),
  produzidoKg:     z.number().default(0),
  produzidoUn:     z.number().default(0),
});

const bodySchema = z.object({
  apontamentos: z.array(apontamentoSchema).min(1).max(5000),
  dataInicio:   z.string(), // periodo sincronizado
  dataFim:      z.string(),
  duracaoMs:    z.number().int().optional(),
});

export async function POST(req) {
  // Verifica API key
  const apiKey = process.env.MES_SYNC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MES_SYNC_API_KEY não configurada no servidor" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (provided !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 });
  }

  const inicio = Date.now();
  let criados = 0, atualizados = 0, ignorados = 0;

  // Pré-carrega mapa opNumero → opId pra resolver vínculos sem N queries
  const numerosUnicos = [...new Set(body.apontamentos.map((a) => a.opNumero).filter(Boolean))];
  const ops = await prisma.oP.findMany({
    where: { numero: { in: numerosUnicos } },
    select: { id: true, numero: true },
  });
  const opMap = Object.fromEntries(ops.map((o) => [o.numero, o.id]));

  // Log de sync (cria antes pra ter o ID de referência)
  const syncLog = await prisma.mesSyncLog.create({
    data: {
      sucesso: false, // atualiza no final
      dataInicio: new Date(body.dataInicio),
      dataFim:    new Date(body.dataFim),
      totalLinhas: body.apontamentos.length,
    },
  });

  try {
    // Upsert em lotes de 200 pra não sobrecarregar o DB
    const LOTE = 200;
    for (let i = 0; i < body.apontamentos.length; i += LOTE) {
      const lote = body.apontamentos.slice(i, i + LOTE);
      await Promise.all(
        lote.map(async (ap) => {
          const opId = opMap[ap.opNumero] || null;
          const data = {
            dataApontamento: new Date(ap.dataApontamento),
            turno:      ap.turno,
            opNumero:   ap.opNumero,
            obra:       ap.obra       || null,
            setor:      ap.setor      || null,
            maquina:    ap.maquina    || null,
            operacao:   ap.operacao   || null,
            codigoPeca: ap.codigoPeca || null,
            produzidoKg: ap.produzidoKg ?? 0,
            produzidoUn: ap.produzidoUn ?? 0,
            opId,
            syncRunId: syncLog.id,
          };
          const res = await prisma.mesApontamento.upsert({
            where: {
              dataApontamento_opNumero_setor_maquina_operacao_codigoPeca: {
                dataApontamento: data.dataApontamento,
                opNumero:   data.opNumero,
                setor:      data.setor      ?? "",
                maquina:    data.maquina    ?? "",
                operacao:   data.operacao   ?? "",
                codigoPeca: data.codigoPeca ?? "",
              },
            },
            create: data,
            update: {
              produzidoKg: data.produzidoKg,
              produzidoUn: data.produzidoUn,
              opId:        data.opId,
              syncRunId:   data.syncRunId,
            },
          });
          // Prisma upsert não distingue create vs update nativamente,
          // mas podemos inferir pelo createdAt ≈ updatedAt
          if (res.createdAt.getTime() === res.updatedAt.getTime()) criados++;
          else atualizados++;
        })
      );
    }

    const duracaoMs = Date.now() - inicio;
    await prisma.mesSyncLog.update({
      where: { id: syncLog.id },
      data: {
        sucesso: true,
        criados,
        atualizados,
        ignorados,
        duracaoMs: body.duracaoMs ?? duracaoMs,
      },
    });

    return NextResponse.json({ ok: true, criados, atualizados, ignorados, syncId: syncLog.id });
  } catch (e) {
    console.error("[mes/sync] erro:", e?.message);
    await prisma.mesSyncLog.update({
      where: { id: syncLog.id },
      data: { sucesso: false, erro: e?.message || "erro desconhecido", duracaoMs: Date.now() - inicio },
    }).catch(() => {});
    return NextResponse.json({ error: "Erro interno ao processar apontamentos: " + e?.message }, { status: 500 });
  }
}

// GET — retorna status do último sync (usado pelo painel do portal)
export async function GET(req) {
  const apiKey = process.env.MES_SYNC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "não configurado" }, { status: 503 });
  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (provided !== apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ultimo = await prisma.mesSyncLog.findFirst({ orderBy: { criadoEm: "desc" } });
  return NextResponse.json({ ultimoSync: ultimo });
}
