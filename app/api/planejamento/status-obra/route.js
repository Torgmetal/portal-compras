// GET /api/planejamento/status-obra            → listas já importadas (resumo)
// GET /api/planejamento/status-obra?descobrir=1 → varre o SharePoint e lista as
//     OPs que têm Lista Avançada (só metadados, sem baixar) p/ o usuário importar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { descobrirListas } from "@/lib/lista-avancada-sharepoint";

export const runtime = "nodejs";
export const maxDuration = 120;

const ROLES = ["ADMIN", "PLANEJAMENTO", "ENGENHARIA", "EXPEDICAO", "PRODUCAO"];

export async function GET(req) {
  try {
    await requireRole(ROLES);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  if (new URL(req.url).searchParams.get("descobrir")) {
    try {
      const opsComLista = await descobrirListas();
      return NextResponse.json({ opsComLista });
    } catch (e) {
      return NextResponse.json({ error: "Falha ao varrer o SharePoint: " + (e?.message || "") }, { status: 502 });
    }
  }

  const listas = await prisma.listaExpedicao.findMany({
    select: {
      id: true, frente: true, opNumero: true, arquivo: true, revisao: true,
      fileModificado: true, marcas: true, qtdItens: true,
      pesoContratado: true, pesoExpedido: true, pesoFaltante: true,
      expedidasArquivo: true, importadoEm: true,
    },
    orderBy: [{ opNumero: "asc" }, { frente: "asc" }],
  });

  // Expedido REAL = Σ peso dos romaneios EMITIDOS no portal (por OP+frente).
  // Sobrescreve o pesoExpedido gravado quando há romaneio no portal; senão mantém o
  // backfill do SharePoint (não regride OPs antigas).
  const k = (s) => String(s || "").trim().toUpperCase();
  const padOp = (s) => String(s || "").replace(/\D/g, "").padStart(3, "0");
  const previos = await prisma.romaneioPrevio.findMany({ where: { emitidoEm: { not: null } }, select: { opNumero: true, itens: true } });
  const expFrente = new Map(); // padOp|FRENTE -> peso
  const expOp = new Map();      // padOp -> peso
  for (const r of previos) for (const it of (Array.isArray(r.itens) ? r.itens : [])) {
    const peso = Number(it.pesoTotal ?? it.pesoKg) || 0;
    const op = padOp(r.opNumero);
    expFrente.set(`${op}|${k(it.frente)}`, (expFrente.get(`${op}|${k(it.frente)}`) || 0) + peso);
    expOp.set(op, (expOp.get(op) || 0) + peso);
  }
  const nFrentesOp = new Map();
  for (const l of listas) { const op = padOp(l.opNumero); nFrentesOp.set(op, (nFrentesOp.get(op) || 0) + 1); }
  const listasOut = listas.map((l) => {
    const op = padOp(l.opNumero);
    let portal = expFrente.get(`${op}|${k(l.frente)}`) || 0;
    if (portal === 0 && nFrentesOp.get(op) === 1) portal = expOp.get(op) || 0; // frente única
    const pesoExpedido = portal > 0 ? Math.round(portal) : l.pesoExpedido;
    const pesoFaltante = Math.max(0, Math.round((l.pesoContratado || 0) - (pesoExpedido || 0)));
    return { ...l, pesoExpedido, pesoFaltante };
  });
  return NextResponse.json({ listas: listasOut });
}
