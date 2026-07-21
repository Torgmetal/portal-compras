// GET  /api/comercial/op/[id]/atas/[ataId]/enviar — quem dá pra escolher pra
//      receber a ata: contatos do CLIENTE já registrados na OP + equipe da Torg
//      (lista fixa). Espelha o "Enviar cronograma".
// POST — envia a ata (link público por token) pra 1+ destinatários. O cliente
//      abre o link e registra o ACEITE; a Torg recebe cópia pra conhecimento.
//      Os contatos do cliente usados ficam registrados na OP pro próximo envio.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { gerarTokenForte } from "@/lib/token";
import { escapeHtml } from "@/lib/html";
import { CONTATOS_TAREFAS } from "@/lib/contatos-tarefas";
import { z } from "zod";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];
const BASE = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "https://workspace.torg.com.br";
const normEmail = (e) => String(e || "").trim().toLowerCase();
const fmtOP = (n) => `OP-${String(n).padStart(3, "0")}`;
const nn = (n) => String(n).padStart(2, "0");
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");

async function carregar(opId, ataId) {
  return prisma.ataOP.findFirst({
    where: { id: ataId, opId },
    include: { op: { select: { id: true, numero: true, cliente: true, obra: true, refCliente: true, clienteContato: true, clienteEmail: true, clienteContatos: true } } },
  });
}

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ata = await carregar(params.id, params.ataId);
  if (!ata) return NextResponse.json({ error: "Ata não encontrada" }, { status: 404 });

  const registrados = Array.isArray(ata.op?.clienteContatos) ? ata.op.clienteContatos : [];
  const vistos = new Set(registrados.map((x) => normEmail(x.email)));
  const doCadastro = [];
  if (ata.op?.clienteEmail && !vistos.has(normEmail(ata.op.clienteEmail))) {
    doCadastro.push({ nome: ata.op.clienteContato || ata.op.cliente || "Cliente", email: ata.op.clienteEmail, doCadastro: true });
  }

  return NextResponse.json({
    success: true,
    ata: { numero: ata.numero, opNumero: ata.opNumero, titulo: ata.titulo, obra: ata.op?.obra || null, cliente: ata.op?.cliente || null, refCliente: ata.op?.refCliente || null, status: ata.status, enviadoEm: ata.enviadoEm, aceiteEm: ata.aceiteEm, aceiteNome: ata.aceiteNome, temConteudo: !!(ata.conteudoJson || ata.pauta), anexos: Array.isArray(ata.anexos) ? ata.anexos.length : 0 },
    clientes: [...registrados, ...doCadastro],
    setores: CONTATOS_TAREFAS,
  });
}

const schema = z.object({
  destinatarios: z.array(z.object({
    nome: z.string().optional().nullable(),
    email: z.string().email(),
    tipo: z.enum(["CLIENTE", "TORG"]).default("TORG"),
  })).min(1, "Escolha ao menos um destinatário."),
  mensagem: z.string().max(2000).optional().nullable(),
});

