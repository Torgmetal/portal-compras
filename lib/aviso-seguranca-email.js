import "server-only";
import { cabecalhoEmail, EMAIL_NAVY, EMAIL_ORANGE } from "./email-layout";
import { escapeHtml } from "./html";

// ─── COMUNICADO AO TIME ───────────────────────────────────────────────────────
// Vitor (29/08/2026): "tem como mandarmos um informativo no email pra os usuários do portal?" e,
// logo depois, "você consegue deixar eu editar o texto que vc sugeriu?".
//
// ⚠⚠ O TEXTO É DADO, O LAYOUT É CÓDIGO. Quem escreve o comunicado é o Vitor; o que não muda é a
// moldura — faixa navy, filete laranja, os blocos com a régua laranja. Deixar o corpo inteiro
// virar HTML editável acabaria com o padrão visual no primeiro comunicado com pressa.
//
// ⚠ E O QUE ELE DIGITA É ESCAPADO. Vai para dentro de um e-mail HTML: sem escapar, um "<" no
// texto quebra a mensagem, e colar algo de outro lugar injetaria marcação. O único enfeite é
// **negrito**, convertido depois do escape.
//
// ⚠⚠ TRÊS COISAS QUE O TEXTO PADRÃO FAZ DE PROPÓSITO — se for reescrever, não perca:
// 1. ABRE DIZENDO QUE NADA MUDA. Aviso de segurança gera mais ligação para o suporte do que o
//    próprio problema; se a primeira linha não desarmar isso, o telefone toca o dia inteiro.
// 2. DIZ QUE NÃO É GOLPE, com todas as letras. Um e-mail pedindo troca de senha é exatamente o
//    formato de um phishing. Sem nomear isso, ou a pessoa desconfia (com razão) e ignora, ou —
//    pior — aprende que é normal obedecer a e-mails desse tipo.
// 3. FECHA COM A REGRA PERMANENTE: a Torg nunca pede senha por e-mail, telefone ou WhatsApp. É o
//    único item que continua valendo depois desta semana.
export const ASSUNTO_AVISO = "Portal Torg — reforço no acesso (pode pedir senha nova)";

export const AVISO_PADRAO = {
  assunto: ASSUNTO_AVISO,
  titulo: "Acesso ao portal — o que muda",
  abertura: "Reforçamos a segurança do acesso ao portal. **Nada muda no seu dia a dia** — você continua entrando do mesmo jeito, e nenhum link que você já recebeu deixou de funcionar.",
  chamada: "Duas coisas que podem aparecer para você:",
  blocos: [
    {
      titulo: "1. O portal pode pedir uma senha nova",
      texto: "Se você nunca trocou a senha que recebeu quando sua conta foi criada, o portal vai pedir uma senha sua no próximo acesso. É rápido, é uma tela só — e depois disso não pede mais. **É normal, não é golpe.**",
    },
    {
      titulo: "2. Errar a senha muitas vezes agora tranca por 15 minutos",
      texto: "Depois de várias tentativas erradas seguidas, o acesso àquela conta espera 15 minutos. O bloqueio passa sozinho — ninguém precisa liberar. Se não lembrar a senha, use **Esqueci minha senha** na tela de entrada, que resolve na hora.",
    },
  ],
  botao: "Abrir o portal",
  fechamento: "**Uma dica que vale sempre:** a Torg nunca pede sua senha por e-mail, telefone ou WhatsApp. Se receber um pedido desses, não responda e avise a gente.",
  rodape: "Dúvida ou problema para entrar? Responda este e-mail.",
};

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";

/** Escapa e depois devolve o único enfeite permitido: **negrito**. */
const texto = (t) =>
  escapeHtml(String(t ?? "")).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");

const bloco = (b) => `
          <tr>
            <td style="padding:12px 14px;background:#f6f8fb;border-left:3px solid ${EMAIL_ORANGE};border-radius:4px">
              <p style="margin:0 0 4px;font-weight:bold;font-size:14px;color:${EMAIL_NAVY}">${texto(b?.titulo)}</p>
              <p style="margin:0;font-size:13px;color:#42536b">${texto(b?.texto)}</p>
            </td>
          </tr>`;

/**
 * O e-mail do comunicado, com o primeiro nome de quem recebe.
 * @param {string} nome
 * @param {typeof AVISO_PADRAO} [conteudo] — o que o Vitor escreveu; sem isso, vale o padrão.
 */
export function htmlAvisoSeguranca(nome, conteudo = null) {
  const c = { ...AVISO_PADRAO, ...(conteudo || {}) };
  const quem = escapeHtml(String(nome || "").trim().split(/\s+/)[0] || "colega");
  const blocos = (Array.isArray(c.blocos) ? c.blocos : [])
    .filter((b) => b && (b.titulo || b.texto))
    .map(bloco)
    .join('\n          <tr><td style="height:8px"></td></tr>');

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#1b2a41;line-height:1.55">
      ${cabecalhoEmail(escapeHtml(c.titulo || AVISO_PADRAO.titulo))}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 24px">
        <p style="margin:0 0 14px">Olá, <strong>${quem}</strong>,</p>

        <p style="margin:0 0 14px">${texto(c.abertura)}</p>
${c.chamada ? `
        <p style="margin:0 0 8px;font-weight:bold;color:${EMAIL_NAVY}">${texto(c.chamada)}</p>` : ""}
${blocos ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px">${blocos}
        </table>` : ""}
${c.botao ? `
        <p style="text-align:center;margin:22px 0">
          <a href="${BASE}/entrar" style="background:#006EAB;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block">${texto(c.botao)}</a>
        </p>` : ""}
${c.fechamento ? `
        <p style="margin:0 0 6px;font-size:13px;color:#42536b">${texto(c.fechamento)}</p>` : ""}
${c.rodape ? `
        <p style="margin:16px 0 0;font-size:12px;color:#7b8798">${texto(c.rodape)}</p>` : ""}
      </div>
    </div>`;
}
