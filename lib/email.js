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

let resend = null;
function getClient() {
  if (!RESEND_KEY) return null;
  if (!resend) resend = new Resend(RESEND_KEY);
  return resend;
}

// Envia um email pra uma lista de destinatarios. Retorna {ok, ids?, error?}.
// Nao lanca exception — caller decide o que fazer com falhas.
export async function sendEmail({ to, cc, subject, html, text, replyTo }) {
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
      from: FROM,
      to: destinatarios,
      ...(ccList.length > 0 ? { cc: ccList } : {}),
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
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
