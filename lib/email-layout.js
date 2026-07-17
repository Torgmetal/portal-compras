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
    <div style="height:4px;background:${EMAIL_ORANGE};"></div>`;
}
