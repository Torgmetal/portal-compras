import { NextResponse } from "next/server";
import { z } from "zod";
import { prismaDirect, waitMesTables } from "@/lib/prisma";

// Recebe do agente a lista de setores INATIVOS-SEM-PRODUCAO do Syneco
// (Production.IsEnabled=0 e PartCount=0) — etapas feitas FORA da fabrica.
// SUBSTITUI a tabela MesInativo por inteiro (self-correcting: se o gerente
// reativar um setor no SSP, ele some da lista no proximo sync).
// Usado SO no relatorio de furos de apontamento. Auth: Bearer MES_SYNC_API_KEY.

export const maxDuration = 60;

const itemSchema = z.object({
  op:       z.string(),
  item:     z.string(),
  operacao: z.string(),
});
const bodySchema = z.object({
  inativos: z.array(itemSchema).max(100000),
});

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

  // Dedup pela chave (op,item,operacao)
  const vistos = new Set();
  const linhas = [];
  for (const r of body.inativos) {
    const k = `${r.op}|${r.item}|${r.operacao}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    linhas.push(r);
  }

  // Literais de array Postgres em TEXTO (evita "improper binary format" do Prisma)
  const litEl   = (e) => e == null ? "NULL" : `"${String(e).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const pgArray = (arr) => `{${arr.map(litEl).join(",")}}`;

  const SQL_INSERT = `
    INSERT INTO "MesInativo" ("id","op","item","operacao","atualizadoEm")
    SELECT gen_random_uuid()::text, t.op, t.item, t.operacao, NOW()
    FROM UNNEST($1::text[], $2::text[], $3::text[]) AS t(op, item, operacao)
    ON CONFLICT ("op","item","operacao") DO NOTHING
  `;

  try {
    // Substitui por inteiro
    await prismaDirect.$executeRawUnsafe(`DELETE FROM "MesInativo"`);

    const SUB = 2000;
    let inseridos = 0;
    for (let i = 0; i < linhas.length; i += SUB) {
      const lote = linhas.slice(i, i + SUB);
      await prismaDirect.$executeRawUnsafe(
        SQL_INSERT,
        pgArray(lote.map((r) => r.op)),
        pgArray(lote.map((r) => r.item)),
        pgArray(lote.map((r) => r.operacao)),
      );
      inseridos += lote.length;
      await new Promise((r) => setTimeout(r, 30)); // alivia a compute do Neon
    }

    return NextResponse.json({ ok: true, inativos: inseridos });
  } catch (e) {
    console.error("[mes/sync-status] erro:", e?.message);
    return NextResponse.json({ error: "Erro interno: " + e?.message }, { status: 500 });
  }
}

export async function GET(req) {
  await waitMesTables();
  const apiKey = process.env.MES_SYNC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "não configurado" }, { status: 503 });
  if ((req.headers.get("authorization") || "").slice(7) !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const total = await prismaDirect.mesInativo.count();
  return NextResponse.json({ total });
}
