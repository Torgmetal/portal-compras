// GET /api/cliente/faturamento — a aba "Pedidos e faturamento" do cliente logado.
//
// ⚠⚠ QUEM PERGUNTA É A SESSÃO. O e-mail vem do login; só ADMIN/COMERCIAL da Torg podem pedir
// `?como=<e-mail>` para ver exatamente o que aquela pessoa vê (a mesma regra de papel vale — não é
// atalho). Toda leitura fica na auditoria: quem viu, quais obras, quando.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { faturamentoDoCliente } from "@/lib/cliente-faturamento-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNO = new Set(["ADMIN"]);
const temModulo = (u, m) => (u?.modulos || []).some((x) => (typeof x === "string" ? x : x?.modulo) === m);

export async function GET(req) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const como = String(new URL(req.url).searchParams.get("como") || "").trim().toLowerCase();
  const podeVerComo = INTERNO.has(user.tipo) || temModulo(user, "COMERCIAL");
  if (como && !podeVerComo) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  const email = como || String(user.email || "").toLowerCase();
  if (!email) return NextResponse.json({ error: "Sessão sem e-mail." }, { status: 400 });

  const r = await faturamentoDoCliente(email);
  if (!r.temAcesso) return NextResponse.json({ error: como ? `${email} não tem o papel "Pedidos e faturamento" em nenhuma obra.` : "Esta área não está liberada para o seu acesso." , temAcesso: false }, { status: 403 });
  await prisma.auditLog.create({
    data: { userId: user.id || null, action: como ? "CLIENTE_FATURAMENTO_VISTO_COMO" : "CLIENTE_VIU_FATURAMENTO", entity: "OP", entityId: email,
            diff: { email, obras: r.obras.map((o) => o.opNumero), ...(como ? { por: user.email } : {}) } },
  }).catch(() => {});
  return NextResponse.json({ email, como: como ? true : false, ...r });
}
