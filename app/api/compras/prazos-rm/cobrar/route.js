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
  enviarTeste, MAX_TESTE, // ⚠ TEMPORÁRIO — ver o marcador em `lib/cobranca-atraso-envio.js`
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
  // ⚠ TEMPORÁRIO (18/09/2026): manda a prévia para quem está logado, nunca para o fornecedor.
  // O destinatário NÃO vem daqui — vem da sessão. Ver o marcador em `cobranca-atraso-envio.js`.
  teste: z.boolean().optional(),
});

/** ⚠ Base pública explícita: o link vai num e-mail, e e-mail não tem "mesma origem". */
const enderecoPublico = () =>
  process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

/** O que impede esta requisição de sair do lugar. `null` = pode seguir. */
function oQueFalta(body, user) {
  if (!process.env.RESEND_API_KEY) {
    return { status: 503, erro: "Serviço de e-mail não configurado (RESEND_API_KEY)." };
  }
  if (!enderecoPublico()) {
    return { status: 503, erro: "Endereço público do portal não configurado (NEXTAUTH_URL)." };
  }
  // ⚠ TEMPORÁRIO: sem endereço na sessão não há para onde mandar a prévia — e o destinatário
  // NUNCA vem do corpo. Recusa explícita em vez de um 500 sem explicação.
  if (body.teste && !user.email) {
    return { status: 400, erro: "Seu usuário não tem e-mail cadastrado — não há para onde mandar a prévia." };
  }
  return null;
}

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
  let sessao;
  try {
    sessao = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) { return naoAutorizado(e); }

  const grupos = agruparParaCobranca(await buscarPedidos());
  const ultimas = await ultimasCobrancas(prisma, grupos.map((g) => g.chave));

  return NextResponse.json({
    success: true,
    copias: copiasInternas(),
    respostaPara: respostaPara(),
    // ⚠ TEMPORÁRIO: a tela mostra para onde a prévia vai, e é o endereço da própria sessão.
    testePara: sessao.email || null,
    maxTeste: MAX_TESTE,
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

  const falta = oQueFalta(body, user);
  if (falta) return NextResponse.json({ success: false, error: falta.erro }, { status: falta.status });

  const baseUrl = enderecoPublico();
  const grupos = agruparParaCobranca(await buscarPedidos());
  const comum = { grupos, chaves: body.chaves, userId: user.id, baseUrl,
    enviar: sendEmail, gerarToken: () => crypto.randomBytes(24).toString("hex") };

  // ⚠⚠ TEMPORÁRIO (18/09/2026) — a prévia vai para o e-mail DA SESSÃO, nunca para um endereço do
  // corpo da requisição, e não encosta nas travas do caminho real (sem reserva, sem intervalo).
  // Para remover: apague este bloco, o `teste` do schema e o botão da tela.
  const resultados = body.teste
    ? await enviarTeste(prisma, { ...comum, para: user.email })
    : await enviarCobrancas(prisma, { ...comum, confirmar: body.confirmar });

  // ⚠⚠ 200 COM ESTADO POR FORNECEDOR, não um erro global. Um 500 faria a tela oferecer "tentar de
  // novo" para a lista inteira — inclusive para quem já recebeu (achado do Codex, 17/09/2026).
  const enviados = resultados.filter((r) => r.estado === "aceito").length;
  return NextResponse.json({
    success: true, enviados, total: resultados.length, resultados,
  });
}
