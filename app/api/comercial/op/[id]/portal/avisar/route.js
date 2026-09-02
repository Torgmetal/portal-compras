// ─── AVISAR O CLIENTE SOBRE DOCUMENTOS NOVOS NO PORTAL ────────────────────────
// GET  → o que há de novo e para quem daria para mandar (não envia nada)
// POST → manda o aviso {emails?: string[]}  e carimba o que foi avisado
//
// Vitor (01/09/2026): "preciso enviar para os envolvidos sobre alguns arquivos que adicionei (…)
// pensei em um botão para mandar o alerta" e "eu só não faria isso sempre que algum arquivo for
// adicionado e sim quando eu quiser mandar".
//
// ⚠⚠ NÃO DISPARA SOZINHO. Publicar um documento não manda e-mail: o novo se ACUMULA até alguém
// clicar. Quem sobe dez arquivos ao longo do dia manda um aviso, não dez — e aviso que chega em
// rajada é o que ensina o cliente a ignorar o próximo.
//
// ⚠ O AVISO NÃO É O CONVITE. O e-mail de publicação explica o que é o portal; este assume que a
// pessoa já conhece e vai direto ao que mudou. Repetir a apresentação faria a terceira mensagem
// não ser lida.
//
// ⚠⚠ MANTÉM O LINK PESSOAL (`?d=codigo`). É ele que faz o histórico saber QUEM abriu; um link sem
// código volta como acesso anônimo e joga fora o rastreio que o portal já tem.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { escapeHtml } from "@/lib/html";
import { TIPO_ENG, tipoDoDocEng, secoesDoPortal } from "@/lib/portal-cliente";

const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "ENGENHARIA"];
const AREA_NOME = { ENGENHARIA: "Engenharia", QUALIDADE: "Qualidade", PLANEJAMENTO: "Planejamento", EXPEDICAO: "Expedição" };

/** Os documentos publicados hoje, achatados, com a caixa a que pertencem. */
function documentosDoPortal(portal) {
  const mapa = portal.docsPorArea || (portal.docsEngenharia ? { ENGENHARIA: portal.docsEngenharia } : {});
  const out = [];
  for (const [area, lista] of Object.entries(mapa || {})) {
    if (!Array.isArray(lista)) continue;
    for (const d of lista) {
      if (!d?.id) continue;
      // ⚠⚠ NA ENGENHARIA A CAIXA VEM DO CLASSIFICADOR, não de um campo do documento. A seleção não
      // grava o tipo (ele é parâmetro da tela, não do arquivo) — `tipoDoDocEng` é o mesmo caminho
      // que a rota do portal usa para montar as caixas. Assim o aviso fala a língua da TELA do
      // cliente ("Projetos de fabricação"), e não a da nossa pasta.
      const caixa = area === "ENGENHARIA"
        ? (TIPO_ENG[tipoDoDocEng({ nome: d.nomeExibicao || d.nome, pasta: d.pasta })]?.nome || "Engenharia")
        : (AREA_NOME[area] || area);
      out.push({ id: String(d.id), nome: d.nomeExibicao || d.nome, caixa });
    }
  }
  return out;
}

async function carregar(opId) {
  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { numero: true, obra: true } });
  if (!op) return { erro: "OP não encontrada." };
  const portal = await prisma.portalCliente.findUnique({ where: { opNumero: op.numero } });
  if (!portal) return { erro: "Esta obra ainda não tem portal." };
  if (portal.status !== "PUBLICADO") return { erro: "Publique o portal antes de avisar." };

  const jaAvisados = new Set((Array.isArray(portal.docsAvisados) ? portal.docsAvisados : []).map(String));
  const todos = documentosDoPortal(portal);
  const novos = todos.filter((d) => !jaAvisados.has(d.id));

  const destinatarios = await prisma.portalDestinatario.findMany({
    where: { portalId: portal.id },
    select: { id: true, nome: true, email: true, codigo: true, enviadoEm: true },
    orderBy: [{ enviadoEm: "asc" }],
  });
  return { op, portal, todos, novos, destinatarios };
}

