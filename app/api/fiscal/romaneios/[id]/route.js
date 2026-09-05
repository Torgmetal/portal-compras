// PATCH — NF de um romaneio de cliente emitido (aba Fiscal → Romaneios / NF).
//   Registro MANUAL: { nfNumero, nfTipo, nfObservacao } (fluxo antigo, mantido).
//   Emissão INTEGRADA (NF Remessa, mesmo fluxo da Remessa Terceiro):
//     acao: "gerar_remessa_omie" | "conferir_omie" | "emitir_omie" | "atualizar_status".
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarPedidoRemessa, conferirRemessaOmie, concluirRemessaOmie, statusNfDaRemessa } from "@/lib/omie-remessa-industrializacao";

export const runtime = "nodejs";
export const maxDuration = 120; // emitir espera a autorização do SEFAZ
const ROLES = ["ADMIN", "FISCAL", "FINANCEIRO"];

const freteSchema = z.object({
  tpFrete: z.string().max(1).optional(), nCodTransp: z.number().int().positive().nullable().optional(),
  transpNome: z.string().max(120).nullable().optional(), placa: z.string().max(10).nullable().optional(),
  uf: z.string().max(2).nullable().optional(), qtdVol: z.number().nonnegative().nullable().optional(),
  especie: z.string().max(60).nullable().optional(), pesoLiq: z.number().nonnegative().nullable().optional(),
  pesoBruto: z.number().nonnegative().nullable().optional(), valorFrete: z.number().nonnegative().nullable().optional(),
  valorSeguro: z.number().nonnegative().nullable().optional(), valorOutras: z.number().nonnegative().nullable().optional(),
}).strict().optional();

const schema = z.object({
  acao: z.enum(["gerar_remessa_omie", "conferir_omie", "emitir_omie", "atualizar_status"]).optional(),
  cfop: z.string().max(10).nullable().optional(),
  frete: freteSchema,
  valorKg: z.number().positive().nullable().optional(), // valor R$/kg da remessa (ARM000001)
  infoAdic: z.string().max(500).nullable().optional(), // Informações Adicionais da NF
  // registro manual (fluxo antigo)
  nfNumero: z.string().max(60).nullable().optional(),
  nfTipo: z.enum(["VENDA", "SERVICO", "REMESSA"]).nullable().optional(),
  nfObservacao: z.string().max(1000).nullable().optional(),
});

