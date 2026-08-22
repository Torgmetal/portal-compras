// Cron — avisa a Qualidade das RNCs paradas há mais de dois dias.
//
// Vitor (22/08/2026): "as RNCs que ficarem mais de dois dias em aberto devemos mandar um e-mail
// para a equipe de qualidade avisando sobre o fechamento desse problema".
//
// ⚠ O QUE CONTA É A INÉRCIA, não a idade. Uma RNC aberta há um mês com plano de ação andando não é
// o problema; uma aberta anteontem e intocada é. Por isso o corte é sobre a ÚLTIMA MEXIDA
// (`updatedAt`), não sobre a data de abertura — senão o aviso viraria uma lista fixa que se repete
// todo dia e ninguém lê.
//
// ⚠ E ENCERRADA NÃO ENTRA. Só o que ainda está aberto, em ação ou respondido: RNC encerrada é
// problema resolvido, e cobrar o resolvido ensina a ignorar a cobrança.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { registrarExecucao } from "@/lib/cron-monitor";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const DIAS = 2;
const ABERTAS = ["ABERTA", "EM_ACAO", "RESPONDIDA"];

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const diasDe = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

async function destinatarios() {
  const env = (process.env.QUALIDADE_ALERTA_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  let db = [];
  try {
    const insc = await prisma.emailNotificacao.findMany({
      where: { ativo: true, eventos: { has: "QUALIDADE_VENCIDOS" } },
      select: { email: true },
    });
    db = insc.map((i) => i.email).filter(Boolean);
  } catch { /* sem inscritos no banco não é fatal */ }
  return [...new Set([...db, ...env])];
}

export async function GET(req) {
  const isCron = temCronSecret(req);
  // disparo manual por ADMIN manda a prévia só para ele — não incomoda a equipe num teste
  let admin = null;
  if (!isCron) {
    try { admin = await requireRole(["ADMIN"]); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  }

  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const corte = new Date(Date.now() - DIAS * 86400000);
    const paradas = await prisma.naoConformidade.findMany({
      where: { status: { in: ABERTAS }, updatedAt: { lt: corte } },
      select: {
        id: true, numero: true, ano: true, tipo: true, data: true, cliente: true,
        opNumero: true, descricao: true, status: true, prazoResposta: true, updatedAt: true,
      },
      orderBy: [{ updatedAt: "asc" }],
      take: 200,
    });

    if (!paradas.length) {
      await registrarExecucao("rnc-abertas", { ok: true, mensagem: "nada parado", duracaoMs: Date.now() - t0 });
      return NextResponse.json({ ok: true, paradas: 0, enviado: false });
    }

    const to = admin ? [admin.email].filter(Boolean) : await destinatarios();
    if (!to.length) {
      await registrarExecucao("rnc-abertas", { ok: true, mensagem: "sem destinatários", duracaoMs: Date.now() - t0 });
      return NextResponse.json({ ok: true, paradas: paradas.length, enviado: false, motivo: "sem destinatários" });
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";
    const linhas = paradas.map((r) => {
      const num = `RNC-${String(r.numero).padStart(3, "0")}/${String(r.ano).slice(-2)}`;
      const parada = diasDe(r.updatedAt);
      // ⚠ prazo estourado é o que muda a cor: dias parado explica, prazo vencido cobra
      const venceu = r.prazoResposta && new Date(r.prazoResposta) < new Date();
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eef2f6;font-family:monospace;font-weight:bold;color:#006EAB">
          <a href="${base}/qualidade/rnc/${r.id}" style="color:#006EAB;text-decoration:none">${num}</a>
        </td>
        <td style="padding:6px 8px;border-bottom:1px solid #eef2f6">${r.opNumero ? `OP-${String(r.opNumero).replace(/^[Tt]\s*/, "")}` : "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eef2f6">${(r.descricao || "sem descrição").slice(0, 90)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eef2f6;white-space:nowrap">${r.status.replace("_", " ").toLowerCase()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eef2f6;white-space:nowrap;color:${venceu ? "#c62828" : "#5b6b7a"}">
          ${parada} dia${parada === 1 ? "" : "s"} parada${venceu ? ` · prazo venceu ${fmtD(r.prazoResposta)}` : ""}
        </td>
      </tr>`;
    }).join("");

    const assunto = `${paradas.length} RNC${paradas.length > 1 ? "s" : ""} sem movimento há mais de ${DIAS} dias`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail("Não conformidades sem movimento")}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
        <p style="margin:0 0 14px">
          As RNCs abaixo estão abertas e <strong>não recebem nenhuma atualização há mais de ${DIAS} dias</strong>.
          Cada uma precisa de análise de causa, plano de ação ou encerramento.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f5f7fa;color:#5b6b7a;text-align:left">
            <th style="padding:6px 8px">RNC</th><th style="padding:6px 8px">OP</th>
            <th style="padding:6px 8px">Descrição</th><th style="padding:6px 8px">Situação</th>
            <th style="padding:6px 8px">Parada</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        <p style="text-align:center;margin:22px 0 6px">
          <a href="${base}/qualidade/rnc" style="background:#006EAB;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block">Abrir as RNCs</a>
        </p>
      </div>
    </div>`;

    const res = await sendEmail({
      to, subject: assunto, html,
      text: `${paradas.length} RNC(s) sem movimento há mais de ${DIAS} dias. Acesse ${base}/qualidade/rnc`,
    });
    await registrarExecucao("rnc-abertas", { ok: res.ok, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: res.ok, modo: admin ? "teste" : "agendado", paradas: paradas.length, enviado: res.ok, error: res.error });
  } catch (e) {
    await registrarExecucao("rnc-abertas", { ok: false, mensagem: e.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
