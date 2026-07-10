// GET  /api/proposta/aceite/[token] — PÚBLICO: dados da proposta p/ a página de aceite.
// POST /api/proposta/aceite/[token] — PÚBLICO: cliente aprova/assina a proposta.
// Acesso por token único (sem login), espelhando o aceite do Relatório de Status.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dadosProposta } from "@/lib/proposta-servico-docx";

export const runtime = "nodejs";

function publico(o) {
  const d = dadosProposta(o, new Date());
  return {
    numeroPtc: d.numeroPtc,
    cliente: o.cliente,
    obra: o.obra || null,
    contato: o.contato || null,
    escopo: d.escopo,
    servicos: (d.servicos || []).map((s) => ({ nome: s.nome, qtd: s.qtd, unid: s.unid, vt: s.vt })),
    valorTotal: d.valorTotal,
    dias: d.dias,
    revisao: o.revisao || 0,
    consolidada: !!o.consolidadaEm,
    aceitoEm: o.aceitoEm,
    aceitoNome: o.aceitoNome,
  };
}

export async function GET(_req, { params }) {
  const o = await prisma.orcamentoServico.findUnique({ where: { aceiteToken: params.token } });
  if (!o) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({ success: true, data: publico(o) });
}

export async function POST(req, { params }) {
  let body;
  try {
    body = z.object({
      nome: z.string().trim().min(3, "Informe seu nome completo").max(120),
      documento: z.string().trim().max(40).optional(),
      cargo: z.string().trim().max(120).optional(),
    }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const o = await prisma.orcamentoServico.findUnique({ where: { aceiteToken: params.token } });
  if (!o) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  if (o.aceitoEm) return NextResponse.json({ success: true, data: publico(o), jaAceito: true });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const nome = body.cargo ? `${body.nome.trim()} — ${body.cargo.trim()}` : body.nome.trim();
  const atualizado = await prisma.orcamentoServico.update({
    where: { id: o.id },
    data: { aceitoEm: new Date(), aceitoNome: nome, aceitoDoc: body.documento || null, aceitoIp: ip },
  });
  await prisma.auditLog.create({
    data: { userId: o.criadoPorId || null, action: "ACEITE_CLIENTE_PROPOSTA", entity: "OrcamentoServico", entityId: o.id, diff: { nome, doc: body.documento || null, ip } },
  }).catch(() => {});

  return NextResponse.json({ success: true, data: publico(atualizado) });
}
