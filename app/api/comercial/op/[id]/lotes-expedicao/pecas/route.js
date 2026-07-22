// GET  — peças registradas (opcional ?loteId=) de um lote / da OP.
// POST — importa a LISTA DO TEKLA (já parseada no navegador). Casa cada peça ao
//        lote pelo NOME (cria o lote se não existir) e recalcula o PESO do lote
//        como a soma das peças — é daqui que sai o peso final.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"];
const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export async function GET(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const loteId = new URL(req.url).searchParams.get("loteId");
  const pecas = await prisma.pecaLote.findMany({
    where: { opId: params.id, ...(loteId ? { loteId } : {}) },
    orderBy: [{ marca: "asc" }],
    take: 2000,
  });
  return NextResponse.json({ success: true, pecas });
}

const pecaSchema = z.object({
  lote: z.string().nullable().optional(),
  marca: z.string().min(1).max(120),
  descricao: z.string().max(300).nullable().optional(),
  qtd: z.number().nullable().optional(),
  pesoUnitKg: z.number().nullable().optional(),
  pesoTotalKg: z.number().nullable().optional(),
});
const schema = z.object({
  pecas: z.array(pecaSchema).min(1, "Nenhuma peça válida na lista.").max(5000),
  substituir: z.boolean().optional(),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  if (body.substituir) await prisma.pecaLote.deleteMany({ where: { opId: op.id } });

  // casa o nome do lote da planilha com os lotes da OP; cria os que faltarem
  const lotes = await prisma.loteExpedicao.findMany({ where: { opId: op.id }, select: { id: true, nome: true, ordem: true } });
  const porNome = new Map(lotes.map((l) => [chave(l.nome), l.id]));
  let maiorOrdem = lotes.reduce((m, l) => Math.max(m, l.ordem || 0), 0);
  let lotesCriados = 0;
  for (const p of body.pecas) {
    const k = chave(p.lote);
    if (!k || porNome.has(k)) continue;
    const novo = await prisma.loteExpedicao.create({ data: { opId: op.id, ordem: ++maiorOrdem, nome: String(p.lote).trim().slice(0, 200) } });
    porNome.set(k, novo.id);
    lotesCriados++;
  }

  const data = body.pecas.map((p) => {
    const total = p.pesoTotalKg ?? (p.pesoUnitKg != null && p.qtd != null ? p.pesoUnitKg * p.qtd : p.pesoUnitKg ?? null);
    return {
      opId: op.id,
      loteId: porNome.get(chave(p.lote)) || null,
      marca: p.marca.trim(),
      descricao: p.descricao?.trim() || null,
      qtd: p.qtd ?? null,
      pesoUnitKg: p.pesoUnitKg ?? null,
      pesoTotalKg: total,
    };
  });
  const criadas = await prisma.pecaLote.createMany({ data });

  // peso do lote = soma das peças (só mexe em lote que tem peça)
  const somas = await prisma.pecaLote.groupBy({ by: ["loteId"], where: { opId: op.id, loteId: { not: null } }, _sum: { pesoTotalKg: true } });
  for (const s of somas) {
    await prisma.loteExpedicao.update({ where: { id: s.loteId }, data: { pesoKg: s._sum.pesoTotalKg ?? null } });
  }

  await prisma.auditLog.create({ data: { userId: user.id, action: "IMPORTAR_PECAS_LOTE", entity: "OP", entityId: op.id, diff: { pecas: criadas.count, lotesCriados, substituir: !!body.substituir } } }).catch(() => {});
  return NextResponse.json({ success: true, pecas: criadas.count, lotesCriados, lotesAtualizados: somas.length, semLote: data.filter((d) => !d.loteId).length });
}
