import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { criarCompromissosDaTarefa } from "@/lib/compromissos";
import { getContatosSetor } from "@/lib/comunicacao-setor";

// Mapeamento setor da tarefa → modulo do sistema (para buscar usuarios)
const SETOR_MODULO = {
  PRODUCAO: "PRODUCAO",
  PINTURA: "PRODUCAO",
  PCP: "PRODUCAO",
  EXPEDICAO: "EXPEDICAO",
  COMERCIAL: "COMERCIAL",
  ENGENHARIA: "ENGENHARIA",
  COMPRAS: "COMPRAS",
  ALMOXARIFADO: "ALMOXARIFADO",
  FINANCEIRO: "FINANCEIRO",
  RH: "RH",
  PLANEJAMENTO: "PLANEJAMENTO",
};

const SETOR_LABEL = {
  PRODUCAO: "Produção",
  PINTURA: "Pintura",
  PCP: "PCP",
  EXPEDICAO: "Expedição",
  COMERCIAL: "Comercial",
  ENGENHARIA: "Engenharia",
  COMPRAS: "Compras",
  ALMOXARIFADO: "Almoxarifado",
  FINANCEIRO: "Financeiro",
  RH: "Recursos Humanos",
  PLANEJAMENTO: "Planejamento",
};

const PRIORIDADE_LABEL = { ALTA: "🔴 Alta", MEDIA: "🟡 Média", BAIXA: "🟢 Baixa" };

