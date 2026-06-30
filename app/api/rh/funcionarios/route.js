import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { syncContratacao } from "@/lib/sharepoint-rh";

const funcionarioSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  cpf: z.string().optional().nullable(),
  pis: z.string().optional().nullable(),
  empresa: z.string().optional().nullable(),
  banco: z.string().optional().nullable(),
  agencia: z.string().optional().nullable(),
  conta: z.string().optional().nullable(),
  pixChave: z.string().optional().nullable(),
  rg: z.string().optional().nullable(),
  dataNascimento: z.string().optional().nullable(),
  email: z.string().email("Email inválido").optional().nullable(),
  telefone: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  cidadeUF: z.string().optional().nullable(),
  matricula: z.string().optional().nullable(),
  dataAdmissao: z.string().min(1, "Data de admissão obrigatória"),
  setorId: z.string().min(1, "Setor obrigatório"),
  cargoId: z.string().min(1, "Cargo obrigatório"),
  salario: z.number().optional().nullable(),
  tipoContrato: z.enum(["CLT", "PJ", "ESTAGIO", "JOVEM_APRENDIZ", "TEMPORARIO"]).default("CLT"),
  jornadaHoras: z.number().int().default(44),
  turno: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

// GET — Lista funcionários
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);

    const { searchParams } = new URL(req.url);
    const busca = searchParams.get("busca")?.trim();
    const setorId = searchParams.get("setorId");
    const status = searchParams.get("status");
    const ativo = searchParams.get("ativo");

    const where = {};
    if (ativo !== "todos" && ativo !== "false") where.ativo = true;
    if (ativo === "false") where.ativo = false;
    if (setorId) where.setorId = setorId;
    if (status) where.status = status;
    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: "insensitive" } },
        { cpf: { contains: busca, mode: "insensitive" } },
        { matricula: { contains: busca, mode: "insensitive" } },
        { email: { contains: busca, mode: "insensitive" } },
      ];
    }

    const funcionarios = await prisma.funcionario.findMany({
      where,
      select: {
        id: true,
        nome: true,
        cpf: true,
        pis: true,
        empresa: true,
        matricula: true,
        email: true,
        telefone: true,
        dataAdmissao: true,
        dataDemissao: true,
        salario: true,
        tipoContrato: true,
        status: true,
        ativo: true,
        foto: true,
        setor: { select: { id: true, nome: true, sigla: true } },
        cargo: { select: { id: true, nome: true, nivel: true } },
      },
      orderBy: { nome: "asc" },
      take: 500,
    });

    return NextResponse.json({ success: true, data: funcionarios });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// POST — Criar funcionário
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const body = await req.json();

    const parsed = funcionarioSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Verificar duplicatas
    if (data.cpf) {
      const existe = await prisma.funcionario.findFirst({ where: { cpf: data.cpf } });
      if (existe) {
        return NextResponse.json({ success: false, error: "CPF já cadastrado" }, { status: 409 });
      }
    }
    if (data.matricula) {
      const existe = await prisma.funcionario.findFirst({ where: { matricula: data.matricula } });
      if (existe) {
        return NextResponse.json({ success: false, error: "Matrícula já cadastrada" }, { status: 409 });
      }
    }

    const funcionario = await prisma.funcionario.create({
      data: {
        ...data,
        dataAdmissao: new Date(data.dataAdmissao),
        dataNascimento: data.dataNascimento ? new Date(data.dataNascimento) : null,
        salario: data.salario || null,
      },
      include: {
        cargo: { select: { id: true, nome: true } },
        setor: { select: { id: true, nome: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CRIAR_FUNCIONARIO",
        entity: "Funcionario",
        entityId: funcionario.id,
        diff: { nome: data.nome, setor: data.setorId, cargo: data.cargoId },
      },
    });

    // Sincronizar com planilha SharePoint (fire-and-forget)
    syncContratacao(funcionario).catch(() => {});

    return NextResponse.json({ success: true, data: funcionario }, { status: 201 });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
