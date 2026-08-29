import "server-only";
import { cabecalhoEmail, EMAIL_NAVY, EMAIL_ORANGE } from "./email-layout";
import { escapeHtml } from "./html";

// ─── COMUNICADO AO TIME SOBRE O ACESSO ────────────────────────────────────────
// Vitor (29/08/2026): "tem como mandarmos um informativo no email pra os usuários do portal?".
// É o aviso do reforço de login — a trava de tentativas e a troca obrigatória da senha de cadastro.
//
// ⚠⚠ TRÊS COISAS QUE O TEXTO PRECISA FAZER, e que não são óbvias:
//
// 1. ABRIR DIZENDO QUE NADA MUDA. Aviso de segurança gera mais ligação para o suporte do que o
//    próprio problema; se a primeira linha não desarmar isso, o telefone toca o dia inteiro.
// 2. DIZER QUE NÃO É GOLPE, com todas as letras. Um e-mail pedindo troca de senha é exatamente o
//    formato de um phishing. Sem nomear isso, ou a pessoa desconfia (com razão) e ignora, ou —
//    pior — ela aprende que é normal obedecer a e-mails desse tipo.
// 3. FECHAR COM A REGRA PERMANENTE: a Torg nunca pede senha por e-mail, telefone ou WhatsApp. É o
//    único item da mensagem que continua valendo depois desta semana.
export const ASSUNTO_AVISO = "Portal Torg — reforço no acesso (pode pedir senha nova)";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";

const bloco = (titulo, texto) => `
          <tr>
            <td style="padding:12px 14px;background:#f6f8fb;border-left:3px solid ${EMAIL_ORANGE};border-radius:4px">
              <p style="margin:0 0 4px;font-weight:bold;font-size:14px;color:${EMAIL_NAVY}">${titulo}</p>
              <p style="margin:0;font-size:13px;color:#42536b">${texto}</p>
            </td>
          </tr>`;

/** O e-mail do comunicado, já com o primeiro nome de quem recebe. */
export function htmlAvisoSeguranca(nome) {
  const quem = escapeHtml(String(nome || "").trim().split(/\s+/)[0] || "colega");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#1b2a41;line-height:1.55">
      ${cabecalhoEmail("Acesso ao portal — o que muda")}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 24px">
        <p style="margin:0 0 14px">Olá, <strong>${quem}</strong>,</p>

        <p style="margin:0 0 14px">Reforçamos a segurança do acesso ao portal. <strong>Nada muda no seu dia a dia</strong> — você continua entrando do mesmo jeito, e nenhum link que você já recebeu deixou de funcionar.</p>

        <p style="margin:0 0 8px;font-weight:bold;color:${EMAIL_NAVY}">Duas coisas que podem aparecer para você:</p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px">
${bloco("1. O portal pode pedir uma senha nova",
        "Se você nunca trocou a senha que recebeu quando sua conta foi criada, o portal vai pedir uma senha sua no próximo acesso. É rápido, é uma tela só — e depois disso não pede mais. <strong>É normal, não é golpe.</strong>")}
          <tr><td style="height:8px"></td></tr>
${bloco("2. Errar a senha muitas vezes agora tranca por 15 minutos",
        "Depois de várias tentativas erradas seguidas, o acesso àquela conta espera 15 minutos. O bloqueio passa sozinho — ninguém precisa liberar. Se não lembrar a senha, use <strong>Esqueci minha senha</strong> na tela de entrada, que resolve na hora.")}
        </table>

        <p style="text-align:center;margin:22px 0">
          <a href="${BASE}/entrar" style="background:#006EAB;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block">Abrir o portal</a>
        </p>

        <p style="margin:0 0 6px;font-size:13px;color:#42536b"><strong>Uma dica que vale sempre:</strong> a Torg nunca pede sua senha por e-mail, telefone ou WhatsApp. Se receber um pedido desses, não responda e avise a gente.</p>

        <p style="margin:16px 0 0;font-size:12px;color:#7b8798">Dúvida ou problema para entrar? Responda este e-mail.</p>
      </div>
    </div>`;
}
