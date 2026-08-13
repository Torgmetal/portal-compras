// Classificação de itens da lista de expedição para o % de expedição da ESTRUTURA.
//
// A estrutura é medida em KG. Alguns itens NÃO entram nesse % (têm linha própria no
// cronograma e/ou são medidos por unidade): grade de piso (tem peso, mas fora), telhas,
// parafusos/fixação (sem peso), lanternim, steel deck… A lista de termos é EDITÁVEL pelo
// time (tabela ExpedicaoItemExcluido) — aqui ficam só os padrões de fallback. (Vitor 09/08)

export const TERMOS_NAO_ESTRUTURAL_PADRAO = [
  "grade de piso", "grade",
  "steel deck", "steeldeck",
  "lanternim", "lanternin",
  "telha", "cumeeira", "rufo", "calha", "cobertura",
  "parafuso", "arruela", "porca", "rebite", "chumbador", "silicone",
];

const pesoMarca = (m) => (m?.pesoTotal ?? (m?.pesoUnit || 0) * (m?.qte ?? m?.qtd ?? 1)) || 0;
const foiExpedida = (m) => !!(m?.expedidoRomaneio || m?.expedidoArquivo);

/** true se a marca conta como estrutura (a descrição não bate com nenhum termo excluído). */
export function ehEstrutura(descricao, termos) {
  const lista = termos && termos.length ? termos : TERMOS_NAO_ESTRUTURAL_PADRAO;
  const d = String(descricao || "").toLowerCase();
  return !lista.some((t) => t && d.includes(String(t).toLowerCase()));
}

/**
 * % de expedição da ESTRUTURA: itens COM peso, fora os não-estruturais (grade/steel deck…).
 * @param {Array} marcas  marcasJson da ListaExpedicao
 * @param {string[]} [termos]  termos de exclusão (default = padrão)
 * @returns {{totalKg,expedidoKg,faltanteKg,marcasFaltantes,pct}}
 */
export function progressoEstrutura(marcas, termos) {
  let totalKg = 0, expedidoKg = 0, faltanteKg = 0, marcasFaltantes = 0;
  for (const m of marcas || []) {
    const p = pesoMarca(m);
    if (p <= 0) continue; // sem peso (telha/parafuso) — não é estrutura
    if (!ehEstrutura(m.descricao, termos)) continue; // grade/steel deck/lanternim…
    totalKg += p;
    if (foiExpedida(m)) expedidoKg += p;
    else { faltanteKg += p; marcasFaltantes++; }
  }
  const pct = totalKg > 0 ? Math.round((expedidoKg / totalKg) * 100) : null;
  return { totalKg, expedidoKg, faltanteKg, marcasFaltantes, pct };
}

/** Peso das marcas (com peso) NÃO embarcadas — o faltante REAL da lista (estrutura ou não). */
export function pesoFaltanteReal(marcas) {
  let kg = 0;
  for (const m of marcas || []) if (!foiExpedida(m)) kg += pesoMarca(m);
  return kg;
}

// ── Baixa POR LINHA do cronograma (Vitor 09/08) ────────────────────────────────
// Cada tarefa de expedição (Guarda corpo, Telhas, Grade de piso, Fixadores…) dá baixa
// pelas marcas do seu grupo: estrutura por KG, acessórios (sem peso) por UNIDADE.

/** Grupo de uma marca pela descrição. Corrimão conta como guarda-corpo. */
export function grupoMarca(descricao) {
  const d = String(descricao || "").toLowerCase();
  // Guarda-corpo/corrimão — inclui a abreviação "G.C." / "G.C EL." / "GC". Separa
  // reto × inclinado; sem sufixo = reto (é sempre a maioria — Vitor 13/08).
  if (/guarda|corrim|g\.\s*c|\bgc\b/.test(d)) return /inclin/.test(d) ? "guarda-corpo-inclinado" : "guarda-corpo-reto";
  if (/grade|piso/.test(d)) return "grade";
  if (/telha|cumeeira|rufo|calha|cobertura|lanternim|lanternin|steel\s*deck/.test(d)) return "cobertura";
  if (/parafuso|arruela|porca|rebite|chumbador|silicone|fixad/.test(d)) return "fixacao";
  return "estrutura"; // colunas, vigas, acessos, escadas, plataformas
}

/** Grupos que o NOME de uma tarefa do cronograma cobre (pode ser mais de um). */
export function gruposDaTarefa(nome) {
  const n = String(nome || "").toLowerCase();
  const g = new Set();
  if (/guarda|corrim|g\.\s*c|\bgc\b/.test(n)) {
    if (/inclin/.test(n)) g.add("guarda-corpo-inclinado");
    else if (/reto/.test(n)) g.add("guarda-corpo-reto");
    else { g.add("guarda-corpo-reto"); g.add("guarda-corpo-inclinado"); } // linha genérica cobre os dois
  }
  if (/grade|piso/.test(n)) g.add("grade");
  if (/telha|cobertura|calha|rufo|cumeeira|lanternim|steel\s*deck/.test(n)) g.add("cobertura");
  if (/parafuso|fixad|fixa[çc]/.test(n)) g.add("fixacao");
  if (/acesso|escada|estrutura|coluna|viga|plataforma|suporte|m[aã]o\s*franc/.test(n)) g.add("estrutura");
  return g;
}

/**
 * % de conclusão de um conjunto de marcas: por KG se tiverem peso (estrutura/grade),
 * senão por UNIDADE (telha/parafuso). null se o conjunto for vazio.
 */
export function completudeMarcas(marcas) {
  const lista = marcas || [];
  if (!lista.length) return null;
  const comPeso = lista.filter((m) => pesoMarca(m) > 0);
  if (comPeso.length) {
    const total = comPeso.reduce((s, m) => s + pesoMarca(m), 0);
    const exp = comPeso.filter(foiExpedida).reduce((s, m) => s + pesoMarca(m), 0);
    return total > 0 ? Math.round((exp / total) * 100) : null;
  }
  const qtd = (m) => m.qte ?? m.qtd ?? 1;
  const total = lista.reduce((s, m) => s + qtd(m), 0);
  const exp = lista.filter(foiExpedida).reduce((s, m) => s + qtd(m), 0);
  return total > 0 ? Math.round((exp / total) * 100) : null;
}
