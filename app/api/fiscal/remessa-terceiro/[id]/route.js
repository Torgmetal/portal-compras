// PATCH — registra/edita a NF de remessa de um romaneio a terceiro (aba Fiscal).
//   acao: "gerar_pedido_omie" (cria o Pedido de Venda RASCUNHO no Omie — Fase 2) |
//         "registrar" (nº/série/chave/CFOP → EMITIDA) | "dispensar" | "reabrir".
// "gerar_pedido_omie" só CRIA o pedido (não fatura); o Fiscal fatura no Omie.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarPedidoRemessa } from "@/lib/omie-remessa-industrializacao";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "FISCAL", "FINANCEIRO"];

const schema = z.object({
  acao: z.enum(["gerar_pedido_omie", "registrar", "dispensar", "reabrir"]),
  cfop: z.string().max(10).nullable().optional(),
  natureza: z.string().max(120).nullable().optional(),
  nfNumero: z.string().max(60).nullable().optional(),
  nfSerie: z.string().max(20).nullable().optional(),
  nfChave: z.string().max(60).nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const atual = await prisma.romaneioTerceiro.findUnique({ where: { id: params.id }, select: { id: true, numero: true, remessaStatus: true, remessaPedidoOmie: true } });
  if (!atual) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // ── Fase 2: cria o Pedido de Venda RASCUNHO no Omie (não fatura) ──
  if (body.acao === "gerar_pedido_omie") {
    if (atual.remessaStatus === "EMITIDA") return NextResponse.json({ error: "Remessa já emitida." }, { status: 400 });
    if (atual.remessaStatus === "DISPENSADA") return NextResponse.json({ error: "Remessa dispensada — reabra antes de gerar o pedido." }, { status: 400 });
    if (atual.remessaPedidoOmie) return NextResponse.json({ error: `Pedido já criado no Omie (código ${atual.remessaPedidoOmie}). Confira e fature lá.` }, { status: 400 });

    const rom = await prisma.romaneioTerceiro.findUnique({
      where: { id: atual.id },
      select: { id: true, numero: true, itens: true, opRefNumero: true, servico: true, fornecedorId: true },
    });
    const forn = rom.fornecedorId
      ? await prisma.fornecedor.findUnique({ where: { id: rom.fornecedorId }, select: { cnpj: true, uf: true, nCodOmie: true } })
      : null;
    if (!forn) return NextResponse.json({ error: "Terceiro sem cadastro de fornecedor vinculado — não dá pra localizar o cliente no Omie." }, { status: 400 });

    let resultado;
    try {
      resultado = await criarPedidoRemessa(rom, { cnpj: forn.cnpj, uf: forn.uf, nCodOmie: forn.nCodOmie });
    } catch (e) {
      return NextResponse.json({ error: `Falha ao criar pedido no Omie: ${e.message}` }, { status: 502 });
    }
    if (resultado.erro) return NextResponse.json({ error: resultado.erro }, { status: 400 });

    const upd = await prisma.romaneioTerceiro.update({
      where: { id: atual.id },
      data: {
        remessaStatus: "PEDIDO_CRIADO",
        remessaPedidoOmie: String(resultado.codigoPedido),
        remessaPedidoNumero: resultado.numeroPedido || null,
        remessaCfop: resultado.cfop || null,
        remessaNatureza: "Remessa para industrialização",
        remessaPorNome: user.name || null,
      },
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "REMESSA_TERCEIRO_GERAR_PEDIDO", entity: "RomaneioTerceiro", entityId: upd.id, diff: { numero: upd.numero, pedidoOmie: upd.remessaPedidoOmie, numeroPedido: upd.remessaPedidoNumero } } }).catch(() => {});
    return NextResponse.json({ success: true, remessaStatus: upd.remessaStatus, pedidoOmie: upd.remessaPedidoOmie, numeroPedido: upd.remessaPedidoNumero });
  }

  const data = {};
  if (body.acao === "registrar") {
    if (!body.nfNumero?.trim()) return NextResponse.json({ error: "Informe o número da NF." }, { status: 400 });
    data.remessaStatus = "EMITIDA";
    data.remessaNfNumero = body.nfNumero.trim();
    data.remessaNfSerie = body.nfSerie?.trim() || null;
    data.remessaNfChave = body.nfChave?.trim() || null;
    data.remessaCfop = body.cfop?.trim() || null;
    data.remessaNatureza = body.natureza?.trim() || null;
    data.remessaObservacao = body.observacao?.trim() || null;
    data.remessaNfEmitidaEm = new Date();
    data.remessaPorNome = user.name || null;
  } else if (body.acao === "dispensar") {
    data.remessaStatus = "DISPENSADA";
    data.remessaObservacao = body.observacao?.trim() || null;
    data.remessaPorNome = user.name || null;
  } else if (body.acao === "reabrir") {
    data.remessaStatus = "PENDENTE";
    data.remessaNfNumero = null; data.remessaNfSerie = null; data.remessaNfChave = null; data.remessaNfEmitidaEm = null;
  }

  const rom = await prisma.romaneioTerceiro.update({ where: { id: atual.id }, data });
  await prisma.auditLog.create({ data: { userId: user.id, action: "REMESSA_TERCEIRO_" + body.acao.toUpperCase(), entity: "RomaneioTerceiro", entityId: rom.id, diff: { numero: rom.numero, remessaStatus: rom.remessaStatus, nf: rom.remessaNfNumero } } }).catch(() => {});
  return NextResponse.json({ success: true, remessaStatus: rom.remessaStatus });
}
