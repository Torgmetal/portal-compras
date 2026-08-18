// GET — fila de REMESSAS a TERCEIRO (NF de remessa p/ industrialização), aba
// "Remessa Terceiro" do Fiscal. Cada RomaneioTerceiro pré-cria uma remessa
// PENDENTE; aqui o Fiscal emite/registra a NF. Emissão integrada com Omie = Fase 2.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "FISCAL", "FINANCEIRO"];
const UF_TORG = "SP"; // Torg fica em Conchal-SP: dentro do estado = 5901, fora = 6901

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const status = new URL(req.url).searchParams.get("status") || "todos"; // pendente | emitida | todos
  const where = { status: { not: "CANCELADO" }, remessaStatus: { not: "DISPENSADA" } };
  if (status === "pendente") where.remessaStatus = "PENDENTE";
  else if (status === "emitida") where.remessaStatus = "EMITIDA";

  const rows = await prisma.romaneioTerceiro.findMany({
    where,
    orderBy: [{ dataEnvio: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, numero: true, fornecedorId: true, terceiroNome: true, servico: true,
      opRefNumero: true, itens: true, materiais: true, pesoEnviadoKg: true, dataEnvio: true, setorEnvio: true,
      remessaStatus: true, remessaCfop: true, remessaNatureza: true,
      remessaNfNumero: true, remessaNfSerie: true, remessaNfChave: true, remessaNfEmitidaEm: true,
      remessaObservacao: true, remessaPorNome: true,
    },
  });

  // CNPJ/UF do terceiro (Vendor List) — denormalizado: busca em lote.
  const ids = [...new Set(rows.map((r) => r.fornecedorId).filter(Boolean))];
  const forns = ids.length ? await prisma.fornecedor.findMany({ where: { id: { in: ids } }, select: { id: true, cnpj: true, uf: true, razaoSocial: true } }) : [];
  const fmap = new Map(forns.map((f) => [f.id, f]));

  const remessas = rows.map((r) => {
    const f = r.fornecedorId ? fmap.get(r.fornecedorId) : null;
    const uf = f?.uf || null;
    const cfopSugerido = uf ? (uf.toUpperCase() === UF_TORG ? "5901" : "6901") : "5901";
    const itens = Array.isArray(r.itens) ? r.itens : [];
    return {
      id: r.id, numero: r.numero,
      terceiro: { nome: r.terceiroNome, cnpj: f?.cnpj || null, uf, razaoSocial: f?.razaoSocial || null },
      servico: r.servico, opRefNumero: r.opRefNumero, setorEnvio: r.setorEnvio,
      itensCount: itens.length, pesoEnviadoKg: r.pesoEnviadoKg || 0,
      materiaisCount: Array.isArray(r.materiais) ? r.materiais.length : 0,
      dataEnvio: r.dataEnvio,
      remessaStatus: r.remessaStatus,
      cfop: r.remessaCfop || cfopSugerido,
      cfopSugerido,
      natureza: r.remessaNatureza || "Remessa para industrialização",
      nfNumero: r.remessaNfNumero, nfSerie: r.remessaNfSerie, nfChave: r.remessaNfChave,
      nfEmitidaEm: r.remessaNfEmitidaEm, observacao: r.remessaObservacao, porNome: r.remessaPorNome,
    };
  });

  return NextResponse.json({ success: true, remessas });
}
