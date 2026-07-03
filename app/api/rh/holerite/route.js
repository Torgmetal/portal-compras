// /api/rh/holerite
//   GET  ?competencia=AAAA-MM  → lista holerites da competência (+ status) e as
//                                competências já existentes. Sem filtro: só as
//                                competências (p/ o seletor).
//   POST  { competencia, empresa?, cnpj?, arquivoOriginalUrl?, itens[] }
//         → cria o LoteHolerite e os Holerite (1 por funcionário), status PENDENTE.
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const itemSchema = z.object({
  funcionarioId: z.string().min(1),
  arquivoUrl: z.string().url(),
  arquivoNome: z.string().optional().nullable(),
  arquivoTamanho: z.number().int().optional().nullable(),
  tipo: z.enum(["MENSAL", "DECIMO_TERCEIRO", "FERIAS", "RESCISAO"]).default("MENSAL"),
  empresa: z.string().optional().nullable(),
  valorLiquido: z.number().optional().nullable(),
});

const schema = z.object({
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência deve ser AAAA-MM"),
  empresa: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  arquivoOriginalUrl: z.string().url().optional().nullable(),
  arquivoOriginalNome: z.string().optional().nullable(),
  itens: z.array(itemSchema).min(1, "Inclua ao menos um holerite"),
});

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const competencia = new URL(req.url).searchParams.get("competencia");

  // Competências existentes (distinct) — p/ o seletor
  const grupos = await prisma.holerite.groupBy({ by: ["competencia"], _count: true, orderBy: { competencia: "desc" } });
  const competencias = grupos.map((g) => ({ competencia: g.competencia, total: g._count }));

  if (!competencia) return NextResponse.json({ success: true, competencias, holerites: [] });

  const holerites = await prisma.holerite.findMany({
    where: { competencia },
    orderBy: { funcionario: { nome: "asc" } },
    select: {
      id: true, competencia: true, empresa: true, tipo: true, status: true,
      valorLiquido: true, arquivoNome: true, enviadoEm: true, visualizadoEm: true, confirmadoEm: true,
      funcionario: {
        select: { id: true, nome: true, email: true, telefone: true, matricula: true, usuario: { select: { id: true } } },
      },
    },
  });

  return NextResponse.json({ success: true, competencias, holerites });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const { competencia, empresa, cnpj, arquivoOriginalUrl, arquivoOriginalNome, itens } = parsed.data;

  // Não permitir o mesmo funcionário 2x no mesmo lote+tipo
  const chaves = itens.map((i) => `${i.funcionarioId}|${i.tipo}`);
  if (new Set(chaves).size !== chaves.length) {
    return NextResponse.json({ success: false, error: "Há funcionários repetidos (mesmo tipo) no lote" }, { status: 400 });
  }

  const lote = await prisma.$transaction(async (tx) => {
    const novoLote = await tx.loteHolerite.create({
      data: {
        competencia, empresa: empresa || null, cnpj: cnpj || null,
        arquivoOriginalUrl: arquivoOriginalUrl || null, arquivoOriginalNome: arquivoOriginalNome || null,
        totalPaginas: itens.length, criadoPorId: user.id,
      },
    });
    for (const it of itens) {
      // upsert: reimportar a mesma competência/tipo substitui o arquivo, mantendo
      // o histórico de status só se ainda PENDENTE (re-disparo será manual).
      await tx.holerite.upsert({
        where: { funcionarioId_competencia_tipo: { funcionarioId: it.funcionarioId, competencia, tipo: it.tipo } },
        update: {
          loteId: novoLote.id, empresa: it.empresa || empresa || null, valorLiquido: it.valorLiquido ?? null,
          arquivoUrl: it.arquivoUrl, arquivoNome: it.arquivoNome || null, arquivoTamanho: it.arquivoTamanho ?? null,
        },
        create: {
          funcionarioId: it.funcionarioId, loteId: novoLote.id, competencia, tipo: it.tipo,
          empresa: it.empresa || empresa || null, valorLiquido: it.valorLiquido ?? null,
          arquivoUrl: it.arquivoUrl, arquivoNome: it.arquivoNome || null, arquivoTamanho: it.arquivoTamanho ?? null,
          status: "PENDENTE",
        },
      });
    }
    return novoLote;
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "IMPORTAR_HOLERITE_LOTE", entity: "LoteHolerite", entityId: lote.id, diff: { competencia, total: itens.length } },
  }).catch(() => {});

  return NextResponse.json({ success: true, loteId: lote.id, total: itens.length });
}

// DELETE /api/rh/holerite?competencia=AAAA-MM
// Cancela a importação de uma competência (apaga holerites + lotes) p/ reimportar.
// Bloqueia se algum holerite já foi CONFIRMADO (ciência do funcionário — não perder o registro).
export async function DELETE(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const competencia = new URL(req.url).searchParams.get("competencia");
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ success: false, error: "Informe a competência (AAAA-MM)" }, { status: 400 });
  }

  const confirmados = await prisma.holerite.count({ where: { competencia, status: "CONFIRMADO" } });
  if (confirmados > 0) {
    return NextResponse.json({ success: false, error: `${confirmados} holerite(s) já confirmados pelo funcionário — não é possível excluir a competência.` }, { status: 409 });
  }

  const del = await prisma.holerite.deleteMany({ where: { competencia } });
  await prisma.loteHolerite.deleteMany({ where: { competencia } });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "CANCELAR_HOLERITE_IMPORTACAO", entity: "Holerite", entityId: competencia, diff: { competencia, apagados: del.count } },
  }).catch(() => {});

  return NextResponse.json({ success: true, apagados: del.count });
}
