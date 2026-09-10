// GET/PUT /api/comercial/op/[id]/analise-critica
// Análise Crítica de Projeto (PO-13) — um registro por OP, na aba Engenharia.
// GET devolve o registro (ou o esqueleto inicial, sem gravar) + as verificações que o portal
// faz sozinho a partir dos itens da OP e das listas. PUT grava os blocos; `acao` = "salvar" |
// "verificada" | "nova-revisao" | "aprovar" (só Diretoria).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";
import { registroInicial, registroSchema, verificacoesAutomaticas, resumo } from "@/lib/analise-critica";

export const runtime = "nodejs";
const ROLES_EDIT = ["ADMIN", "ENGENHARIA"];
const BLOCOS = ["entradas", "requisitos", "areas", "riscos", "saidas", "comentarios", "reunioes", "acoes"];

async function carregarOP(id) {
  return prisma.oP.findUnique({
    where: { id },
    select: { id: true, numero: true, cliente: true, obra: true, itens: { select: { descricao: true, unidade: true, qtdContratada: true, categoria: true } } },
  });
}
async function carregarPecas(opId) {
  return prisma.pecaConjunto.findMany({ where: { opId }, select: { marca: true, fonte: true, tipoPeca: true, pesoTotalKg: true, areaPinturaM2: true, comprimentoMm: true } });
}
const podeEditar = (user) => user.tipo === "ADMIN" || (user.modulos || []).some((m) => ROLES_EDIT.includes(m));

export async function GET(_req, { params }) {
  let user;
  try { user = await requireUser(); } catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const { id } = await params;
  const op = await carregarOP(id);
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const [registro, pecas] = await Promise.all([prisma.analiseCriticaProjeto.findUnique({ where: { opId: op.id } }), carregarPecas(op.id)]);
  const reg = registro || { ...registroInicial(), opId: op.id, opNumero: op.numero, revisao: 0, status: "EM_ANALISE", historico: [], novo: true };
  return NextResponse.json({
    success: true, registro: reg, verificacoes: verificacoesAutomaticas({ itens: op.itens, pecas }), resumo: resumo(reg),
    podeEditar: podeEditar(user), podeAprovar: await temAcessoDiretoria(user.email),
  });
}

export async function PUT(req, { params }) {
  let user;
  try { user = await requireRole(ROLES_EDIT); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const op = await carregarOP(id);
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const acao = ["salvar", "verificada", "nova-revisao", "aprovar"].includes(body.acao) ? body.acao : "salvar";
  const parsed = registroSchema.safeParse(body.registro || {});
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });
  const dados = parsed.data;

  if (acao === "aprovar" && !(await temAcessoDiretoria(user.email))) return NextResponse.json({ error: "Só a Diretoria aprova a análise crítica." }, { status: 403 });

  const atual = await prisma.analiseCriticaProjeto.findUnique({ where: { opId: op.id } });
  const blocos = Object.fromEntries(BLOCOS.map((b) => [b, dados[b]]));
  const base = { ...blocos, responsavelNome: dados.responsavelNome || atual?.responsavelNome || user.name || null };
  let extra = {};
  if (acao === "verificada") extra = { status: "VERIFICADA" };
  if (acao === "aprovar") extra = { status: "APROVADA", aprovadoPorNome: user.name || user.email, aprovadoPorId: user.id, aprovadoEm: new Date() };
  if (acao === "nova-revisao" && atual) {
    // a revisão anterior fica congelada no histórico — quem lê o registro sabe o que mudou e quando
    const snapshot = Object.fromEntries(BLOCOS.map((b) => [b, atual[b]]));
    const historico = [...(Array.isArray(atual.historico) ? atual.historico : []), { revisao: atual.revisao, data: new Date().toISOString(), porQuem: user.name || user.email, motivo: String(body.motivo || "").slice(0, 300), status: atual.status, snapshot }];
    extra = { revisao: atual.revisao + 1, status: "EM_ANALISE", aprovadoPorNome: null, aprovadoPorId: null, aprovadoEm: null, historico };
  }
  const registro = await prisma.analiseCriticaProjeto.upsert({
    where: { opId: op.id },
    create: { opId: op.id, opNumero: op.numero, criadoPorId: user.id, responsavelId: user.id, ...base, ...extra },
    update: { ...base, ...extra },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: `ANALISE_CRITICA_${acao.toUpperCase().replace("-", "_")}`, entity: "AnaliseCriticaProjeto", entityId: registro.id,
      diff: { opNumero: op.numero, revisao: registro.revisao, status: registro.status, linhas: Object.fromEntries(BLOCOS.map((b) => [b, (dados[b] || []).length])) } },
  }).catch(() => {});
  const pecas = await carregarPecas(op.id);
  return NextResponse.json({ success: true, registro, verificacoes: verificacoesAutomaticas({ itens: op.itens, pecas }), resumo: resumo(registro), podeEditar: true, podeAprovar: await temAcessoDiretoria(user.email) });
}
