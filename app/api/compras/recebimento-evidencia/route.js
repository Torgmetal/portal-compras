// GET    /api/compras/recebimento-evidencia?pedidoId=…   → as fotos daquele recebimento
// POST   /api/compras/recebimento-evidencia              → vincula um blob já enviado ao pedido
// DELETE /api/compras/recebimento-evidencia?id=…         → tira uma foto da evidência
//
// Vitor (04/09/2026): "preciso que na página de compras você me permita anexar imagens para podermos
// evidenciar recebimento de material".
//
// ⚠⚠ A FOTO É PROVA DE RECEBIMENTO, e por isso mora no acervo da Qualidade
// (`DocumentoQualidade`), do lado do CMR — não num campo solto do pedido. Amarrada ao pedido, à NF
// e à OP, ela responde depois "o que chegou nessa nota?", que é a pergunta que aparece numa
// auditoria ou numa divergência com o fornecedor.
//
// ⚠ SEM MIGRAÇÃO: `categoria` é texto livre (já convivem MATERIAL, ANEXO, EQUIPAMENTOS…), então a
// evidência entra como categoria própria sem mexer no schema.
//
// ⚠ O ARQUIVO NÃO PASSA POR AQUI. Foto de celular sai com 8 a 12 MB e a função serverless corta em
// ~4,5 MB — o upload é direto do navegador para o Blob (/api/rm/upload-token) e esta rota só grava
// o vínculo. Ver torg_upload_4mb.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERFIS = ["ADMIN", "COMPRAS", "ALMOXARIFADO", "QUALIDADE"];
const CATEGORIA = "EVIDENCIA_RECEBIMENTO";

export async function GET(req) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const pedidoId = String(new URL(req.url).searchParams.get("pedidoId") || "").trim();
  if (!pedidoId) return NextResponse.json({ error: "Informe o pedido." }, { status: 400 });

  const fotos = await prisma.documentoQualidade.findMany({
    where: { categoria: CATEGORIA, vinculo: pedidoId, ativo: true },
    select: { id: true, nome: true, arquivoUrl: true, arquivoTipo: true, arquivoTamanho: true, createdAt: true, responsavel: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ fotos });
}

const schema = z.object({
  pedidoId: z.string().min(1),
  arquivoUrl: z.string().url(),
  nome: z.string().min(1).max(200),
  arquivoTipo: z.string().max(120).optional().nullable(),
  arquivoTamanho: z.number().int().nonnegative().optional().nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  const d = body.data;

  // ⚠ SÓ BLOB NOSSO. Sem isto, um POST com URL de fora gravaria no acervo da Qualidade um link que
  // some (ou muda) quando quem hospeda quiser — e a "prova" deixaria de provar. Ver lib/blob-url.
  if (!isBlobUrlSegura(d.arquivoUrl)) {
    return NextResponse.json({ error: "Arquivo fora do nosso armazenamento." }, { status: 400 });
  }
  // ⚠ imagem, e só: a evidência é foto do material chegando. PDF de nota tem lugar próprio (o CMR).
  if (d.arquivoTipo && !/^image\//i.test(d.arquivoTipo)) {
    return NextResponse.json({ error: "Aqui entram imagens do recebimento." }, { status: 400 });
  }

  const pedido = await prisma.pedidoOmie.findUnique({
    where: { id: d.pedidoId },
    select: { id: true, numeroPedido: true, nfNumero: true, opId: true, fornecedorNome: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  const op = pedido.opId ? await prisma.oP.findUnique({ where: { id: pedido.opId }, select: { numero: true } }) : null;

  const foto = await prisma.documentoQualidade.create({
    data: {
      categoria: CATEGORIA,
      nome: d.nome,
      // ⚠ o `vinculo` guarda o ID do pedido (é por ele que a tela busca); o texto legível vai na
      // observação, para quem abrir o acervo da Qualidade entender a linha sem consultar o pedido.
      vinculo: pedido.id,
      opNumero: op?.numero || null,
      nfNumero: pedido.nfNumero || null,
      observacao: `Recebimento do pedido ${pedido.numeroPedido || pedido.id}`
        + (pedido.nfNumero ? ` · NF ${pedido.nfNumero}` : "") + ` · ${pedido.fornecedorNome}`,
      arquivoUrl: d.arquivoUrl,
      arquivoNome: d.nome,
      arquivoTipo: d.arquivoTipo || null,
      arquivoTamanho: d.arquivoTamanho ?? null,
      origem: "registro_manual",
      responsavel: user.name || user.email || null,
      createdById: user.id,
    },
    select: { id: true, nome: true, arquivoUrl: true, arquivoTipo: true, arquivoTamanho: true, createdAt: true, responsavel: true },
  });
  return NextResponse.json({ success: true, foto });
}

export async function DELETE(req) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const id = String(new URL(req.url).searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "Informe a foto." }, { status: 400 });

  // ⚠ NÃO APAGA: evidência que some sem deixar rastro é o oposto de evidência. Inativa e guarda o
  // motivo, igual ao resto do acervo da Qualidade.
  const r = await prisma.documentoQualidade.updateMany({
    where: { id, categoria: CATEGORIA },
    data: { ativo: false, invalidadoMotivo: `Removida por ${user.name || user.email || "usuário"}` },
  });
  if (!r.count) return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  return NextResponse.json({ success: true });
}
