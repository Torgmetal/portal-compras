// GET/POST/DELETE /api/diretoria/conferencia — rastreabilidade e conferência dos
// lançamentos financeiros (a pagar / a receber). Lista cada título em aberto com
// a trilha completa (códigos Omie, NF, pedido, datas) + flags automáticas do que
// está suspeito, e permite marcar conferido/suspeito. Gate próprio (requireDiretoria).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const maxDuration = 30;

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const tem = (s) => !!(s && String(s).trim());

export async function GET(req) {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const tipo = new URL(req.url).searchParams.get("tipo") === "receber" ? "RECEBER" : "PAGAR";
  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const hoje = new Date(hojeIso + "T00:00:00.000Z");

  const confs = await prisma.lancamentoConferencia.findMany({ where: { tipo } });
  const confByLanc = new Map(confs.map((c) => [c.lancamentoId, c]));

  let brutos;
  if (tipo === "RECEBER") {
    const rows = await prisma.contaReceber.findMany({
      where: { saldo: { gt: 0 }, status: { not: "CANCELADO" } },
      select: { id: true, clienteNome: true, clienteCodigo: true, valor: true, valorRecebido: true, saldo: true, dataVencimento: true, dataEmissao: true, status: true, categoriaNome: true, categoriaCodigo: true, tipoDocumento: true, numeroDocumento: true, numeroDocFiscal: true, chaveNfe: true, numeroPedidoVenda: true, numeroOS: true, contaCorrenteId: true, syncedAt: true, dataAlteracaoOmie: true, detalheCarregado: true, observacao: true },
    });
    brutos = rows.map((c) => ({
      id: c.id, nome: c.clienteNome || "—", codParceiro: c.clienteCodigo || "",
      valor: r2(c.valor), saldo: r2(c.saldo),
      venc: c.dataVencimento, emissao: c.dataEmissao, status: c.status,
      categoriaNome: c.categoriaNome || "", categoriaCodigo: c.categoriaCodigo || "",
      tipoDoc: c.tipoDocumento || "", numeroDocumento: c.numeroDocumento || "", numeroDocFiscal: c.numeroDocFiscal || "",
      chaveNfe: c.chaveNfe || "", numeroPedido: c.numeroPedidoVenda || c.numeroOS || "",
      contaCorrenteId: c.contaCorrenteId || "", syncedAt: c.syncedAt, dataAlteracaoOmie: c.dataAlteracaoOmie,
      detalheCarregado: c.detalheCarregado, observacao: c.observacao || "",
    }));
  } else {
    const rows = await prisma.contaPagar.findMany({
      where: { status: { notIn: ["PAGO", "CANCELADO", "LIQUIDADO"] } },
      select: { id: true, fornecedorNome: true, fornecedorCodigo: true, valor: true, valorPago: true, dataVencimento: true, dataEmissao: true, status: true, categoriaNome: true, categoriaCodigo: true, tipoDocumento: true, numeroDocumento: true, numeroDocFiscal: true, chaveNfe: true, numeroPedidoCompra: true, contaCorrenteId: true, syncedAt: true, dataAlteracaoOmie: true, detalheCarregado: true, observacao: true },
    });
    brutos = rows.map((c) => ({
      id: c.id, nome: c.fornecedorNome || "—", codParceiro: c.fornecedorCodigo || "",
      valor: r2(c.valor), saldo: r2(Math.max(0, (c.valor || 0) - (c.valorPago || 0))),
      venc: c.dataVencimento, emissao: c.dataEmissao, status: c.status,
      categoriaNome: c.categoriaNome || "", categoriaCodigo: c.categoriaCodigo || "",
      tipoDoc: c.tipoDocumento || "", numeroDocumento: c.numeroDocumento || "", numeroDocFiscal: c.numeroDocFiscal || "",
      chaveNfe: c.chaveNfe || "", numeroPedido: c.numeroPedidoCompra || "",
      contaCorrenteId: c.contaCorrenteId || "", syncedAt: c.syncedAt, dataAlteracaoOmie: c.dataAlteracaoOmie,
      detalheCarregado: c.detalheCarregado, observacao: c.observacao || "",
    }));
  }

  // Grupos de duplicidade (mesmo parceiro + valor + vencimento)
  const grupos = new Map();
  for (const b of brutos) {
    const k = `${b.nome}|${b.valor.toFixed(2)}|${b.venc ? new Date(b.venc).toISOString().slice(0, 10) : "-"}`;
    grupos.set(k, (grupos.get(k) || 0) + 1);
  }

  const itens = brutos.map((b) => {
    const k = `${b.nome}|${b.valor.toFixed(2)}|${b.venc ? new Date(b.venc).toISOString().slice(0, 10) : "-"}`;
    const flags = [];
    if (!tem(b.categoriaNome)) flags.push("sem categoria");
    if (!tem(b.numeroDocFiscal) && !(b.chaveNfe && b.chaveNfe.length > 20)) flags.push("sem NF");
    if (!tem(b.numeroPedido) && !tem(b.numeroDocFiscal) && !(b.chaveNfe && b.chaveNfe.length > 20)) flags.push("sem vínculo");
    if (!b.detalheCarregado) flags.push("detalhe pendente");
    if ((grupos.get(k) || 0) > 1) flags.push("possível duplicado");
    if (b.dataAlteracaoOmie && b.syncedAt && new Date(b.dataAlteracaoOmie) > new Date(b.syncedAt)) flags.push("alterado após sync");
    const conf = confByLanc.get(b.id);
    return {
      ...b,
      vencido: b.venc ? new Date(b.venc) < hoje : false,
      flags, score: flags.length,
      situacao: conf?.situacao || null, conferenciaObs: conf?.observacao || "", conferenciaPor: conf?.por || "", conferenciaEm: conf?.em || null,
    };
  });

  // suspeitos manuais e mais sinalizados primeiro
  itens.sort((a, b) => {
    const sa = a.situacao === "SUSPEITO" ? 2 : a.situacao === "CONFERIDO" ? -1 : 0;
    const sb = b.situacao === "SUSPEITO" ? 2 : b.situacao === "CONFERIDO" ? -1 : 0;
    if (sb !== sa) return sb - sa;
    if (b.score !== a.score) return b.score - a.score;
    return b.saldo - a.saldo;
  });

  const resumo = {
    tipo, total: itens.length,
    saldoTotal: r2(itens.reduce((s, i) => s + i.saldo, 0)),
    conferidos: itens.filter((i) => i.situacao === "CONFERIDO").length,
    suspeitos: itens.filter((i) => i.situacao === "SUSPEITO").length,
    comFlag: itens.filter((i) => i.score > 0).length,
    saldoComFlag: r2(itens.filter((i) => i.score > 0).reduce((s, i) => s + i.saldo, 0)),
    semCategoria: r2(itens.filter((i) => i.flags.includes("sem categoria")).reduce((s, i) => s + i.saldo, 0)),
    duplicados: r2(itens.filter((i) => i.flags.includes("possível duplicado")).reduce((s, i) => s + i.saldo, 0)),
  };
  return NextResponse.json({ resumo, itens });
}

