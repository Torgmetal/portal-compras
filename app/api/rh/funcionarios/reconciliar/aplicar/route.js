// POST /api/rh/funcionarios/reconciliar/aplicar
//   { mudancas: [{ funcionarioId, campos: { nome?, cpf?, email?, empresa?, centroCusto?, dataNascimento? } }] }
// Grava SOMENTE os campos aprovados pelo RH na tela de revisão. AuditLog com
// diff {antes, depois} por funcionário. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const camposSchema = z.object({
  nome: z.string().min(2).optional(),
  cpf: z.string().optional(),
  email: z.string().optional(),
  empresa: z.string().optional(),
  centroCusto: z.string().optional(),
}).strict();

const schema = z.object({
  mudancas: z.array(z.object({
    funcionarioId: z.string().min(1),
    campos: camposSchema,
  })).min(1, "Nenhuma mudança selecionada"),
});

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

  let atualizados = 0; const erros = [];
  for (const m of parsed.data.mudancas) {
    const campos = Object.fromEntries(Object.entries(m.campos).filter(([, v]) => v !== undefined && v !== ""));
    if (Object.keys(campos).length === 0) continue;

    const antesFunc = await prisma.funcionario.findUnique({
      where: { id: m.funcionarioId },
      select: { id: true, nome: true, cpf: true, email: true, empresa: true, centroCusto: true, dataNascimento: true },
    });
    if (!antesFunc) { erros.push({ funcionarioId: m.funcionarioId, erro: "não encontrado" }); continue; }

    const data = {};
    const antes = {};
    for (const [campo, valor] of Object.entries(campos)) {
      antes[campo] = campo === "dataNascimento"
        ? (antesFunc.dataNascimento ? new Date(antesFunc.dataNascimento).toISOString().slice(0, 10) : null)
        : (antesFunc[campo] ?? null);
      data[campo] = campo === "dataNascimento" ? new Date(valor) : valor;
    }

    // CPF não pode colidir com outro funcionário
    if (data.cpf) {
      const dup = await prisma.funcionario.findFirst({ where: { cpf: data.cpf, NOT: { id: m.funcionarioId } }, select: { id: true } });
      if (dup) { erros.push({ funcionarioId: m.funcionarioId, erro: "CPF já usado por outro funcionário" }); continue; }
    }

    try {
      await prisma.funcionario.update({ where: { id: m.funcionarioId }, data });
      atualizados++;
      await prisma.auditLog.create({
        data: {
          userId: user.id, action: "RECONCILIAR_FUNCIONARIO", entity: "Funcionario", entityId: m.funcionarioId,
          diff: { antes, depois: campos },
        },
      }).catch(() => {});
    } catch (e) {
      erros.push({ funcionarioId: m.funcionarioId, erro: e.message?.slice(0, 120) });
    }
  }

  return NextResponse.json({ success: true, atualizados, erros });
}
