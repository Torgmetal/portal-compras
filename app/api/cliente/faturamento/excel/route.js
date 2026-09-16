// GET /api/cliente/faturamento/excel[?como=] — o extrato da aba em Excel (padrão das planilhas Torg).
// Mesma regra de acesso da aba: e-mail da sessão com o papel FATURAMENTO; `como` só para a Torg.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { faturamentoDoCliente } from "@/lib/cliente-faturamento-servidor";
import { extratoFaturamentoExcel } from "@/lib/cliente-faturamento-excel";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const temModulo = (u, m) => (u?.modulos || []).some((x) => (typeof x === "string" ? x : x?.modulo) === m);

export async function GET(req) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const como = String(new URL(req.url).searchParams.get("como") || "").trim().toLowerCase();
  if (como && !(user.tipo === "ADMIN" || temModulo(user, "COMERCIAL"))) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  const email = como || String(user.email || "").toLowerCase();
  if (!email) return NextResponse.json({ error: "Sessão sem e-mail." }, { status: 400 });
  const dados = await faturamentoDoCliente(email);
  if (!dados.temAcesso) return NextResponse.json({ error: "Esta área não está liberada para o seu acesso." }, { status: 403 });
  const cliente = dados.obras[0]?.cliente || null;
  const buf = await extratoFaturamentoExcel({ ...dados, email }, { cliente });
  await prisma.auditLog.create({ data: { userId: user.id || null, action: como ? "CLIENTE_FATURAMENTO_EXCEL_COMO" : "CLIENTE_FATURAMENTO_EXCEL", entity: "OP", entityId: email, diff: { email, obras: dados.obras.map((o) => o.opNumero), ...(como ? { por: user.email } : {}) } } }).catch(() => {});
  const nome = `Pedidos e faturamento - ${(cliente || "cliente").replace(/[\\/:*?"<>|]/g, "-")} - ${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": dispArquivo(nome, "attachment"), "Cache-Control": "no-store" } });
}
