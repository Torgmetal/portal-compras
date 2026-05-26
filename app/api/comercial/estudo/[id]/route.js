import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

// ── GET /api/comercial/estudo/[id] ── Detalhe do estudo ──

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const estudo = await prisma.propostaEstudo.findUnique({
      where: { id },
      include: {
        orcamento: {
          select: {
            numero: true, cliente: true, obra: true, vendedor: true,
            tipoVenda: true, status: true, porte: true, valor: true,
            responsavel: true, contato: true,
          },
        },
        criadoPor: { select: { name: true } },
        itensPerso: { orderBy: { ordem: "asc" } },
        itensAcessorio: { orderBy: { ordem: "asc" } },
        itensParafuso: { orderBy: { ordem: "asc" } },
        itensPintura: { orderBy: { ordem: "asc" } },
        itensCusto: { orderBy: [{ categoria: "asc" }, { ordem: "asc" }] },
        itensFaturamento: { orderBy: { ordem: "asc" } },
        itensCronograma: { orderBy: { ordem: "asc" } },
        documentos: { orderBy: { criadoEm: "desc" } },
      },
    });

    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: estudo });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── PATCH /api/comercial/estudo/[id] ── Atualizar estudo ──

const updateSchema = z.object({
  status: z.enum(["RASCUNHO", "EM_ANALISE", "APROVADO", "CONCLUIDO"]).optional(),
  referencia: z.string().optional(),
  sharepointUrl: z.string().optional(),
  observacoes: z.string().optional(),
  // Produtividade
  tipoObra: z.string().nullable().optional(),
  hhPorTon: z.number().min(0).nullable().optional(),
  custoMoKg: z.number().min(0).nullable().optional(),
  produtividadeMix: z.array(z.object({
    tipoObraId: z.string(),
    label: z.string(),
    grupo: z.string(),
    pesoKg: z.number(),
    hhTon: z.number(),
    elementosIdentificados: z.string().optional(),
  })).nullable().optional(),
  percPerda: z.number().min(0).max(100).optional(),
  percParafusos: z.number().min(0).optional(),
  percPesoParafusos: z.number().min(0).max(100).nullable().optional(),
  esquemaPintura: z.string().nullable().optional(),
  esquemaPinturaDesc: z.string().nullable().optional(),
  esquemaPinturaEspessura: z.number().min(0).nullable().optional(),
  // Pintura — calculo por area
  pinturaPercPerda: z.number().min(0).max(100).optional(),
  pinturaMetodo: z.enum(["M2", "LITRO", "KG"]).optional(),
  pinturaCustoM2: z.number().min(0).nullable().optional(),
  pinturaRendimento: z.number().min(0).nullable().optional(),
  pinturaCustoLitro: z.number().min(0).nullable().optional(),
  custoPinturaKg: z.number().min(0).optional(),
  custoAuxiliarKg: z.number().min(0).optional(),
  custoFinanceiroKg: z.number().min(0).optional(),
  custoDemaisKg: z.number().min(0).optional(),
  // Créditos tributários
  percCreditoICMS: z.number().min(0).max(100).optional(),
  percCreditoPIS: z.number().min(0).max(100).optional(),
  percCreditoCOFINS: z.number().min(0).max(100).optional(),
  creditoConfirmado: z.boolean().optional(),
  cfopPrincipal: z.string().nullable().optional(),
  bdiAdmin: z.number().min(0).optional(),
  bdiSeguro: z.number().min(0).optional(),
  bdiRisco: z.number().min(0).optional(),
  bdiFactoring: z.number().min(0).optional(),
  bdiLucro: z.number().min(0).optional(),
  bdiComissao: z.number().min(0).optional(),
  aliqPIS: z.number().min(0).optional(),
  aliqCOFINS: z.number().min(0).optional(),
  aliqCSLL: z.number().min(0).optional(),
  aliqIRPJ: z.number().min(0).optional(),
  aliqICMS: z.number().min(0).optional(),
  aliqISS: z.number().min(0).optional(),
  // Totais recalculados pelo front
  pesoTotal: z.number().optional(),
  areaTotal: z.number().optional(),
  custoMaterial: z.number().optional(),
  custoFabricacao: z.number().optional(),
  custoMontagem: z.number().optional(),
  custoTerceiros: z.number().optional(),
  bdiValor: z.number().optional(),
  valorTotal: z.number().optional(),
}).strict();

export async function PATCH(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const data = updateSchema.parse(body);

    const antes = await prisma.propostaEstudo.findUnique({ where: { id } });
    if (!antes) {
      return NextResponse.json({ success: false, error: "Estudo não encontrado" }, { status: 404 });
    }

    const estudo = await prisma.propostaEstudo.update({
      where: { id },
      data,
      include: {
        orcamento: { select: { numero: true, cliente: true } },
      },
    });

    // Se status mudou para CONCLUIDO, atualizar valor no Orcamento
    if (data.status === "CONCLUIDO" && data.valorTotal) {
      await prisma.orcamento.update({
        where: { id: estudo.orcamentoId },
        data: { valor: data.valorTotal },
      });
    }

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "ATUALIZAR_ESTUDO",
        entity: "PropostaEstudo",
        entityId: id,
        diff: { antes: { status: antes.status }, depois: data },
      },
    });

    return NextResponse.json({ success: true, data: estudo });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── DELETE /api/comercial/estudo/[id] ── Excluir estudo ──

export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id } = await params;

    const estudo = await prisma.propostaEstudo.findUnique({
      where: { id },
      include: { orcamento: { select: { numero: true } } },
    });
    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo não encontrado" }, { status: 404 });
    }

    await prisma.propostaEstudo.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_ESTUDO",
        entity: "PropostaEstudo",
        entityId: id,
        diff: { orcamento: estudo.orcamento.numero, revisao: estudo.revisao },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
