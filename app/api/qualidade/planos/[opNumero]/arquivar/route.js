// POST /api/qualidade/planos/{opNumero}/arquivar  {doc}  — guarda o plano na pasta da Qualidade
// do SharePoint e anexa ao Data Book, sem esperar o cliente.
//
// ⚠⚠ EXISTE PORQUE O GATILHO AUTOMÁTICO É UMA ASSINATURA. Vitor (28/08/2026): "para o PLP e PIT
// tire a opção de ter que a assinatura do cliente obrigatoriamente". Quem já estava verificado
// internamente e parado esperando o cliente (OP-094 PIT) nunca mais recebe uma assinatura — logo
// nunca dispararia o arquivamento sozinho. Isto também é a saída quando o arquivamento automático
// falha no meio (o SharePoint fora do ar não pode derrubar a assinatura, então ele falha calado).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { DOCS, tudoAprovado, arquivarPlano } from "@/lib/planos-aceite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE", "COMERCIAL", "PRODUCAO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String((await params)?.opNumero || "").replace(/\D/g, "").padStart(3, "0");
  const doc = String((await req.json().catch(() => ({})))?.doc || "").toUpperCase();
  if (!DOCS[doc]) return NextResponse.json({ error: "Documento desconhecido (use PIT ou PLP)." }, { status: 400 });

  // ⚠ a verificação interna continua sendo condição: é ela que faz o documento valer. O que deixou
  // de ser obrigatório é o aceite do CLIENTE.
  if (!(await tudoAprovado(prisma, doc, opNumero))) {
    return NextResponse.json({ error: `A verificação interna do ${doc} ainda não está assinada.` }, { status: 409 });
  }

  const r = await arquivarPlano(prisma, doc, opNumero).catch((e) => ({ ok: false, erro: e?.message }));
  if (!r?.ok) return NextResponse.json({ error: r?.erro || "Não foi possível arquivar." }, { status: 502 });

  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "PLANO_ARQUIVADO_MANUAL", entity: "DocumentoQualidade",
      entityId: r.documentoId || null, diff: { op: opNumero, doc, pasta: r.pasta, arquivos: r.arquivos } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, ...r });
}
