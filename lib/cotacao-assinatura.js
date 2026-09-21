// ─── A ASSINATURA DIMENSIONAL DE UM ITEM ──────────────────────────────────────
//
// ⚠⚠ POR QUE ISTO EXISTE. O casamento PDF × RM comparava PALAVRAS, e o fornecedor não escreve
// como a engenharia: "FERRO CANT. 2 X 3/16 6MT." (SOUFER) × "CANTONEIRA ACO CARBONO LAMINADA
// A-36 DN. 3/16 X 2POL" (RM). Medido na T122-001 em 21/09/2026: 9 itens lidos, 9 linhas na RM,
// e ZERO casamentos — scores de 0,20 a 0,40 contra um corte de 0,50. O fornecedor foi mandado
// redigitar 27 campos, anexou o PDF e foi embora.
//
// ⚠⚠ E POR QUE NÃO É UM SACO DE NÚMEROS. Comparar "todos os números, sem ordem" parece resolver e
// casaria `W200 X 26,6` com `W200 X 52,0` — perfis que pesam o dobro um do outro (alerta do Codex,
// 21/09/2026). Por isso a leitura é POR FAMÍLIA: cada uma tem os seus campos, e a massa linear do
// perfil é um deles.
//
// ⚠ Família desconhecida devolve `null`, e quem chama cai no casamento por palavras de sempre.
// Tinta, diluente e consumível — 108 famílias distintas no portal — continuam exatamente como hoje.

