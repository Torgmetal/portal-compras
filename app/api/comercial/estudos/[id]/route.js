import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcularLqc } from "@/lib/lqc";
import { capacidadeDaFabrica } from "@/lib/fabrica-capacidade";
import { custoDeFabricacao, custoPorKgDaRota, mixDeClasses, calibrarTabela, SETORES_ROTA } from "@/lib/custo-fabricacao";
import { CLASSES } from "@/lib/lqc";

export const runtime = "nodejs";
const PERFIS = ["ADMIN", "COMERCIAL"];

export async function GET(req, { params }) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const estudo = await prisma.estudoFabricacao.findUnique({ where: { id } });
  if (!estudo) return NextResponse.json({ error: "Estudo não encontrado." }, { status: 404 });
  // ⚠ o cálculo vem SEMPRE do servidor, nunca do que a tela mandou: é o mesmo número que vai pra
  // planilha e pra proposta, e duas contas em lugares diferentes acabam divergindo.
  const resultado = calcularLqc({ ...estudo.composicao, demaos: estudo.demaos, preMontagem: estudo.preMontagem });
  // ⚠ cadência e custo operacional vêm do que a fábrica REALMENTE fez, não de um campo digitado:
  // número de capacidade digitado num orçamento envelhece e ninguém percebe.
  const fabrica = await capacidadeDaFabrica().catch(() => null);

  // ⚠ O CUSTO DE FABRICAR VEM DA EMPRESA, NÃO DE UMA TABELA. Vitor (23/08/2026): "não quero que
  // use minha planilha como bengala sua, quero que monte a sistemática que deve ser essa parte do
  // comercial". Então o portal calcula quanto custa processar um quilo em cada setor — custo
  // mensal do setor dividido pelo que ele produz — e mostra a tabela ao lado, calibrada pelo mix
  // real da fábrica. Ver lib/custo-fabricacao.
  let custoFabrica = null;
  try {
    const base = await custoDeFabricacao();
    if (base) {
      const rota = estudo.composicao?.rotaFabricacao || SETORES_ROTA.filter((s) => s.padrao).map((s) => s.key);
      const daRota = custoPorKgDaRota(base, rota);
      const mix = await mixDeClasses();
      const iDemaos = Math.max(0, Math.min(2, (resultado.demaos || 1) - 1));
      custoFabrica = { ...base, rota, ...daRota, mix, calibracao: calibrarTabela(CLASSES, daRota.custoPorKg, mix, iDemaos) };
    }
  } catch { /* sem base de custo, a tela cai na tabela */ }

  return NextResponse.json({ estudo, resultado, fabrica, custoFabrica });
}

export async function PUT(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const atual = await prisma.estudoFabricacao.findUnique({ where: { id } });
  if (!atual) return NextResponse.json({ error: "Estudo não encontrado." }, { status: 404 });

  const composicao = b.composicao ?? atual.composicao;
  const demaos = b.demaos ?? atual.demaos;
  const preMontagem = b.preMontagem ?? atual.preMontagem;
  const resultado = calcularLqc({ ...composicao, demaos, preMontagem });

  const estudo = await prisma.estudoFabricacao.update({
    where: { id },
    data: {
      composicao, demaos, preMontagem, resultado,
      cliente: b.cliente ?? atual.cliente,
      obra: b.obra === undefined ? atual.obra : (String(b.obra).trim() || null),
      metodo: b.metodo ?? atual.metodo,
      cenario: b.cenario ?? atual.cenario,
      status: b.status ?? atual.status,
      observacoes: b.observacoes === undefined ? atual.observacoes : b.observacoes,
      ...(b.revisar ? { revisao: atual.revisao + 1 } : {}),
    },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "SALVAR_ESTUDO_FABRICACAO", entity: "EstudoFabricacao", entityId: id, diff: { preco: resultado.preco, custo: resultado.custo } },
  }).catch(() => {});
  return NextResponse.json({ ok: true, estudo, resultado });
}

export async function DELETE(req, { params }) {
  try { await requireRole(["ADMIN"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  await prisma.estudoFabricacao.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
