// /api/rh/folha
//   GET                      → lista as competências (histórico)
//   GET ?competencia=AAAA-MM → a folha com itens + derivados + resumo
//   POST { competencia }     → cria a competência e semeia os funcionários ativos
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { comDerivados, resumo } from "@/lib/folha-calc";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const tipoFolha = (t) => (t === "PJ" ? "PJ" : "CLT");

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const competencia = new URL(req.url).searchParams.get("competencia");

  const competencias = await prisma.folhaCompetencia.findMany({
    orderBy: { competencia: "desc" },
    select: { id: true, competencia: true, status: true, _count: { select: { itens: true } } },
  });

  if (!competencia) return NextResponse.json({ success: true, competencias });

  const folha = await prisma.folhaCompetencia.findUnique({
    where: { competencia },
    include: { itens: { orderBy: [{ empresa: "asc" }, { nome: "asc" }] } },
  });
  if (!folha) return NextResponse.json({ success: true, competencias, folha: null });

  const itens = folha.itens.map(comDerivados);
  return NextResponse.json({
    success: true, competencias,
    folha: { id: folha.id, competencia: folha.competencia, status: folha.status, itens },
    resumo: resumo(folha.itens),
  });
}

const schema = z.object({ competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência deve ser AAAA-MM") });

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
  const { competencia } = parsed.data;

  let folha = await prisma.folhaCompetencia.findUnique({ where: { competencia }, include: { _count: { select: { itens: true } } } });
  if (folha && folha._count.itens > 0) {
    return NextResponse.json({ success: true, jaExiste: true, id: folha.id });
  }

  // Semeia a partir dos funcionários ativos (snapshot do cadastro)
  const ativos = await prisma.funcionario.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, cpf: true, empresa: true, centroCusto: true, tipoContrato: true, salario: true },
    orderBy: { nome: "asc" },
  });

  await prisma.$transaction(async (tx) => {
    if (!folha) folha = await tx.folhaCompetencia.create({ data: { competencia, criadoPorId: user.id } });
    if (ativos.length) {
      await tx.folhaItem.createMany({
        data: ativos.map((f) => ({
          folhaId: folha.id, funcionarioId: f.id, nome: f.nome, cpf: f.cpf || null,
          empresa: f.empresa || null, centroCusto: f.centroCusto || null,
          tipoContrato: tipoFolha(f.tipoContrato), salarioBase: f.salario ?? 0,
        })),
        skipDuplicates: true,
      });
    }
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "INICIAR_FOLHA", entity: "FolhaCompetencia", entityId: folha.id, diff: { competencia, itens: ativos.length } },
  }).catch(() => {});

  return NextResponse.json({ success: true, id: folha.id, itens: ativos.length });
}
