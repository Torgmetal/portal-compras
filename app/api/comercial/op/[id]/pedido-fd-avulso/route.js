// POST — cadastra um pedido FD avulso direto na OP (sem RM/Cotacao).
// Usado pra regularizar compras antigas: a empresa recebeu o PDF da NF/
// pedido do fornecedor, ja existe no Omie, e quer registrar pra que o
// saldo de Faturamento Direto bata.
//
// Aceita multipart/form-data com:
//  - file: PDF da NF/pedido (obrigatorio)
//  - dados: JSON com { fornecedorNome, cnpj?, numeroPedido?, codigoPedido?,
//    total, observacao?, faturamentoDireto (default true) }
//
// DELETE — remove o pedido avulso (so manuais; gerados via cotacao
// usam o endpoint normal de cancelamento).
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_SIZE = 20 * 1024 * 1024;

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP nao encontrada." }, { status: 404 });

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Multipart/form-data esperado." }, { status: 400 });
  }

  // Dados — vem como JSON string no campo "dados"
  let dados;
  try {
    dados = JSON.parse(form.get("dados") || "{}");
  } catch {
    return NextResponse.json({ error: "Campo 'dados' invalido (JSON)." }, { status: 400 });
  }

  if (!dados.fornecedorNome || !String(dados.fornecedorNome).trim()) {
    return NextResponse.json({ error: "Informe o fornecedor." }, { status: 400 });
  }
  const total = Number(dados.total);
  if (!total || total <= 0) {
    return NextResponse.json({ error: "Informe o valor total (> 0)." }, { status: 400 });
  }

  // Upload do PDF (opcional, mas recomendado)
  let anexoUrl = null;
  let anexoNome = null;
  const file = form.get("file");
  if (file && typeof file !== "string") {
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `Arquivo muito grande. Limite ${MAX_SIZE / (1024 * 1024)}MB.` },
        { status: 413 }
      );
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Storage de arquivos nao configurado." }, { status: 500 });
    }
    const stamp = Date.now();
    const safeName = String(file.name || "fd-avulso.pdf")
      .replace(/[^\w\d.\- ]/g, "_")
      .substring(0, 100);
    const pathname = `fd-avulsos/${op.id}/${stamp}-${safeName}`;
    try {
      const blob = await put(pathname, file, {
        access: "public",
        addRandomSuffix: false,
        contentType: file.type || "application/pdf",
      });
      anexoUrl = blob.url;
      anexoNome = file.name;
    } catch (e) {
      return NextResponse.json(
        { error: "Falha no upload do PDF: " + (e?.message || "desconhecido") },
        { status: 500 }
      );
    }
  }

  const pedido = await prisma.pedidoOmie.create({
    data: {
      opId: op.id,
      cotacaoId: null,
      fornecedorNome: String(dados.fornecedorNome).trim(),
      cnpj: dados.cnpj ? String(dados.cnpj).replace(/\D/g, "") : null,
      nCodFor: dados.nCodFor ? String(dados.nCodFor) : null,
      codigoPedido: dados.codigoPedido ? String(dados.codigoPedido) : null,
      numeroPedido: dados.numeroPedido ? String(dados.numeroPedido) : null,
      total: Math.round(total * 100) / 100,
      faturamentoDireto: dados.faturamentoDireto !== false, // default true
      status: "CRIADO", // ja existe no Omie (cadastro manual de regularizacao)
      observacao: dados.observacao ? String(dados.observacao).trim() : null,
      criadoManualmente: true,
      anexoUrl,
      anexoNome,
      createdById: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "criar_pedido_fd_avulso",
      entity: "PedidoOmie",
      entityId: pedido.id,
      diff: {
        opNumero: op.numero,
        fornecedor: pedido.fornecedorNome,
        total: pedido.total,
        numeroPedido: pedido.numeroPedido,
      },
    },
  });

  return NextResponse.json({ pedido });
}
