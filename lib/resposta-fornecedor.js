// ─── O FORNECEDOR RESPONDEU — QUEM FICA SABENDO ──────────────────────────────
//
// Matheus (18/09/2026), ao descobrir que ninguém era avisado: "pode fechar as duas (…) aí notificar
// por e-mail que o fornecedor respondeu e já foi entregue em tal NF".
//
// ⚠⚠ O LINK EXISTE DESDE MAIO E FOI USADO 6 VEZES, a última em 10/06 — e NADA reagia a essas
// respostas. Para um recurso cujo propósito inteiro é obter uma resposta, esse era o elo que
// faltava: o fornecedor respondia às 23h e o único jeito de descobrir era abrir a tela e reparar
// que um número tinha mudado.
//
// ⚠⚠ ESTA ROTA É PÚBLICA, SEM LOGIN. Avisar a cada chamada transforma um token vazado em uma
// torneira de e-mail apontada para `compras@` (achado do Codex, 18/09/2026). Daí as duas travas
// abaixo: repetição idêntica não é evento, e há um intervalo mínimo entre avisos do mesmo pedido.
import { criarNotificacao } from "@/lib/notificacoes";
import { sendEmail } from "@/lib/email";
import { escaparHtml as esc } from "@/lib/email-layout";
import { log } from "@/lib/log";

const registro = log("resposta-fornecedor");

/** Intervalo mínimo entre dois avisos do MESMO pedido. */
export const INTERVALO_AVISO_MS = 15 * 60_000;

/** Teto de avisos de um mesmo pedido em 24h — a defesa que sobra se alguém insistir. */
export const TETO_AVISOS_DIA = 5;

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

