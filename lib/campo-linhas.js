// As LINHAS do relatório (cotas, juntas, peças) como o portal de campo as grava — usado por
// `PATCH /api/campo/relatorios/[id]`.
//
// ⚠ MESCLA POR ÍNDICE, não substitui a lista. Se o celular mandasse as linhas inteiras, uma versão
// antiga aberta no bolso apagaria a cota que a Qualidade acabou de acrescentar no computador.
//
// ⚠⚠ O ÍNDICE É O DA LINHA NO BANCO, e a lixeira vem À PARTE (`removidas`). Até 23/09/2026 a tela
// recontava as posições depois de apagar uma junta, e a mescla escrevia os dados da 2ª por cima da
// 1ª — a apagada não saía e a última ficava repetida. Cada remoção traz a marca, conferida contra o
// banco: se a lista mudou no computador enquanto o celular estava aberto, nada é tirado às cegas.
// Cota do dimensional não se apaga daqui — vem do desenho, de quem monta.
import { usaCotas } from "@/lib/qualidade-campo";

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ⚠⚠ A INDICAÇÃO DO LÍQUIDO PENETRANTE FICAVA DE FORA (23/09/2026). A tela do celular sempre pediu
// "Nº da indicação", "Local", "Tamanho" e "Tipo" de cada peça, e mandava — mas a linha é reconstruída
// pela lista do que o campo escreve, e os quatro não estavam nela: o inspetor digitava, gravava, e ao
// reabrir estava tudo em branco. Mesmos nomes e tetos do computador (qualidade/inspecoes/[id]).
const TETO_LP = { indicacaoLp: 20, local: 60, tamanho: 30, tipoDefeito: 10 };
const textoLp = (m, k) => (m[k] ? String(m[k]).slice(0, TETO_LP[k]) : null);

// campos da JUNTA (visual de solda) e da INDICAÇÃO de ultrassom — o `c` e o `d` também, calculados na
// tela e gravados: quem lê o relatório meses depois precisa do número que foi usado, não de refazer a
// conta com uma fórmula que pode ter mudado de revisão.
const DA_JUNTA = ["marca", "descricao", "eps", "soldador", "sinete"];
const DA_INDICACAO_US = ["indicacao", "angulo", "face", "comprimento", "percurso",
  "db_indicacao", "db_referencia", "db_atenuacao", "db_classe",
  "reprovado", "profundidade", "dist_x", "dist_y", "nivel"];

/** Quais linhas GRAVADAS a lixeira do celular pediu para tirar — só as que a marca confirma. */
function indicesRemovidos(tipo, originais, pedidas) {
  const removidas = new Set();
  if (usaCotas(tipo) || !Array.isArray(pedidas)) return removidas;
  const mesma = (x) => String(x ?? "").trim().toUpperCase();
  for (const r of pedidas.slice(0, 400)) {
    const i = Number(r?.i);
    if (!Number.isInteger(i) || i < 0 || i >= originais.length) continue;
    if (mesma(r?.marca) === mesma(originais[i]?.marca)) removidas.add(i);
  }
  return removidas;
}

/** A linha gravada com o que o celular mandou por cima — só o que ele pode escrever. */
function mesclar(l, m) {
  const novo = { ...l };
  if (m.encontradoMm !== undefined) novo.encontradoMm = num(m.encontradoMm);
  if (m.laudo !== undefined) novo.laudo = m.laudo ? String(m.laudo).slice(0, 10) : null;
  if (m.descontinuidade !== undefined) novo.descontinuidade = m.descontinuidade ? String(m.descontinuidade).slice(0, 40) : null;
  if (m.obs !== undefined) novo.obs = m.obs ? String(m.obs).slice(0, 160) : null;
  // ⚠ no visual de solda quem descobre a junta é quem está na frente dela, então o campo escreve
  // peça, EPS e soldador. No dimensional isso não vem — as cotas são definidas no desenho, antes, e o
  // celular só responde a medida.
  for (const k of [...DA_JUNTA, ...DA_INDICACAO_US]) {
    if (m[k] !== undefined) novo[k] = m[k] ? String(m[k]).slice(0, 60) : null;
  }
  for (const k of Object.keys(TETO_LP)) if (m[k] !== undefined) novo[k] = textoLp(m, k);
  if (m.qtd !== undefined) novo.qtd = num(m.qtd);
  return novo;
}

/** A junta que nasceu no celular. */
function nova(m) {
  return {
    marca: m.marca ? String(m.marca).slice(0, 60) : null,
    qtd: num(m.qtd), descricao: m.descricao ? String(m.descricao).slice(0, 120) : null,
    eps: m.eps ? String(m.eps).slice(0, 60) : null,
    soldador: m.soldador ? String(m.soldador).slice(0, 60) : null,
    sinete: m.sinete ? String(m.sinete).slice(0, 20) : null,
    ...Object.fromEntries(DA_INDICACAO_US.map((k) => [k, m[k] ? String(m[k]).slice(0, 40) : null])),
    ...Object.fromEntries(Object.keys(TETO_LP).map((k) => [k, textoLp(m, k)])),
    descontinuidade: m.descontinuidade ? String(m.descontinuidade).slice(0, 40) : null,
    laudo: m.laudo ? String(m.laudo).slice(0, 10) : null,
    obs: m.obs ? String(m.obs).slice(0, 160) : null,
  };
}

/**
 * As linhas que o relatório passa a ter depois de uma gravação do celular.
 *
 * ⚠ Juntas ACRESCENTADAS vêm com índice além da lista gravada e entram no FIM, na ordem, uma depois da
 * outra. Gravar em `linhas[m.i]` deixava buraco (null no banco) quando o índice pulava — o que passa a
 * acontecer sempre que se apaga uma junta e se acrescenta outra.
 *
 * @returns {{ linhas: object[], removidas: (string|null)[] }} `removidas` = marcas tiradas, para a auditoria
 */
export function linhasDoCampo({ tipo, originais = [], medidas = [], removidas: pedidas = null }) {
  const removidas = indicesRemovidos(tipo, originais, pedidas);
  const mescladas = originais.map((l, i) => {
    const m = medidas.find((x) => x?.i === i);
    return m ? mesclar(l, m) : l;
  });
  const novas = medidas
    .filter((m) => Number.isInteger(m?.i) && m.i >= originais.length)
    .sort((a, b) => a.i - b.i)
    .map(nova);
  return {
    linhas: [...mescladas.filter((_, i) => !removidas.has(i)), ...novas],
    removidas: [...removidas].map((i) => originais[i]?.marca ?? null),
  };
}
