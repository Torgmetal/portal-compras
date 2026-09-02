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
        mensagem: mensagemPadrao({ cliente: op.cliente }),
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
      destinatarios: Array.isArray(b.destinatarios)
        ? b.destinatarios.slice(0, 20).map((x) => ({ nome: txt(x?.nome, 120), email: txt(x?.email, 160) }))
            .filter((x) => x.email && /.+@.+\..+/.test(x.email))
        : undefined,
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
  let totalEnvio = 0;
  let okEnvio = 0;

  if (b.enviar) {
    // ⚠ A OBRA TEM MAIS DE UM INTERLOCUTOR. Vitor (27/08/2026): "preciso de campos para colocar mais
    // e-mails para enviar o acesso ao portal da obra". O contato principal continua sendo o primeiro
    // da fila; os demais vêm da lista gravada no portal. Cada um recebe o SEU código (?d=) — é o que
    // permite dizer depois quem abriu, em vez de um "acesso sem identificação" quando o link é
    // repassado. Endereço repetido entra uma vez só.
    const principal = txt(b.clienteEmail, 160) || portal.clienteEmail;
    const extras = Array.isArray(b.destinatarios) ? b.destinatarios : (Array.isArray(portal.destinatarios) ? portal.destinatarios : []);
    const lista = [];
    for (const x of [{ nome: txt(b.contato, 120) || portal.contato, email: principal }, ...extras]) {
      const email = txt(x?.email, 160);
      if (!email || !/.+@.+\..+/.test(email)) continue;
      if (lista.some((y) => y.email.toLowerCase() === email.toLowerCase())) continue;
      lista.push({ nome: txt(x?.nome, 120), email });
    }
    if (!lista.length) return NextResponse.json({ error: "Informe o e-mail do cliente para enviar." }, { status: 400 });

    // ⚠⚠ UM CÓDIGO POR PESSOA. Vitor (26/08/2026): "preciso do histórico do acesso (…) para as
    // pessoas que enviamos". Com um link só para a obra dá para dizer "abriram 7 vezes" e nunca
    // "o Fulano abriu e baixou o certificado" — e é a segunda pergunta que ele faz.
    //
    // ⚠ O CÓDIGO NÃO É SENHA: quem repassar o link repassa a identidade junto. Serve para saber
    // quem recebeu e o que aconteceu depois; quem controla o acesso continua sendo o token.
    // ⚠ Reenviar para o MESMO e-mail reaproveita o código — senão o histórico de quem já abriu se
    // partiria em duas pessoas a cada reenvio.
    const obra = r.op.obra || `OP-${String(r.op.numero).padStart(3, "0")}`;
    let enviados = 0;
    for (const pessoa of lista) {
      const jaTem = await prisma.portalDestinatario.findFirst({ where: { portalId: portal.id, email: pessoa.email } });
      const dest = jaTem
        ? await prisma.portalDestinatario.update({ where: { id: jaTem.id }, data: { enviadoEm: new Date(), enviadoPorNome: user.name || user.email || null, nome: pessoa.nome || jaTem.nome } })
        : await prisma.portalDestinatario.create({
            data: {
              portalId: portal.id, opNumero: portal.opNumero, email: pessoa.email,
              nome: pessoa.nome || null,
              codigo: `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`,
              enviadoEm: new Date(), enviadoPorNome: user.name || user.email || null,
            },
          });
      const linkPessoal = `${link}?d=${dest.codigo}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
        ${cabecalhoEmail("Portal da Obra")}
        <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 26px">
          <p style="margin:0 0 12px">Olá${pessoa.nome ? `, <strong>${pessoa.nome}</strong>` : ""},</p>
          <p style="margin:0 0 14px">
            Preparamos um portal para você acompanhar a fabricação de <strong>${obra}</strong>: cronograma,
            relatórios de inspeção aprovados, certificados de matéria-prima com rastreabilidade e os
            documentos da obra — atualizados conforme ela avança.
          </p>
          <p style="text-align:center;margin:24px 0">
            <a href="${linkPessoal}" style="background:#006EAB;color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">Abrir o portal da obra</a>
          </p>
          <p style="margin:0;color:#5b6b7a;font-size:12px">
            Se o botão não funcionar, copie e cole no navegador:<br>
            <span style="color:#006EAB;word-break:break-all">${linkPessoal}</span>
          </p>
        </div>
      </div>`;
      const res = await sendEmail({
        to: pessoa.email, subject: `Portal da obra — ${obra} · Torg Metal`, html,
        text: `Acompanhe a fabricação de ${obra}: ${linkPessoal}`,
        replyTo: user.email || undefined,
      }).catch(() => ({ ok: false }));
      if (res?.ok) enviados++;
    }
    enviado = enviados > 0;
    if (enviado) {
      // ⚠⚠ O E-MAIL DE PUBLICAÇÃO JÁ ANUNCIA O QUE ESTÁ NO AR. Vitor (01/09/2026): "só o e-mail que
      // listou todos os itens da aba da engenharia, não mostrou apenas os que foram adicionados".
      //
      // O aviso de "documentos novos" compara o que está publicado com o que já foi anunciado
      // (`docsAvisados`). Sem carimbar aqui, esse conjunto nascia VAZIO e o primeiro aviso listava a
      // obra inteira — tecnicamente correto ("nada foi anunciado ainda"), mas errado na prática:
      // quem recebeu o link recebeu tudo junto com ele.
      const doPortal = [];
      const mapa = portal.docsPorArea || (portal.docsEngenharia ? { ENGENHARIA: portal.docsEngenharia } : {});
      for (const lst of Object.values(mapa || {})) {
        if (Array.isArray(lst)) for (const doc of lst) if (doc?.id) doPortal.push(String(doc.id));
      }
      await prisma.portalCliente.update({
        where: { id: portal.id },
        data: { enviadoEm: new Date(), clienteEmail: lista[0].email, docsAvisados: doPortal, docsAvisadoEm: new Date() },
      });
    }
    totalEnvio = lista.length; okEnvio = enviados;
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "PUBLICAR_PORTAL_CLIENTE", entity: "PortalCliente", entityId: portal.id, diff: { opNumero: portal.opNumero, enviado, destinatarios: totalEnvio } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, link, enviado, total: totalEnvio, enviados: okEnvio });
}
