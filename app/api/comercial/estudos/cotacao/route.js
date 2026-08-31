// GET  /api/comercial/estudos/cotacao?tipo=TINTA&estudoId=...  → fornecedores da família + cotações já enviadas
// POST /api/comercial/estudos/cotacao  { estudoId, tipo, fornecedorIds[], snapshot } → dispara a cotação
//
// Vitor (31/08/2026): "precisamos que tenha o botão para enviar para cotação (…) mando a
// especificação da pintura, mais a área a ser pintada e o coeficiente de perda para o fabricante e
// com base nisso ele informa quantos galões, quantos diluentes e componentes B vai precisar vender"
// e "traga os cadastrados no vendor list, página de compras, lista de fornecedores de tintas".
//
// ⚠⚠ SÓ VAI PARA QUEM FOI SELECIONADO. Vitor (31/08/2026): "precisa ser selecionado quais
// fornecedores vamos enviar, não deve mandar nada para ninguém que não esteja selecionado". A rota
// não tem "enviar para todos": a lista de ids é obrigatória e é ela que manda.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { escapeHtml } from "@/lib/html";

export const runtime = "nodejs";
export const maxDuration = 120;

// família do vendor list por tipo de insumo — é o filtro que traz "os cadastrados"
const FAMILIA = { TINTA: /tinta/i };

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const u = new URL(req.url);
  const tipo = String(u.searchParams.get("tipo") || "TINTA").toUpperCase();
  const estudoId = String(u.searchParams.get("estudoId") || "");
  const rx = FAMILIA[tipo];
  if (!rx) return NextResponse.json({ error: "Tipo de insumo desconhecido." }, { status: 400 });

  const todos = await prisma.fornecedor.findMany({
    where: { ativo: true },
    select: { id: true, razaoSocial: true, nomeFantasia: true, email: true, categorias: true, cidade: true, uf: true },
    orderBy: { razaoSocial: "asc" },
  });
  // ⚠ SEM E-MAIL NÃO ENTRA NA LISTA: um fornecedor que não dá para chamar só ocuparia espaço e
  // criaria a impressão de que a cotação foi mais ampla do que foi.
  const fornecedores = todos
    .filter((f) => f.email && rx.test(Array.isArray(f.categorias) ? f.categorias.join(" ") : String(f.categorias || "")))
    .map((f) => ({ id: f.id, nome: f.nomeFantasia || f.razaoSocial, email: f.email, praca: [f.cidade, f.uf].filter(Boolean).join("/") }));

  const cotacoes = estudoId
    ? await prisma.cotacaoEstudo.findMany({
        where: { estudoId, tipo },
        orderBy: { enviadoEm: "desc" },
        select: {
          id: true, enviadoEm: true, enviadoPorNome: true, snapshot: true,
          fornecedores: { select: { id: true, nome: true, email: true, enviadoEm: true, erroEnvio: true, respondidoEm: true, valorTotal: true, vencedor: true } },
        },
      })
    : [];

  return NextResponse.json({ fornecedores, cotacoes });
}

