// Público (sem login, via respostaToken) — o SETOR responde um lembrete de
// tarefa do Planejamento: confirma conclusão, informa nova data ou comenta.
// Cada resposta vira um TarefaResposta (Painel de Respostas) e avisa o Planejamento.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { getEmailsSetor, SETOR_LABEL } from "@/lib/comunicacao-setor";

export const runtime = "nodejs";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);

export async function GET(_req, { params }) {
  const { token } = params;
  const tarefa = await prisma.tarefaPlanejamento.findUnique({
    where: { respostaToken: token },
    include: {
      op: { select: { numero: true, cliente: true, obra: true } },
      respostas: { where: { origem: "SETOR" }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!tarefa) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({
    success: true,
    tarefa: {
      titulo: tarefa.titulo,
      descricao: tarefa.descricao,
      setor: tarefa.setor,
      setorLabel: SETOR_LABEL[tarefa.setor] || tarefa.setor,
      opNumero: tarefa.opNumero,
      obra: tarefa.op?.obra || null,
      cliente: tarefa.op?.cliente || null,
      prazo: tarefa.dataPrevista,
      status: tarefa.status,
      respostas: tarefa.respostas.map((r) => ({ autorNome: r.autorNome, tipo: r.tipo, texto: r.texto, novaData: r.novaData, createdAt: r.createdAt })),
    },
  });
}

const schema = z.object({
  autorNome: z.string().min(1, "Informe seu nome").max(100),
  acao: z.enum(["concluido", "nova_data", "comentario"]),
  novaData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  comentario: z.string().max(500).optional().nullable(),
});

export async function POST(req, { params }) {
  const { token } = params;
  const tarefa = await prisma.tarefaPlanejamento.findUnique({
    where: { respostaToken: token },
    include: { op: { select: { numero: true } }, createdBy: { select: { email: true, name: true } } },
  });
  if (!tarefa) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const autorNome = body.autorNome.trim().slice(0, 100);
  const comentario = (body.comentario || "").trim().slice(0, 500);

  let tipo, texto, novaData = null, resumo;
  const tarefaUpdate = {};
  if (body.acao === "concluido") {
    tipo = "CONCLUIDO";
    texto = `Concluído${comentario ? `: ${comentario}` : ""}`;
    tarefaUpdate.status = "CONCLUIDA";
    tarefaUpdate.dataConcluida = new Date();
    resumo = "marcou como CONCLUÍDA";
  } else if (body.acao === "nova_data") {
    if (!body.novaData) return NextResponse.json({ success: false, error: "Informe a nova data." }, { status: 400 });
    novaData = new Date(body.novaData + "T00:00:00Z");
    tipo = "NOVA_DATA";
    texto = `Nova data: ${fmtData(novaData)}${comentario ? ` — ${comentario}` : ""}`;
    tarefaUpdate.dataPrevista = novaData;
    resumo = `informou nova data: ${fmtData(novaData)}`;
  } else {
    if (!comentario) return NextResponse.json({ success: false, error: "Escreva um comentário." }, { status: 400 });
    tipo = "COMENTARIO";
    texto = comentario;
    resumo = "deixou um comentário";
  }

  await prisma.$transaction([
    prisma.tarefaResposta.create({
      data: { tarefaId: tarefa.id, origem: "SETOR", autorNome, tipo, novaData, texto },
    }),
    ...(Object.keys(tarefaUpdate).length ? [prisma.tarefaPlanejamento.update({ where: { id: tarefa.id }, data: tarefaUpdate })] : []),
  ]);

  await prisma.auditLog.create({
    data: { userId: tarefa.createdById || null, action: "RESPOSTA_SETOR_TAREFA", entity: "TarefaPlanejamento", entityId: tarefa.id, diff: { autorNome, tipo, novaData: body.novaData || null, comentario: comentario || null } },
  }).catch(() => {});

  // avisa o Planejamento (quem criou + matriz do Planejamento)
  try {
    const planEmails = await getEmailsSetor("PLANEJAMENTO");
    const to = [...new Set([tarefa.createdBy?.email, ...planEmails].filter(Boolean).map((e) => String(e).toLowerCase()))];
    if (to.length) {
      const op = tarefa.opNumero ? `OP-${String(tarefa.opNumero).padStart(3, "0")}` : null;
      const cor = body.acao === "concluido" ? "#059669" : body.acao === "nova_data" ? "#F4801F" : "#006EAB";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:${cor};color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;font-size:17px;">📨 Resposta do setor</h2>
            <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Workspace Torg — Planejamento</p>
          </div>
          <div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:14px;color:#002945;">
            <p style="margin:0 0 8px;"><b>${escapeHtml(autorNome)}</b> ${escapeHtml(resumo)} na tarefa:</p>
            <p style="margin:0;font-size:15px;font-weight:700;">${escapeHtml(tarefa.titulo)}${op ? ` <span style="font-weight:400;color:#576D7E;">· ${op}</span>` : ""}</p>
            ${comentario ? `<p style="margin:10px 0 0;font-size:13px;">📝 ${escapeHtml(comentario)}</p>` : ""}
            <p style="margin:14px 0 0;font-size:12px;color:#576D7E;border-top:1px solid #e5e7eb;padding-top:10px;">Veja em Planejamento › Tarefas › Respostas.</p>
          </div>
        </div>`;
      await sendEmail({ to, subject: `📨 ${autorNome} respondeu: ${tarefa.titulo}${tarefa.opNumero ? ` (OP-${String(tarefa.opNumero).padStart(3, "0")})` : ""}`, html });
    }
  } catch (e) { console.error("[tarefa-resposta-setor] aviso ao planejamento falhou:", e?.message); }

  return NextResponse.json({ success: true });
}
