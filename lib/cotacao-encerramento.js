import "server-only";
import { sendEmail } from "./email";
import { escapeHtml } from "./html";
import { log } from "./log";

// ─── COTAÇÃO SEM RESPOSTA, EM RM QUE JÁ VIROU PEDIDO: ENCERRA E AVISA ────────
//
// Matheus (02/10/2026): "quando as RM/cotações estiverem com status PEDIDO GERADO é preciso dar um
// aviso para os fornecedores que ainda não responderam a cotação, avisando que já foi encerrada".
// Medido no dia: 236 cotações sem resposta em 103 RMs já em Pedido gerado — todas com o link
// aberto, aceitando proposta para compra que já tinha sido feita.
//
// ⚠⚠ STATUS PRÓPRIO, "ENCERRADA", e não "CANCELADA": a página pública de cancelada diz "o comprador
// cancelou esta solicitação", que não é o que aconteceu — a compra foi concluída.
//
// ⚠⚠ COTAÇÃO CONSOLIDADA SÓ ENCERRA QUANDO TODAS AS RMs DELA FECHARAM. Uma cotação pode cobrir
// itens de mais de uma RM (`adicionar-rm`); fechar a T119-001 não pode encerrar o link de um
// fornecedor que ainda tem a T119-002 para cotar.
//
// ⚠⚠ E-MAIL NÃO TEM DESFAZER — a mesma ordem da cobrança de atrasados: grava ENCERRADA primeiro,
// condicionado ao status lido, e só quem ganhou a gravação manda. Duas chamadas simultâneas (dois
// pedidos da mesma RM) não mandam o aviso duas vezes.
//
// ⚠ NUNCA DERRUBA QUEM CHAMOU. Isto roda depois de o pedido existir no Omie: um Resend fora do ar,
// ou o banco piscando aqui, não pode fazer a tela de gerar pedido dizer que deu errado.

const registro = log("lib/cotacao-encerramento");

const ABERTAS = ["PENDENTE", "VENCIDA"];
const RM_FECHADA = ["PEDIDO_GERADO", "CANCELADA"];
const COPIA = "compras@torg.com.br";

/** As RMs da cotação: a dela e as dos itens (consolidada). */
const rmsDa = (c) => {
  const m = new Map();
  if (c.rm) m.set(c.rm.id, c.rm);
  for (const it of c.itens || []) if (it.rmItem?.rm) m.set(it.rmItem.rm.id, it.rmItem.rm);
  return [...m.values()];
};

/** Pura: esta cotação está sem resposta e TODAS as RMs dela já fecharam? */
export function cotacaoPodeEncerrar(c) {
  if (!ABERTAS.includes(c?.status)) return false;
  const rms = rmsDa(c);
  return rms.length > 0 && rms.every((r) => RM_FECHADA.includes(r.status));
}

/** O e-mail neutro (texto aprovado por Matheus, 02/10/2026): encerrada, sem dizer quem ganhou. */
export function emailDeEncerramento(c) {
  const numeros = rmsDa(c).map((r) => r.numero).filter(Boolean).sort();
  const rotulo = numeros.length > 1 ? `RMs ${numeros.join(", ")}` : `RM ${numeros[0] ?? ""}`;
  const enviadaEm = c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
  const subject = `Cotação encerrada — ${rotulo} · Torg Metal`;
  const corpo = [
    `Olá, ${c.fornecedorNome}.`,
    `A cotação da ${rotulo}${enviadaEm ? `, que enviamos em ${enviadaEm},` : ""} foi encerrada: o processo de compra desses itens foi concluído, e o link de resposta não aceita mais propostas.`,
    "Agradecemos a atenção e contamos com vocês nas próximas cotações.",
    "Equipe de Compras · Torg Metal",
  ];
  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; color: #2d3748;">
      <h2 style="color: #002945;">Cotação encerrada</h2>
      ${corpo.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n      ")}
    </div>`;
  return { subject, html, text: corpo.join("\n\n") };
}

async function avisar(c, enviar) {
  if (!c.fornecedorEmail) return "sem-email";
  try {
    const r = await enviar({ to: c.fornecedorEmail, cc: [COPIA], replyTo: COPIA, ...emailDeEncerramento(c) });
    return r?.ok === false ? "falhou" : "enviado";
  } catch (e) {
    registro.aviso(`aviso de encerramento falhou (${c.id}):`, e?.message);
    return "falhou";
  }
}

/**
 * Encerra as cotações sem resposta de uma RM que acabou de virar Pedido gerado, e avisa o fornecedor.
 * @param {object} db  prisma (ou um duplo nos testes)
 * @param {string} rmId
 * @param {{ avisar?: boolean, enviar?: Function, userId?: string|null }} [opcoes]
 *   `avisar: false` só encerra — foi o que se fez com as 236 antigas (Matheus: "encerrar sem e-mail").
 * @returns {Promise<{cotacaoId:string, fornecedor:string, aviso:string}[]>}
 */
export async function encerrarCotacoesDaRM(db, rmId, { avisar: deveAvisar = true, enviar = sendEmail, userId = null } = {}) {
  if (!rmId) return [];
  try {
    const rmSel = { select: { id: true, numero: true, status: true } };
    const candidatas = await db.cotacao.findMany({
      where: { status: { in: ABERTAS }, OR: [{ rmId }, { itens: { some: { rmItem: { rmId } } } }] },
      select: {
        id: true, status: true, fornecedorNome: true, fornecedorEmail: true, createdAt: true,
        rm: rmSel, itens: { select: { rmItem: { select: { rm: rmSel } } } },
      },
    });
    const feitos = [];
    for (const c of candidatas.filter(cotacaoPodeEncerrar)) {
      const r = await db.cotacao.updateMany({ where: { id: c.id, status: { in: ABERTAS } }, data: { status: "ENCERRADA" } });
      if (!r.count) continue; // outra chamada encerrou primeiro — e é ela que avisa
      const aviso = deveAvisar ? await avisar(c, enviar) : "nao-avisar";
      await db.auditLog.create({
        data: {
          userId, action: "ENCERRAR_COTACAO_PEDIDO_GERADO", entity: "Cotacao", entityId: c.id,
          diff: { antes: c.status, depois: "ENCERRADA", fornecedor: c.fornecedorNome, rms: rmsDa(c).map((x) => x.numero), aviso },
        },
      }).catch(() => {});
      feitos.push({ cotacaoId: c.id, fornecedor: c.fornecedorNome, aviso });
    }
    return feitos;
  } catch (e) {
    registro.erro(`encerrar cotações da RM ${rmId}:`, e?.message);
    return [];
  }
}
