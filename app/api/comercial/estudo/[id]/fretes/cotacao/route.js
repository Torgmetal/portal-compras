import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── GET ── Lista cotacoes de frete do estudo
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const cotacoes = await prisma.freteCotacao.findMany({
      where: { estudoId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: cotacoes });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST ── Enviar cotacao para transportadoras
const enviarSchema = z.object({
  fornecedores: z.array(z.object({
    id: z.string(),
    nome: z.string(),
    email: z.string().email("Email invalido"),
  })).min(1, "Selecione ao menos uma transportadora"),
  observacao: z.string().optional(),
  prazoResposta: z.string().optional(),
});

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { fornecedores, observacao, prazoResposta } = enviarSchema.parse(body);

    // Buscar estudo com itens de frete
    const estudo = await prisma.propostaEstudo.findUnique({
      where: { id },
      include: {
        orcamento: { select: { numero: true, cliente: true, obra: true } },
        itensFretes: { orderBy: { ordem: "asc" } },
      },
    });
    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo nao encontrado" }, { status: 404 });
    }

    const ref = `EPC-${estudo.orcamento?.numero || "???"}`;
    const cliente = estudo.orcamento?.cliente || "—";
    const obra = estudo.orcamento?.obra || "—";

    // Montar tabela de fretes para o email
    const linhasHtml = estudo.itensFretes.map((f, i) => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px;font-size:13px">${i + 1}</td>
        <td style="padding:8px;font-size:13px">${escapeHtml(f.descricao)}</td>
        <td style="padding:8px;font-size:13px">${escapeHtml(f.origem || "—")} → ${escapeHtml(f.destino || "—")}</td>
        <td style="padding:8px;font-size:13px;text-align:right">${f.distanciaKm ? f.distanciaKm.toLocaleString("pt-BR") + " km" : "—"}</td>
        <td style="padding:8px;font-size:13px;text-align:right">${f.pesoTon ? f.pesoTon.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + " ton" : "—"}</td>
        <td style="padding:8px;font-size:13px">${escapeHtml(f.tipoVeiculo || "—")}</td>
      </tr>
    `).join("");

    const pesoTotal = estudo.itensFretes.reduce((s, f) => s + (f.pesoTon || 0), 0);

    // Enviar para cada transportadora
    const resultados = [];
    for (const forn of fornecedores) {
      // Verificar se ja existe cotacao pendente
      const existente = await prisma.freteCotacao.findFirst({
        where: { estudoId: id, fornecedorId: forn.id, status: "PENDENTE" },
      });
      if (existente) {
        resultados.push({ fornecedor: forn.nome, status: "ja_enviado" });
        continue;
      }

      // Criar registro antes para gerar o token
      const registro = await prisma.freteCotacao.create({
        data: {
          estudoId: id,
          fornecedorId: forn.id,
          fornecedorNome: forn.nome.trim().toUpperCase(),
          fornecedorEmail: forn.email,
          status: "PENDENTE",
          observacao: observacao || undefined,
        },
      });

      const baseUrl = process.env.NEXTAUTH_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const linkCotacao = `${baseUrl}/fornecedores/frete/${registro.token}`;

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
          <div style="background:#006EAB;padding:20px 24px;border-radius:12px 12px 0 0">
            <h1 style="color:#fff;margin:0;font-size:20px">Solicitacao de Cotacao de Frete</h1>
            <p style="color:#b3d9f0;margin:4px 0 0;font-size:13px">Torg Metal Estruturas</p>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p style="color:#333;font-size:14px;margin:0 0 16px">
              Prezado(a) <strong>${escapeHtml(forn.nome)}</strong>,
            </p>
            <p style="color:#333;font-size:14px;margin:0 0 16px">
              Solicitamos cotacao de frete para o projeto abaixo:
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
                <td style="padding:8px 12px;font-size:13px;font-weight:600">${escapeHtml(obra)}</td>
                <td style="padding:8px 12px;font-size:13px;color:#666">Peso Total</td>
                <td style="padding:8px 12px;font-size:13px;font-weight:600">${pesoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ton</td>
              </tr>
            </table>
            <h3 style="color:#006EAB;font-size:14px;margin:0 0 8px">Itens para Transporte</h3>
            <table style="width:100%;border-collapse:collapse;margin:0 0 16px">
              <thead>
                <tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0">
                  <th style="padding:8px;font-size:12px;text-align:left;color:#64748b">#</th>
                  <th style="padding:8px;font-size:12px;text-align:left;color:#64748b">Descricao</th>
                  <th style="padding:8px;font-size:12px;text-align:left;color:#64748b">Origem → Destino</th>
                  <th style="padding:8px;font-size:12px;text-align:right;color:#64748b">Distancia</th>
                  <th style="padding:8px;font-size:12px;text-align:right;color:#64748b">Peso</th>
                  <th style="padding:8px;font-size:12px;text-align:left;color:#64748b">Veiculo</th>
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
        `SOLICITACAO DE COTACAO DE FRETE — Torg Metal`,
        ``,
        `Prezado(a) ${forn.nome},`,
        ``,
        `Solicitamos cotacao de frete para o projeto:`,
        `Referencia: ${ref} | Cliente: ${cliente} | Obra: ${obra}`,
        `Peso Total: ${pesoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ton`,
        ``,
        ...estudo.itensFretes.map((f, i) =>
          `${i + 1}. ${f.descricao} | ${f.origem || "—"} → ${f.destino || "—"} | ${f.distanciaKm || 0} km | ${f.pesoTon || 0} ton | ${f.tipoVeiculo || "—"}`
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
        subject: `Cotacao de Frete — ${ref} — ${obra}`,
        html,
        text,
        replyTo: user.email || undefined,
      });

      // Atualizar enviadoEm no registro ja criado
      if (emailResult.ok) {
        await prisma.freteCotacao.update({
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
        action: "ENVIAR_COTACAO_FRETE",
        entity: "FreteCotacao",
        entityId: id,
        diff: { transportadoras: fornecedores.map((f) => f.nome), resultados },
      },
    });

    const todas = await prisma.freteCotacao.findMany({
      where: { estudoId: id },
      orderBy: { createdAt: "desc" },
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

// ── PATCH ── Atualizar cotacao (status, valor, anexo)
const updateSchema = z.object({
  cotacaoId: z.string().min(1),
  status: z.enum(["PENDENTE", "RECEBIDA", "SELECIONADA", "RECUSADA"]).optional(),
  valorCotado: z.number().min(0).nullish(),
  prazoEntrega: z.string().optional(),
  observacao: z.string().optional(),
  anexoUrl: z.string().optional(),
  anexoNome: z.string().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { cotacaoId, ...campos } = updateSchema.parse(body);

    const cotacao = await prisma.freteCotacao.findFirst({
      where: { id: cotacaoId, estudoId: id },
    });
    if (!cotacao) {
      return NextResponse.json({ success: false, error: "Cotacao nao encontrada" }, { status: 404 });
    }

    // Se marcou como recebida, registrar data
    if (campos.status === "RECEBIDA" && cotacao.status === "PENDENTE") {
      campos.respondidoEm = new Date();
    }

    const atualizada = await prisma.freteCotacao.update({
      where: { id: cotacaoId },
      data: campos,
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

    const cotacao = await prisma.freteCotacao.findFirst({
      where: { id: cotacaoId, estudoId: id },
    });
    if (!cotacao) {
      return NextResponse.json({ success: false, error: "Cotacao nao encontrada" }, { status: 404 });
    }

    await prisma.freteCotacao.delete({ where: { id: cotacaoId } });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_COTACAO_FRETE",
        entity: "FreteCotacao",
        entityId: id,
        diff: { fornecedor: cotacao.fornecedorNome },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
