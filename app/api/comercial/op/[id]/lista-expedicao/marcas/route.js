// GET — marcas de todas as frentes da OP, para EXPORTAR a lista de expedição.
// Só é chamado no clique do "Exportar" (o payload é grande: uma frente pode ter
// milhares de marcas), por isso fica fora do GET do resumo.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, obra: true, cliente: true, refCliente: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const listas = await prisma.listaExpedicao.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: op.numero }] },
    orderBy: { frente: "asc" },
    select: { frente: true, arquivo: true, revisao: true, pesoContratado: true, pesoExpedido: true, marcasJson: true },
  });

  const frentes = listas.map((l) => ({
    frente: l.frente,
    arquivo: l.arquivo,
    revisao: l.revisao,
    pesoContratado: l.pesoContratado,
    pesoExpedido: l.pesoExpedido,
    marcas: (Array.isArray(l.marcasJson) ? l.marcasJson : []).map((m) => ({
      marca: m.marca,
      descricao: m.descricao || "",
      qte: m.qte ?? null,
      pesoUnit: m.pesoUnit ?? null,
      pesoTotal: m.pesoTotal ?? 0,
      // expedido = romaneio emitido (fonte principal) ou, na falta, a coluna
      // "Marca (Expedido)" do próprio arquivo. null = sem informação.
      expedido: m.expedidoRomaneio ?? (m.expedidoArquivo === true ? true : m.expedidoArquivo === false ? false : null),
      origemExpedido: m.expedidoRomaneio != null ? "romaneio" : m.expedidoArquivo != null ? "arquivo" : null,
    })),
  }));

  return NextResponse.json({ success: true, op: { numero: op.numero, obra: op.obra, cliente: op.cliente, refCliente: op.refCliente }, frentes });
}