// GET — detalhe do romaneio p/ o modal Faturar (itens, cliente, estado da NF/Omie).
export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const r = await prisma.romaneioPrevio.findUnique({
    where: { id: params.id },
    select: {
      id: true, numero: true, opNumero: true, pesoKg: true, itens: true,
      nfNumero: true, nfTipo: true, nfPedidoOmie: true, nfPedidoNumero: true, nfChave: true, nfErroEmissao: true, nfFrete: true, nfObservacao: true,
      op: { select: { numero: true, obra: true, cliente: true, clienteCnpj: true, clienteUF: true } },
    },
  });
  if (!r) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });
  const itens = (Array.isArray(r.itens) ? r.itens : []).map((it) => ({
    marca: it.marca || null, descricao: it.descricao || null, frente: it.frente || null,
    qte: Number(it.qte || 0) || 0, pesoTotal: Number(it.pesoTotal || 0) || 0,
  }));
  return NextResponse.json({ success: true, romaneio: { ...r, itens } });
}

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const previo = await prisma.romaneioPrevio.findUnique({
    where: { id: params.id },
    select: {
      id: true, numero: true, opNumero: true, emitidoEm: true, itens: true,
      nfNumero: true, nfTipo: true, nfEmitidaEm: true, nfPedidoOmie: true, nfPedidoNumero: true, nfFrete: true,
      op: { select: { numero: true, obra: true, cliente: true, clienteCnpj: true, clienteUF: true } },
    },
  });
  if (!previo) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });
  if (!previo.emitidoEm) return NextResponse.json({ error: "Romaneio ainda não foi emitido." }, { status: 400 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // ── Emissão integrada (NF Remessa) ──
  if (body.acao === "gerar_remessa_omie") {
    if (previo.nfNumero) return NextResponse.json({ error: "Romaneio já tem NF." }, { status: 400 });
    if (previo.nfPedidoOmie) return NextResponse.json({ error: `Remessa já criada no Omie (nº ${previo.nfPedidoNumero || previo.nfPedidoOmie}).` }, { status: 400 });
    const marcas = Array.isArray(previo.itens) ? previo.itens : [];
    if (marcas.length === 0) return NextResponse.json({ error: "Romaneio sem itens." }, { status: 400 });
    if (!previo.op?.clienteCnpj) return NextResponse.json({ error: "OP sem CNPJ do cliente — não dá pra localizar no Omie." }, { status: 400 });

    const cli = { cnpj: previo.op.clienteCnpj, uf: previo.op.clienteUF };
    const romAdapt = {
      numero: `${previo.opNumero}-R${previo.numero}`, itens: marcas, materiais: [],
      opRefNumero: previo.op.numero, servico: previo.op.obra || null,
      remessaCfop: body.cfop || null, // o Fiscal escolhe o CFOP da remessa ao cliente
    };
    let resultado;
    try { resultado = await criarPedidoRemessa(romAdapt, cli, { frete: body.frete || null, valorKg: body.valorKg || null, infoAdic: body.infoAdic || null }); }
    catch (e) { return NextResponse.json({ error: `Falha ao criar remessa no Omie: ${e.message}` }, { status: 502 }); }
    if (resultado.erro) return NextResponse.json({ error: resultado.erro }, { status: 400 });

    await prisma.romaneioPrevio.update({ where: { id: previo.id }, data: {
      nfTipo: "REMESSA", nfPedidoOmie: String(resultado.codigoPedido), nfPedidoNumero: resultado.numeroPedido || null,
      nfFrete: body.frete || undefined, nfErroEmissao: null,
    } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "FISCAL_REMESSA_GERAR", entity: "RomaneioPrevio", entityId: previo.id, diff: { pedidoOmie: resultado.codigoPedido, numero: resultado.numeroPedido } } }).catch(() => {});
    return NextResponse.json({ success: true, pedidoOmie: resultado.codigoPedido, numeroPedido: resultado.numeroPedido });
  }

  if (body.acao === "conferir_omie") {
    if (!previo.nfPedidoOmie) return NextResponse.json({ error: "Gere a remessa no Omie antes de conferir." }, { status: 400 });
    const r = await conferirRemessaOmie(previo.nfPedidoOmie);
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
    return NextResponse.json({ success: true, mensagem: r.mensagem });
  }

  if (body.acao === "emitir_omie") {
    if (previo.nfNumero) return NextResponse.json({ error: "Romaneio já tem NF." }, { status: 400 });
    if (!previo.nfPedidoOmie) return NextResponse.json({ error: "Gere a remessa no Omie antes de emitir." }, { status: 400 });
    const r = await concluirRemessaOmie(previo.nfPedidoOmie);
    if (!r.ok) {
      await prisma.romaneioPrevio.update({ where: { id: previo.id }, data: { nfErroEmissao: (r.erro || "Falha na emissão").substring(0, 900) } }).catch(() => {});
      return NextResponse.json({ error: r.erro, pendente: !!r.pendente }, { status: 502 });
    }
    await prisma.romaneioPrevio.update({ where: { id: previo.id }, data: {
      nfNumero: r.nf?.numero || null, nfSerie: r.nf?.serie || null, nfChave: r.nf?.chave || null,
      nfTipo: "REMESSA", nfEmitidaEm: new Date(), nfRegistradoPorId: user.id, nfErroEmissao: null,
    } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "FISCAL_REMESSA_EMITIR", entity: "RomaneioPrevio", entityId: previo.id, diff: { nf: r.nf } } }).catch(() => {});
    return NextResponse.json({ success: true, nf: r.nf });
  }

  if (body.acao === "atualizar_status") {
    if (!previo.nfPedidoOmie) return NextResponse.json({ error: "Remessa ainda não gerada no Omie." }, { status: 400 });
    const s = await statusNfDaRemessa(previo.nfPedidoOmie);
    if (s.estado === "AUTORIZADA") {
      await prisma.romaneioPrevio.update({ where: { id: previo.id }, data: {
        nfNumero: s.nf?.numero || null, nfSerie: s.nf?.serie || null, nfChave: s.nf?.chave || null,
        nfTipo: "REMESSA", nfEmitidaEm: new Date(), nfRegistradoPorId: user.id, nfErroEmissao: null,
      } }).catch(() => {});
      return NextResponse.json({ success: true, estado: "AUTORIZADA", nf: s.nf });
    }
    return NextResponse.json({ success: true, estado: s.estado });
  }

  // ── Registro MANUAL (fluxo antigo) ──
  const data = {};
  if (body.nfNumero !== undefined) data.nfNumero = body.nfNumero?.trim() || null;
  if (body.nfTipo !== undefined) data.nfTipo = body.nfTipo || null;
  if (body.nfObservacao !== undefined) data.nfObservacao = body.nfObservacao?.trim() || null;

  const numeroFinal = "nfNumero" in data ? data.nfNumero : previo.nfNumero;
  const tipoFinal = "nfTipo" in data ? data.nfTipo : previo.nfTipo;
  const completo = !!(numeroFinal && tipoFinal);
  if (completo && !previo.nfEmitidaEm) { data.nfEmitidaEm = new Date(); data.nfRegistradoPorId = user.id; }
  if (!completo && previo.nfEmitidaEm) { data.nfEmitidaEm = null; data.nfRegistradoPorId = null; }

  const atualizado = await prisma.romaneioPrevio.update({ where: { id: previo.id }, data });
  await prisma.auditLog.create({ data: { userId: user.id, action: completo ? "FISCAL_NF_REGISTRADA" : "FISCAL_NF_EDITADA", entity: "RomaneioPrevio", entityId: previo.id, diff: { nfNumero: numeroFinal, nfTipo: tipoFinal } } }).catch(() => {});
  return NextResponse.json({ success: true, romaneio: { ...atualizado, finalizado: completo } });
}
