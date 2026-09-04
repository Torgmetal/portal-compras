// Envio de emails via Resend. Best-effort: nao quebra o fluxo principal
// se falhar — so loga e segue. Notificacoes operacionais nao podem
// derrubar criacao de RM, por exemplo.
//
// Requer:
// - RESEND_API_KEY  (Vercel env)
// - EMAIL_FROM      (ex: "Workspace Torg <noreply@torg.com.br>"). Fallback
//   pra onboarding@resend.dev (dominio de teste do Resend) se nao definido —
//   util pra testar sem precisar verificar dominio.
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "Workspace Torg <onboarding@resend.dev>";

// Mantém o endereço verificado do EMAIL_FROM, mas troca o nome de exibição
// (ex.: "Torg Metal - Comercial" em vez de "Workspace Torg") quando informado.
function fromComNome(nome) {
  if (!nome) return FROM;
  const m = /<([^>]+)>/.exec(FROM);
  return m ? `${nome} <${m[1]}>` : FROM;
}

let resend = null;
function getClient() {
  if (!RESEND_KEY) return null;
  if (!resend) resend = new Resend(RESEND_KEY);
  return resend;
}

// Envia um email pra uma lista de destinatarios. Retorna {ok, ids?, error?}.
// Nao lanca exception — caller decide o que fazer com falhas.
export async function sendEmail({ to, cc, subject, html, text, replyTo, attachments, fromName }) {
  if (!RESEND_KEY) {
    console.warn("[email] RESEND_API_KEY nao configurado — pulando envio");
    return { ok: false, error: "RESEND_API_KEY nao configurado" };
  }
  const destinatarios = Array.isArray(to) ? to : [to];
  if (destinatarios.length === 0) return { ok: false, error: "sem destinatarios" };
  const ccList = cc ? (Array.isArray(cc) ? cc : [cc]).filter(Boolean) : [];

  try {
    const client = getClient();
    const result = await client.emails.send({
      from: fromComNome(fromName),
      to: destinatarios,
      ...(ccList.length > 0 ? { cc: ccList } : {}),
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      // Anexos: array { filename, content (Buffer/base64) } — usado p/ enviar
      // documentos de RH como anexo de verdade (não só link).
      ...(Array.isArray(attachments) && attachments.length > 0 ? { attachments } : {}),
    });
    if (result.error) {
      console.error("[email] resend retornou erro:", result.error);
      return { ok: false, error: result.error.message || "Resend error" };
    }
    return { ok: true, id: result.data?.id };
  } catch (e) {
    console.error("[email] excecao no envio:", e?.message);
    return { ok: false, error: e?.message || "erro desconhecido" };
  }
}

// Broadcast: MUITOS e-mails individuais numa só chamada via Resend Batch API.
// ⚠ Por que existe: o envio em `Promise.all` de vários `emails.send` em rajada
// estoura o rate limit do Resend (~2 req/s) e a maioria volta 429 — foi o que fez
// um comunicado do RH chegar a só 20 de 67 funcionários. O batch manda até 100
// e-mails INDIVIDUAIS (cada um só vê o próprio endereço) em UMA requisição.
// Recebe [{ to, subject, html, text, fromName? }].
// Retorna { ok, enviados, falhas: [{ to, error }] } — nunca lança.
export async function sendEmailBatch(mensagens) {
  const lista = (mensagens || []).filter((m) => m && m.to);
  if (!RESEND_KEY) {
    return { ok: false, enviados: 0, falhas: lista.map((m) => ({ to: m.to, error: "RESEND_API_KEY nao configurado" })) };
  }
  if (lista.length === 0) return { ok: true, enviados: 0, falhas: [] };

  const client = getClient();
  let enviados = 0;
  const falhas = [];
  const CHUNK = 100; // limite do batch do Resend

  for (let i = 0; i < lista.length; i += CHUNK) {
    const chunk = lista.slice(i, i + CHUNK);
    const payload = chunk.map((m) => ({
      from: fromComNome(m.fromName),
      to: Array.isArray(m.to) ? m.to : [m.to],
      subject: m.subject,
      html: m.html,
      text: m.text,
    }));
    try {
      const result = await client.batch.send(payload);
      if (result?.error) {
        // Falha no batch inteiro (validação/limite) — marca todos do chunk.
        chunk.forEach((m) => falhas.push({ to: m.to, error: result.error.message || "Resend batch error" }));
      } else {
        // result.data.data = array de { id } na ordem enviada.
        const ids = result?.data?.data || result?.data || [];
        chunk.forEach((m, j) => {
          if (ids[j]?.id) enviados++;
          else falhas.push({ to: m.to, error: "sem id retornado pelo Resend" });
        });
      }
    } catch (e) {
      chunk.forEach((m) => falhas.push({ to: m.to, error: e?.message || "erro desconhecido" }));
    }
  }
  return { ok: falhas.length === 0, enviados, falhas };
}

// Busca emails inscritos em um evento e dispara o email pra cada.
// Eventos suportados hoje: "RM_CRIADA"
export async function notificarEvento({ evento, subject, html, text }) {
  let destinatarios = [];
  try {
    const inscritos = await prisma.emailNotificacao.findMany({
      where: { ativo: true, eventos: { has: evento } },
      select: { email: true },
    });
    destinatarios = inscritos.map((i) => i.email).filter(Boolean);
  } catch (e) {
    console.error("[email] falha buscando inscritos:", e?.message);
    return { ok: false, error: e?.message };
  }
  if (destinatarios.length === 0) {
    return { ok: true, skipped: true, motivo: "nenhum inscrito ativo" };
  }
  return await sendEmail({ to: destinatarios, subject, html, text });
}
