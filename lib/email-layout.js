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
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;font-family:Arial,sans-serif;">
      <tr><td bgcolor="${EMAIL_NAVY}" style="background:${EMAIL_NAVY};color:#ffffff;padding:28px 24px;border-radius:8px 8px 0 0;">
        <p style="margin:0;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:1px;color:#ffffff;">TORG METAL</p>
        <p style="margin:6px 0 0;font-size:11px;line-height:1.5;letter-spacing:2px;color:#CFDFEC;">ESTRUTURAS METÁLICAS</p>
        ${seloCampanhaEmail()}
        <h2 style="margin:24px 0 0;font-size:24px;line-height:1.35;font-weight:700;color:#ffffff;">${titulo}</h2>${subtitulo ? `
        <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#CFDFEC;">${subtitulo}</p>` : ""}
      </td></tr>
      <tr><td bgcolor="${EMAIL_ORANGE}" height="5" style="height:5px;line-height:5px;font-size:0;background:${EMAIL_ORANGE};">&nbsp;</td></tr>
    </table>`;
}

// ─── SETEMBRO AMARELO NOS E-MAILS DO PORTAL ───────────────────────────────────
// Vitor (30/08/2026): "para os e-mails que saem do portal pode colocar o laço também". Entra aqui,
// em `cabecalhoEmail`, porque é o único ponto por onde TODO e-mail do portal passa — notificações de vários setores,
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
function seloCampanhaEmail() {
  if (!emSetembroAmarelo()) return "";
  const laco = "https://workspace.torg.com.br/laco-setembro.png";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:22px;">
      <tr>
        <td width="44" style="padding:0 12px 0 0;vertical-align:middle;">
          <img src="${laco}" width="32" height="32" alt="Laço amarelo" style="display:block;border:0;" />
        </td>
        <td style="vertical-align:middle;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#CFDFEC;">
          <strong style="font-size:13px;color:#F4C000;">Setembro Amarelo</strong><br>${SLOGAN}
        </td>
      </tr>
    </table>`;
}
