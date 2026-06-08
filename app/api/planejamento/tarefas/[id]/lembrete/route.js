import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { criarCompromissosDaTarefa } from "@/lib/compromissos";

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

  // Busca usuarios ativos que tem o modulo correspondente ao setor da tarefa
  const modulo = SETOR_MODULO[tarefa.setor] || tarefa.setor;
  const usuarios = await prisma.user.findMany({
    where: {
      ativo: true,
      OR: [
        { tipo: "ADMIN" },
        { modulos: { some: { modulo } } },
      ],
    },
    select: { email: true, name: true },
  });

  // Filtra somente quem tem email valido
  const destinatarios = usuarios.map((u) => u.email).filter(Boolean);

  if (destinatarios.length === 0) {
    return NextResponse.json(
      { error: `Nenhum usuário ativo encontrado no setor ${SETOR_LABEL[tarefa.setor] || tarefa.setor}` },
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
            <td style="padding: 8px 0; color: #002945; font-weight: 700;">${tarefa.titulo}</td>
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
            <td style="padding: 8px 0; color: #006EAB; font-family: monospace; font-weight: 600;">${opInfo}${tarefa.op?.cliente ? ` — ${tarefa.op.cliente}` : ""}</td>
          </tr>` : ""}
          ${tarefa.responsavel ? `<tr>
            <td style="padding: 8px 0; color: #576D7E; font-weight: 600;">Responsável:</td>
            <td style="padding: 8px 0; color: #002945;">${tarefa.responsavel}</td>
          </tr>` : ""}
          ${tarefa.observacao ? `<tr>
            <td style="padding: 8px 0; color: #576D7E; font-weight: 600;">Observação:</td>
            <td style="padding: 8px 0; color: #002945;">${tarefa.observacao}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 8px 0; color: #576D7E; font-weight: 600;">Semana:</td>
            <td style="padding: 8px 0; color: #002945;">${tarefa.semanaIso}/${tarefa.ano}</td>
          </tr>
        </table>
        <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #576D7E; margin: 0;">
            Lembrete enviado por <strong>${user.name || "Planejamento"}</strong> via Workspace Torg.
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
    destinatarios: usuarios.map((u) => u.name).filter(Boolean),
    compromissosCriados: compromissos.criados,
  });
}
