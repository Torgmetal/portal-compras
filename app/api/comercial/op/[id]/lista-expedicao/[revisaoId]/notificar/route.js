// POST — avisa os SETORES DA TORG por e-mail que a Lista de Expedição mudou.
// Manda o diff (incluídas / excluídas / alteradas) e destaca as peças que saíram
// da lista mas seguem alocadas num lote — o risco de expedir peça inexistente.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { cabecalhoEmail } from "@/lib/email-layout";
import { CONTATOS_TAREFAS } from "@/lib/contatos-tarefas";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"];
const BASE = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "https://workspace.torg.com.br";
const k = (s) => String(s || "").trim().toUpperCase();
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;

function tabela(titulo, itens, cor, mostrarLote) {
  if (!itens?.length) return "";
  const linhas = itens.slice(0, 60).map((m) => `
    <tr>
      <td style="padding:5px 8px;border-top:1px solid #E2E9F0;font-family:monospace">${escapeHtml(m.marca)}</td>
      <td style="padding:5px 8px;border-top:1px solid #E2E9F0;color:#5C7285">${escapeHtml(m.descricao || "—")}</td>
      <td style="padding:5px 8px;border-top:1px solid #E2E9F0;text-align:right">${m.qte ?? "—"}</td>
      <td style="padding:5px 8px;border-top:1px solid #E2E9F0;text-align:right;white-space:nowrap">${m.pesoTotal != null ? escapeHtml(fmtKg(m.pesoTotal)) : "—"}</td>
      ${mostrarLote ? `<td style="padding:5px 8px;border-top:1px solid #E2E9F0;color:${m.lote ? "#b91c1c" : "#5C7285"};font-weight:${m.lote ? 700 : 400}">${m.lote ? escapeHtml(m.lote) : "—"}</td>` : ""}
    </tr>`).join("");
  return `
    <h3 style="font-size:14px;color:${cor};margin:18px 0 6px">${escapeHtml(titulo)} (${itens.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#F5F8FB;color:#5C7285;font-size:12px">
        <th style="text-align:left;padding:5px 8px">Marca</th><th style="text-align:left;padding:5px 8px">Descrição</th>
        <th style="text-align:right;padding:5px 8px">Qtd</th><th style="text-align:right;padding:5px 8px">Peso</th>
        ${mostrarLote ? `<th style="text-align:left;padding:5px 8px">Lote</th>` : ""}
      </tr>${linhas}
    </table>
    ${itens.length > 60 ? `<p style="font-size:12px;color:#5C7285;margin:6px 0 0">…e mais ${itens.length - 60}. Veja a lista completa no portal.</p>` : ""}`;
}

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rev = await prisma.listaExpedicaoRevisao.findUnique({ where: { id: params.revisaoId } });
  if (!rev) return NextResponse.json({ error: "Revisão não encontrada" }, { status: 404 });
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, cliente: true, obra: true, refCliente: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  // marca alocada em lote? (é o que gera o alerta vermelho)
  const pecas = await prisma.pecaLote.findMany({ where: { opId: op.id }, select: { marca: true, lote: { select: { nome: true } } } });
  const porMarca = new Map();
  for (const p of pecas) if (!porMarca.has(k(p.marca))) porMarca.set(k(p.marca), p.lote?.nome || null);
  const anota = (arr) => (Array.isArray(arr) ? arr : []).map((m) => ({ ...m, lote: porMarca.get(k(m.marca)) || null }));

  const excluidas = anota(rev.excluidas);
  const incluidas = anota(rev.incluidas);
  const alteradas = anota(rev.alteradas);
  const risco = excluidas.filter((m) => m.lote);
  const semLote = incluidas.filter((m) => !m.lote);

  const codigo = `OP-${String(op.numero).padStart(3, "0")}`;
  const titulo = `${codigo} — Lista de Expedição alterada`;
  const link = `${BASE}/comercial/${op.id}`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#00263F">
    ${cabecalhoEmail(escapeHtml(titulo), escapeHtml([op.obra, op.cliente, op.refCliente ? `Ref. ${op.refCliente}` : null].filter(Boolean).join(" · ") || "Torg Metal · Estruturas Metálicas"))}
    <div style="background:#f9fafb;padding:22px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
      <p style="margin:0 0 12px;font-size:14px;line-height:1.55">
        A lista de expedição da frente <strong>${escapeHtml(rev.frente)}</strong> foi atualizada no servidor
        ${rev.revisaoAnterior ? `(revisão <strong>${escapeHtml(rev.revisaoAnterior)}</strong> → <strong>${escapeHtml(rev.revisao || "—")}</strong>)` : rev.revisao ? `(revisão <strong>${escapeHtml(rev.revisao)}</strong>)` : ""}.
        Arquivo: <em>${escapeHtml(rev.arquivo)}</em>.
      </p>
      <p style="margin:0 0 4px;font-size:14px"><strong>${rev.nIncluidas}</strong> peça(s) incluída(s) · <strong>${rev.nExcluidas}</strong> excluída(s) · <strong>${rev.nAlteradas}</strong> alterada(s).</p>
      ${risco.length ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:13px;color:#b91c1c">
        <strong>⚠ Atenção:</strong> ${risco.length} peça(s) saíram da lista mas ainda estão alocadas em lote de entrega. Não expedir antes de o Planejamento retirar do lote.
      </div>` : ""}
      ${semLote.length ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:13px;color:#92400e">
        ${semLote.length} peça(s) nova(s) ainda <strong>sem lote de entrega</strong> — o Planejamento precisa alocar.
      </div>` : ""}
      ${tabela("Peças incluídas", incluidas, "#047857", true)}
      ${tabela("Peças excluídas", excluidas, "#b91c1c", true)}
      ${tabela("Peças alteradas (qtd/peso)", alteradas, "#0D1F3C", false)}
      <p style="text-align:center;margin:24px 0 6px">
        <a href="${link}" style="background:#F4801F;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;display:inline-block">Abrir a OP no portal</a>
      </p>
      <p style="font-size:12px;color:#5C7285;margin:10px 0 0">Aviso enviado por ${escapeHtml(user.name || "Portal Torg")}.</p>
    </div>
  </div>`;

  const destinos = [...new Set(CONTATOS_TAREFAS.flatMap((g) => g.contatos.map((c) => c.email)).filter(Boolean))];
  let ok = 0;
  for (const to of destinos) {
    try {
      const r = await sendEmail({ to, subject: `${titulo} — ação necessária`, html, replyTo: user.email || undefined });
      if (r?.ok) ok++;
    } catch { /* uma falha não impede os demais */ }
  }
  if (!ok) return NextResponse.json({ error: "Nenhum e-mail foi enviado." }, { status: 500 });

  await prisma.listaExpedicaoRevisao.update({ where: { id: rev.id }, data: { notificadaEm: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "NOTIFICAR_LISTA_EXPEDICAO", entity: "OP", entityId: op.id, diff: { revisaoId: rev.id, enviados: ok, total: destinos.length } } }).catch(() => {});
  return NextResponse.json({ success: true, enviados: ok, total: destinos.length });
}
