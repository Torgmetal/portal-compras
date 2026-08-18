// GET — preparação da remessa de MATERIAIS: para cada material do romaneio, resolve
// o custo unitário (preço de compra → estoque) e sinaliza o que falta (código do Omie
// ou valor). O Fiscal completa na tela e só então gera o pedido no Omie.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { resolverCustoPorCodigo } from "@/lib/custo-material";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "FISCAL", "FINANCEIRO"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rom = await prisma.romaneioTerceiro.findUnique({
    where: { id: params.id },
    select: { id: true, numero: true, materiais: true, itens: true, remessaStatus: true },
  });
  if (!rom) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });

  const materiais = Array.isArray(rom.materiais) ? rom.materiais : [];
  const custos = await resolverCustoPorCodigo(materiais.map((m) => m.codigoOmie));

  const itens = materiais.map((m, i) => {
    const codigoOmie = m.codigoOmie || null;
    const c = codigoOmie ? custos[String(codigoOmie)] : null;
    const valorUnit = m.valorUnit != null ? Number(m.valorUnit) : (c ? c.valorUnit : null);
    const fonte = m.valorUnit != null ? "manual" : (c ? c.fonte : null);
    const qtd = Number(m.qtd || 0) || 0;
    return {
      idx: i,
      perfil: m.perfil || null,
      descricao: m.descricaoOmie || m.descricao || null,
      unidade: m.unidade || null,
      qtd,
      pesoKg: Number(m.pesoKg || 0) || 0,
      codigoOmie,
      valorUnit,
      fonte, // "compra" | "estoque" | "manual" | null
      precisaCodigo: !codigoOmie,
      precisaValor: !(valorUnit > 0),
    };
  });

  const pronto = itens.length > 0 && itens.every((it) => it.codigoOmie && it.valorUnit > 0 && it.qtd > 0);
  return NextResponse.json({
    success: true,
    numero: rom.numero,
    remessaStatus: rom.remessaStatus,
    temMateriais: materiais.length > 0,
    marcasCount: Array.isArray(rom.itens) ? rom.itens.length : 0,
    itens,
    pronto,
  });
}
