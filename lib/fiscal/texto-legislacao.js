import crypto from "node:crypto";

// ─── O TEXTO DA LEI, EXTRAÍDO DA PÁGINA ──────────────────────────────────────
//
// ⚠⚠ ESTE ARQUIVO NÃO DECIDE NADA FISCAL. Ele transforma HTML em texto e em dispositivos
// (artigo, parágrafo, inciso) — separado de propósito de quem baixa e de quem interpreta.
//
// ⚠⚠ UMA PÁGINA DE ERRO DO SHAREPOINT DEVOLVE **200** COM HTML. Sem conferir que o texto esperado
// está lá dentro, o coletor gravaria a página de erro no banco como se fosse a lei, com hash e
// tudo — e o portal passaria a fundamentar apontamentos fiscais num "Desculpe, ocorreu um erro".
// Por isso todo documento declara marcadores, e a leitura RECUSA o que não os contém.

const semTags = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
  .replace(/<[^>]+>/g, " ");

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u0020", ordm: "º", ordf: "ª", deg: "°", hellip: "…", ndash: "–", mdash: "—", laquo: "«", raquo: "»", sect: "§", middot: "·" };

// ⚠⚠ TEXTO LEGAL EM PORTUGUÊS É CHEIO DE `&ccedil;` E `&atilde;`, e sem eles "operação" chega ao
// banco como "opera&ccedil;&atilde;o" — quebrando a busca textual e a leitura de quem confere. O
// mapa é gerado das letras acentuadas em vez de escrito à mão, que é como se esquece metade.
for (const [sufixo, letras, acentuadas] of [
  ["acute", "aeiouyAEIOUY", "áéíóúýÁÉÍÓÚÝ"],
  ["grave", "aeiouAEIOU", "àèìòùÀÈÌÒÙ"],
  ["circ", "aeiouAEIOU", "âêîôûÂÊÎÔÛ"],
  ["tilde", "anoANO", "ãñõÃÑÕ"],
  ["uml", "aeiouAEIOU", "äëïöüÄËÏÖÜ"],
  ["cedil", "cC", "çÇ"],
]) {
  for (let i = 0; i < letras.length; i += 1) ENTIDADES[letras[i] + sufixo] = acentuadas[i];
}

/** ⚠ `&#186;` e `&ordm;` são o "º" dos artigos — perder isso vira "Artigo 1 -" onde é "Artigo 1º". */
const desescapar = (t) => t
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  // ⚠⚠ ENTIDADE É SENSÍVEL A MAIÚSCULA: `&Ccedil;` é "Ç" e `&ccedil;` é "ç". Casando por
  // `toLowerCase()`, "INSCRIÇÃO" — que é como cabeçalho de lei se escreve — virava "INSCRIçãO".
  .replace(/&([a-zA-Z]+);/g, (m, n) => ENTIDADES[n] ?? m);

