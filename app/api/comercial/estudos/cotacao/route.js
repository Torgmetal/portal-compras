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
import { emailCotacaoTinta } from "@/lib/cotacao-tinta-email";
import { emailCotacaoAco } from "@/lib/cotacao-aco-email";
import { FAMILIAS_COTACAO, fornecedorAtende } from "@/lib/cotacao-familias";

export const runtime = "nodejs";
export const maxDuration = 120;

// ⚠ O DE-PARA MORA EM lib/cotacao-familias.js. Vitor (01/09/2026): "terças Z também precisam
// aparecer junto com a matéria prima, curvas de GC também (…) seria bom vc trazer separado para
// não cometermos erro de enviar para cotação". Uma família de cotação junta várias categorias do
// vendor list — quem vende terça Z é o mesmo mundo de quem vende perfil.

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const u = new URL(req.url);
  const tipo = String(u.searchParams.get("tipo") || "TINTA").toUpperCase();
  const estudoId = String(u.searchParams.get("estudoId") || "");
  if (!FAMILIAS_COTACAO[tipo]) return NextResponse.json({ error: "Família de cotação desconhecida." }, { status: 400 });

  const todos = await prisma.fornecedor.findMany({
    where: { ativo: true },
    select: { id: true, razaoSocial: true, nomeFantasia: true, email: true, categorias: true, cidade: true, uf: true },
    orderBy: { razaoSocial: "asc" },
  });
  // ⚠ SEM E-MAIL NÃO ENTRA NA LISTA: um fornecedor que não dá para chamar só ocuparia espaço e
  // criaria a impressão de que a cotação foi mais ampla do que foi.
  const fornecedores = todos
    .filter((f) => f.email && fornecedorAtende(f, tipo))
    .map((f) => ({ id: f.id, nome: f.nomeFantasia || f.razaoSocial, email: f.email, praca: [f.cidade, f.uf].filter(Boolean).join("/") }));

  const cotacoes = estudoId
    ? await prisma.cotacaoEstudo.findMany({
        where: { estudoId, tipo },
        orderBy: { enviadoEm: "desc" },
        select: {
          id: true, enviadoEm: true, enviadoPorNome: true, snapshot: true,
          fornecedores: { select: { id: true, nome: true, email: true, enviadoEm: true, erroEnvio: true, respondidoEm: true, valorTotal: true, vencedor: true, resposta: true }, orderBy: { valorTotal: "asc" } },
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

  let ok = 0;
  for (const f of cot.fornecedores) {
    // ⚠ O QUE ELE PRECISA PARA RESPONDER, e nada além. Vitor: área, esquema e perda — com isso o
    // fabricante dimensiona galões, diluente e componente B. Sem preço nosso, sem nome de
    // concorrente, sem OP: é orçamento, não pedido.
    // ⚠ o corpo vem de lib/cotacao-tinta-email.js — a prévia que o Vitor revisa usa a MESMA
    // função, então o que ele aprova é literalmente o que sai.
      // ⚠ TINTA tem e-mail próprio (área + esquema + perda); todo o resto — aço, telha, grade,
    // fixador — é uma LISTA de itens, e o mesmo corpo serve. O que muda é o rótulo da família.
    const ctx = { obra, numero: est?.numero, ano: est?.ano, token: f.token, familia: FAMILIAS_COTACAO[b.tipo]?.rotulo };
    const msg = b.tipo === "TINTA" ? emailCotacaoTinta(f, s, ctx) : emailCotacaoAco(f, s, ctx);
    const r = await sendEmail({
      to: f.email, subject: msg.subject, html: msg.html, text: msg.text,
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