/** Para quem o aviso vai. Resolvido SEMPRE no servidor — nunca vem da requisição. */
export function destinosDoAviso(env = process.env) {
  const brutos = String(env.RESPOSTA_FORNECEDOR_CC ?? "compras@torg.com.br,matheus@torg.com.br").split(/[,;]/);
  return [...new Set(brutos.map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
}

/**
 * Já avisamos deste pedido há pouco?
 *
 * ⚠ Lê o próprio AuditLog — a resposta do fornecedor já grava lá de qualquer jeito, e uma tabela
 * nova para contar avisos seria a mesma informação com outro nome.
 */
export async function podeAvisar(prisma, pedidoId) {
  const desde = new Date(Date.now() - 24 * 60 * 60_000);
  const avisos = await prisma.auditLog.findMany({
    where: { action: "AVISO_RESPOSTA_FORNECEDOR", entityId: pedidoId, createdAt: { gte: desde } },
    select: { createdAt: true }, orderBy: { createdAt: "desc" },
  }).catch((e) => {
    registro.erro("não consegui ler o histórico de avisos:", e?.message);
    return null;
  });
  // ⚠ Sem leitura, NÃO avisa: o pior caso de não avisar é um atraso; o de avisar sem limite é
  // inundar a caixa de quem precisa ler.
  if (avisos === null) return { ok: false, motivo: "não consegui conferir o limite de avisos" };
  if (avisos.length >= TETO_AVISOS_DIA) return { ok: false, motivo: "teto de avisos do dia atingido" };
  if (avisos[0] && Date.now() - new Date(avisos[0].createdAt).getTime() < INTERVALO_AVISO_MS) {
    return { ok: false, motivo: "avisado há pouco" };
  }
  return { ok: true };
}

/** O texto do aviso, nas duas formas de resposta. */
export function textoDoAviso(pedido, resposta) {
  const quem = pedido.fornecedorNome || "O fornecedor";
  const ref = [
    pedido.numeroPedido ? `pedido ${pedido.numeroPedido}` : null,
    pedido.rmNumero ? `RM ${pedido.rmNumero}` : null,
  ].filter(Boolean).join(" · ") || "um pedido";

  if (resposta.entregue) {
    return {
      titulo: `${quem} informou ENTREGA — ${ref}`,
      // ⚠⚠ "INFORMOU", NUNCA "ENTREGOU". Quem lê o aviso precisa saber que isto é declaração de
      // terceiro, não recebimento conferido — a diferença decide se alguém vai ao pátio olhar.
      linha: `${quem} informou que o ${ref} já foi entregue${resposta.nfNumero ? `, na NF ${resposta.nfNumero}` : ""}.`,
      acao: "Confira o recebimento antes de dar o pedido por encerrado.",
    };
  }
  return {
    titulo: `${quem} informou nova previsão — ${ref}`,
    linha: `${quem} informou nova previsão de entrega para o ${ref}: ${fmt(resposta.prazoNovo)}`
      + (resposta.prazoAnterior ? ` (antes era ${fmt(resposta.prazoAnterior)})` : "") + ".",
    acao: "A tela Prazos das RMs já está com a data nova.",
  };
}

/** O corpo do e-mail. Tudo que veio do fornecedor passa por `esc`. */
function corpoDoEmail({ titulo, linha, acao }, resposta) {
  const motivo = String(resposta.motivo || "").trim();
  return `<div style="font-family:Arial,sans-serif;max-width:620px;color:#18394f;">
    <h2 style="color:#006EAB;margin:0 0 14px;font-size:18px;">${esc(titulo)}</h2>
    <p style="font-size:14px;line-height:1.8;margin:0 0 12px;">${esc(linha)}</p>
    ${motivo ? `<p style="font-size:13px;line-height:1.8;margin:0 0 12px;padding:12px 14px;background:#f4f8fb;border-left:3px solid #F4801F;">
      <b>O que ele escreveu:</b><br>${esc(motivo)}</p>` : ""}
    <p style="font-size:13px;line-height:1.8;color:#5d7b8d;margin:0;">${esc(acao)}</p>
  </div>`;
}

/**
 * Avisa Compras — sino e e-mail. Nunca lança: a resposta do fornecedor já foi gravada, e um
 * problema no aviso não pode fazer a tela dele dizer que deu errado (ele tentaria de novo, e cada
 * tentativa é outro aviso).
 *
 * @param {object} prisma
 * @param {{id, numeroPedido, fornecedorNome, rmNumero}} pedido
 * @param {{entregue?:boolean, nfNumero?:string, prazoNovo?:Date, prazoAnterior?:Date, motivo?:string}} resposta
 */
export async function avisarResposta(prisma, pedido, resposta) {
  const permissao = await podeAvisar(prisma, pedido.id);
  if (!permissao.ok) {
    registro.aviso(`[${pedido.numeroPedido}] não avisei: ${permissao.motivo}`);
    return { avisado: false, motivo: permissao.motivo };
  }

  const texto = textoDoAviso(pedido, resposta);
  const link = `/compras/prazos`;

  // ⚠ O sino primeiro: ele é interno e barato. O e-mail depois, e nenhum dos dois derruba o outro.
  await criarNotificacao({
    tipo: "FORNECEDOR_RESPONDEU", titulo: texto.titulo, mensagem: texto.linha, link,
    modulos: ["COMPRAS"],
    dados: { pedidoId: pedido.id, entregue: !!resposta.entregue, nfNumero: resposta.nfNumero || null },
  }).catch((e) => registro.erro("sino falhou:", e?.message));

  const r = await sendEmail({
    to: destinosDoAviso(),
    subject: texto.titulo,
    html: corpoDoEmail(texto, resposta),
    text: `${texto.linha}\n\n${resposta.motivo ? `O que ele escreveu: ${resposta.motivo}\n\n` : ""}${texto.acao}`,
  }).catch((e) => ({ ok: false, error: e?.message }));

  // ⚠ O carimbo do aviso é o que segura o intervalo — grava mesmo se o e-mail falhou, senão uma
  // falha do Resend viraria aviso sem limite nenhum.
  await prisma.auditLog.create({
    data: {
      userId: null, action: "AVISO_RESPOSTA_FORNECEDOR", entity: "PedidoOmie", entityId: pedido.id,
      diff: { entregue: !!resposta.entregue, nfNumero: resposta.nfNumero || null, emailOk: !!r?.ok },
    },
  }).catch(() => {});

  return { avisado: true, emailOk: !!r?.ok };
}
