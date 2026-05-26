import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { matchItensComOmie } from "@/lib/match-omie";

// POST /api/comercial/estudo/[id]/rematch
// Re-vincula itens existentes com o cadastro Omie (atualiza codigoOmie, descricaoOmie, custoUnitario)

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    // Buscar todos os itens do estudo
    const itens = await prisma.pesoProjetoItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    if (itens.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nenhum item encontrado para re-vincular" },
        { status: 404 }
      );
    }

    // Preparar itens no formato esperado pelo matchItensComOmie
    const itensParaMatch = itens.map((item) => ({
      descricao: item.descricao,
      tipoMaterial: item.tipoMaterial,
      norma: item.norma,
    }));

    // Executar matching
    const matched = await matchItensComOmie(itensParaMatch);

    // Atualizar cada item no banco
    let vinculados = 0;
    let atualizados = 0;

    const updates = itens.map((item, idx) => {
      const match = matched[idx];
      const data = {
        codigoOmie: match.codigoOmie || null,
        descricaoOmie: match.descricaoOmie || null,
        custoUnitario: match.custoUnitario || null,
      };

      if (match.codigoOmie) vinculados++;
      if (data.custoUnitario > 0) atualizados++;

      return prisma.pesoProjetoItem.update({
        where: { id: item.id },
        data,
      });
    });

    await prisma.$transaction(updates);

    // Log
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "REMATCH_OMIE",
        entity: "PropostaEstudo",
        entityId: id,
        diff: {
          totalItens: itens.length,
          vinculados,
          comCusto: atualizados,
        },
      },
    });

    // Retornar itens atualizados
    const itensAtualizados = await prisma.pesoProjetoItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        itens: itensAtualizados,
        vinculados,
        comCusto: atualizados,
        total: itens.length,
      },
    });
  } catch (e) {
    console.error("Erro no rematch Omie:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
