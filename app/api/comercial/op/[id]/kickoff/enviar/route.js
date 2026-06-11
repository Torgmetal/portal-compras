// POST /api/comercial/op/[id]/kickoff/enviar  { para, mensagem?, tipo }
// tipo "GERAL": divulgação animada de início de obra aos setores (escopo,
//   cronograma, prioridades, pesos, entrega, pintura, inspeção, atenções).
// tipo "FISCAL": comunicado para fiscal/financeiro (faturamento por linha,
//   nota de retorno, dados fiscais do cliente).
// Sem valores em R$ em nenhum dos dois.
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  para: z.string().min(3, "Informe os e-mails dos envolvidos"),
  mensagem: z.string().max(2000).optional().nullable(),
  tipo: z.enum(["GERAL", "FISCAL"]).default("GERAL"),
});
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtDataStr = (s) => {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || "—");
};
const fmtKg = (v) => (v != null ? `${Number(v).toLocaleString("pt-BR")} kg` : "—");
const fmtMoeda = (v) => (v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");

// Bloco do botão de ACEITE — link único por destinatário; registra que o setor
// está de acordo com as informações divulgadas.
function blocoAceite(url) {
  return `
    <div style="text-align:center;margin:24px 0 8px 0;">
      <a href="${url}" style="display:inline-block;background:#059669;color:#fff;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
        ✅ Li e estou de acordo
      </a>
      <p style="margin:8px 0 0 0;color:#718096;font-size:12px;">Clique para registrar seu aceite às informações deste kick off.</p>
    </div>`;
}

function secao(titulo, conteudoHtml) {
  if (!conteudoHtml) return "";
  return `
    <p style="margin:18px 0 6px 0;color:#006EAB;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${titulo}</p>
    ${conteudoHtml}`;
}
const paragrafo = (txt) => (txt ? `<p style="margin:0;color:#2d3748;font-size:14px;line-height:1.6;white-space:pre-wrap;">${txt}</p>` : "");
const listaHtml = (itens, cor, marcador) => itens.length
  ? `<ul style="margin:4px 0 0 0;padding-left:0;list-style:none;">${itens.map((i) => `<li style="margin:3px 0;color:${cor};font-size:14px;line-height:1.5;">${marcador} ${i}</li>`).join("")}</ul>`
  : "";

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const emails = body.para.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const invalidos = emails.filter((e) => !EMAIL_RE.test(e));
  if (emails.length === 0 || invalidos.length) {
    return NextResponse.json({ error: `E-mail inválido: ${invalidos.join(", ") || "(vazio)"}` }, { status: 400 });
  }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    select: {
      id: true, numero: true, cliente: true, obra: true, dataInicio: true, dataFimPrevista: true,
      clienteRazaoSocial: true, clienteCnpj: true, clienteIE: true, clienteEndereco: true,
      clienteCidade: true, clienteUF: true, clienteCep: true, clienteContato: true,
      kickoff: true,
      itens: { select: { descricao: true, categoria: true, faturamentoDireto: true } },
      aditivos: { select: { itens: { select: { descricao: true, categoria: true, faturamentoDireto: true } } } },
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const k = op.kickoff;
  if (!k) return NextResponse.json({ error: "Salve o Kick Off antes de enviar." }, { status: 400 });

  const esc = escapeHtml;
  const linhas = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean).map(esc);
  const obraLabel = `${esc(op.cliente)}${op.obra ? ` · ${esc(op.obra)}` : ""}`;
  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  // Banner padrão da divulgação (logo Torg + abertura animada) — usado nos
  // DOIS comunicados para manter a identidade da marca.
  const banner = (subtituloTipo) => `
      <div style="background:#002945;border-radius:12px 12px 0 0;padding:26px 28px 20px 28px;text-align:center;">
        <img src="${baseUrl}/torg-logo-white.png" width="150" alt="Torg Metal" style="display:block;margin:0 auto 10px auto;max-width:150px;height:auto;">
        <p style="margin:0;font-size:30px;line-height:1;">🚀🏗️</p>
        <p style="margin:8px 0 0 0;color:#fff;font-size:24px;font-weight:800;letter-spacing:0.5px;">NOVA OBRA CONFIRMADA!</p>
        <p style="margin:6px 0 0 0;color:#F4801F;font-size:18px;font-weight:700;">OP ${esc(op.numero)} — ${obraLabel}</p>
        <p style="margin:10px 0 0 0;color:#90cdf4;font-size:13px;">${subtituloTipo}</p>
      </div>`;

  // Gantt em tabela (compatível com clientes de e-mail): barra por fase e
  // marco ◆ para prioridades, posicionados por largura percentual.
  function ganttEmail() {
    const todas = (Array.isArray(k.cronograma) ? k.cronograma : [])
      .filter((c) => c?.fase && c?.data)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)));
    if (todas.length < 2) return "";
    const entrega = k.dataEntregaAcordada ? k.dataEntregaAcordada.toISOString().slice(0, 10) : null;
    const iniStr = todas[0].data;
    const fimStr = entrega && entrega > todas[todas.length - 1].data ? entrega : todas[todas.length - 1].data;
    const t0 = new Date(iniStr + "T00:00:00").getTime();
    const t1 = new Date(fimStr + "T23:59:59").getTime();
    const span = Math.max(t1 - t0, 1);
    const pct = (d) => Math.min(98, Math.max(0, ((new Date(d + "T12:00:00").getTime() - t0) / span) * 100));

    let linhasG = "";
    let prevPct = 0;
    for (const c of todas) {
      const ehMarco = String(c.fase).startsWith("★");
      const x = pct(c.data);
      if (ehMarco) {
        linhasG += `
        <tr>
          <td style="width:220px;padding:3px 8px 3px 0;font-size:11px;color:#92400e;font-weight:700;text-align:right;white-space:nowrap;overflow:hidden;">${esc(String(c.fase).slice(0, 38))}</td>
          <td style="padding:3px 0;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
              ${x > 0 ? `<td style="width:${x.toFixed(1)}%;font-size:1px;">&nbsp;</td>` : ""}
              <td style="font-size:13px;color:#d69e2e;white-space:nowrap;">◆ <span style="font-size:10px;color:#92400e;font-weight:700;">${fmtDataStr(c.data)}</span></td>
            </tr></table>
          </td>
        </tr>`;
      } else {
        const ini = prevPct;
        const w = Math.max(pct(c.data) - ini, 3);
        linhasG += `
        <tr>
          <td style="width:220px;padding:3px 8px 3px 0;font-size:11px;color:#2d3748;font-weight:600;text-align:right;white-space:nowrap;overflow:hidden;">${esc(String(c.fase).slice(0, 38))}</td>
          <td style="padding:3px 0;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
              ${ini > 0 ? `<td style="width:${ini.toFixed(1)}%;font-size:1px;">&nbsp;</td>` : ""}
              <td style="width:${w.toFixed(1)}%;background:#006EAB;border-radius:4px;font-size:1px;height:14px;">&nbsp;</td>
              <td style="padding-left:5px;font-size:10px;color:#4a5568;font-weight:600;white-space:nowrap;">${fmtDataStr(c.data)}</td>
            </tr></table>
          </td>
        </tr>`;
        prevPct = pct(c.data);
      }
    }
    return `
      <p style="margin:18px 0 6px 0;color:#006EAB;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Linha do tempo (Gantt)</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#fbfdff;">${linhasG}</table>
      <p style="margin:4px 0 0 0;color:#a0aec0;font-size:11px;">▬ fase &nbsp;·&nbsp; ◆ prioridade &nbsp;·&nbsp; período: ${fmtDataStr(iniStr)} → ${fmtDataStr(fimStr)}</p>`;
  }

  let subject, html;

  if (body.tipo === "GERAL") {
    // ── Divulgação animada de início de obra ──────────────────────────────
    const incluso = linhas(k.escopoIncluso);
    const excluso = linhas(k.escopoExcluso);
    const cron = Array.isArray(k.cronograma) ? k.cronograma.filter((c) => c?.fase) : [];
    const prios = Array.isArray(k.prioridades) ? k.prioridades.filter((p) => p?.descricao) : [];
    const pesos = Array.isArray(k.pesoResumo) ? k.pesoResumo.filter((p) => p?.descricao) : [];
    const pesoTotal = pesos.reduce((s, p) => s + (Number(p.pesoKg) || 0), 0);

    const cronHtml = cron.length ? `
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr style="background:#002945;">
          <th style="padding:8px 12px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;">Fase / Setor</th>
          <th style="padding:8px 12px;text-align:center;color:#fff;font-size:11px;text-transform:uppercase;width:110px;">Data limite</th>
          <th style="padding:8px 12px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;">Obs.</th>
        </tr>
        ${cron.map((c, i) => `
        <tr style="background:${i % 2 ? "#f7fafc" : "#fff"};">
          <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;font-weight:600;">${esc(c.fase)}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;text-align:center;white-space:nowrap;">${fmtDataStr(c.data)}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#718096;">${esc(c.obs || "")}</td>
        </tr>`).join("")}
      </table>` : "";

    const priosHtml = prios.length ? `
      <ol style="margin:4px 0 0 0;padding-left:20px;color:#2d3748;font-size:14px;line-height:1.7;">
        ${prios.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map((p) => `<li><strong>${esc(p.descricao)}</strong>${p.data ? ` — até ${fmtDataStr(p.data)}` : ""}</li>`).join("")}
      </ol>` : "";

    const pesosHtml = pesos.length ? `
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr style="background:#edf2f7;">
          <th style="padding:7px 12px;text-align:left;color:#4a5568;font-size:11px;text-transform:uppercase;">Grupo / Item</th>
          <th style="padding:7px 12px;text-align:right;color:#4a5568;font-size:11px;text-transform:uppercase;width:80px;">Qtd</th>
          <th style="padding:7px 12px;text-align:right;color:#4a5568;font-size:11px;text-transform:uppercase;width:110px;">Peso</th>
        </tr>
        ${pesos.map((p, i) => `
        <tr style="background:${i % 2 ? "#f7fafc" : "#fff"};">
          <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;">${esc(p.descricao)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#4a5568;text-align:right;">${p.qtd != null ? Number(p.qtd).toLocaleString("pt-BR") : "—"}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;text-align:right;white-space:nowrap;">${fmtKg(p.pesoKg)}</td>
        </tr>`).join("")}
        ${pesoTotal > 0 ? `<tr style="background:#002945;"><td style="padding:7px 12px;color:#fff;font-size:13px;font-weight:700;">TOTAL</td><td></td><td style="padding:7px 12px;color:#fff;font-size:13px;font-weight:700;text-align:right;white-space:nowrap;">${fmtKg(Math.round(pesoTotal))}</td></tr>` : ""}
      </table>` : "";

    subject = `🚀 Nova obra na área! Kick Off — OP ${op.numero} · ${op.cliente}`;
    html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:0 auto;color:#2d3748;">
      ${banner("É hora do kick off — bora fazer acontecer, time! 💪")}
      <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:22px 28px;">
        ${body.mensagem ? `<div style="background:#fff8f1;border-left:4px solid #F4801F;padding:10px 14px;border-radius:0 6px 6px 0;margin-bottom:14px;"><p style="margin:0;font-size:14px;color:#2d3748;white-space:pre-wrap;">${esc(body.mensagem)}</p></div>` : ""}

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:3px 0;color:#718096;width:190px;">Cliente</td><td style="padding:3px 0;"><strong>${esc(op.cliente)}</strong>${op.obra ? ` — ${esc(op.obra)}` : ""}</td></tr>
          ${k.pedidoCompraCliente ? `<tr><td style="padding:3px 0;color:#718096;">Pedido do cliente</td><td style="padding:3px 0;"><strong>${esc(k.pedidoCompraCliente)}</strong></td></tr>` : ""}
          ${k.dataEntregaAcordada ? `<tr><td style="padding:3px 0;color:#718096;">Entrega acordada</td><td style="padding:3px 0;"><strong style="color:#c05621;">${fmtData(k.dataEntregaAcordada)}</strong></td></tr>` : ""}
          ${k.frete ? `<tr><td style="padding:3px 0;color:#718096;">Frete</td><td style="padding:3px 0;">${k.frete === "TORG" ? "Por conta da Torg (CIF)" : "Por conta do cliente (FOB)"}</td></tr>` : ""}
          ${k.entregaEndereco ? `<tr><td style="padding:3px 0;color:#718096;vertical-align:top;">Local de entrega</td><td style="padding:3px 0;white-space:pre-wrap;">${esc(k.entregaEndereco)}</td></tr>` : ""}
        </table>

        ${secao("O que vamos fazer", paragrafo(esc(k.escopo || "")))}
        ${incluso.length || excluso.length ? secao("Escopo", `
          ${listaHtml(incluso, "#276749", "✅")}
          ${listaHtml(excluso, "#9b2c2c", "🚫")}
        `) : ""}
        ${pesos.length ? secao("Resumo de pesos", pesosHtml) : ""}
        ${cron.length ? secao("Cronograma prévio — datas-limite por fase", cronHtml) : ""}
        ${ganttEmail()}
        ${prios.length ? secao("Prioridades de fase/peça/entrega", priosHtml) : ""}
        ${k.padraoPintura ? secao("Padrão de pintura", paragrafo(esc(k.padraoPintura))) : ""}
        ${k.inspecao ? secao("Inspeção", paragrafo(esc(k.inspecao))) : ""}
        ${k.observacoes ? secao("Observações", paragrafo(esc(k.observacoes))) : ""}

        <div style="background:#ebf8ff;border-radius:8px;padding:12px 16px;margin:20px 0 0 0;text-align:center;">
          <p style="margin:0;color:#2b6cb0;font-size:13px;">Dúvidas sobre a obra? Fala com o comercial. Kick off ${k.kickoffSetoresEm ? `com os setores em <strong>${fmtData(k.kickoffSetoresEm)}</strong>` : "a agendar"}.</p>
        </div>
        __ACEITE__
        <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0 10px 0;">
        <p style="margin:0;color:#a0aec0;font-size:12px;">Enviado por ${esc(user.name)} — Workspace Torg (uso interno). Sem valores comerciais neste comunicado.</p>
      </div>
    </div>`;
  } else {
    // ── Comunicado fiscal/financeiro ──────────────────────────────────────
    const todosItens = [...op.itens, ...op.aditivos.flatMap((a) => a.itens)];
    const linhasItens = todosItens.map((it, i) => `
      <tr style="background:${i % 2 ? "#f7fafc" : "#fff"};">
        <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;">${esc(it.descricao)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#4a5568;">${esc(it.categoria || "—")}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">
          <span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;background:${it.faturamentoDireto ? "#d69e2e" : "#006EAB"};">${it.faturamentoDireto ? "Direto (cliente)" : "Torg"}</span>
        </td>
      </tr>`).join("");

    subject = `🚀 Nova obra na área! Kick Off fiscal — OP ${op.numero} · ${op.cliente}`;
    html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:0 auto;color:#2d3748;">
      ${banner("É hora do kick off — comunicado fiscal & financeiro da obra 💼")}
      <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 10px 10px;padding:20px 24px;">
        ${body.mensagem ? `<div style="background:#ebf8ff;border-left:4px solid #006EAB;padding:10px 14px;border-radius:0 6px 6px 0;margin-bottom:14px;"><p style="margin:0;font-size:14px;color:#2d3748;white-space:pre-wrap;">${esc(body.mensagem)}</p></div>` : ""}

        <p style="margin:0 0 6px 0;color:#006EAB;font-size:13px;font-weight:700;text-transform:uppercase;">Dados fiscais do cliente</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
          <tr><td style="padding:3px 0;color:#718096;width:190px;">Razão social</td><td style="padding:3px 0;"><strong>${esc(op.clienteRazaoSocial || op.cliente)}</strong></td></tr>
          ${op.clienteCnpj ? `<tr><td style="padding:3px 0;color:#718096;">CNPJ</td><td style="padding:3px 0;">${esc(op.clienteCnpj)}</td></tr>` : ""}
          ${op.clienteIE ? `<tr><td style="padding:3px 0;color:#718096;">IE</td><td style="padding:3px 0;">${esc(op.clienteIE)}</td></tr>` : ""}
          ${op.clienteEndereco ? `<tr><td style="padding:3px 0;color:#718096;">Endereço fiscal</td><td style="padding:3px 0;">${esc([op.clienteEndereco, op.clienteCidade && `${op.clienteCidade}/${op.clienteUF || ""}`, op.clienteCep].filter(Boolean).join(" — "))}</td></tr>` : ""}
          ${k.pedidoCompraCliente ? `<tr><td style="padding:3px 0;color:#718096;">Pedido de compra do cliente</td><td style="padding:3px 0;"><strong>${esc(k.pedidoCompraCliente)}</strong></td></tr>` : ""}
          ${k.entregaEndereco ? `<tr><td style="padding:3px 0;color:#718096;vertical-align:top;">Local de entrega</td><td style="padding:3px 0;white-space:pre-wrap;">${esc(k.entregaEndereco)}</td></tr>` : ""}
          ${k.frete ? `<tr><td style="padding:3px 0;color:#718096;">Frete</td><td style="padding:3px 0;">${k.frete === "TORG" ? "Por conta da Torg (CIF)" : "Por conta do cliente (FOB)"}</td></tr>` : ""}
        </table>

        <div style="background:${k.notaRetorno ? "#fffbeb" : "#f7fafc"};border:1px solid ${k.notaRetorno ? "#f6e05e" : "#e2e8f0"};border-radius:8px;padding:10px 14px;margin:10px 0;">
          <p style="margin:0;font-size:14px;color:#2d3748;"><strong>Nota de retorno:</strong> ${k.notaRetorno ? "SIM — NECESSÁRIA" : "não é necessária"}${k.notaRetorno && k.notaRetornoObs ? ` — ${esc(k.notaRetornoObs)}` : ""}</p>
        </div>

        ${k.tipoFaturamento ? secao("Tipo de faturamento (definido na proposta)", paragrafo(esc(k.tipoFaturamento))) : ""}

        ${Array.isArray(k.faturamentoEventos) && k.faturamentoEventos.length ? `
        <p style="margin:18px 0 6px 0;color:#006EAB;font-size:13px;font-weight:700;text-transform:uppercase;">Eventos de faturamento</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <tr style="background:#002945;">
            <th style="padding:8px 10px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;">Evento</th>
            <th style="padding:8px 10px;text-align:right;color:#fff;font-size:11px;text-transform:uppercase;">%</th>
            <th style="padding:8px 10px;text-align:right;color:#fff;font-size:11px;text-transform:uppercase;">Valor</th>
            <th style="padding:8px 10px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;">Prazo pgto.</th>
            <th style="padding:8px 10px;text-align:center;color:#fff;font-size:11px;text-transform:uppercase;">Medição</th>
            <th style="padding:8px 10px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;">Obs. NF</th>
          </tr>
          ${k.faturamentoEventos.map((ev, i) => `
          <tr style="background:${i % 2 ? "#f7fafc" : "#fff"};">
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;font-weight:600;">${esc(ev.descricao || "—")}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;text-align:right;">${ev.percentual != null ? `${ev.percentual}%` : "—"}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;text-align:right;white-space:nowrap;">${fmtMoeda(ev.valor)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#4a5568;">${esc(ev.prazoPagamento || "—")}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#4a5568;text-align:center;">${esc(ev.medicao || "—")}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#718096;">${esc(ev.obsNF || "—")}</td>
          </tr>`).join("")}
        </table>` : ""}

        ${k.retencaoContratual ? `
        <div style="background:#fff5f5;border:1px solid #feb2b2;border-radius:8px;padding:10px 14px;margin:12px 0;">
          <p style="margin:0;font-size:14px;color:#742a2a;"><strong>⚠ Retenção contratual:</strong> ${esc(k.retencaoContratual)}</p>
        </div>` : ""}
        ${k.segurosObrigatorios ? secao("Seguros obrigatórios", paragrafo(esc(k.segurosObrigatorios))) : ""}
        ${k.fiscalObservacao ? `${secao("Observações de faturamento", paragrafo(esc(k.fiscalObservacao)))}` : ""}

        <p style="margin:18px 0 6px 0;color:#006EAB;font-size:13px;font-weight:700;text-transform:uppercase;">Faturamento por linha do pedido</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <tr style="background:#002945;">
            <th style="padding:8px 10px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;">Item</th>
            <th style="padding:8px 10px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;">Categoria</th>
            <th style="padding:8px 10px;text-align:center;color:#fff;font-size:11px;text-transform:uppercase;">Faturamento</th>
          </tr>
          ${linhasItens}
        </table>

        __ACEITE__
        <hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0 12px 0;">
        <p style="margin:0;color:#a0aec0;font-size:12px;">Enviado por ${esc(user.name)} — Workspace Torg (uso interno).</p>
      </div>
    </div>`;
  }

  // Envio individual: cada destinatário ganha um token de ACEITE próprio e o
  // e-mail leva o botão "Li e estou de acordo" com o link único.
  const resultados = [];
  for (const email of emails) {
    const token = randomUUID();
    await prisma.kickoffAceite.create({
      data: { kickoffId: k.id, tipo: body.tipo, email, token },
    });
    const htmlFinal = html.replace("__ACEITE__", blocoAceite(`${baseUrl}/kickoff/aceite/${token}`));
    const r = await sendEmail({
      to: email,
      replyTo: user.email,
      subject,
      html: htmlFinal,
      text: `Kick Off da OP ${op.numero} — ${op.cliente}. Confirme seu aceite: ${baseUrl}/kickoff/aceite/${token}`,
    });
    resultados.push({ email, ok: r.ok, error: r.error || null });
  }

  const falhas = resultados.filter((r) => !r.ok);
  if (falhas.length === emails.length) {
    return NextResponse.json({ error: "Nenhum e-mail foi enviado: " + (falhas[0]?.error || "falha no envio") }, { status: 502 });
  }

  await prisma.oPKickOff.update({
    where: { opId: op.id },
    data: { enviadoPara: emails.join(", "), enviadoEm: new Date() },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ENVIAR_KICKOFF", entity: "OPKickOff", entityId: k.id, diff: { opNumero: op.numero, tipo: body.tipo, para: emails, falhas: falhas.map((f) => f.email) } },
  }).catch(() => {});

  return NextResponse.json({ success: true, enviados: resultados.filter((r) => r.ok).length, falhas: falhas.map((f) => f.email) });
}