const bodySchema = z.object({
  tipo: z.enum(["pagar", "receber"]),
  lancamentoId: z.string().min(1),
  situacao: z.enum(["CONFERIDO", "SUSPEITO"]),
  observacao: z.string().max(500).optional().nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = bodySchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const tipo = body.tipo === "receber" ? "RECEBER" : "PAGAR";
  await prisma.lancamentoConferencia.upsert({
    where: { tipo_lancamentoId: { tipo, lancamentoId: body.lancamentoId } },
    create: { tipo, lancamentoId: body.lancamentoId, situacao: body.situacao, observacao: body.observacao || null, por: user.email },
    update: { situacao: body.situacao, observacao: body.observacao || null, por: user.email },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DIRETORIA_CONFERENCIA", entity: tipo === "PAGAR" ? "ContaPagar" : "ContaReceber", entityId: body.lancamentoId, diff: { situacao: body.situacao, observacao: body.observacao || null } } }).catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  let user;
  try { user = await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const sp = new URL(req.url).searchParams;
  const tipo = sp.get("tipo") === "receber" ? "RECEBER" : "PAGAR";
  const lancamentoId = sp.get("lancamentoId");
  if (!lancamentoId) return NextResponse.json({ error: "lancamentoId obrigatório" }, { status: 400 });

  await prisma.lancamentoConferencia.deleteMany({ where: { tipo, lancamentoId } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DIRETORIA_CONFERENCIA_LIMPAR", entity: tipo === "PAGAR" ? "ContaPagar" : "ContaReceber", entityId: lancamentoId } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
