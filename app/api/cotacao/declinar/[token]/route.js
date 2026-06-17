// POST /api/cotacao/declinar/[token]  { motivo?: string }
// O fornecedor declina a cotação (não vai cotar) — em vez de deixá-la em aberto.
// Fecha a cotação (status DECLINADA) sem mexer nas RMs (o comprador busca outro).
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notificarEvento } from "@/lib/email";
import { criarNotificacao } from "@/lib/notificacoes";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { escapeHtml, limparTextoCurto } from "@/lib/html";

const postLimiter = createRateLimiter({ name: "cotacao-declinar-post", maxRequests: 10, windowMs: 60000 });

const schema = z.object({ motivo: z.string().max(500).optional().nullable() });

export async function POST(req, { params }) {
  const rl = postLimiter(req);
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  let body;
  try {
    body = schema.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { token: params.token },
    select: { id: true, status: true, fornecedorNome: true },
  });
  if (!cotacao) return NextResponse.json({ error: "Token inválido." }, { status: 404 });
  if (cotacao.status === "CANCELADA") {
    return NextResponse.json({ error: "Esta cotação foi cancelada pela Torg." }, { status: 409 });
  }
  if (cotacao.status === "RECEBIDA") {
    return NextResponse.json({ error: "Você já enviou uma proposta para esta cotação." }, { status: 409 });
  }
  if (cotacao.status === "DECLINADA") {
    return NextResponse.json({ ok: true, jaDeclinada: true });
  }

  const motivo = body.motivo ? limparTextoCurto(body.motivo, 500) : null;

  await prisma.cotacao.update({
    where: { id: cotacao.id },
    data: { status: "DECLINADA", declinadaEm: new Date(), motivoDeclinio: motivo },
  });

  await prisma.auditLog.create({
    data: {
      userId: null,
      action: "declinar_cotacao_fornecedor",
      entity: "Cotacao",
      entityId: cotacao.id,
      diff: { fornecedor: cotacao.fornecedorNome, motivo },
    },
  }).catch(() => {});

  // Notifica o Compras — fora do caminho crítico. Monta contexto das RMs.
  (async () => {
    try {
      const cotItens = await prisma.cotacaoItem.findMany({
        where: { cotacaoId: cotacao.id },
        select: { rmItem: { select: { rm: { select: { id: true, numero: true, opId: true } } } } },
      });
      const rmsMap = new Map();
      const opIds = new Set();
      for (const ci of cotItens) {
        const rm = ci.rmItem?.rm;
        if (rm) { rmsMap.set(rm.id, rm.numero); if (rm.opId) opIds.add(rm.opId); }
      }
      const rmsNumeros = Array.from(rmsMap.values()).sort();
      const rotuloRMs = rmsNumeros.length === 1 ? `RM ${rmsNumeros[0]}` : `RMs ${rmsNumeros.join(", ")}`;
      const linkInterno = rmsMap.size === 1 ? `/compras/rm/${[...rmsMap.keys()][0]}` : "/compras";

      for (const rmId of rmsMap.keys()) revalidatePath(`/compras/rm/${rmId}`);
      for (const opId of opIds) revalidatePath(`/compras/painel-ops/${opId}`);
      revalidatePath("/compras");

      await criarNotificacao({
        tipo: "COTACAO_RESPONDIDA",
        titulo: `Cotação declinada — ${cotacao.fornecedorNome}`,
        mensagem: `${cotacao.fornecedorNome} declinou a cotação da ${rotuloRMs}${motivo ? ` — "${motivo}"` : ""}. Considere outro fornecedor.`,
        link: linkInterno,
        dados: { cotacaoId: cotacao.id, fornecedor: cotacao.fornecedorNome, rmsNumeros, motivo, declinada: true },
      });

      await notificarEvento({
        evento: "COTACAO_RESPONDIDA",
        subject: `[Compras] Cotação declinada — ${cotacao.fornecedorNome} (${rotuloRMs})`,
        html: `
          <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0a3a5c;">Fornecedor declinou a cotação</h2>
            <p style="color: #4a5568;"><strong>${escapeHtml(cotacao.fornecedorNome)}</strong> informou que não vai cotar a ${escapeHtml(rotuloRMs)}.</p>
            ${motivo ? `<p style="color: #4a5568;">Motivo informado: <em>${escapeHtml(motivo)}</em></p>` : ""}
            <p style="color: #718096; font-size: 13px;">A cotação foi encerrada como <strong>declinada</strong> — busque outro fornecedor para esses itens.</p>
          </div>`,
        text: `${cotacao.fornecedorNome} declinou a cotação da ${rotuloRMs}.${motivo ? " Motivo: " + motivo : ""}`,
      });
    } catch (e) {
      console.warn("[declinar] notificação falhou:", e?.message);
    }
  })();

  return NextResponse.json({ ok: true });
}