const Body = z.object({
  estudoId: z.string().min(1),
  tipo: z.string().default("TINTA"),
  fornecedorIds: z.array(z.string()).min(1, "Selecione ao menos um fornecedor."),
  snapshot: z.object({}).passthrough().default({}),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let b;
  try { b = Body.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const escolhidos = await prisma.fornecedor.findMany({
    where: { id: { in: b.fornecedorIds }, ativo: true, email: { not: null } },
    select: { id: true, razaoSocial: true, nomeFantasia: true, email: true },
  });
  if (!escolhidos.length) return NextResponse.json({ error: "Nenhum dos fornecedores selecionados tem e-mail." }, { status: 400 });

  const est = await prisma.estudoFabricacao.findUnique({
    where: { id: b.estudoId },
    select: { numero: true, ano: true, orcamento: { select: { numero: true, cliente: true, obra: true } } },
  });
  const obra = [est?.orcamento?.cliente, est?.orcamento?.obra].filter(Boolean).join(" · ") || "obra em orçamento";

  const cot = await prisma.cotacaoEstudo.create({
    data: {
      estudoId: b.estudoId, tipo: b.tipo, snapshot: b.snapshot,
      enviadoPorId: user.id, enviadoPorNome: user.name || user.email || null,
      fornecedores: {
        create: escolhidos.map((f) => ({
          fornecedorId: f.id, nome: f.nomeFantasia || f.razaoSocial, email: f.email, token: gerarTokenForte(32),
        })),
      },
    },
    select: { id: true, fornecedores: { select: { id: true, nome: true, email: true, token: true } } },
  });

  const s = b.snapshot || {};
  const linhaCamada = (c) =>
    `<tr><td style="padding:5px 8px;border-bottom:1px solid #eef2f6"><strong>${escapeHtml(c.camada || "")}</strong></td>` +
    `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6">${escapeHtml(c.produto || "—")}</td>` +
    `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6;text-align:right">${c.peliculaSeca ?? "—"} µm</td>` +
    `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6;text-align:right">${c.solidos ?? "—"}%</td>` +
    `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6">${escapeHtml(c.cor || "—")}</td></tr>`;

  let ok = 0;
  for (const f of cot.fornecedores) {
    // ⚠ O QUE ELE PRECISA PARA RESPONDER, e nada além. Vitor: área, esquema e perda — com isso o
    // fabricante dimensiona galões, diluente e componente B. Sem preço nosso, sem nome de
    // concorrente, sem OP: é orçamento, não pedido.
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail("Consulta técnica de tintas")}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 26px">
        <p style="margin:0 0 12px">Olá <strong>${escapeHtml(f.nome)}</strong>,</p>
        <p style="margin:0 0 14px">
          A Torg Metal está orçando a obra <strong>${escapeHtml(obra)}</strong> e gostaríamos da sua
          ajuda para dimensionar o sistema de pintura.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 16px">
          <tr><td style="padding:5px 8px;background:#f6f8fa;width:45%">Área total a pintar</td>
              <td style="padding:5px 8px;background:#f6f8fa"><strong>${Number(s.areaM2 || 0).toLocaleString("pt-BR")} m²</strong></td></tr>
          <tr><td style="padding:5px 8px">Coeficiente de perda</td>
              <td style="padding:5px 8px"><strong>${escapeHtml(String(s.perda ?? "45"))}%</strong>${s.perdaNota ? ` <span style="color:#5b6b7a">(${escapeHtml(s.perdaNota)})</span>` : ""}</td></tr>
          ${s.fabricante ? `<tr><td style="padding:5px 8px;background:#f6f8fa">Especificação do cliente</td><td style="padding:5px 8px;background:#f6f8fa">${escapeHtml(s.fabricante)}</td></tr>` : ""}
        </table>
        ${Array.isArray(s.camadas) && s.camadas.length ? `
          <p style="margin:0 0 6px;font-weight:bold">Esquema de pintura</p>
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin:0 0 16px">
            <tr style="background:#0D1F3C;color:#fff">
              <td style="padding:5px 8px">Demão</td><td style="padding:5px 8px">Produto / resina</td>
              <td style="padding:5px 8px;text-align:right">Película seca</td>
              <td style="padding:5px 8px;text-align:right">Sólidos</td><td style="padding:5px 8px">Cor</td>
            </tr>
            ${s.camadas.map(linhaCamada).join("")}
          </table>` : ""}
        <p style="margin:0 0 14px">
          Com base nisso, poderia nos informar <strong>quantos galões de cada demão</strong>,
          <strong>quanto de diluente</strong> e <strong>quanto de componente B</strong> seriam
          necessários para atender essa área — e o preço de cada item?
        </p>
        <p style="margin:0 0 14px;color:#5b6b7a;font-size:13px">
          Basta responder a este e-mail. Estamos em fase de orçamento: ainda não é um pedido de compra.
        </p>
        <p style="margin:0;color:#5b6b7a;font-size:12px">Consulta ${escapeHtml(String(est?.numero || ""))}/${escapeHtml(String(est?.ano || ""))} · Engenharia Comercial — Torg Metal</p>
      </div>
    </div>`;
    const r = await sendEmail({
      to: f.email,
      subject: `Consulta de tintas — ${obra} · Torg Metal`,
      html,
      text: `Estamos orçando ${obra}. Área a pintar: ${Number(s.areaM2 || 0).toLocaleString("pt-BR")} m², perda ${s.perda ?? 45}%. Poderia informar galões, diluente e componente B necessários, com preço? Responda este e-mail.`,
      replyTo: user.email || undefined,
    }).catch((e) => ({ ok: false, erro: e.message }));
    await prisma.cotacaoEstudoFornecedor.update({
      where: { id: f.id },
      data: r?.ok ? { enviadoEm: new Date() } : { erroEnvio: String(r?.erro || "falha no envio").slice(0, 200) },
    });
    if (r?.ok) ok++;
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "COTACAO_ESTUDO_ENVIADA", entity: "CotacaoEstudo", entityId: cot.id,
      diff: { tipo: b.tipo, estudoId: b.estudoId, convidados: cot.fornecedores.length, enviados: ok },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, id: cot.id, convidados: cot.fornecedores.length, enviados: ok });
}
