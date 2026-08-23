// GET  — o portal do cliente desta OP (cria em rascunho na primeira abertura).
// PUT  — grava a configuração: mensagem, contato, seções, capa, fotos.
// POST — publica (gera o token) e, com `enviar`, manda o link por e-mail.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { normalizarSecoes, mensagemPadrao, secoesDoPortal } from "@/lib/portal-cliente";

export const runtime = "nodejs";
export const maxDuration = 60;

const PERFIS = ["ADMIN", "COMERCIAL", "QUALIDADE", "PLANEJAMENTO"];
const txt = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);

async function daOP(id) {
  const op = await prisma.oP.findUnique({
    where: { id },
    select: { id: true, numero: true, cliente: true, obra: true, clienteContatos: true },
  });
  if (!op) return null;
  let portal = await prisma.portalCliente.findUnique({ where: { opNumero: op.numero } });
  if (!portal) {
    // ⚠ nasce em RASCUNHO e SEM TOKEN: enquanto ninguém publicar, não existe link — não há
    // como o portal vazar por um endereço criado sem querer.
    portal = await prisma.portalCliente.create({
      data: {
        opNumero: op.numero, opId: op.id, status: "RASCUNHO",
        mensagem: mensagemPadrao({ cliente: op.cliente, obra: op.obra }),
      },
    });
  }
  return { op, portal };
}

export async function GET(_req, { params }) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const r = await daOP(id);
  if (!r) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  return NextResponse.json({ op: r.op, portal: { ...r.portal, secoesAtivas: secoesDoPortal(r.portal) } });
}

export async function PUT(req, { params }) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const r = await daOP(id);
  if (!r) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const portal = await prisma.portalCliente.update({
    where: { id: r.portal.id },
    data: {
      contato: txt(b.contato, 120), empresa: txt(b.empresa, 160), clienteEmail: txt(b.clienteEmail, 160),
      mensagem: txt(b.mensagem, 4000), capaUrl: txt(b.capaUrl, 600), logoClienteUrl: txt(b.logoClienteUrl, 600),
      secoes: normalizarSecoes(b.secoes),
      ...(b.mostrarPeso === undefined ? {} : { mostrarPeso: b.mostrarPeso === true }),
      fotos: Array.isArray(b.fotos)
        ? b.fotos.slice(0, 24).map((f) => ({ url: String(f?.url || "").slice(0, 600), legenda: txt(f?.legenda, 140) }))
            .filter((f) => f.url)
        : undefined,
    },
  });
  return NextResponse.json({ ok: true, portal: { ...portal, secoesAtivas: secoesDoPortal(portal) } });
}

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const r = await daOP(id);
  if (!r) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  // ⚠ o token é gerado UMA VEZ e reaproveitado. Portal é endereço: trocar o link a cada
  // publicação faria o cliente perder o que já tinha salvo — e nos obrigaria a explicar por quê.
  const token = r.portal.token || gerarTokenForte(32);
  const portal = await prisma.portalCliente.update({
    where: { id: r.portal.id },
    data: { token, status: "PUBLICADO", publicadoEm: r.portal.publicadoEm || new Date(), criadoPorId: r.portal.criadoPorId || user.id },
  });

  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";
  const link = `${base}/portal/${token}`;
  let enviado = null;

  if (b.enviar) {
    const para = txt(b.clienteEmail, 160) || portal.clienteEmail;
    if (!para) return NextResponse.json({ error: "Informe o e-mail do cliente para enviar." }, { status: 400 });
    const obra = r.op.obra || `OP-${String(r.op.numero).padStart(3, "0")}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail("Portal da Obra")}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 26px">
        <p style="margin:0 0 12px">Olá${portal.contato ? `, <strong>${portal.contato}</strong>` : ""},</p>
        <p style="margin:0 0 14px">
          Preparamos um portal para você acompanhar a fabricação de <strong>${obra}</strong>: cronograma,
          relatórios de inspeção aprovados, certificados de matéria-prima com rastreabilidade e os
          documentos da obra — atualizados conforme ela avança.
        </p>
        <p style="text-align:center;margin:24px 0">
          <a href="${link}" style="background:#006EAB;color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">Abrir o portal da obra</a>
        </p>
        <p style="margin:0;color:#5b6b7a;font-size:12px">
          Se o botão não funcionar, copie e cole no navegador:<br>
          <span style="color:#006EAB;word-break:break-all">${link}</span>
        </p>
      </div>
    </div>`;
    const res = await sendEmail({
      to: para, subject: `Portal da obra — ${obra} · Torg Metal`, html,
      text: `Acompanhe a fabricação de ${obra}: ${link}`,
      replyTo: user.email || undefined,
    }).catch(() => ({ ok: false }));
    enviado = !!res?.ok;
    if (enviado) {
      await prisma.portalCliente.update({ where: { id: portal.id }, data: { enviadoEm: new Date(), clienteEmail: para } });
    }
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "PUBLICAR_PORTAL_CLIENTE", entity: "PortalCliente", entityId: portal.id, diff: { opNumero: portal.opNumero, enviado } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, link, enviado });
}
