// ─── QUANDO UMA ENTRADA DO CMR É TINTA ─────────────────
//
// ⚠⚠ POR QUE ISTO EXISTE. Vitor (07/09/2026): "o ideal é FEFO mesmo, precisamos ter essa informação
// no recebimento (…) quando identificar que é recebimento de tinta isso deve ser solicitado para o
// preenchimento na tela de recebimento".
//
// O aço usa FIFO — entrega mais antiga primeiro. A tinta não: ela VENCE, e gastar primeiro o lote
// que vence antes é o certo (FEFO). Sem a validade no recebimento não existe FEFO, e é por isso que
// a tela passa a pedir o dado exatamente quando ele importa, em vez de ter mais um campo que
// ninguém preenche.
//
// ⚠ ISTO NÃO É UM CADASTRO, É UM DETECTOR. Roda sobre o texto que veio da nota fiscal, que é livre
// e varia por fornecedor ("TINTA W-POXI ZSP 315", "INDUSTHANE RHB 650 DF SB CINZA", "ENDURECEDOR
// PARA INDUSTHANE 35"). Por isso vale por FAMÍLIA de palavra, não por lista de produto — produto
// novo do mesmo fornecedor continua sendo pego.
//
// ⚠⚠ O TRIO ANDA JUNTO e os três são tinta para efeito de validade: tinta, ENDURECEDOR e DILUENTE
// chegam na mesma nota, cada um com seu R e seu lote, e todos vencem. Medido em 07/09/2026 na
// OP-112: R261340 tinta lote 89121, R261341 endurecedor 89122, R261342 diluente 89123, NF 25645.
// Pedir validade só da tinta deixaria dois terços do conjunto sem controle.

/** Palavras que identificam tinta e seus componentes numa descrição de nota fiscal. */
const FAMILIAS = [
  "TINTA", "PRIMER", "ESMALTE", "VERNIZ", "FUNDO",
  "EPOXI", "EPÓXI", "POLIURETANO", "ACRILIC", "ALQUIDIC", "ETIL SILICATO", "ETIL-SILICATO",
  "ENDURECEDOR", "CATALISADOR", "DILUENTE", "THINNER", "SOLVENTE",
  // nomes comerciais que a fábrica usa e que não trazem a palavra "tinta" na nota
  "INDUSTHANE", "INDUSDUR", "INDUSLUX", "HARDTOP", "JOTAMASTIC", "JOTACOTE", "PENGUARD",
  "W-POXI", "WPOXI", "WEGPOXI", "WEGTHANE", "LACKPOXI", "LACKTHANE", "MACROPOXY", "AMERCOAT",
];

/**
 * A descrição é de tinta (ou componente dela)?
 *
 * ⚠ Falso positivo é barato aqui — o campo de validade aparece e a pessoa deixa em branco. Falso
 * NEGATIVO é caro: a tinta entra sem validade e o FEFO não acontece. A lista erra para o lado
 * seguro de propósito.
 *
 * @param {string} descricao texto do material, como veio da nota
 * @returns {boolean}
 */
export function ehMaterialDeTinta(descricao) {
  const t = String(descricao || "").toUpperCase();
  if (!t.trim()) return false;
  return FAMILIAS.some((f) => t.includes(f));
}

/**
 * O que a tela deve cobrar de uma entrada de tinta.
 *
 * ⚠ AVISA, NÃO BLOQUEIA. O recebimento é lançado com a nota na mão e às vezes a validade não está
 * legível na embalagem; travar o lançamento faria o Almoxarifado inventar uma data, que é pior que
 * não ter. Fica um "—" honesto, e o FEFO diz que aquele lote não tem validade conhecida.
 *
 * @param {{descricao?: string, validade?: string, loteCorrida?: string}} l
 * @returns {string[]} avisos, vazio quando está tudo preenchido
 */
export function avisosDeTinta(l) {
  if (!ehMaterialDeTinta(l?.descricao)) return [];
  const avisos = [];
  if (!String(l?.validade || "").trim()) avisos.push("validade");
  if (!String(l?.loteCorrida || l?.corrida || "").trim()) avisos.push("lote");
  return avisos;
}

/**
 * Litros de UMA embalagem, lidos da descrição da nota — ou null quando ela não diz.
 *
 * ⚠⚠ O CMR CONTA EMBALAGENS, NÃO LITROS. O campo `quantidade` é "quantas unidades chegaram", e o
 * tamanho de cada uma só aparece quando o fornecedor escreve na descrição. Medido em 07/09/2026:
 * das 486 entradas de tinta, apenas 112 trazem o tamanho — e ele VARIA (18 L, 20 L, 16 L). O
 * `pesoKg` está preenchido em 33.
 *
 * ⚠ POR ISSO NÃO SE COMPARA "NECESSÁRIO × RECEBIDO" ÀS CEGAS. Dizer "faltam 2 galões" tratando 33
 * unidades como 33 galões de 3,6 L é errado quando cada unidade pode ser um balde de 18 L — a
 * diferença é de cinco vezes, e a conclusão vira o contrário. Sem o tamanho, o portal informa o
 * necessário em LITROS e diz que o recebido está em embalagens de tamanho não informado.
 *
 * @param {string} descricao texto do material, como veio da nota
 * @returns {number|null} litros por embalagem
 */
export function litrosDaEmbalagem(descricao) {
  const t = String(descricao || "").toUpperCase();
  // "18L", "18 L", "3,6 LT", "20 LITROS" — o número colado na unidade de volume
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:L|LT|LTS|LITRO|LITROS)\b/);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  // ⚠ teto de sanidade: "N 1277" e "RAL 7000" são código de tinta, não volume. Embalagem de tinta
  // no Brasil vai de 0,9 a 200 L; fora disso é quase certo que o número é outra coisa.
  return v >= 0.5 && v <= 200 ? v : null;
}
