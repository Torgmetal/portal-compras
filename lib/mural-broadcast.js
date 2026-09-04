// Broadcast de comunicado do mural por e-mail — lógica única compartilhada entre
// criar o aviso (/api/rh/mural POST) e reenviar (/api/rh/mural/[id]/reenviar e o
// gatilho /api/cron/mural-reenviar).
//
// ⚠ Usa `sendEmailBatch` (Resend Batch API): manda todos os e-mails individuais em
// UMA requisição, sem estourar o rate limit que fazia o comunicado chegar só a uma
// parte dos funcionários. As falhas voltam DISCRIMINADAS (nunca engolidas) para o
// RH ver quem não recebeu.
import { sendEmailBatch } from "@/lib/email";
import { escapeHtml } from "@/lib/html";

export function montarHtmlAviso({ titulo, corpo, autor, imagemUrl }) {
  const imgHtml = imagemUrl
    ? `<img src="${imagemUrl}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:0 0 14px;display:block" />`
    : "";
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
    <div style="background:#0D1F3C;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
      <strong style="font-size:16px">📢 Comunicado do RH — Torg Metal</strong>
    </div>
    <div style="height:4px;background:#F4801F;"></div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:20px">
      <h2 style="color:#002945;margin:0 0 10px">${escapeHtml(titulo)}</h2>
      ${imgHtml}
      <div style="color:#333;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(corpo)}</div>
      <p style="margin-top:22px;font-size:12px;color:#888">${autor ? escapeHtml(autor) + " · " : ""}Você recebeu este comunicado por fazer parte da equipe Torg. Veja todos os avisos no portal do funcionário.</p>
    </div>
  </div>`;
}

// Destinatários do comunicado: funcionários ATIVOS com e-mail (deduplicado).
export async function destinatariosMural(prisma) {
  const funcs = await prisma.funcionario.findMany({
    where: { ativo: true, email: { not: null } },
    select: { email: true },
  });
  return [...new Set(funcs.map((f) => (f.email || "").trim().toLowerCase()).filter(Boolean))];
}

// Envia (ou reenvia) um aviso por e-mail a todos os funcionários ativos com e-mail.
// `autorNome` é o nome exibido como remetente/assinatura. Atualiza o próprio aviso
// (emailEnviadoEm + emailDestinatarios = quantos de fato entraram) e devolve os detalhes.
export async function enviarAvisoPorEmail(prisma, aviso, autorNome) {
  const destinos = await destinatariosMural(prisma);
  if (destinos.length === 0) return { enviados: 0, falhas: [], total: 0 };

  const html = montarHtmlAviso({ titulo: aviso.titulo, corpo: aviso.corpo, autor: autorNome || aviso.criadoPorNome, imagemUrl: aviso.imagemUrl });
  const text = `Comunicado do RH — Torg Metal\n\n${aviso.titulo}\n\n${aviso.corpo}`;
  const subject = `📢 ${aviso.titulo}`;

  const mensagens = destinos.map((to) => ({ to, subject, html, text }));
  const { enviados, falhas } = await sendEmailBatch(mensagens);

  await prisma.muralAviso.update({
    where: { id: aviso.id },
    data: { emailEnviadoEm: new Date(), emailDestinatarios: enviados },
  }).catch(() => {});

  return { enviados, falhas, total: destinos.length };
}
