// POST /api/comercial/op/[id]/analise-critica/plano-5w2h — leva as ações do bloco 7 para um plano
// 5W2H da Qualidade (FORM 28). Cria o plano na primeira vez e, nas seguintes, acrescenta as ações
// novas sem mexer no que a Qualidade já acompanhou (status, acompanhamento, conclusão).
//
// Vitor (11/09/2026): "ligação das ações ao 5W2H da Qualidade — pode ajustar já".
// ⚠ A chave entre os dois é o TEXTO da ação (o "o que"): o registro da OP não tem id do item do
// plano, e o item do plano não tem id da ação. Ação renomeada aqui vira item novo lá — e é assim
// mesmo: o plano é o documento da Qualidade, não se apaga item dele por conta da Engenharia.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { fmtOP } from "@/lib/utils";

export const runtime = "nodejs";
const STATUS_ITEM = { A_FAZER: "A_FAZER", EM_CURSO: "EM_ANDAMENTO", CONCLUIDA: "CONCLUIDO" };
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "ENGENHARIA", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const op = await prisma.oP.findUnique({ where: { id }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const registro = await prisma.analiseCriticaProjeto.findUnique({ where: { opId: op.id } });
  if (!registro) return NextResponse.json({ error: "Salve a análise crítica antes de criar o plano." }, { status: 400 });
  const acoes = (Array.isArray(registro.acoes) ? registro.acoes : []).filter((a) => a.acao);
  if (!acoes.length) return NextResponse.json({ error: "O registro não tem ações para levar ao plano." }, { status: 400 });

  const acp = `ACP-${String(op.numero).replace(/^0+/, "").padStart(3, "0")}`;
  const paraItem = (a) => ({ oque: String(a.acao).slice(0, 300), porque: "Análise crítica de projeto (PO-13)", onde: fmtOP(op.numero), quem: a.quem || "", quando: a.quando || null, como: "", quanto: "", status: STATUS_ITEM[a.situacao] || "A_FAZER", acompanhamento: a.codigo ? `Ação ${a.codigo} do registro ${acp}` : `Registro ${acp}` });

  let plano = registro.planoAcaoId ? await prisma.planoAcao.findUnique({ where: { id: registro.planoAcaoId } }) : null;
  let novos = 0;
  if (!plano) {
    // ⚠ numeração única olhando TODOS os planos — a mesma lição da rota da Qualidade (PA-001 duplicado)
    const ultima = await prisma.planoAcao.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
    plano = await prisma.planoAcao.create({
      data: { numero: (ultima?.numero || 0) + 1, titulo: `Análise Crítica de Projeto ${fmtOP(op.numero)} — ${op.cliente || ""}`.trim(), origem: `${acp} (PO-13)`, responsavel: registro.responsavelNome || null, processo: "ENGENHARIA", itens: acoes.map(paraItem), createdById: user.id },
    });
    novos = acoes.length;
    await prisma.analiseCriticaProjeto.update({ where: { id: registro.id }, data: { planoAcaoId: plano.id } });
  } else {
    const itens = Array.isArray(plano.itens) ? plano.itens : [];
    const existentes = new Set(itens.map((i) => norm(i.oque)));
    const acrescentar = acoes.filter((a) => !existentes.has(norm(a.acao))).map(paraItem);
    novos = acrescentar.length;
    if (novos) plano = await prisma.planoAcao.update({ where: { id: plano.id }, data: { itens: [...itens, ...acrescentar] } });
  }
  await prisma.auditLog.create({ data: { userId: user.id, action: "ANALISE_CRITICA_PLANO_5W2H", entity: "PlanoAcao", entityId: plano.id, diff: { opNumero: op.numero, acp, itensNovos: novos, totalItens: Array.isArray(plano.itens) ? plano.itens.length : 0 } } }).catch(() => {});
  return NextResponse.json({ success: true, planoId: plano.id, numero: plano.numero, itensNovos: novos, totalItens: Array.isArray(plano.itens) ? plano.itens.length : 0 });
}
