import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { syncAjuste } from "@/lib/sharepoint-rh";

const ajusteSchema = z.object({
  tipo: z.enum(["PROMOCAO", "TRANSFERENCIA", "ALTERACAO_SALARIAL", "CORRECAO"], {
    message: "Tipo de ajuste inválido",
  }),
  cargoId: z.string().optional().nullable(),
  setorId: z.string().optional().nullable(),
  salario: z.number().optional().nullable(),
  tipoContrato: z.string().optional().nullable(),
  turno: z.string().optional().nullable(),
  dataEfetivacao: z.string().min(1, "Data de efetivação obrigatória"),
  motivo: z.string().optional().nullable(),
});

// POST — Registrar ajuste (promoção, transferência, alteração salarial)
export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const { id } = await params;
    const body = await req.json();

    const parsed = ajusteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Buscar funcionário atual
    const atual = await prisma.funcionario.findUnique({
      where: { id },
      include: {
        cargo: { select: { id: true, nome: true } },
        setor: { select: { id: true, nome: true } },
      },
    });
    if (!atual) {
      return NextResponse.json({ success: false, error: "Funcionário não encontrado" }, { status: 404 });
    }
    if (atual.status === "DEMITIDO") {
      return NextResponse.json({ success: false, error: "Funcionário já desligado" }, { status: 400 });
    }

    // Montar diff (antes/depois)
    const antes = {};
    const depois = {};
    const updateData = {};

    if (data.cargoId && data.cargoId !== atual.cargoId) {
      antes.cargoId = atual.cargoId;
      antes.cargo = atual.cargo?.nome;
      depois.cargoId = data.cargoId;
      updateData.cargoId = data.cargoId;
    }

    if (data.setorId && data.setorId !== atual.setorId) {
      antes.setorId = atual.setorId;
      antes.setor = atual.setor?.nome;
      depois.setorId = data.setorId;
      updateData.setorId = data.setorId;
    }

    if (data.salario != null && data.salario !== (atual.salario ? Number(atual.salario) : null)) {
      antes.salario = atual.salario ? Number(atual.salario) : null;
      depois.salario = data.salario;
      updateData.salario = data.salario;
    }

    if (data.tipoContrato && data.tipoContrato !== atual.tipoContrato) {
      antes.tipoContrato = atual.tipoContrato;
      depois.tipoContrato = data.tipoContrato;
      updateData.tipoContrato = data.tipoContrato;
    }

    if (data.turno !== undefined && data.turno !== atual.turno) {
      antes.turno = atual.turno;
      depois.turno = data.turno;
      updateData.turno = data.turno || null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "Nenhuma alteração detectada" },
        { status: 400 }
      );
    }

    // Buscar nomes para o diff legível
    if (depois.cargoId) {
      const novoCargo = await prisma.cargo.findUnique({ where: { id: depois.cargoId }, select: { nome: true } });
      depois.cargo = novoCargo?.nome;
    }
    if (depois.setorId) {
      const novoSetor = await prisma.setor.findUnique({ where: { id: depois.setorId }, select: { nome: true } });
      depois.setor = novoSetor?.nome;
    }

    // Atualizar funcionário
    const funcionario = await prisma.funcionario.update({
      where: { id },
      data: updateData,
      include: {
        cargo: { select: { id: true, nome: true } },
        setor: { select: { id: true, nome: true } },
      },
    });

    // AuditLog com diff completo
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: `AJUSTE_${data.tipo}`,
          entity: "Funcionario",
          entityId: id,
          diff: {
            tipo: data.tipo,
            dataEfetivacao: data.dataEfetivacao,
            motivo: data.motivo || null,
            antes,
            depois,
          },
        },
      });
    } catch (_) {}

    // Sincronizar com planilha SharePoint (fire-and-forget)
    syncAjuste(funcionario, antes, depois, data.motivo).catch(() => {});

    return NextResponse.json({ success: true, data: funcionario });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
