import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { gerarTokenForte } from "@/lib/token";
import { z } from "zod";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const includeItens = { itens: { orderBy: { ordem: "asc" } } };

// ── GET ── Lista cotacoes de materiais/acessorios do estudo
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo"); // "MATERIAIS" ou "ACESSORIOS"

    const where = { estudoId: id };
    if (tipo) where.tipo = tipo;

    const cotacoes = await prisma.estudoCotacao.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: includeItens,
    });
    return NextResponse.json({ success: true, data: cotacoes });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST ── Enviar cotacao para fornecedores
const enviarSchema = z.object({
  tipo: z.enum(["MATERIAIS", "ACESSORIOS"]),
  fornecedores: z.array(z.object({
    id: z.string(),
    nome: z.string(),
    email: z.string().email("Email invalido"),
  })).min(1, "Selecione ao menos um fornecedor"),
  observacao: z.string().optional(),
  prazoResposta: z.string().optional(),
});

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { tipo, fornecedores, observacao, prazoResposta } = enviarSchema.parse(body);

    // Buscar estudo com itens relevantes
    const estudo = await prisma.propostaEstudo.findUnique({
      where: { id },
      include: {
        orcamento: { select: { numero: true, cliente: true, obra: true } },
        itensAcessorio: { orderBy: { ordem: "asc" } },
        itensPerso: { orderBy: { ordem: "asc" } },
      },
    });
    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo nao encontrado" }, { status: 404 });
    }

    // Montar lista de itens conforme o tipo
    const itensOrigem = tipo === "ACESSORIOS"
      ? estudo.itensAcessorio.map((a, i) => ({
          descricao: a.descricao,
          especificacao: a.especificacao || null,
          unidade: a.unidade || "un",
          quantidade: a.quantidade || 0,
          ordem: i,
        }))
      : estudo.itensPerso.map((m, i) => ({
          descricao: m.descricao,
          especificacao: [m.norma, m.tipoMaterial !== "OUTRO" ? m.tipoMaterial : null].filter(Boolean).join(" — ") || null,
          unidade: "kg",
          quantidade: m.pesoTotal || 0,
          ordem: i,
        }));

    if (itensOrigem.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhum item para enviar" }, { status: 400 });
    }

    const ref = `EPC-${estudo.orcamento?.numero || "???"}`;
    const cliente = estudo.orcamento?.cliente || "—";
    const obra = estudo.orcamento?.obra || "—";
    const tipoLabel = tipo === "ACESSORIOS" ? "Acessorios" : "Materiais";

    // Montar tabela de itens para o email
    const linhasHtml = itensOrigem.map((item, i) => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px;font-size:13px">${i + 1}</td>
        <td style="padding:8px;font-size:13px">${escapeHtml(item.descricao)}</td>
        <td style="padding:8px;font-size:13px">${escapeHtml(item.especificacao || "—")}</td>
        <td style="padding:8px;font-size:13px;text-align:center">${escapeHtml(item.unidade)}</td>
        <td style="padding:8px;font-size:13px;text-align:right">${item.quantidade ? item.quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}</td>
      </tr>
    `).join("");

    // Enviar para cada fornecedor
    const resultados = [];
    for (const forn of fornecedores) {
      // Verificar se ja existe cotacao pendente do mesmo tipo
      const existente = await prisma.estudoCotacao.findFirst({
        where: { estudoId: id, fornecedorId: forn.id, tipo, status: "PENDENTE" },
      });
      if (existente) {
        resultados.push({ fornecedor: forn.nome, status: "ja_enviado" });
        continue;
      }

      // Criar registro + itens snapshot
      const registro = await prisma.estudoCotacao.create({
        data: {
          estudoId: id,
          tipo,
          token: gerarTokenForte(),
          fornecedorId: forn.id,
          fornecedorNome: forn.nome.trim().toUpperCase(),
          fornecedorEmail: forn.email,
          status: "PENDENTE",
          observacaoInterna: observacao || undefined,
          itens: {
            create: itensOrigem.map((item) => ({
              descricao: item.descricao,
              especificacao: item.especificacao,
              unidade: item.unidade,
              quantidade: item.quantidade,
              ordem: item.ordem,
            })),
          },
        },
        include: includeItens,
      });

      const baseUrl = process.env.NEXTAUTH_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const linkCotacao = `${baseUrl}/fornecedores/estudo/${registro.token}`;

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
          <div style="background:#0D1F3C;padding:20px 24px;border-radius:12px 12px 0 0">
            <h1 style="color:#fff;margin:0;font-size:20px">Solicitacao de Cotacao — ${escapeHtml(tipoLabel)}</h1>
            <p style="color:#b3d9f0;margin:4px 0 0;font-size:13px">Torg Metal Estruturas</p>
          </div>
          <div style="height:4px;background:#F4801F;"></div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p style="color:#333;font-size:14px;margin:0 0 16px">
              Prezado(a) <strong>${escapeHtml(forn.nome)}</strong>,
            </p>
            <p style="color:#333;font-size:14px;margin:0 0 16px">
              Solicitamos cotacao de ${tipoLabel.toLowerCase()} para o projeto abaixo:
            </p>
            <table style="width:100%;border-collapse:collapse;margin:0 0 16px;background:#f8fafc;border-radius:8px">
              <tr>
                <td style="padding:8px 12px;font-size:13px;color:#666">Referencia</td>
                <td style="padding:8px 12px;font-size:13px;font-weight:600">${escapeHtml(ref)}</td>
                <td style="padding:8px 12px;font-size:13px;color:#666">Cliente</td>
                <td style="padding:8px 12px;font-size:13px;font-weight:600">${escapeHtml(cliente)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-size:13px;color:#666">Obra</td>
                <td style="padding:8px 12px;font-size:13px;font-weight:600" colspan="3">${escapeHtml(obra)}</td>
              </tr>
            </table>
            <h3 style="color:#006EAB;font-size:14px;margin:0 0 8px">Itens para Cotacao</h3>
            <table style="width:100%;border-collapse:collapse;margin:0 0 16px">
              <thead>
                <tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0">
                  <th style="padding:8px;font-size:12px;text-align:left;color:#64748b">#</th>
                  <th style="padding:8px;font-size:12px;text-align:left;color:#64748b">Descricao</th>
                  <th style="padding:8px;font-size:12px;text-align:left;color:#64748b">Especificacao</th>
                  <th style="padding:8px;font-size:12px;text-align:center;color:#64748b">Unid.</th>
                  <th style="padding:8px;font-size:12px;text-align:right;color:#64748b">Quantidade</th>
                </tr>
              </thead>
              <tbody>${linhasHtml}</tbody>
            </table>
            ${prazoResposta ? `<p style="color:#333;font-size:14px;margin:0 0 8px"><strong>Prazo para resposta:</strong> ${escapeHtml(prazoResposta)}</p>` : ""}
            ${observacao ? `<p style="color:#333;font-size:14px;margin:0 0 8px"><strong>Observacao:</strong> ${escapeHtml(observacao)}</p>` : ""}
            <div style="text-align:center;margin:24px 0 16px">
              <a href="${linkCotacao}" style="display:inline-block;background:#006EAB;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                Preencher Cotacao
              </a>
            </div>
            <p style="color:#999;font-size:12px;text-align:center;margin:0 0 8px">
              Ou acesse o link: <a href="${linkCotacao}" style="color:#006EAB">${linkCotacao}</a>
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
            <p style="color:#999;font-size:11px;margin:0">
              Este email foi enviado pelo sistema Torg Metal. Em caso de duvidas, responda diretamente.
            </p>
          </div>
        </div>
      `;

      const text = [
        `SOLICITACAO DE COTACAO DE ${tipoLabel.toUpperCase()} — Torg Metal`,
        ``,
        `Prezado(a) ${forn.nome},`,
        ``,
        `Solicitamos cotacao de ${tipoLabel.toLowerCase()} para o projeto:`,
        `Referencia: ${ref} | Cliente: ${cliente} | Obra: ${obra}`,
        ``,
        ...itensOrigem.map((item, i) =>
          `${i + 1}. ${item.descricao} | ${item.especificacao || "—"} | ${item.unidade} | Qtd: ${item.quantidade}`
        ),
        ``,
        prazoResposta ? `Prazo para resposta: ${prazoResposta}` : "",
        observacao ? `Observacao: ${observacao}` : "",
        ``,
        `Preencha sua cotacao pelo link abaixo:`,
        linkCotacao,
        ``,
        `Em caso de duvidas, responda diretamente este email.`,
      ].filter(Boolean).join("\n");

      const emailResult = await sendEmail({
        to: forn.email,
        cc: user.email || undefined,
        subject: `Cotacao de ${tipoLabel} — ${ref} — ${obra}`,
        html,
        text,
        replyTo: user.email || undefined,
      });

      if (emailResult.ok) {
        await prisma.estudoCotacao.update({
          where: { id: registro.id },
          data: { enviadoEm: new Date() },
        });
      }

      resultados.push({
        fornecedor: forn.nome,
        email: forn.email,
        emailOk: emailResult.ok,
        emailError: emailResult.error || undefined,
      });
    }

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "ENVIAR_COTACAO_ESTUDO",
        entity: "EstudoCotacao",
        entityId: id,
        diff: { tipo, fornecedores: fornecedores.map((f) => f.nome), resultados },
      },
    });

    const todas = await prisma.estudoCotacao.findMany({
      where: { estudoId: id, tipo },
      orderBy: { createdAt: "desc" },
      include: includeItens,
    });

    return NextResponse.json({ success: true, data: todas, resultados }, { status: 201 });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── PATCH ── Atualizar cotacao (status, obs interna)
