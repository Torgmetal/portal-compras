import { createHash } from "node:crypto";

// ─── DO PLANO LIDO PARA AS LINHAS DO BANCO ───────────────────────────────────
//
// ⚠⚠ O NESTING NÃO É UMA NOVA LISTA DO QUE PRODUZIR (§3.2). É um AGRUPAMENTO FÍSICO de marcas que
// já existem em `PecaConjunto`. Por isso o casamento é exato e o que não casar vira PENDÊNCIA
// VISÍVEL — um plano que entra com marca inventada faria o portal ter duas verdades sobre a obra.

export const hashDo = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * As marcas do plano, em uma lista só — é o que se procura no portal de uma vez.
 */
export function marcasDoPlano(plano) {
  const todas = new Set();
  for (const u of plano?.barras || []) {
    for (const i of u.itens || []) if (i.marca) todas.add(i.marca);
    for (const c of u.cortes || []) if (c.marca) todas.add(c.marca);
  }
  return [...todas];
}

/**
 * Casa marca do plano com peça do portal.
 *
 * ⚠⚠ EXATO, E DENTRO DA OBRA. A mesma marca se repete entre obras (`T97A16` existe na 097 e na
 * 102): casar só pela marca daria baixa na obra errada, e erro de baixa só aparece no inventário,
 * meses depois. Quando a obra do arquivo não resolve, e a marca existe em mais de uma obra, o item
 * fica SEM peça e a tela cobra — é a mesma regra do "não aproximar por semelhança" (§12.7.3).
 *
 * @param {{marca:string,opNumero:string|null,opId:string|null}[]} pecas o que o portal tem
 */
export function casarComOPortal(marcas, pecas, obraDoArquivo = null) {
  const porMarca = new Map();
  for (const p of pecas) {
    if (!porMarca.has(p.marca)) porMarca.set(p.marca, []);
    porMarca.get(p.marca).push(p);
  }

  const casamento = new Map();
  const pendentes = [];
  for (const marca of marcas) {
    const achadas = porMarca.get(marca) || [];
    const escolhida = escolher(achadas, obraDoArquivo);
    if (escolhida) casamento.set(marca, escolhida);
    else pendentes.push({ marca, motivo: motivoDaPendencia(achadas, obraDoArquivo) });
  }
  return { casamento, pendentes };
}

function escolher(achadas, obraDoArquivo) {
  if (achadas.length === 1) return achadas[0];
  if (!achadas.length) return null;
  const daObra = achadas.filter((p) => mesmaObra(p.opNumero, obraDoArquivo));
  return daObra.length === 1 ? daObra[0] : null;
}

function motivoDaPendencia(achadas, obraDoArquivo) {
  if (!achadas.length) return "Esta marca não existe no portal.";
  const obras = [...new Set(achadas.map((p) => p.opNumero).filter(Boolean))];
  return obraDoArquivo
    ? `Existe em ${obras.length} obras (${obras.join(", ")}) e nenhuma é ${obraDoArquivo}.`
    : `Existe em ${obras.length} obras (${obras.join(", ")}) e o arquivo não diz qual é.`;
}

/**
 * ⚠ A OBRA TEM 90 GRAFIAS NO BANCO (o problema multi-chave do CLAUDE.md): a mesma obra é "89",
 * "089", "T89A", "T89C". Comparar cru descartaria casamento bom — então compara só os dígitos.
 */
const soDigitos = (v) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
const mesmaObra = (a, b) => Boolean(soDigitos(a)) && soDigitos(a) === soDigitos(b);

/**
 * O plano pronto para gravar: cabeçalho, unidades e itens, já com o que casou.
 *
 * ⚠ A ordem de corte (`ordem`) só existe quando o arquivo da máquina veio junto. Sem ele, a lista
 * é a do relatório — que é o que o operador já lê hoje no papel.
 */
export function linhasDoPlano(plano, { casamento = new Map(), tipo = "BARRA" } = {}) {
  return (plano?.barras || []).map((u) => ({
    indice: u.indice,
    tipo,
    pecas: u.pecas || 0,
    comprimentoMm: u.comprimentoMm ?? null,
    sobraMm: u.sobraMm ?? null,
    aproveitamento: u.aproveitamento ?? null,
    itens: itensDaUnidade(u, casamento),
  }));
}

function itensDaUnidade(u, casamento) {
  // Com a ordem de corte, cada marca leva a posição em que aparece primeiro e a contagem real dos
  // cortes; sem ela, vale a tabela do relatório.
  const daOrdem = new Map();
  (u.cortes || []).forEach((c, i) => {
    if (!c.marca) return;
    const atual = daOrdem.get(c.marca);
    if (atual) atual.qtd += 1;
    else daOrdem.set(c.marca, { marca: c.marca, qtd: 1, ordem: i + 1, deduzida: Boolean(c.deduzida) });
    if (atual && c.deduzida) atual.deduzida = true;
  });

  const base = daOrdem.size
    ? [...daOrdem.values()]
    : (u.itens || []).map((i) => ({ marca: i.marca, qtd: i.qtd, ordem: null, deduzida: false }));

  return base.map((i) => {
    const peca = casamento.get(i.marca) || null;
    return { ...i, pecaConjuntoId: peca?.id || null, opNumero: peca?.opNumero || null };
  });
}
