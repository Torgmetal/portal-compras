// GET   /api/rh/funcionarios/[id] — detalhe completo (p/ abrir a edição)
// PATCH /api/rh/funcionarios/[id] — edita os dados cadastrais do funcionário
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  cpf: z.string().optional().nullable(),
  rg: z.string().optional().nullable(),
  dataNascimento: z.string().optional().nullable(),
  email: z.union([z.string().email("Email inválido"), z.literal(""), z.null()]).optional(),
  telefone: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  cidadeUF: z.string().optional().nullable(),
  matricula: z.string().optional().nullable(),
  dataAdmissao: z.string().min(1, "Data de admissão obrigatória"),
  setorId: z.string().min(1, "Setor obrigatório"),
  cargoId: z.string().min(1, "Cargo obrigatório"),
  salario: z.number().optional().nullable(),
  tipoContrato: z.enum(["CLT", "PJ", "ESTAGIO", "JOVEM_APRENDIZ", "TEMPORARIO"]).optional(),
  jornadaHoras: z.number().int().optional(),
  turno: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

export async function GET(_req, { params }) {
  try {
    await requireRole(["ADMIN", "RH"]);
    const f = await prisma.funcionario.findUnique({
      where: { id: params.id },
      include: { setor: { select: { id: true, nome: true } }, cargo: { select: { id: true, nome: true } } },
    });
    if (!f) return NextResponse.json({ success: false, error: "Funcionário não encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: f });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

export async function PATCH(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });
    }
    const data = parsed.data;

    const atual = await prisma.funcionario.findUnique({ where: { id: params.id }, select: { id: true, dataAdmissao: true, matricula: true, cpf: true } });
    if (!atual) return NextResponse.json({ success: false, error: "Funcionário não encontrado" }, { status: 404 });

    // Duplicatas (ignorando o próprio)
    if (data.cpf) {
      const dup = await prisma.funcionario.findFirst({ where: { cpf: data.cpf, NOT: { id: params.id } } });
      if (dup) return NextResponse.json({ success: false, error: "CPF já cadastrado em outro funcionário" }, { status: 409 });
    }
    if (data.matricula) {
      const dup = await prisma.funcionario.findFirst({ where: { matricula: data.matricula, NOT: { id: params.id } } });
      if (dup) return NextResponse.json({ success: false, error: "Matrícula já cadastrada em outro funcionário" }, { status: 409 });
    }

    const funcionario = await prisma.funcionario.update({
      where: { id: params.id },
      data: {
        nome: data.nome,
        cpf: data.cpf || null,
        rg: data.rg || null,
        // datas date-only → UTC meia-noite (evita deslocar 1 dia no fuso BR)
        dataNascimento: data.dataNascimento ? new Date(data.dataNascimento) : null,
        dataAdmissao: new Date(data.dataAdmissao),
        email: data.email || null,
        telefone: data.telefone || null,
        endereco: data.endereco || null,
        cidadeUF: data.cidadeUF || null,
        matricula: data.matricula || null,
        setorId: data.setorId,
        cargoId: data.cargoId,
        salario: data.salario ?? null,
        ...(data.tipoContrato ? { tipoContrato: data.tipoContrato } : {}),
        ...(data.jornadaHoras ? { jornadaHoras: data.jornadaHoras } : {}),
        turno: data.turno || null,
        observacao: data.observacao || null,
      },
      include: { setor: { select: { id: true, nome: true, sigla: true } }, cargo: { select: { id: true, nome: true, nivel: true } } },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "EDITAR_FUNCIONARIO", entity: "Funcionario", entityId: params.id,
        diff: { dataAdmissaoAntes: atual.dataAdmissao, dataAdmissaoDepois: funcionario.dataAdmissao },
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: funcionario });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