// GET — destinatários sugeridos p/ o modal: pessoas do setor (usuários com o
// módulo) + contatos da matriz, deduplicados. Assim dá pra escolher os internos.
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const tarefa = await prisma.tarefaPlanejamento.findUnique({
    where: { id: params.id },
    select: {
      setor: true, doCliente: true, clienteNome: true, clienteEmail: true,
      op: { select: { cliente: true, clienteContato: true, clienteEmail: true } },
    },
  });
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const modulo = SETOR_MODULO[tarefa.setor] || tarefa.setor;
  const usuarios = await prisma.user.findMany({
    where: { ativo: true, modulos: { some: { modulo } } },
    select: { name: true, email: true },
  });
  const matriz = await getContatosSetor(tarefa.setor).catch(() => []);

  // Sugeridos = pessoas do setor da tarefa + contatos da matriz (pré-marcados no modal)
  const map = new Map();
  for (const u of usuarios) if (u.email) map.set(u.email.toLowerCase(), { nome: u.name || "", email: u.email, origem: "setor" });
  for (const c of matriz) if (c.email && !map.has(c.email.toLowerCase())) map.set(c.email.toLowerCase(), { nome: c.nome || "", email: c.email, origem: "matriz" });
  const sugeridos = [...map.values()];
  const sugeridosSet = new Set(sugeridos.map((s) => s.email.toLowerCase()));

  // Diretório completo da Torg (todos os usuários ativos) — pra escolher qualquer
  // pessoa sem precisar digitar. Exclui quem já está nos sugeridos.
  const todosUsuarios = await prisma.user.findMany({
    where: { ativo: true },
    select: { name: true, email: true, setor: true },
    orderBy: { name: "asc" },
  });
  const todos = todosUsuarios
    .filter((u) => u.email && !sugeridosSet.has(u.email.toLowerCase()))
    .map((u) => ({ nome: u.name || "", email: u.email, setor: u.setor || "" }));

  // Contato do cliente já cadastrado (na tarefa ou na OP) — pra incluir sem digitar.
  const clienteEmail = tarefa.clienteEmail || tarefa.op?.clienteEmail || "";
  const clienteNome = tarefa.clienteNome || tarefa.op?.clienteContato || tarefa.op?.cliente || "";
  const cliente = clienteEmail ? { nome: clienteNome, email: clienteEmail } : null;

  return NextResponse.json({ setor: tarefa.setor, doCliente: tarefa.doCliente, sugeridos, todos, cliente });
}

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const tarefa = await prisma.tarefaPlanejamento.findUnique({
    where: { id: params.id },
    include: { op: { select: { numero: true, cliente: true } } },
  });

  if (!tarefa) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  // Destinatários: e-mails escolhidos no modal (se vierem) OU broadcast pro setor
  let body = {};
  try { body = await req.json(); } catch {}
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim().toLowerCase());
  const mensagemExtra = (body?.mensagem || "").toString().slice(0, 500);
  const manuais = Array.isArray(body?.emails) ? [...new Set(body.emails.map((e) => String(e).trim().toLowerCase()).filter(emailOk))] : [];

  let destinatarios, nomesDest;
  if (manuais.length) {
    destinatarios = manuais;
    nomesDest = manuais;
  } else {
    // Busca usuarios ativos que tem o modulo correspondente ao setor da tarefa
    const modulo = SETOR_MODULO[tarefa.setor] || tarefa.setor;
    const usuarios = await prisma.user.findMany({
      where: { ativo: true, OR: [{ tipo: "ADMIN" }, { modulos: { some: { modulo } } }] },
      select: { email: true, name: true },
    });
    destinatarios = usuarios.map((u) => u.email).filter(Boolean);
    nomesDest = usuarios.map((u) => u.name).filter(Boolean);
  }

  if (destinatarios.length === 0) {
    return NextResponse.json(
      { error: manuais.length ? "Nenhum e-mail válido selecionado." : `Nenhum usuário ativo encontrado no setor ${SETOR_LABEL[tarefa.setor] || tarefa.setor}` },
      { status: 400 }
    );
  }

  const setorNome = SETOR_LABEL[tarefa.setor] || tarefa.setor;
  const prioridadeNome = PRIORIDADE_LABEL[tarefa.prioridade] || tarefa.prioridade;
  const opInfo = tarefa.opNumero ? `OP-${tarefa.opNumero.padStart(3, "0")}` : null;

  const subject = `📋 Lembrete de Tarefa — ${tarefa.titulo}${opInfo ? ` (${opInfo})` : ""}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #006EAB; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">📋 Lembrete de Tarefa</h2>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Workspace Torg — Planejamento</p>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #576D7E; font-weight: 600; width: 120px;">Tarefa:</td>
            <td style="padding: 8px 0; color: #002945; font-weight: 700;">${escapeHtml(tarefa.titulo)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #576D7E; font-weight: 600;">Setor:</td>
            <td style="padding: 8px 0; color: #002945;">${setorNome}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #576D7E; font-weight: 600;">Prioridade:</td>
            <td style="padding: 8px 0; color: #002945;">${prioridadeNome}</td>
          </tr>
          ${opInfo ? `<tr>
            <td style="padding: 8px 0; color: #576D7E; font-weight: 600;">OP:</td>
            <td style="padding: 8px 0; color: #006EAB; font-family: monospace; font-weight: 600;">${escapeHtml(opInfo)}${tarefa.op?.cliente ? ` — ${escapeHtml(tarefa.op.cliente)}` : ""}</td>
          </tr>` : ""}
          ${tarefa.responsavel ? `<tr>
            <td style="padding: 8px 0; color: #576D7E; font-weight: 600;">Responsável:</td>
            <td style="padding: 8px 0; color: #002945;">${escapeHtml(tarefa.responsavel)}</td>
          </tr>` : ""}
          ${tarefa.observacao ? `<tr>
            <td style="padding: 8px 0; color: #576D7E; font-weight: 600;">Observação:</td>
            <td style="padding: 8px 0; color: #002945;">${escapeHtml(tarefa.observacao)}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 8px 0; color: #576D7E; font-weight: 600;">Semana:</td>
            <td style="padding: 8px 0; color: #002945;">${tarefa.semanaIso}/${tarefa.ano}</td>
          </tr>
        </table>
        ${mensagemExtra ? `<p style="font-size:13px;color:#002945;background:#eef6fb;border-radius:8px;padding:10px 14px;margin:16px 0 0;">${escapeHtml(mensagemExtra)}</p>` : ""}
        <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #576D7E; margin: 0;">
            Lembrete enviado por <strong>${escapeHtml(user.name || "Planejamento")}</strong> via Workspace Torg.
          </p>
        </div>
      </div>
    </div>
  `;

  const resultado = await sendEmail({
    to: destinatarios,
    subject,
    html,
  });

  // Registra no audit log
  try {
    await prisma.auditLog.create({
      data: {
        action: "LEMBRETE_TAREFA",
        entity: "TarefaPlanejamento",
        entityId: tarefa.id,
        userId: user.id,
        diff: {
          titulo: tarefa.titulo,
          setor: tarefa.setor,
          destinatarios,
          emailOk: resultado.ok,
        },
      },
    });
  } catch (e) {
    console.error("[audit] falha ao registrar lembrete:", e?.message);
  }

  // Cria/reforça compromissos na agenda dos envolvidos (best-effort)
  const compromissos = await criarCompromissosDaTarefa(tarefa, user.id);

  if (!resultado.ok) {
    return NextResponse.json(
      { error: `Falha ao enviar: ${resultado.error}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    enviados: destinatarios.length,
    destinatarios: nomesDest,
    compromissosCriados: compromissos.criados,
  });
}
