// Previsão de faturamento por CARGA (fluxo de caixa).
// Cada carga programada (PlanejamentoCarga) tem data prevista e peso (real do romaneio
// quando existe, senão estimado dos itens). Valor previsto = peso × R$/kg da OP
// (OP.valorFaturarPorKg, definido pelo Comercial). Sem R$/kg ou sem peso → fica EM ABERTO.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "FINANCEIRO", "COMERCIAL"];

// Situação da carga (precedência): Cancelada → Emitida → Alterada → Atrasada → Confirmada → Pendente.
// Automáticos: Emitida (romaneio saiu), Alterada (data mudou), Atrasada (venceu sem romaneio).
// Manuais: Confirmada, Cancelada (situacao). Pendente é o padrão.
function statusCarga(c, now) {
  if (c.situacao === "CANCELADA") return { key: "CANCELADA", label: "Cancelada" };
  if (c.romaneio) return { key: "EMITIDA", label: "Emitida" };
  const ini = c.dataOriginal ? new Date(c.dataOriginal).getTime() : null;
  const atual = c.dataPrevista ? new Date(c.dataPrevista).getTime() : null;
  if (ini && atual && ini !== atual) return { key: "ALTERADA", label: "Alterada", dataOriginal: c.dataOriginal };
  if (atual && atual < now.getTime()) return { key: "ATRASADA", label: "Atrasada" };
  if (c.situacao === "CONFIRMADA") return { key: "CONFIRMADA", label: "Confirmada" };
  return { key: "PENDENTE", label: "Pendente" };
}

export async function GET() {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const cargas = await prisma.planejamentoCarga.findMany({
    orderBy: { dataPrevista: "asc" },
    select: {
      id: true, opId: true, dataPrevista: true, dataOriginal: true, situacao: true, status: true, descricao: true, romaneioId: true,
      itens: { select: { pesoEstimadoKg: true } },
      romaneio: { select: { pesoRealKg: true, data: true } },
    },
  });

  const opIds = [...new Set(cargas.map((c) => c.opId).filter(Boolean))];
  const opsCarga = opIds.length
    ? await prisma.oP.findMany({ where: { id: { in: opIds } }, select: { id: true, numero: true, obra: true, cliente: true, valorFaturarPorKg: true } })
    : [];
  const opMap = new Map(opsCarga.map((o) => [o.id, o]));

  const now = new Date();
  const todas = cargas.map((c) => {
    const op = opMap.get(c.opId);
    const temRomaneio = !!c.romaneio;
    const peso = temRomaneio ? (c.romaneio.pesoRealKg || 0) : c.itens.reduce((a, i) => a + (i.pesoEstimadoKg || 0), 0);
    const rsKg = op?.valorFaturarPorKg ?? null;
    const valor = peso > 0 && rsKg ? Math.round(peso * rsKg) : null;
    const dataBase = temRomaneio && c.romaneio.data ? c.romaneio.data : c.dataPrevista;
    const s = statusCarga(c, now);
    return {
      id: c.id, opNumero: op?.numero || null, obra: op?.obra || null, cliente: op?.cliente || null,
      data: dataBase ? dataBase.toISOString() : null,
      dataOriginal: s.dataOriginal ? new Date(s.dataOriginal).toISOString() : null,
      peso: Math.round(peso), fonte: temRomaneio ? "real" : "estimado", rsKg, valor,
      situacao: s.key, situacaoLabel: s.label, descricao: c.descricao || null,
    };
  });
  // Canceladas não entram na previsão (mas ficam registradas).
  const linhas = todas.filter((l) => l.situacao !== "CANCELADA");
  const canceladas = todas.filter((l) => l.situacao === "CANCELADA");

  // Fluxo mensal.
  const mesMap = new Map();
  for (const l of linhas) {
    if (!l.data) continue;
    const mes = l.data.slice(0, 7);
    const m = mesMap.get(mes) || { mes, valor: 0, valorReal: 0, valorEstimado: 0, nCargas: 0, nAberto: 0 };
    m.nCargas++;
    if (l.valor != null) { m.valor += l.valor; if (l.fonte === "real") m.valorReal += l.valor; else m.valorEstimado += l.valor; }
    else m.nAberto++;
    mesMap.set(mes, m);
  }
  const porMes = [...mesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes));

  // OPs ativas (pra painel de R$/kg — Comercial preenche mesmo antes de ter carga).
  // Contrato "efetivo": explícito (OP.valorTotalContrato) ou implícito (Σ receita) quando nulo.
  const opsRaw = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] } },
    select: { id: true, numero: true, obra: true, cliente: true, valorTotalContrato: true, valorFaturarPorKg: true, receitas: { select: { valor: true } } },
    orderBy: { numero: "asc" },
  });
  const ops = opsRaw.map((o) => {
    const receita = o.receitas.reduce((a, r) => a + (r.valor || 0), 0);
    const contrato = o.valorTotalContrato != null ? o.valorTotalContrato : (receita > 0 ? Math.round(receita) : null);
    return { id: o.id, numero: o.numero, obra: o.obra, cliente: o.cliente, valorTotalContrato: contrato, contratoAuto: o.valorTotalContrato == null && receita > 0, valorFaturarPorKg: o.valorFaturarPorKg };
  });

  const totalPrevisto = linhas.reduce((a, l) => a + (l.valor || 0), 0);
  const totalReal = linhas.filter((l) => l.fonte === "real").reduce((a, l) => a + (l.valor || 0), 0);
  const nAberto = linhas.filter((l) => l.valor == null).length;

  return NextResponse.json({ cargas: linhas, canceladas, porMes, ops, totalPrevisto, totalReal, nAberto, geradoEm: new Date().toISOString() });
}

// Comercial define o R$/kg a faturar da OP.
export async function PATCH(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opId, valorFaturarPorKg } = await req.json().catch(() => ({}));
  if (!opId) return NextResponse.json({ error: "opId obrigatório" }, { status: 400 });
  const v = valorFaturarPorKg === null || valorFaturarPorKg === "" ? null : Number(valorFaturarPorKg);
  if (v != null && (Number.isNaN(v) || v < 0)) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });

  await prisma.oP.update({ where: { id: opId }, data: { valorFaturarPorKg: v } });
  return NextResponse.json({ ok: true, valorFaturarPorKg: v });
}
