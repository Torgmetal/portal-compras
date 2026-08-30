import { emSetembroAmarelo, SLOGAN } from "./campanha";

// PADRÃO VISUAL dos e-mails automáticos do portal — definido pelo Vitor:
// faixa NAVY + filete LARANJA, a mesma linguagem dos PDFs (Data Book,
// Relatório de Status, Cronograma). Todo aviso que sai do portal usa isto.
//
// Antes cada rota montava seu próprio cabeçalho inline e a cor tinha derivado:
// #006EAB na maioria, #0d1f3c em algumas e até #059669 (verde) em duas.
//
// USE SEMPRE `cabecalhoEmail()` em e-mail novo — não repita o HTML na mão.

export const EMAIL_NAVY = "#0D1F3C";
export const EMAIL_ORANGE = "#F4801F";
export const EMAIL_ASSINATURA = "Torg Metal · Estruturas Metálicas";

/**
 * Cabeçalho padrão: faixa navy com o título + filete laranja embaixo.
 * ⚠️ `titulo` e `subtitulo` entram como HTML — escape antes (lib/html:escapeHtml)
 * se vierem de dado do usuário/banco.
 * @param {string} titulo
 * @param {string} [subtitulo] — passe "" pra omitir a linha.
 */
export function cabecalhoEmail(titulo, subtitulo = EMAIL_ASSINATURA) {
  return `<div style="background:${EMAIL_NAVY};color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;font-size:18px;">${titulo}</h2>${subtitulo ? `
      <p style="margin:4px 0 0;font-size:13px;opacity:.85;">${subtitulo}</p>` : ""}
    </div>
    <div style="height:4px;background:${EMAIL_ORANGE};"></div>${faixaCampanhaEmail()}`;
}

// ─── SETEMBRO AMARELO NOS E-MAILS DO PORTAL ───────────────────────────────────
// Vitor (30/08/2026): "para os e-mails que saem do portal pode colocar o laço também". Entra aqui,
// em `cabecalhoEmail`, porque é o único ponto por onde TODO e-mail do portal passa — 13 arquivos,
// de aprovação de RM a holerite, sem tocar em nenhum deles.
//
// ⚠⚠ IMAGEM DE E-MAIL VEM BLOQUEADA POR PADRÃO. Se a campanha dependesse só do laço, boa parte de
// quem recebe veria um quadradinho vazio. Por isso o TEXTO vai junto e carrega a mensagem sozinho:
// quem libera imagem vê o laço, quem não libera lê a frase. O `alt` cobre o meio-termo.
//
// ⚠ TABELA, e não flex/grid: Outlook desktop ignora os dois. É feio no código e é o que funciona.
//
// ⚠ URL ABSOLUTA E PÚBLICA: e-mail não tem "a mesma origem". O laço já está servido em
// workspace.torg.com.br e o middleware o libera sem sessão (ver a exceção `laco-setembro`).
function faixaCampanhaEmail() {
  if (!emSetembroAmarelo()) return "";
  const laco = "https://workspace.torg.com.br/laco-setembro.png";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFF8E1;border-collapse:collapse;">
      <tr>
        <td style="padding:10px 24px;vertical-align:middle;width:34px;">
          <img src="${laco}" width="26" height="26" alt="Setembro Amarelo" style="display:block;border:0;" />
        </td>
        <td style="padding:10px 24px 10px 0;vertical-align:middle;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#7a4a06;">
          <strong style="color:#412402;">Setembro Amarelo</strong> — ${SLOGAN}
        </td>
      </tr>
    </table>`;
}