function montarEmail({ ata, obra, refCliente, codigo, nome, tipo, mensagem, link, cj, anexos }) {
  const isCliente = tipo === "CLIENTE";
  const saud = isCliente ? `Olá, <strong>${escapeHtml(nome || "cliente")}</strong>,` : "Olá, equipe,";
  const intro = isCliente
    ? `Segue a <strong>ata da reunião</strong> ${escapeHtml(codigo)}${obra ? ` — obra ${escapeHtml(obra)}` : ""}${ata.titulo ? `: <em>${escapeHtml(ata.titulo)}</em>` : ""}. Por favor, revise as informações e registre o seu <strong>aceite</strong> pelo botão abaixo.`
    : `Cópia da <strong>ata da reunião</strong> ${escapeHtml(codigo)}${obra ? ` — obra ${escapeHtml(obra)}` : ""}${ata.titulo ? `: <em>${escapeHtml(ata.titulo)}</em>` : ""}, enviada ao cliente para aceite. Segue para conhecimento.`;
  const cta = isCliente ? "Ver a ata e aceitar" : "Ver a ata";

  const meta = [
    ata.dataReuniao ? `<tr><td style="padding:4px 0;color:#5C7285;width:120px">Reunião</td><td style="padding:4px 0;font-weight:600">${escapeHtml(fmtD(ata.dataReuniao))}</td></tr>` : "",
    ata.participantes ? `<tr><td style="padding:4px 0;color:#5C7285">Participantes</td><td style="padding:4px 0">${escapeHtml(ata.participantes)}</td></tr>` : "",
    refCliente ? `<tr><td style="padding:4px 0;color:#5C7285">Ref. do cliente</td><td style="padding:4px 0;font-weight:600">${escapeHtml(refCliente)}</td></tr>` : "",
  ].join("");

  const resumo = cj?.resumo ? `<p style="font-size:14px;line-height:1.55;color:#123549;margin:14px 0 0">${escapeHtml(cj.resumo)}</p>` : "";
  const nTop = cj?.topicos?.length || 0;
  const nAc = cj?.acoes?.length || 0;
  const contadores = (nTop || nAc)
    ? `<p style="font-size:12px;color:#5C7285;margin:10px 0 0">${nTop ? `${nTop} tópico${nTop === 1 ? "" : "s"}` : ""}${nTop && nAc ? " · " : ""}${nAc ? `${nAc} ação/pendência${nAc === 1 ? "" : "s"}` : ""} — detalhes na ata.</p>`
    : "";
  const anexosHtml = anexos?.length
    ? `<div style="margin-top:16px"><p style="font-size:12px;color:#5C7285;margin:0 0 6px;font-weight:600">Anexos</p>${anexos.map((a) => `<a href="${escapeHtml(a.url)}" style="display:block;font-size:13px;color:#006EAB;text-decoration:none;padding:2px 0">#${nn(a.seq)} — ${escapeHtml(a.nome)}</a>`).join("")}</div>`
    : "";

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#00263F">
    <div style="background:#0D1F3C;color:#fff;padding:22px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:19px">Torg Metal — Ata de reunião</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:.85">${escapeHtml(codigo)}${obra ? ` · ${escapeHtml(obra)}` : ""}</p>
    </div>
    <div style="height:4px;background:#F4801F;"></div>
    <div style="border:1px solid #E2E9F0;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <p style="font-size:15px;margin:0 0 12px">${saud}</p>
      <p style="font-size:14px;line-height:1.55;color:#123549;margin:0">${intro}</p>
      ${mensagem ? `<p style="font-size:14px;line-height:1.55;color:#123549;margin:14px 0 0;white-space:pre-wrap">${escapeHtml(mensagem)}</p>` : ""}
      <div style="background:#F5F8FB;border:1px solid #E2E9F0;border-radius:10px;padding:16px 18px;margin:18px 0">
        ${ata.titulo ? `<p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#00263F">${escapeHtml(ata.titulo)}</p>` : ""}
        ${meta ? `<table style="width:100%;font-size:13px;border-collapse:collapse">${meta}</table>` : ""}
        ${resumo}${contadores}
      </div>
      ${anexosHtml}
      <p style="text-align:center;margin:24px 0 6px">
        <a href="${link}" style="background:#F4801F;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px;display:inline-block">${cta}</a>
      </p>
      <p style="font-size:12px;color:#5C7285;text-align:center;margin:0">Ou copie este link:<br><a href="${link}" style="color:#006EAB">${link}</a></p>
    </div>
  </div>`;
}

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ata = await carregar(params.id, params.ataId);
  if (!ata) return NextResponse.json({ error: "Ata não encontrada" }, { status: 404 });
  if (!ata.conteudoJson && !ata.pauta) return NextResponse.json({ error: "Preencha a ata (texto ou IA) antes de enviar." }, { status: 400 });

  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // dedupe por e-mail; o tipo CLIENTE tem prioridade se o mesmo e-mail vier duplicado
  const porEmail = new Map();
  for (const d of body.destinatarios) {
    const em = normEmail(d.email);
    if (!em) continue;
    const atual = porEmail.get(em);
    if (!atual || (d.tipo === "CLIENTE" && atual.tipo !== "CLIENTE")) porEmail.set(em, { nome: (d.nome || "").trim() || null, email: em, tipo: d.tipo });
  }
  const destinatarios = [...porEmail.values()];

  const token = ata.tokenCliente || gerarTokenForte();
  const link = `${BASE}/ata-op/${token}`;
  const codigo = `${fmtOP(ata.opNumero)} · ATA #${nn(ata.numero)}`;
  const obra = ata.op?.obra || null;
  const refCliente = ata.op?.refCliente || null;
  const cj = ata.conteudoJson || null;
  const anexos = Array.isArray(ata.anexos) ? ata.anexos : [];
  const mensagem = body.mensagem?.trim() || null;

  let ok = 0;
  for (const d of destinatarios) {
    const html = montarEmail({ ata, obra, refCliente, codigo, nome: d.nome, tipo: d.tipo, mensagem, link, cj, anexos });
    const assunto = d.tipo === "CLIENTE"
      ? `${codigo} — Ata de reunião para aceite (Torg Metal)`
      : `${codigo} — Ata de reunião (cópia) — Torg Metal`;
    try {
      const r = await sendEmail({ to: d.email, subject: assunto, html, replyTo: user.email || undefined });
      if (r?.ok) ok++;
    } catch { /* uma falha não impede os demais destinatários */ }
  }
  if (!ok) return NextResponse.json({ error: "Nenhum e-mail foi enviado. Verifique os endereços e tente novamente." }, { status: 500 });

  // Registra na OP os contatos do CLIENTE usados — voltam prontos no próximo envio.
  let registrados = 0;
  const clientesUsados = destinatarios.filter((d) => d.tipo === "CLIENTE");
  if (ata.op?.id && clientesUsados.length) {
    const atuais = Array.isArray(ata.op.clienteContatos) ? ata.op.clienteContatos : [];
    const vistos = new Set(atuais.map((x) => normEmail(x.email)));
    const novos = clientesUsados.filter((d) => !vistos.has(d.email)).map((d) => ({ nome: d.nome || "", email: d.email }));
    if (novos.length) {
      await prisma.oP.update({ where: { id: ata.op.id }, data: { clienteContatos: [...atuais, ...novos] } });
      registrados = novos.length;
    }
  }

  // primeiro contato do cliente vira o "principal" (exibição do aceite)
  const principal = clientesUsados[0] || null;
  const atualizada = await prisma.ataOP.update({
    where: { id: ata.id },
    data: {
      status: ata.status === "ACEITA" ? "ACEITA" : "ENVIADA",
      enviadoEm: new Date(),
      tokenCliente: token,
      ...(principal ? { clienteEmail: principal.email, clienteNome: (principal.nome || ata.op?.cliente || "Cliente").slice(0, 120) } : {}),
    },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "ENVIAR_ATA_OP", entity: "AtaOP", entityId: ata.id, diff: { numero: ata.numero, destinatarios: destinatarios.map((d) => d.email), enviados: ok } } }).catch(() => {});
  return NextResponse.json({ success: true, ata: atualizada, enviados: ok, total: destinatarios.length, registrados });
}
