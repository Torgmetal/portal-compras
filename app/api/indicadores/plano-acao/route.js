// Planos de ação 5W2H dos INDICADORES — os meses fora da meta de cada setor.
//
// Vitor (27/08/2026): "criar um botão para criar plano de ação para os meses que estão abaixo da
// meta (…) a estrutura do plano de ação é o 5W2H, pode usar o mesmo modelo que usamos na RNC,
// criar dentro desse botão uma aba com os PA em aberto e os encerrados".
//
// ⚠ MESMO MODELO, OUTRO LUGAR. Reusa PlanoAcao (5W2H, numeração PA-001, status por item) — mudar de
// estrutura por causa da origem só criaria um segundo formulário para a mesma coisa. O que muda é o
// vínculo (indicador + mês) e o fato de não aparecerem na aba da Qualidade.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { situacaoItem } from "@/lib/plano-acao";
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// quem enxerga o painel de um setor pode cuidar do plano dele
const ROLES = ["ADMIN", "QUALIDADE", "PRODUCAO", "PCP", "ENGENHARIA", "COMERCIAL", "COMPRAS", "RH"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const resumir = (p) => {
  const itens = Array.isArray(p.itens) ? p.itens : [];
  return {
    id: p.id, numero: p.numero, titulo: p.titulo, origem: p.origem, responsavel: p.responsavel,
    status: p.status, createdAt: p.createdAt,
    indicador: p.indicador, processo: p.processo, ano: p.ano, mes: p.mes, valor: p.valor, metaValor: p.metaValor,
    itens,
    total: itens.length,
    concluidos: itens.filter((i) => i.status === "CONCLUIDO").length,
    atrasados: itens.filter((i) => situacaoItem(i) === "ATRASADO").length,
  };
};

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const u = new URL(req.url);
  const processo = String(u.searchParams.get("processo") || "").toUpperCase() || null;
  const indicador = String(u.searchParams.get("indicador") || "") || null;
  const ano = parseInt(u.searchParams.get("ano") || "", 10) || null;

  const planos = await prisma.planoAcao.findMany({
    where: {
      indicador: indicador || { not: null },
      ...(processo ? { processo } : {}),
      ...(ano ? { ano } : {}),
    },
    orderBy: [{ ano: "desc" }, { mes: "desc" }, { numero: "desc" }],
    take: 200,
  });
  return NextResponse.json({ planos: planos.map(resumir) });
}

const item = z.object({
  oque: z.string().max(600).optional().nullable(), porque: z.string().max(600).optional().nullable(),
  onde: z.string().max(200).optional().nullable(), quem: z.string().max(160).optional().nullable(),
  quando: z.string().max(30).optional().nullable(), como: z.string().max(600).optional().nullable(),
  quanto: z.string().max(120).optional().nullable(),
  status: z.enum(["A_FAZER", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]).optional(),
  acompanhamento: z.string().max(600).optional().nullable(),
  concluidoEm: z.string().max(30).optional().nullable(),
});
const schema = z.object({
  indicador: z.string().min(1), processo: z.string().min(1),
  ano: z.number().int(), mes: z.number().int().min(-1).max(11).nullable().optional(),
  valor: z.number().nullable().optional(), metaValor: z.number().nullable().optional(),
  responsavel: z.string().max(120).optional().nullable(),
  itens: z.array(item).max(40).optional(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const def = INDICADORES_ISO.find((i) => i.id === body.indicador);
  if (!def) return NextResponse.json({ error: "Indicador desconhecido." }, { status: 400 });

  const mes = body.mes == null || body.mes < 0 ? null : body.mes;
  // ⚠ UM PLANO POR INDICADOR/MÊS. Dois planos para o mesmo desvio viram duas listas de ações que
  // ninguém reconcilia — e o segundo sempre nasce por engano, de quem não viu o primeiro.
  const ja = await prisma.planoAcao.findFirst({
    where: { indicador: body.indicador, ano: body.ano, mes },
    select: { id: true, numero: true, status: true },
  });
  if (ja) {
    return NextResponse.json({
      error: `Este mês já tem o plano PA-${String(ja.numero).padStart(3, "0")}${ja.status === "CONCLUIDO" ? " (encerrado)" : ""}. Abra-o na aba ao lado.`,
      planoId: ja.id,
    }, { status: 409 });
  }

  const ultimo = await prisma.planoAcao.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
  const periodo = mes == null ? `acumulado ${body.ano}` : `${MESES[mes]}/${String(body.ano).slice(-2)}`;
  const plano = await prisma.planoAcao.create({
    data: {
      numero: (ultimo?.numero || 0) + 1,
      titulo: `${def.nome} — ${periodo}`,
      origem: `Indicador ${def.nome} (${periodo})`,
      responsavel: body.responsavel || null,
      indicador: body.indicador, processo: body.processo, ano: body.ano, mes,
      valor: body.valor ?? null, metaValor: body.metaValor ?? def.meta?.valor ?? null,
      // ⚠ nasce com o "por quê" preenchido: é o desvio que originou o plano, e escrevê-lo à mão de
      // novo é a primeira coisa que ninguém faz.
      itens: body.itens?.length ? body.itens : [{
        oque: "", porque: `${def.nome} em ${periodo}: ${body.valor ?? "—"}${def.meta?.unidade || ""} contra a meta de ${def.meta?.valor ?? "—"}${def.meta?.unidade || ""}.`,
        onde: "", quem: "", quando: "", como: "", quanto: "", status: "A_FAZER", acompanhamento: "",
      }],
      createdById: user?.id || null,
    },
  });
  return NextResponse.json({ ok: true, plano: resumir(plano) });
}

const patchSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().max(200).optional(),
  responsavel: z.string().max(120).optional().nullable(),
  status: z.enum(["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]).optional(),
  itens: z.array(item).max(40).optional(),
});

export async function PATCH(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = patchSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const atual = await prisma.planoAcao.findUnique({ where: { id: body.id }, select: { id: true, indicador: true } });
  if (!atual?.indicador) return NextResponse.json({ error: "Plano não encontrado neste painel." }, { status: 404 });

  const { id, ...dados } = body;
  const plano = await prisma.planoAcao.update({ where: { id }, data: dados });
  return NextResponse.json({ ok: true, plano: resumir(plano) });
}

export async function DELETE(req) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const id = new URL(req.url).searchParams.get("id");
  const atual = id ? await prisma.planoAcao.findUnique({ where: { id }, select: { indicador: true } }) : null;
  if (!atual?.indicador) return NextResponse.json({ error: "Plano não encontrado neste painel." }, { status: 404 });
  await prisma.planoAcao.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
