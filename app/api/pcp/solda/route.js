// POST /api/pcp/solda → a bancada sugerida para o conjunto na solda
//   { ids, bancada: "SOLDA 4", dia?: "2026-09-02" }  → registra a intenção
//   { ids, bancada: null }                            → tira a sugestão
//   { ids, dia: "2026-09-04" }                        → só muda o dia, mantém a bancada
//
// ⚠⚠ ISTO É INTENÇÃO, NÃO ORDEM. Vitor (01/09/2026) escolheu "só registra a intenção": quem manda
// na bancada é o líder no chão. O portal organiza a fila e anota a sugestão; o que de fato
// aconteceu volta do Syneco. Não medir aderência contra este campo — ele não é promessa de ninguém,
// e transformá-lo em cobrança seria trocar a regra sem avisar a fábrica.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos um conjunto"),
  // ⚠ `bancada` OPCIONAL para poder mexer só na data. Vitor (01/09/2026): "preciso alterar a data
  // de um lançamento, isso pode ocorrer com mais frequência". Exigir a bancada junto obrigaria a
  // tela a reenviar a que já está lá — e um envio errado trocaria a bancada sem querer.
  bancada: z.string().trim().max(60).nullable().optional(),
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable().optional(),
}).refine((v) => v.bancada !== undefined || v.dia !== undefined, "Informe a bancada ou a data");

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const mexeBancada = body.bancada !== undefined;
  const bancada = body.bancada || null;
  const data = {};
  if (mexeBancada) {
    data.soldaBancada = bancada;
    data.soldaBancadaEm = bancada ? new Date() : null;
    data.soldaBancadaPor = bancada ? (user.name || null) : null;
    // tirar a bancada tira o dia junto: dia sem bancada não programa nada
    if (!bancada) data.soldaDiaProgramado = null;
  }
  if (body.dia !== undefined) {
    // ⚠ meia-noite UTC em campo @db.Date — converter para BRT aqui volta um dia
    data.soldaDiaProgramado = body.dia ? new Date(`${body.dia}T00:00:00Z`) : null;
  }
  const r = await prisma.pecaConjunto.updateMany({
    where: { id: { in: body.ids }, tipoPeca: "CONJUNTO" },
    data,
  });

  try {
    await prisma.auditLog.create({
      data: { userId: user.id, action: "SOLDA_BANCADA", entity: "PecaConjunto",
              entityId: body.ids.length === 1 ? body.ids[0] : `${body.ids.length} conjuntos`,
              diff: { ...(mexeBancada ? { bancada } : {}), ...(body.dia !== undefined ? { dia: body.dia } : {}),
                      total: body.ids.length, atualizados: r.count } },
    });
  } catch {}

  return NextResponse.json({ ok: true, atualizados: r.count, ...(mexeBancada ? { bancada } : {}), ...(body.dia !== undefined ? { dia: body.dia } : {}) });
}