const NORM = (s) => String(s ?? "").toUpperCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[“”"″]/g, '"').replace(/\s+/g, " ").trim();

/**
 * "3/16" → 0.1875 · "1.3/4" → 1.75 · "2.1/2" → 2.5 · "38,5" → 38.5 · "250" → 250
 *
 * ⚠⚠ A FRAÇÃO MISTA USA PONTO, NÃO ESPAÇO: no aço "1.3/4" é um e três quartos, não 1,75 escrito
 * errado nem "1 ponto 3 sobre 4". Ler isso como decimal daria 1.3 e casaria com outra bitola.
 *
 * @returns {number|null} `null` quando não é um número reconhecível
 */
export function medida(txt) {
  const t = NORM(txt).replace(/"/g, "").replace(/POL\b/g, "").trim();
  if (!t) return null;
  const misto = t.match(/^(\d+)\.(\d+)\/(\d+)$/);        // 1.3/4
  if (misto) return Number(misto[1]) + Number(misto[2]) / Number(misto[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);                // 3/16
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const dec = t.match(/^(\d+)[.,](\d+)$/);               // 38,5
  if (dec) return Number(`${dec[1]}.${dec[2]}`);
  const inteiro = t.match(/^(\d+)$/);
  return inteiro ? Number(inteiro[1]) : null;
}

/** Iguais dentro de uma folga relativa — medidas vêm de fontes que arredondam diferente. */
const igual = (a, b, tol = 0.005) =>
  a != null && b != null && Math.abs(a - b) <= Math.max(Math.abs(b) * tol, 0.0001);

/**
 * PERFIL — a identidade é ALTURA NOMINAL + MASSA POR METRO.
 *
 * ⚠⚠ A LETRA NÃO ENTRA. A RM diz "PERFIL H ... DN. W200 X 52,0KG/M" e a SOUFER diz "PERFIL WH 200
 * X 52,0": três letras diferentes (H, W, WH) para a MESMA designação dimensional, que é o que
 * identifica o perfil no catálogo. Exigir a letra reprovaria um par correto; o que não pode ceder
 * é a massa linear — é ela que separa o W200x26,6 do W200x52,0.
 */
function perfil(d) {
  if (!/\bPERFIL\b|\bVIGA\b/.test(d)) return null;
  const m = d.match(/\b[WHI]{0,2}\s*(\d{2,4})\s*X\s*(\d+(?:[.,]\d+)?)\s*(?:KG\/M)?/);
  if (!m) return null;
  const altura = medida(m[1]);
  const massa = medida(m[2]);
  if (altura == null || massa == null) return null;
  return { familia: "PERFIL", campos: { altura, massa } };
}

/**
 * CANTONEIRA — aba e espessura, como PAR SEM ORDEM.
 *
 * ⚠ As duas fontes invertem: a RM escreve "DN. 3/16 X 1.3/4POL" (espessura primeiro) e o
 * fornecedor, "1.3/4 X 3/16" (aba primeiro). São só dois números e juntos são a identidade, então
 * comparar o par ordenado resolve sem precisar adivinhar quem é quem.
 *
 * ⚠⚠ "3 X 3 16" NÃO É LIDO, DE PROPÓSITO. Saiu assim do PDF da SOUFER — a barra da fração se
 * perdeu na extração. Chutar "3/16" a partir de "3 16" é inventar bitola; o item cai na associação
 * manual, que é onde um palpite desses tem de morrer (alerta do Codex, 21/09/2026).
 */
function cantoneira(d) {
  if (!/\bCANTONEIRA\b|\bCANT\b|\bCANT\./.test(d)) return null;
  const m = d.match(/(\d+(?:\.\d+\/\d+|\/\d+)?)\s*"?\s*X\s*(\d+(?:\.\d+\/\d+|\/\d+)?)\s*"?/);
  if (!m) return null;
  const a = medida(m[1]);
  const b = medida(m[2]);
  if (a == null || b == null) return null;
  return { familia: "CANTONEIRA", campos: { par: [a, b].sort((x, y) => x - y) } };
}

/**
 * CHAPA — espessura MAIS as medidas do plano.
 *
 * ⚠⚠ A ESPESSURA SOZINHA NÃO IDENTIFICA, e isso foi medido na T122-002 (21/09/2026): a RM tem
 * DOIS itens de 19,00mm — um em chapa 6 × 2,44 e outro em 3 × 1,2. A SOUFER ofertou 1500 × 3000
 * no segundo e escreveu na proposta "ATENÇÃO NAS MEDIDAS OFERTADAS". Casar por espessura poria o
 * preço de uma chapa na linha da outra, que é o erro caro e invisível.
 *
 * ⚠ "CHP" é como o fornecedor escreve; "CHAPA", como a RM escreve. As duas entram.
 *
 * ⚠ O fornecedor dá as medidas em MILÍMETROS dentro da descrição ("19,00 X 2440 X 6000"); a RM
 * guarda em METROS, em campos próprios. Normaliza para metros, e o par vai SEM ORDEM — um escreve
 * largura×comprimento, o outro o inverso.
 */
function chapa(d, extras) {
  if (!/\bCHAPA\b|\bCHP\b/.test(d)) return null;
  const tresNums = d.match(/(\d+(?:[.,]\d+)?)\s*X\s*(\d+(?:[.,]\d+)?)\s*X\s*(\d+(?:[.,]\d+)?)/);
  const m = d.match(/(?:ESPESSURA\s*)?(\d+(?:[.,]\d+)?)\s*MM/) || d.match(/\b(?:CHAPA|CHP)(?:\s+GR)?\s+(\d+(?:[.,]\d+)?)\b/);
  const esp = tresNums ? medida(tresNums[1]) : (m ? medida(m[1]) : null);
  if (esp == null) return null;

  // ⚠ Acima de 100 só pode ser milímetro: chapa de 2.440 metros não existe.
  const emMetros = (v) => (v == null ? null : (v > 100 ? v / 1000 : v));
  const doTexto = tresNums ? [emMetros(medida(tresNums[2])), emMetros(medida(tresNums[3]))] : null;
  const doCadastro = [emMetros(Number(extras?.comprimento)), emMetros(Number(extras?.largura))]
    .every((v) => v > 0) ? [emMetros(Number(extras.comprimento)), emMetros(Number(extras.largura))] : null;
  const plano = (doTexto?.every((v) => v > 0) ? doTexto : doCadastro);
  return { familia: "CHAPA", campos: { espessura: esp, plano: plano ? [...plano].sort((a, b) => a - b) : null } };
}

const LEITORES = [perfil, cantoneira, chapa];

/** Aceita a string crua ou `{descricao, comprimento, largura}` — a RM guarda as medidas à parte. */
const comoItem = (v) => (typeof v === "string" ? { descricao: v } : (v || {}));

/**
 * A assinatura de uma descrição, ou `null` quando a família não é reconhecida.
 * @param {string} descricao
 */
export function assinatura(item) {
  const alvo = comoItem(item);
  const d = NORM(alvo.descricao);
  if (!d) return null;
  for (const ler of LEITORES) {
    const r = ler(d, alvo);
    if (r) return r;
  }
  return null;
}

/**
 * As duas descrições são a MESMA peça?
 *
 * @returns {true|false|null} `null` = não dá para afirmar (família desconhecida dos dois lados,
 *          ou medida que não foi possível recuperar com segurança). Nunca tratar `null` como
 *          "sim": é exatamente aí que mora o casamento errado.
 */
export function mesmaPeca(descA, descB) {
  const a = assinatura(descA);
  const b = assinatura(descB);
  if (!a || !b) return null;
  if (a.familia !== b.familia) return false;
  if (a.familia === "CANTONEIRA") {
    return igual(a.campos.par[0], b.campos.par[0]) && igual(a.campos.par[1], b.campos.par[1]);
  }
  if (a.familia === "CHAPA") {
    if (!igual(a.campos.espessura, b.campos.espessura)) return false;
    // ⚠ Só compara o plano quando os DOIS lados têm. Faltando de um, a espessura decide — e se
    // houver duas chapas da mesma espessura, a regra de margem do casamento manda para o manual
    // em vez de escolher no palpite.
    if (!a.campos.plano || !b.campos.plano) return true;
    // ⚠ Tolerância maior aqui: 2440mm e 2,44m são a mesma chapa escrita de dois jeitos.
    return igual(a.campos.plano[0], b.campos.plano[0], 0.02) && igual(a.campos.plano[1], b.campos.plano[1], 0.02);
  }
  const chaves = Object.keys(a.campos);
  return chaves.every((k) => igual(a.campos[k], b.campos[k]));
}
