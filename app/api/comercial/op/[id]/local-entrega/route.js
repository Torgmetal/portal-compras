// GET — sugestão de LOCAL DE ENTREGA da OP para pré-preencher o romaneio prévio.
// Fonte principal: OPKickOff.entregaEndereco (endereço real de entrega, ≠ fiscal).
// Fallback: endereço do cadastro do cliente. NÃO usa o nome da obra como endereço.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    select: {
      clienteEndereco: true, clienteCidade: true, clienteUF: true,
      kickoff: { select: { entregaEndereco: true } },
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const entrega = op.kickoff?.entregaEndereco?.trim();
  const cadastro = [op.clienteEndereco, [op.clienteCidade, op.clienteUF].filter(Boolean).join("/")].filter(Boolean).join(" - ");
  const local = entrega || cadastro || "";

  return NextResponse.json({ success: true, local, origem: entrega ? "kickoff" : cadastro ? "cadastro" : null });
}
