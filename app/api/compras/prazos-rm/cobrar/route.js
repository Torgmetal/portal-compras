// GET  /api/compras/prazos-rm/cobrar — os fornecedores com pedido atrasado, para escolher.
// POST — dispara UM e-mail por fornecedor escolhido.
//
// Matheus (17/09/2026): "um botão para disparar e-mails para os pedidos/RMs que já estão com 1 dia
// em atraso (…) preciso desse e-mail separado, um para cada fornecedor com sua respectiva
// RM/Pedido e suas datas."
//
// ⚠⚠ A LISTA É SEMPRE RECALCULADA AQUI. O corpo da requisição escolhe QUAIS chaves cobrar, e mais
// nada — nunca destinatário, pedido, data ou token. Aceitar isso do cliente seria deixar a tela
// decidir para quem a Torg manda e-mail (achado do Codex, 17/09/2026).
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { agruparParaCobranca, MOTIVO_BLOQUEIO } from "@/lib/cobranca-atraso";
import {
  enviarCobrancas, ultimasCobrancas, copiasInternas, respostaPara, INTERVALO_COBRANCA_MS,
} from "@/lib/cobranca-atraso-envio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ⚠ 8 fornecedores × (tokens + envio + 600ms de pausa) cabe folgado; o teto existe para o dia em
// que a lista crescer, não para hoje.
export const maxDuration = 120;

const corpo = z.object({
  // ⚠ Limitado e sem repetição: mandar a mesma chave dez vezes seria dez e-mails ao mesmo
  // fornecedor, e a trava de 2 dias não pega isso porque tudo acontece na mesma requisição.
  chaves: z.array(z.string().min(1).max(120)).min(1).max(50)
    .refine((v) => new Set(v).size === v.length, "não repita o mesmo fornecedor"),
  // ⚠ Booleano ESTRITO: `confirmar: "não"` é uma string, e string é `truthy`.
  confirmar: z.boolean().optional(),
});

const naoAutorizado = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });

/** Os pedidos vivos, com o que a cobrança precisa saber. */
const buscarPedidos = () => prisma.pedidoOmie.findMany({
  where: { status: "CRIADO" },
  select: {
    id: true, numeroPedido: true, codigoPedido: true, fornecedorNome: true, cnpj: true,
    statusEntrega: true, dataEntregaReal: true, recebidoEm: true, encerradoOmieEm: true,
    prazoEntregaPrevisto: true, prazoOriginal: true, faturamentoDireto: true,
    acompanhamentos: { select: { etapa: true, data: true } },
    cotacao: {
      select: {
        observacao: true, fornecedorEmail: true,
        fornecedor: { select: { email: true } },
        itens: { where: { vencedor: true }, select: { prazoEntrega: true, vencedor: true } },
      },
    },
    rmItens: { select: { rm: { select: { numero: true, op: { select: { numero: true, cliente: true } } } } }, take: 1 },
  },
});

export async function GET() {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) { return naoAutorizado(e); }

  const grupos = agruparParaCobranca(await buscarPedidos());
  const ultimas = await ultimasCobrancas(prisma, grupos.map((g) => g.chave));

  return NextResponse.json({
    success: true,
    copias: copiasInternas(),
    respostaPara: respostaPara(),
    intervaloDias: Math.round(INTERVALO_COBRANCA_MS / 86_400_000),
    fornecedores: grupos.map((g) => ({
      chave: g.chave, nome: g.nome, email: g.email,
      bloqueio: g.bloqueio, motivoBloqueio: g.bloqueio ? MOTIVO_BLOQUEIO[g.bloqueio] : null,
      ultimaCobranca: ultimas.get(g.chave) || null,
      pedidos: g.pedidos,
    })),
  });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) { return naoAutorizado(e); }

  let body;
  try {
    body = corpo.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `Dados inválidos: ${e.issues?.[0]?.message || e.message}` }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { success: false, error: "Serviço de e-mail não configurado (RESEND_API_KEY)." }, { status: 503 });
  }

  // ⚠ Base pública explícita: o link vai num e-mail, e e-mail não tem "mesma origem".
  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!baseUrl) {
    return NextResponse.json(
      { success: false, error: "Endereço público do portal não configurado (NEXTAUTH_URL)." }, { status: 503 });
  }

  const grupos = agruparParaCobranca(await buscarPedidos());
  const resultados = await enviarCobrancas(prisma, {
    grupos, chaves: body.chaves, userId: user.id, confirmar: body.confirmar,
    baseUrl, enviar: sendEmail, gerarToken: () => crypto.randomBytes(24).toString("hex"),
  });

  // ⚠⚠ 200 COM ESTADO POR FORNECEDOR, não um erro global. Um 500 faria a tela oferecer "tentar de
  // novo" para a lista inteira — inclusive para quem já recebeu (achado do Codex, 17/09/2026).
  const enviados = resultados.filter((r) => r.estado === "aceito").length;
  return NextResponse.json({
    success: true, enviados, total: resultados.length, resultados,
  });
}