const updateSchema = z.object({
  cotacaoId: z.string().min(1),
  status: z.enum(["PENDENTE", "RECEBIDA", "SELECIONADA", "RECUSADA"]).optional(),
  observacaoInterna: z.string().optional(),
  anexoUrl: z.string().optional(),
  anexoNome: z.string().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { cotacaoId, ...campos } = updateSchema.parse(body);

    const cotacao = await prisma.estudoCotacao.findFirst({
      where: { id: cotacaoId, estudoId: id },
    });
    if (!cotacao) {
      return NextResponse.json({ success: false, error: "Cotacao nao encontrada" }, { status: 404 });
    }

    if (campos.status === "RECEBIDA" && cotacao.status === "PENDENTE") {
      campos.respondidoEm = new Date();
    }

    const atualizada = await prisma.estudoCotacao.update({
      where: { id: cotacaoId },
      data: campos,
      include: includeItens,
    });
    return NextResponse.json({ success: true, data: atualizada });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── DELETE ── Excluir cotacao
export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const cotacaoId = searchParams.get("cotacaoId");
    if (!cotacaoId) {
      return NextResponse.json({ success: false, error: "cotacaoId obrigatorio" }, { status: 400 });
    }

    const cotacao = await prisma.estudoCotacao.findFirst({
      where: { id: cotacaoId, estudoId: id },
    });
    if (!cotacao) {
      return NextResponse.json({ success: false, error: "Cotacao nao encontrada" }, { status: 404 });
    }

    await prisma.estudoCotacao.delete({ where: { id: cotacaoId } });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_COTACAO_ESTUDO",
        entity: "EstudoCotacao",
        entityId: cotacaoId,
        diff: { tipo: cotacao.tipo, fornecedor: cotacao.fornecedorNome },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
