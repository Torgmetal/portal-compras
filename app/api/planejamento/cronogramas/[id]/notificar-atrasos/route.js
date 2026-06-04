import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";

// Mapeamento departamento do cronograma → modulo(s) do sistema
const DEPT_TO_MODULOS = {
  COMERCIAL: ["COMERCIAL"],
  ENGENHARIA: ["ENGENHARIA"],
  SUPRIMENTOS: ["COMPRAS"],
  FABRICACAO: ["PRODUCAO"],
  EXPEDICAO: ["EXPEDICAO"],
  MONTAGEM: ["PRODUCAO", "EXPEDICAO"],
};

const DEPT_LABEL = {
  COMERCIAL: "Comercial",
  ENGENHARIA: "Engenharia",
  SUPRIMENTOS: "Suprimentos",
  FABRICACAO: "Fabricação",
  EXPEDICAO: "Expedição",
  MONTAGEM: "Montagem",
};

// GET /api/planejamento/cronogramas/[id]/notificar-atrasos?departamento=X
// Retorna emails sugeridos por departamento (auto-mapeados pelos modulos)
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const dept = searchParams.get("departamento");

    if (!dept) {
      return NextResponse.json({ success: false, error: "departamento obrigatorio" }, { status: 400 });
    }

    const modulosAlvo = DEPT_TO_MODULOS[dept] || [];

    // Busca usuarios que tem pelo menos um dos modulos correspondentes
    // Nota: Prisma 6 rejeita { not: null } — filtramos emails nulos no JS
    const usuarios = await prisma.user.findMany({
      where: {
        ativo: true,
        OR: [
          { tipo: "ADMIN" },
          { modulos: { some: { modulo: { in: modulosAlvo } } } },
        ],
      },
      select: { email: true, name: true, tipo: true, modulos: { select: { modulo: true } } },
    });

    // Filtra: retorna admins + usuarios com o modulo alvo, mas mostra o modulo no resultado
    const sugeridos = usuarios
      .filter((u) => {
        if (!u.email) return false;
        if (u.tipo === "ADMIN") return false; // Admins vao no CC, nao como sugeridos
        return u.modulos.some((m) => modulosAlvo.includes(m.modulo));
      })
      .map((u) => ({
        email: u.email,
        nome: u.name,
        modulo: u.modulos.map((m) => m.modulo).join(", "),
      }));

    return NextResponse.json({ success: true, sugeridos });
  } catch (e) {
    console.error("[notificar-atrasos GET] erro:", e?.message);
    return NextResponse.json(
      { success: false, error: e?.message || "Erro interno" },
      { status: 500 }
    );
  }
}

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  try {
  const { id } = await params;

  let filtroDepts = null;
  let emailsManuais = [];
  try {
    const body = await req.json();
    if (body.departamentos && Array.isArray(body.departamentos)) {
      filtroDepts = body.departamentos;
    } else if (body.departamento && typeof body.departamento === "string") {
      filtroDepts = [body.departamento];
    }
    if (body.emails && Array.isArray(body.emails)) {
      emailsManuais = body.emails.filter((e) => typeof e === "string" && e.includes("@"));
    }
  } catch {
    // body vazio
  }

  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    include: {
      op: { select: { numero: true, cliente: true, obra: true } },
      tarefas: {
        where: { percentualRealizado: { lt: 100 } },
        orderBy: { uidMpp: "asc" },
      },
    },
  });

  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma nao encontrado" }, { status: 404 });
  }

  const now = new Date();
  const atrasadosPorDept = {};

  for (const t of cronograma.tarefas) {
    if (!t.departamento || !t.dataFimPrevista) continue;
    if (new Date(t.dataFimPrevista) >= now) continue;
    if (t.isSummary && t.outlineLevel === 0) continue;
    if (filtroDepts && !filtroDepts.includes(t.departamento)) continue;

    if (!atrasadosPorDept[t.departamento]) atrasadosPorDept[t.departamento] = [];
    atrasadosPorDept[t.departamento].push(t);
  }

  const depts = Object.keys(atrasadosPorDept);
  if (depts.length === 0) {
    return NextResponse.json({ success: true, enviados: 0, motivo: "Nenhum departamento atrasado" });
  }

  // Busca usuarios por modulo (se nao vieram emails manuais)
  let moduloUsers = [];
  if (emailsManuais.length === 0) {
    const allModulos = [...new Set(depts.flatMap((d) => DEPT_TO_MODULOS[d] || []))];
    moduloUsers = await prisma.user.findMany({
      where: {
        ativo: true,
        modulos: { some: { modulo: { in: allModulos } } },
      },
      select: { email: true, name: true, modulos: { select: { modulo: true } } },
    });
  }

  // Admins vao no CC
  const adminUsers = await prisma.user.findMany({
    where: { ativo: true, tipo: "ADMIN" },
    select: { email: true },
  });
  const ccEmails = adminUsers.map((u) => u.email).filter(Boolean);

  const opLabel = cronograma.op
    ? `OP ${cronograma.op.numero} — ${cronograma.op.cliente} — ${cronograma.op.obra || ""}`
    : cronograma.titulo;

  const baseUrl = process.env.NEXTAUTH_URL || "https://portal.torg.com.br";
  const resultados = [];

  for (const dept of depts) {
    const tarefas = atrasadosPorDept[dept];
    const tarefaIds = tarefas.filter((t) => !t.isSummary).map((t) => t.id);

    // Destinatarios: manuais se informados, senao por modulo
    let destinatarios;
    if (emailsManuais.length > 0) {
      destinatarios = emailsManuais;
    } else {
      const modulosAlvo = DEPT_TO_MODULOS[dept] || [];
      destinatarios = moduloUsers
        .filter((u) => u.modulos.some((m) => modulosAlvo.includes(m.modulo)))
        .map((u) => u.email)
        .filter(Boolean);
    }

    if (destinatarios.length === 0) {
      resultados.push({ dept: DEPT_LABEL[dept] || dept, enviado: false, motivo: "Sem destinatários — adicione emails manualmente" });
      continue;
    }

    // Cria registro de cobranca com token pra resposta
    const cobranca = await prisma.cronogramaCobranca.create({
      data: {
        cronogramaId: id,
        departamento: dept,
        emailsEnviados: destinatarios,
        tarefaIds,
        createdById: user.id,
      },
    });

    const linkResposta = `${baseUrl}/planejamento/cronogramas/resposta/${cobranca.token}`;

    const tarefasHtml = tarefas
      .filter((t) => !t.isSummary)
      .slice(0, 20)
      .map((t) => {
        const dias = Math.ceil((now - new Date(t.dataFimPrevista)) / 86400000);
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">${t.nome}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-size:13px;">${t.percentualRealizado}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-size:13px;">${new Date(t.dataFimPrevista).toLocaleDateString("pt-BR")}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:#dc2626;font-weight:600;font-size:13px;">${dias}d</td>
        </tr>`;
      })
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="background:#002945;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:16px;">⚠️ Alerta de Atraso — ${DEPT_LABEL[dept] || dept}</h2>
        </div>
        <div style="padding:20px 24px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
          <p style="margin:0 0 12px;color:#374151;font-size:14px;">
            O departamento <strong>${DEPT_LABEL[dept] || dept}</strong> possui
            <strong style="color:#dc2626;">${tarefas.filter((t) => !t.isSummary).length} tarefa(s) atrasada(s)</strong>
            no cronograma <strong>${opLabel}</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:8px 12px;text-align:left;font-weight:600;color:#576D7E;font-size:12px;">Tarefa</th>
                <th style="padding:8px 12px;text-align:center;font-weight:600;color:#576D7E;font-size:12px;">Realizado</th>
                <th style="padding:8px 12px;text-align:center;font-weight:600;color:#576D7E;font-size:12px;">Prazo</th>
                <th style="padding:8px 12px;text-align:center;font-weight:600;color:#576D7E;font-size:12px;">Atraso</th>
              </tr>
            </thead>
            <tbody>${tarefasHtml}</tbody>
          </table>
        </div>
        <div style="background:#FEF3C7;padding:16px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 10px;color:#92400E;font-size:14px;font-weight:600;">
            📋 Informe a nova data prevista de entrega
          </p>
          <p style="margin:0 0 14px;color:#78350F;font-size:13px;">
            Clique no botão abaixo para informar quando cada atividade será concluída. Isso nos ajuda a replanejar o cronograma.
          </p>
          <a href="${linkResposta}" style="display:inline-block;background:#006EAB;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
            Informar novas datas →
          </a>
          <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">
            Cobrado por ${user.name || "Planejamento"} em ${new Date().toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>`;

    const result = await sendEmail({
      to: destinatarios,
      cc: ccEmails.filter((e) => !destinatarios.includes(e)),
      subject: `[Atraso] ${DEPT_LABEL[dept] || dept} — ${opLabel}`,
      html,
    });

    resultados.push({
      dept: DEPT_LABEL[dept] || dept,
      enviado: result.ok,
      destinatarios: destinatarios.length,
      emails: destinatarios,
      id: result.id,
      token: cobranca.token,
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "NOTIFICAR_ATRASOS_CRONOGRAMA",
      entity: "Cronograma",
      entityId: id,
      diff: { resultados, emailsManuais: emailsManuais.length > 0 ? emailsManuais : undefined },
    },
  });

  return NextResponse.json({ success: true, resultados });

  } catch (e) {
    console.error("[notificar-atrasos] erro inesperado:", e?.message);
    return NextResponse.json(
      { success: false, error: e?.message || "Erro interno ao notificar" },
      { status: 500 }
    );
  }
}
