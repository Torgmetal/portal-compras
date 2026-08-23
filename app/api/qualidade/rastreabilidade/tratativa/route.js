// Registra o tratamento de um material sem certificado digitalizado.
//
// Vitor (22/08/2026): "alguns materiais usamos de estoque" — esses nunca vão ter certificado
// novo, e sem um lugar para dizer isso ficariam vermelhos para sempre até a tela virar ruído.
//
// ⚠ O VOCABULÁRIO É FECHADO E A OBSERVAÇÃO É FILTRADA. Vitor: "não podemos em hipótese alguma
// mencionar que o fornecedor não entrega certificado". Isso vale também para o campo livre: de
// nada adianta a lista de situações ser segura se alguém escrever a frase proibida na observação
// — o registro é o mesmo documento, e um auditor lê os dois. Ver lib/rastreio-tratativa.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SITUACOES, SITUACOES_VALIDAS } from "@/lib/rastreio-tratativa";

export const runtime = "nodejs";
export const maxDuration = 20;

// Frases que descrevem o fornecedor NÃO fornecendo certificado. Barradas na entrada, com
// explicação — não em silêncio, senão a pessoa escreve de novo achando que salvou.
const RX_PROIBIDO = /(n[ãa]o\s+(nos\s+)?(entrega|envia|manda|fornece|emite|possui|tem)\s+.{0,20}certificad)|(certificad.{0,20}n[ãa]o\s+(sera|será|vai|vem|foi)\s+(enviad|fornecid|emitid))|(sem\s+certificado\s+d[oe]\s+fornecedor)|(fornecedor\s+n[ãa]o\s+(tem|possui|emite|fornece))/i;

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const b = await req.json().catch(() => ({}));
  const importRef = String(b.importRef || "").trim();
  const situacao = String(b.situacao || "").trim().toUpperCase();
  const rOrigem = String(b.rOrigem || "").trim() || null;
  const observacao = String(b.observacao || "").trim().slice(0, 500) || null;

  if (!importRef) return NextResponse.json({ error: "Informe o R do material." }, { status: 400 });
  if (!SITUACOES_VALIDAS.includes(situacao))
    return NextResponse.json({ error: "Situação inválida." }, { status: 400 });
  if (SITUACOES[situacao].exigeROrigem && !rOrigem)
    return NextResponse.json({ error: "Material de estoque precisa do R da compra de origem — é ele que carrega o certificado." }, { status: 400 });
  if (observacao && RX_PROIBIDO.test(observacao))
    return NextResponse.json({
      error: "Não registre que o fornecedor não entrega certificado: isso deixa escrito, num documento que auditor e cliente leem, que recebemos material sabendo que o certificado não viria. Use \"Aguardando certificado\" e descreva a cobrança, ou abra uma RNC.",
    }, { status: 422 });

  const doc = await prisma.documentoQualidade.findFirst({
    where: { importRef, categoria: "MATERIAL" },
    select: { opNumero: true },
  });

  if (rOrigem) {
    // ⚠ apontar para um R que não existe não rastreia nada — e passaria a impressão de resolvido.
    const origem = await prisma.documentoQualidade.findFirst({ where: { importRef: rOrigem, categoria: "MATERIAL" }, select: { id: true } });
    if (!origem) return NextResponse.json({ error: `R ${rOrigem} não existe no CMR.` }, { status: 400 });
  }

  const dados = { situacao, rOrigem, observacao, opNumero: doc?.opNumero || null, registradoPorId: user.id };
  const t = await prisma.rastreioTratativa.upsert({
    where: { importRef },
    create: { importRef, ...dados },
    update: dados,
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "TRATATIVA_RASTREABILIDADE", entity: "RastreioTratativa", entityId: t.id, diff: { importRef, situacao, rOrigem } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, tratativa: t });
}

export async function DELETE(req) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const importRef = new URL(req.url).searchParams.get("importRef");
  if (!importRef) return NextResponse.json({ error: "Informe o R." }, { status: 400 });
  await prisma.rastreioTratativa.deleteMany({ where: { importRef } });
  return NextResponse.json({ ok: true });
}
