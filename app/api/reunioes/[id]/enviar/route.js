// Envia a ata a todos os envolvidos: cria (ou reusa) um AtaConfirmacao com token
// por pessoa e manda o e-mail com o link "Confirmar recebimento".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { gerarTokenForte } from "@/lib/token";

export const runtime = "nodejs";
const rev = (n) => `R${String(n).padStart(2, "0")}`;
const numAta = (n) => `ATA-${String(n).padStart(3, "0")}`;

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ata = await prisma.ataReuniao.findUnique({ where: { id: params.id }, include: { confirmacoes: true } });
  if (!ata) return NextResponse.json({ error: "Ata não encontrada" }, { status: 404 });

  const envolvidos = (Array.isArray(ata.envolvidos) ? ata.envolvidos : []).filter((e) => e?.email);
  if (!envolvidos.length) return NextResponse.json({ error: "Adicione ao menos um envolvido com e-mail." }, { status: 400 });

  const jaTem = new Map(ata.confirmacoes.map((c) => [c.email.toLowerCase(), c]));
  const base = (() => { try { return new URL(req.url).origin; } catch { return ""; } })();

  const destinos = [];
  for (const e of envolvidos) {
    const email = String(e.email).trim().toLowerCase();
    let conf = jaTem.get(email);
    if (!conf) {
      conf = await prisma.ataConfirmacao.create({ data: { ataId: ata.id, nome: e.nome || "", email, setor: e.setor || null, token: gerarTokenForte() } });
    }
    destinos.push({ nome: e.nome || "", email, token: conf.token });
  }

  await prisma.ataReuniao.update({ where: { id: ata.id }, data: { status: "ENVIADA", enviadaEm: new Date() } });

  const cabec = `${numAta(ata.numero)} · ${rev(ata.revisao)} · Semana ${ata.semanaIso}/${ata.ano}`;
  let ok = 0;
  for (const d of destinos) {
    const link = `${base}/ata/${d.token}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#006EAB;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">Ata de Reunião — ${escapeHtml(cabec)}</h2>
          <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Torg Metal · ${escapeHtml(ata.titulo)}</p>
        </div>
        <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:14px;color:#002945;">
          ${d.nome ? `<p style="margin:0 0 8px;">Olá, ${escapeHtml(d.nome)}!</p>` : ""}
          <p style="margin:0 0 6px;">Você está entre os envolvidos nesta ata de reunião. Para acessar o conteúdo e as atividades do seu setor, <b>confirme o recebimento</b>:</p>
          <div style="margin:18px 0;text-align:center;">
            <a href="${link}" style="background:#006EAB;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 26px;border-radius:8px;display:inline-block;">Confirmar recebimento e abrir a ata</a>
          </div>
          <p style="font-size:12px;color:#576D7E;margin:12px 0 0;">Ao confirmar, você vê a ata completa e preenche as atividades atribuídas ao seu setor (com a evidência). Sem login.</p>
          <p style="font-size:11px;color:#9aa5b1;margin:14px 0 0;border-top:1px solid #e5e7eb;padding-top:10px;">Enviado por ${escapeHtml(user.name || "Planejamento Torg")}.</p>
        </div>
      </div>`;
    const r = await sendEmail({ to: d.email, subject: `${cabec} — confirme o recebimento`, html });
    if (r.ok) ok++;
  }

  await prisma.auditLog.create({ data: { userId: user.id, action: "ENVIAR_ATA", entity: "AtaReuniao", entityId: ata.id, diff: { destinos: destinos.length, ok } } }).catch(() => {});
  return NextResponse.json({ success: true, enviados: ok, total: destinos.length });
}
