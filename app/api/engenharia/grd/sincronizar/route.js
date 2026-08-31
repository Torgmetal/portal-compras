// POST /api/engenharia/grd/sincronizar — lê a pasta /Engenharia/13. GRD e importa o que mudou,
// avisando a Engenharia sobre GRD nova e sobre revisão.
//
// Vitor (31/08/2026): "quando for enviado alguma revisão ou algo do tipo vc deve alertar ao
// Gabriel, assim como alertar a ele sempre que receber uma nova grd".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sincronizarGrds } from "@/lib/grd-engenharia-sync";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { fmtOP } from "@/lib/utils";
import { escapeHtml } from "@/lib/html";

export const runtime = "nodejs";
export const maxDuration = 300;

// ⚠ QUEM RECEBE O AVISO. Vitor nomeou o Gabriel; o endereço vem do cadastro dele no portal, e não
// escrito aqui — se ele mudar de e-mail, o aviso acompanha. Se a conta sumir, o cron não quebra:
// a importação continua e o resultado diz que ninguém foi avisado.
const AVISAR = ["engenharia3@torg.com.br"];

export async function POST(req) {
  const auth = req.headers.get("authorization");
  const doCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!doCron) {
    try { await requireRole(["ADMIN", "ENGENHARIA", "PCP"]); }
    catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  }

  let r;
  try { r = await sincronizarGrds({ limite: doCron ? 40 : 120 }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }

  // ─── O AVISO ────────────────────────────────────────────────────────────────────────────────
  // ⚠ UM E-MAIL POR RODADA, não um por GRD. Na primeira carga são 485 arquivos; avisar um a um
  // encheria a caixa do Gabriel e faria o aviso virar ruído — que é o oposto de um alerta.
  const aAvisar = [...r.novas, ...r.revisoes].filter((g) => !g.avisadoEm);
  let avisado = false;
  if (aAvisar.length) {
    const linha = (g) =>
      `<tr><td style="padding:4px 8px;border-bottom:1px solid #eef2f6"><strong>GRD-${escapeHtml(g.numero)}</strong>` +
      `${g.revisao > 0 ? ` <span style="color:#B45309">R${String(g.revisao).padStart(2, "0")}</span>` : ""}</td>` +
      `<td style="padding:4px 8px;border-bottom:1px solid #eef2f6">${g.opNumero ? escapeHtml(fmtOP(g.opNumero)) : "—"}</td>` +
      `<td style="padding:4px 8px;border-bottom:1px solid #eef2f6">${escapeHtml(g.referencia || "—")}</td>` +
      `<td style="padding:4px 8px;border-bottom:1px solid #eef2f6;text-align:right">${g.qtdDocs} doc.</td></tr>`;
    const novas = r.novas.filter((g) => !g.avisadoEm);
    const revs = r.revisoes.filter((g) => !g.avisadoEm);
    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";
    const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail("GRD da Engenharia")}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 26px">
        ${novas.length ? `<p style="margin:0 0 8px"><strong>${novas.length} GRD nova(s)</strong> na pasta:</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">${novas.map(linha).join("")}</table>` : ""}
        ${revs.length ? `<p style="margin:0 0 8px"><strong>${revs.length} revisão/alteração:</strong></p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">${revs.map(linha).join("")}</table>` : ""}
        <p style="text-align:center;margin:22px 0">
          <a href="${base}/engenharia/grd" style="background:#006EAB;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block">Abrir a GRD por OP</a>
        </p>
        <p style="margin:0;color:#5b6b7a;font-size:12px">Aviso automático — a pasta é lida algumas vezes por dia.</p>
      </div>
    </div>`;
    const res = await sendEmail({
      to: AVISAR,
      subject: `GRD da Engenharia — ${novas.length} nova(s), ${revs.length} revisão(ões)`,
      html,
      text: `${novas.length} GRD nova(s) e ${revs.length} revisão(ões). Veja em ${base}/engenharia/grd`,
    }).catch(() => ({ ok: false }));
    avisado = !!res?.ok;
    if (avisado) {
      await prisma.grdEngenharia.updateMany({
        where: { id: { in: aAvisar.map((g) => g.id) } }, data: { avisadoEm: new Date() },
      });
    }
  }

  return NextResponse.json({
    ok: true, total: r.total, lidas: r.lidas,
    novas: r.novas.length, revisoes: r.revisoes.length, erros: r.erros, avisado,
  });
}
