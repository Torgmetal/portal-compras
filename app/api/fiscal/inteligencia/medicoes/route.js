import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";

// As medições do Omie que dá para validar ANTES de emitir.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const medicoes = await prisma.oPMedicao.findMany({
    where: { ultimoSync: { not: null } },
    orderBy: [{ ultimoSync: "desc" }],
    take: 120,
    select: {
      id: true, numeroPedidoOmie: true, descricao: true, data: true, valorBruto: true,
      qtdItens: true, tipoDocumento: true, status: true, ultimoSync: true,
      op: { select: { numero: true, cliente: true, clienteUF: true } },
    },
  });

  return NextResponse.json({
    success: true,
    medicoes: medicoes.map((m) => ({
      id: m.id, pedido: m.numeroPedidoOmie, descricao: m.descricao, data: m.data,
      valorBruto: m.valorBruto, qtdItens: m.qtdItens, tipoDocumento: m.tipoDocumento,
      status: m.status, sincronizadoEm: m.ultimoSync,
      op: m.op.numero, cliente: m.op.cliente, uf: m.op.clienteUF,
      // ⚠⚠ "NÃO FATURADO" É O QUE IMPORTA AQUI: é a janela em que o apontamento ainda evita o
      // erro em vez de documentá-lo. A tela destaca essas, mas não esconde as outras — auditar
      // uma já faturada continua valendo, só muda o que dá para fazer com o resultado.
      aindaNaoFaturada: !/faturad[oa]/i.test(m.status ?? "") || /n[ãa]o\s*faturad/i.test(m.status ?? ""),
    })),
  });
}
