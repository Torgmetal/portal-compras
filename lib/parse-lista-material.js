// ─── LISTA DE MATERIAL DO ESTUDO (formato da RM) ──────────────────────────────────────────────
// Vitor (31/08/2026): "vamos usar uma planilha igual a RM, deixe o campo para podermos importar e
// enviar para o fornecedor" e "no caso do aço, quando tivermos uma lista específica por tipo do
// material, seria interessante ter esse botão para podermos cotar também — quando é apenas usado
// peso na família do perfil fica mais difícil para comprarmos".
//
// ⚠ O PROBLEMA QUE ISSO RESOLVE: o quadro "Aço por categoria de perfil" mostra 5 famílias com peso
// e R$/kg médio. Dá para orçar, não dá para COMPRAR — ninguém cota "235 toneladas de perfil
// soldado". A lista por bitola é o que o fornecedor consegue precificar.
//
// ⚠⚠ NOMES DE COLUNA VARIAM, e por isso o casamento é por SINÔNIMO e não por posição. A mesma
// planilha aparece com "Descrição"/"Material"/"Perfil", "Qtd"/"Quantidade"/"Barras",
// "Peso"/"Peso (kg)"/"Peso total". Exigir um cabeçalho exato faria a importação falhar em quase
// toda planilha real e mandaria a pessoa de volta para o Excel.

const SINONIMOS = {
  descricao: ["descricao", "descrição", "material", "perfil", "especificacao", "especificação", "item", "produto"],
  bitola: ["bitola", "dimensao", "dimensão", "medida", "polegada"],
  norma: ["norma", "aco", "aço", "qualidade", "grau"],
  unidade: ["un", "un.", "unid", "unidade", "und"],
  qtd: ["qtd", "qtde", "quantidade", "barras", "pecas", "peças", "qtd."],
  comprimento: ["comprimento", "compr", "comp", "tamanho"],
  peso: ["peso", "peso (kg)", "peso kg", "peso total", "kg", "peso total (kg)"],
};

const norm = (s) => String(s ?? "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

function acharColunas(cabecalho) {
  const cols = {};
  const cels = (cabecalho || []).map(norm);
  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    const alvos = nomes.map(norm);
    // ⚠ casa por IGUALDADE primeiro e só depois por "começa com": sem isso, "Peso unitário" seria
    // aceito como "Peso" e o total da obra sairia com o peso de uma barra.
    let i = cels.findIndex((c) => c && alvos.includes(c));
    if (i < 0) i = cels.findIndex((c) => c && alvos.some((a) => c.startsWith(a)));
    if (i >= 0) cols[campo] = i;
  }
  return cols;
}

const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = parseFloat(t.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * @param {any[][]} grade linhas da planilha (sheet_to_json header:1)
 * @returns {{itens: object[], colunas: object, cabecalhoLinha: number, avisos: string[]}}
 */
export function lerListaMaterial(grade) {
  const linhas = Array.isArray(grade) ? grade : [];
  const avisos = [];

  // ⚠ O CABEÇALHO NEM SEMPRE É A LINHA 1: planilha de obra costuma ter título e logo em cima.
  // Procuro a primeira linha que tenha descrição E (peso OU quantidade) — é o que caracteriza a
  // tabela de material, e não uma linha de cabeçalho de documento.
  let iCab = -1, cols = {};
  for (let r = 0; r < Math.min(linhas.length, 30); r++) {
    const c = acharColunas(linhas[r]);
    if (c.descricao != null && (c.peso != null || c.qtd != null)) { iCab = r; cols = c; break; }
  }
  if (iCab < 0) {
    return { itens: [], colunas: {}, cabecalhoLinha: -1,
      avisos: ["Não achei o cabeçalho da lista. Preciso de uma coluna de descrição (ou material/perfil) e outra de peso ou quantidade."] };
  }

  const itens = [];
  for (let r = iCab + 1; r < linhas.length; r++) {
    const l = linhas[r] || [];
    const descricao = String(l[cols.descricao] ?? "").trim();
    if (!descricao) continue;
    // linha de total não é item — e somada de novo dobraria a obra
    if (/^(total|subtotal|soma)\b/i.test(norm(descricao))) continue;
    const peso = cols.peso != null ? num(l[cols.peso]) : 0;
    const qtd = cols.qtd != null ? num(l[cols.qtd]) : 0;
    if (peso <= 0 && qtd <= 0) continue;
    itens.push({
      descricao,
      bitola: cols.bitola != null ? String(l[cols.bitola] ?? "").trim() || null : null,
      norma: cols.norma != null ? String(l[cols.norma] ?? "").trim() || null : null,
      unidade: cols.unidade != null ? String(l[cols.unidade] ?? "").trim() || null : null,
      qtd: qtd || null,
      comprimento: cols.comprimento != null ? num(l[cols.comprimento]) || null : null,
      peso: peso || null,
    });
  }

  if (!itens.length) avisos.push("Achei o cabeçalho mas nenhuma linha com peso ou quantidade.");
  if (cols.peso == null) avisos.push("Sem coluna de peso: vou cotar por quantidade, e o total em kg não vai fechar com o quantitativo.");
  return { itens, colunas: cols, cabecalhoLinha: iCab + 1, avisos };
}

/** Soma o peso da lista — é o número que tem de bater com o quantitativo. */
export const pesoDaLista = (itens) => (itens || []).reduce((s, i) => s + (Number(i.peso) || 0), 0);
