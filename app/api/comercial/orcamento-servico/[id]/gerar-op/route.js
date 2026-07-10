// POST /api/comercial/orcamento-servico/[id]/gerar-op — cria a OP a partir da
// proposta consolidada (botão do comercial). Número da OP informado no corpo.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { dadosProposta } from "@/lib/proposta-servico-docx";

export const runtime = "nodejs";

const LABEL = { CORTE_FURACAO: "Corte a laser e furação", SOLDA: "Solda", JATEAMENTO: "Jateamento", PINTURA: "Pintura industrial" };
const schema = z.object({ numero: z.string().min(1).transform((s) => s.trim().toUpperCase()) });
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch { return NextResponse.json({ error: "Informe o número da OP." }, { status: 400 }); }

  const o = await prisma.orcamentoServico.findUnique({ where: { id: params.id } });
  if (!o) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  if (!o.consolidadaEm) return NextResponse.json({ error: "Consolide a proposta antes de gerar a OP." }, { status: 400 });
  if (o.opCriadaId) return NextResponse.json({ error: "Esta proposta já gerou uma OP." }, { status: 409 });

  const existe = await prisma.oP.findUnique({ where: { numero: body.numero } });
  if (existe) return NextResponse.json({ error: `Já existe uma OP com o número ${body.numero}.` }, { status: 409 });

  const d = dadosProposta(o, new Date());
  const servs = Array.isArray(o.servicos) ? o.servicos : [];
  const valores = d.valoresNum || {};

  // 1 item por serviço. valorVerba = valor calculado do serviço (corte tem; os
  // demais serviços ainda são placeholders → 0, com observação "a definir").
  let itens = servs.map((s) => {
    const v = round2(valores[s]);
    return { categoria: LABEL[s] || s, tipo: "VERBA", descricao: `${LABEL[s] || s} — conforme proposta ${d.numeroPtc}`, valorVerba: v, faturamentoDireto: false, observacao: v > 0 ? null : "Valor a definir" };
  });
  const soma = itens.reduce((a, it) => a + it.valorVerba, 0);
  if (soma === 0 && round2(o.valor) > 0 && itens.length) itens[0].valorVerba = round2(o.valor);
  if (!itens.length) itens = [{ categoria: "Serviço", tipo: "VERBA", descricao: `Serviços conforme proposta ${d.numeroPtc}`, valorVerba: round2(o.valor), faturamentoDireto: false, observacao: null }];

  const op = await prisma.oP.create({
    data: {
      numero: body.numero,
      cliente: o.cliente || "—",
      obra: o.obra || null,
      descricao: `Serviços — Proposta ${d.numeroPtc}${o.obra ? " — " + o.obra : ""}`,
      createdById: user.id,
      itens: { create: itens.map((it, idx) => ({ ordem: idx, categoria: it.categoria, tipo: it.tipo, descricao: it.descricao, valorVerba: it.valorVerba, faturamentoDireto: it.faturamentoDireto, observacao: it.observacao })) },
    },
  });

  await prisma.orcamentoServico.update({ where: { id: o.id }, data: { opCriadaId: op.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "gerar_op_proposta", entity: "OrcamentoServico", entityId: o.id, diff: { op: op.numero, valor: soma || round2(o.valor) } } }).catch(() => {});

  revalidatePath("/comercial");
  return NextResponse.json({ id: op.id, numero: op.numero });
}