/** O texto legível da página, com as quebras de linha preservadas onde importam. */
export function textoDaPagina(html) {
  return desescapar(semTags(String(html ?? "")))
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export const sha256 = (v) => crypto.createHash("sha256").update(typeof v === "string" ? Buffer.from(v, "utf8") : v).digest("hex");

/**
 * ⚠⚠ O CORPO COMEÇA NO PRIMEIRO ARTIGO, NÃO NO TOPO DA PÁGINA. Medido em 22/09/2026: das ~12.900
 * letras de `art404.aspx`, a maior parte é menu do site ("Ativar o modo mais acessível", "Comando
 * para Ignorar Faixa de Opções"). Guardar isso junto faria a busca textual casar com o CHROME do
 * SharePoint, e o hash mudaria a cada redesenho do portal da SEFAZ — falso "a lei mudou".
 */
export function corpoLegal(texto, { artigos = [], marcadores = [] } = {}) {
  const linhas = String(texto ?? "").split("\n");
  const alvo = artigos.length ? new RegExp(`^Artigo\\s+${artigos[0]}\\b`) : null;
  let inicio = alvo ? linhas.findIndex((l) => alvo.test(l)) : -1;
  if (inicio < 0 && marcadores.length) {
    const m = semAcento(marcadores[0]);
    inicio = linhas.findIndex((l) => semAcento(l).includes(m));
  }
  return inicio < 0 ? null : linhas.slice(inicio).join("\n").trim();
}

const semAcento = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A CONFERÊNCIA ESTRUTURAL — o que separa "a lei" de "uma página que respondeu 200".
 *
 * ⚠ Devolve os motivos, não um booleano: quem lê o painel precisa saber O QUE faltou, senão a
 * única saída é abrir a URL na mão e comparar.
 */
export function conferir(texto, fonte) {
  const faltam = [];
  const t = semAcento(texto);
  for (const n of fonte.artigos ?? []) {
    if (!new RegExp(`artigo\\s+${n}\\b`).test(t)) faltam.push(`Artigo ${n}`);
  }
  for (const m of fonte.marcadores ?? []) {
    if (!t.includes(semAcento(m))) faltam.push(`"${m}"`);
  }
  // ⚠⚠ TAMANHO MÍNIMO É DEFESA CONTRA PÁGINA MUTILADA: um HTML que perdeu o corpo mas manteve o
  // título passaria por todos os marcadores acima.
  if ((texto ?? "").length < 400) faltam.push("corpo com menos de 400 caracteres");
  return { valido: faltam.length === 0, faltam };
}

/**
 * OS DISPOSITIVOS — "Artigo 406", "Artigo 406, § 1º", "Artigo 406, II".
 *
 * ⚠⚠ É O INCISO QUE FUNDAMENTA, NÃO O ARTIGO INTEIRO. A remessa simbólica do cliente é o
 * **art. 406, II**; citar "art. 406" e pronto obrigaria quem confere a ler o artigo todo para
 * descobrir qual pedaço sustenta a afirmação — e é exatamente aí que se perde a rastreabilidade
 * que o briefing pede.
 *
 * ⚠ A varredura é conservadora: reconhece artigo, parágrafo e inciso romano no começo da linha, e
 * qualquer outra coisa fica dentro do dispositivo corrente. Texto de lei tem mil formatos, e um
 * parser esperto erraria em silêncio; este, no máximo, agrupa demais.
 */
export function dispositivos(corpo) {
  const linhas = String(corpo ?? "").split("\n");
  const saida = [];
  let artigoAtual = null;
  let paragrafoAtual = null;
  let atual = null;
  const fechar = () => { if (atual && atual.texto.trim()) saida.push({ ...atual, texto: atual.texto.trim() }); };

  for (const l of linhas) {
    const mArt = l.match(/^Artigo\s+(\d+)(?:\s*[-–—]|\s*º)?/);
    const mPar = l.match(/^§\s*(\d+)\s*[ºo]?/) || l.match(/^Parágrafo único/i);
    const mInc = l.match(/^([IVXLC]+)\s*[-–—]\s/);
    if (mArt) {
      fechar();
      artigoAtual = mArt[1];
      paragrafoAtual = null;
      atual = { artigo: artigoAtual, rotulo: `Artigo ${artigoAtual}`, tipo: "ARTIGO", texto: l };
    } else if (atual && mPar) {
      fechar();
      paragrafoAtual = mPar[1] ? `§ ${mPar[1]}º` : "Parágrafo único";
      atual = { artigo: artigoAtual, rotulo: `Artigo ${artigoAtual}, ${paragrafoAtual}`, tipo: "PARAGRAFO", texto: l };
    } else if (atual && mInc) {
      fechar();
      // ⚠⚠ O INCISO É QUALIFICADO PELO PARÁGRAFO EM QUE ESTÁ. Medido em 22/09/2026: sem isso, o
      // art. 125 gerava "Artigo 125, I" mais de uma vez (o inciso do caput e o de um §), e os
      // repetidos eram DESCARTADOS em silêncio na gravação — 138 dispositivos extraídos viravam
      // 92 gravados. Perder texto de lei sem avisar é a pior forma de errar num módulo que existe
      // para citar a lei.
      const dentro = paragrafoAtual ? `${paragrafoAtual}, ` : "";
      atual = { artigo: artigoAtual, rotulo: `Artigo ${artigoAtual}, ${dentro}${mInc[1]}`, tipo: "INCISO", texto: l };
    } else if (atual) {
      atual.texto += `\n${l}`;
    }
  }
  fechar();

  // ⚠⚠ E O QUE AINDA COLIDIR GANHA UM SUFIXO EM VEZ DE SUMIR. Texto de lei tem mil formatos, e
  // nenhum parser conservador cobre todos; o que ele NÃO pode fazer é apagar o que não entendeu.
  const vistos = new Map();
  return saida.map((d, i) => {
    const n = (vistos.get(d.rotulo) ?? 0) + 1;
    vistos.set(d.rotulo, n);
    return { ...d, ordem: i, rotulo: n === 1 ? d.rotulo : `${d.rotulo} (${n})` };
  });
}
