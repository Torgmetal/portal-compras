// GET /api/comercial/op/[id]/referencias — as referências do cliente da OP (base + por aditivo) e os termos
// PUT /api/comercial/op/[id]/referencias — troca as referências do CONTRATO (as do aditivo vão pelo aditivo)
//   body: { projetos: [], pedidos: [{ codigo, descricao, valor, data, revisao, itens: [], tags: [] }], outros: [] }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { referenciasDaOP, salvarReferencias, termosDaOP, clientePorNome } from "@/lib/referencias-op";

export const dynamic = "force-dynamic";
const LER = ["ADMIN", "COMERCIAL", "ENGENHARIA", "PLANEJAMENTO", "PCP", "PRODUCAO", "QUALIDADE", "EXPEDICAO", "FISCAL", "FINANCEIRO", "COMPRAS"];
const ESCREVE = ["ADMIN", "COMERCIAL"];
const auth = (e) => NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

export async function GET(_req, { params }) {
  try { await requireRole(LER); } catch (e) { return auth(e); }
  const r = await referenciasDaOP(params.id);
  if (!r) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  return NextResponse.json(r);
}

export async function PUT(req, { params }) {
  let user;
  try { user = await requireRole(ESCREVE); } catch (e) { return auth(e); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, cliente: true, clienteId: true, refCliente: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  // o cadastro do cliente nasce aqui se ainda não existia — é o que dá o rótulo às linhas
  const cliente = op.clienteId ? null : await clientePorNome(op.cliente);
  if (cliente && !op.clienteId) await prisma.oP.update({ where: { id: op.id }, data: { clienteId: cliente.id } });
  const { termos } = await termosDaOP({ ...op, clienteId: op.clienteId || cliente?.id || null });
  const linhas = await salvarReferencias({ opId: op.id, aditivoId: null, entrada: body, termos });
  const depois = await referenciasDaOP(op.id);
  await prisma.auditLog.create({
    data: { userId: user.id, action: "REFERENCIAS_CLIENTE_OP", entity: "OP", entityId: op.id,
            diff: { opNumero: op.numero, linhas: linhas.length, refClienteAntes: op.refCliente, refClienteDepois: depois?.refCliente || null } },
  }).catch(() => {});
  return NextResponse.json(depois);
}
