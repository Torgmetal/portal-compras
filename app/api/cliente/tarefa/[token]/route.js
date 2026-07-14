// Público (sem login, via token) — o cliente vê e responde uma tarefa que é da
// responsabilidade dele: confirma conclusão ou informa nova data. A resposta
// volta para a tarefa e avisa o Planejamento por e-mail.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { getEmailsSetor, SETOR_LABEL } from "@/lib/comunicacao-setor";

export const runtime = "nodejs";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);

export async function GET(req, { params }) {
  const { token } = params;
  const tarefa = await prisma.tarefaPlanejamento.findUnique({
    where: { clienteToken: token },
    include: { op: { select: { numero: true, cliente: true, obra: true } } },
  });
  if (!tarefa || !tarefa.doCliente) {
    return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    tarefa: {
      titulo: tarefa.titulo,
      descricao: tarefa.descricao,
      clienteNome: tarefa.clienteNome,
      opNumero: tarefa.opNumero,
      obra: tarefa.op?.obra || null,
      cliente: tarefa.op?.cliente || null,
      prazo: tarefa.dataPrevista,
      status: tarefa.status,
      respostaEm: tarefa.clienteRespostaEm,
      resposta: tarefa.clienteResposta,
    },
  });
}

const schema = z.object({
  acao: z.enum(["concluido", "nova_data"]),
  novaData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  comentario: z.string().max(500).optional().nullable(),
});

export async function POST(req, { params }) {
  const { token } = params;

  const tarefa = await prisma.tarefaPlanejamento.findUnique({
    where: { clienteToken: token },
    include: { op: { select: { numero: true } }, createdBy: { select: { email: true, name: true } } },
  });
  if (!tarefa || !tarefa.doCliente) {
    return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const comentario = (body.comentario || "").trim().slice(0, 500);
  const data = { clienteRespostaEm: new Date() };
  let resumoResposta;

  if (body.acao === "concluido") {
    data.status = "CONCLUIDA";
    data.dataConcluida = new Date();
    data.clienteResposta = `Cliente confirmou conclusão${comentario ? `: ${comentario}` : ""}`;
    resumoResposta = "confirmou que CONCLUIU";
  } else {
    if (!body.novaData) return NextResponse.json({ success: false, error: "Informe a nova data." }, { status: 400 });
    data.dataPrevista = new Date(body.novaData + "T00:00:00Z");
    data.clienteResposta = `Cliente informou nova data: ${fmtData(data.dataPrevista)}${comentario ? ` — ${comentario}` : ""}`;
    resumoResposta = `informou nova data: ${fmtData(data.dataPrevista)}`;
  }

  await prisma.tarefaPlanejamento.update({ where: { id: tarefa.id }, data });

  // Registra no Painel de Respostas (junto com as respostas do setor)
  await prisma.tarefaResposta.create({
    data: {
      tarefaId: tarefa.id, origem: "CLIENTE",
      autorNome: tarefa.clienteNome || null, autorEmail: tarefa.clienteEmail || null,
      tipo: body.acao === "concluido" ? "CONCLUIDO" : "NOVA_DATA",
      novaData: body.acao === "nova_data" ? data.dataPrevista : null,
      texto: data.clienteResposta,
    },
  }).catch(() => {});

  await prisma.auditLog.create({
    data: { userId: tarefa.createdById || null, action: "RESPOSTA_CLIENTE_TAREFA", entity: "TarefaPlanejamento", entityId: tarefa.id, diff: { acao: body.acao, novaData: body.novaData || null, comentario: comentario || null } },
  }).catch(() => {});

  // avisa o Planejamento (quem distribuiu + matriz do Planejamento)
  try {
    const planEmails = await getEmailsSetor("PLANEJAMENTO");
    const to = [...new Set([tarefa.createdBy?.email, ...planEmails].filter(Boolean).map((e) => String(e).toLowerCase()))];
    if (to.length) {
      const op = tarefa.opNumero ? `OP-${String(tarefa.opNumero).padStart(3, "0")}` : null;
      const cor = body.acao === "concluido" ? "#059669" : "#F4801F";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:${cor};color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;font-size:17px;">📨 Resposta do cliente</h2>
            <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Workspace Torg — Planejamento</p>
          </div>
          <div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:14px;color:#002945;">
            <p style="margin:0 0 8px;">O cliente <b>${escapeHtml(tarefa.clienteNome || "")}</b> ${escapeHtml(resumoResposta)} na tarefa:</p>
            <p style="margin:0;font-size:15px;font-weight:700;">${escapeHtml(tarefa.titulo)}${op ? ` <span style="font-weight:400;color:#576D7E;">· ${op}</span>` : ""}</p>
            ${comentario ? `<p style="margin:10px 0 0;font-size:13px;">📝 ${escapeHtml(comentario)}</p>` : ""}
            <p style="margin:14px 0 0;font-size:12px;color:#576D7E;border-top:1px solid #e5e7eb;padding-top:10px;">Veja em Planejamento › Tarefas no portal.</p>
          </div>
        </div>`;
      await sendEmail({ to, subject: `📨 Cliente respondeu: ${tarefa.titulo}${tarefa.opNumero ? ` (OP-${String(tarefa.opNumero).padStart(3, "0")})` : ""}`, html });
    }
  } catch (e) { console.error("[cliente-tarefa] aviso ao planejamento falhou:", e?.message); }

  return NextResponse.json({ success: true });
}