export async function GET(req, { params }) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const d = await carregar(id);
  if (d.erro) return NextResponse.json({ error: d.erro }, { status: 400 });

  // agrupa por caixa, na ordem em que a tela do cliente mostra
  const porCaixa = new Map();
  for (const doc of d.novos) {
    if (!porCaixa.has(doc.caixa)) porCaixa.set(doc.caixa, []);
    porCaixa.get(doc.caixa).push(doc.nome);
  }
  return NextResponse.json({
    total: d.todos.length,
    novos: d.novos.length,
    caixas: [...porCaixa.entries()].map(([caixa, nomes]) => ({ caixa, nomes })),
    avisadoEm: d.portal.docsAvisadoEm,
    destinatarios: d.destinatarios.map((x) => ({ id: x.id, nome: x.nome, email: x.email })),
  });
}

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const escolhidos = Array.isArray(body?.emails) ? body.emails.map((x) => String(x).toLowerCase()) : null;

  const d = await carregar(id);
  if (d.erro) return NextResponse.json({ error: d.erro }, { status: 400 });
  if (!d.novos.length) return NextResponse.json({ error: "Nada novo desde o último aviso." }, { status: 400 });
  if (!secoesDoPortal(d.portal).includes("DOCUMENTOS")) {
    return NextResponse.json({ error: "A seção Documentos está desligada neste portal — o cliente não veria os arquivos." }, { status: 400 });
  }

  const lista = escolhidos
    ? d.destinatarios.filter((x) => escolhidos.includes(String(x.email).toLowerCase()))
    : d.destinatarios;
  if (!lista.length) return NextResponse.json({ error: "Nenhum destinatário escolhido." }, { status: 400 });

  const obra = d.op.obra || `OP-${String(d.op.numero).padStart(3, "0")}`;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://workspace.torg.com.br").replace(/\/$/, "");

  const porCaixa = new Map();
  for (const doc of d.novos) {
    if (!porCaixa.has(doc.caixa)) porCaixa.set(doc.caixa, []);
    porCaixa.get(doc.caixa).push(doc.nome);
  }
  // ⚠ CORTA EM 6 POR CAIXA. Uma pasta de fabricação tem centenas de desenhos; a lista inteira vira
  // parede de texto e o e-mail some no meio dela. Seis dá para reconhecer o que é, e o portal tem
  // o resto.
  const blocos = [...porCaixa.entries()].map(([caixa, nomes]) => {
    const mostra = nomes.slice(0, 6).map((n) => escapeHtml(n)).join(" · ");
    const resto = nomes.length > 6 ? ` <span style="color:#5b6b7a">e mais ${nomes.length - 6}</span>` : "";
    return `<div style="border:1px solid #e7ecf2;border-radius:8px;padding:14px 16px;margin:0 0 12px">
        <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5b6b7a">${escapeHtml(caixa)} · ${nomes.length} arquivo(s)</p>
        <p style="margin:0;font-size:13px;line-height:1.7">${mostra}${resto}</p>
      </div>`;
  }).join("");

  let enviados = 0;
  const erros = [];
  for (const pessoa of lista) {
    const link = `${base}/portal/${d.portal.token}${pessoa.codigo ? `?d=${pessoa.codigo}` : ""}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail("Novos documentos no portal")}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 26px">
        <p style="margin:0 0 12px">Olá${pessoa.nome ? `, <strong>${escapeHtml(pessoa.nome)}</strong>` : ""},</p>
        <p style="margin:0 0 16px">Publicamos novos documentos no portal de <strong>${escapeHtml(obra)}</strong>.</p>
        ${blocos}
        <p style="text-align:center;margin:24px 0">
          <a href="${link}" style="background:#006EAB;color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">Ver no portal da obra</a>
        </p>
        <p style="margin:0;color:#5b6b7a;font-size:12px">
          Se o botão não funcionar, copie e cole no navegador:<br>
          <span style="color:#006EAB;word-break:break-all">${link}</span>
        </p>
      </div>
    </div>`;
    const res = await sendEmail({
      to: pessoa.email,
      subject: `Novos documentos — ${obra} · Torg Metal`,
      html,
      text: `Publicamos ${d.novos.length} documento(s) no portal de ${obra}: ${link}`,
      replyTo: user.email || undefined,
    }).catch((e) => ({ ok: false, erro: e?.message }));
    if (res?.ok) enviados++; else erros.push(pessoa.email);
  }

  // ⚠⚠ SÓ CARIMBA SE ALGUÉM RECEBEU. Marcar como avisado depois de uma falha de envio esconderia os
  // documentos do próximo aviso — eles nunca mais apareceriam como novos, e ninguém saberia.
  if (enviados > 0) {
    const jaAvisados = new Set((Array.isArray(d.portal.docsAvisados) ? d.portal.docsAvisados : []).map(String));
    for (const doc of d.novos) jaAvisados.add(doc.id);
    await prisma.portalCliente.update({
      where: { id: d.portal.id },
      data: { docsAvisados: [...jaAvisados], docsAvisadoEm: new Date() },
    });
    try {
      await prisma.auditLog.create({
        data: { userId: user.id, action: "PORTAL_AVISO_DOCS", entity: "PortalCliente", entityId: d.portal.opNumero,
                diff: { novos: d.novos.length, enviados, para: lista.map((x) => x.email) } },
      });
    } catch {}
  }

  return NextResponse.json({ ok: enviados > 0, enviados, novos: d.novos.length, falhas: erros });
}
