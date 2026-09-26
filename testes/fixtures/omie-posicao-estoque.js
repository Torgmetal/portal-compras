// Respostas REAIS do Omie, medidas em 24/09/2026 (20h40) com chamadas só de leitura.
//
// ⚠ A ESTRUTURA É A DA RESPOSTA INTEIRA, NÃO SÓ OS CAMPOS QUE O CÓDIGO LÊ. Foi exatamente por ler
// campo que não existe (`cUnidade`, `nCodLocal`, `listaLocaisEstoque`) que o sincronismo do estoque
// errou em silêncio por meses — uma fixture enxuta repetiria a suposição em vez de testá-la.
// Os valores são os do dia; só `uInc`/`uAlt` (usuário do Omie) viraram marcadores.

export const ALMOXARIFADO = 7315778267;
export const FABRICA = 7320665233;
export const TERCEIRO = 7572486140;
export const EDIFICACOES = 7756631522; // local de patrimônio

/** `ListarLocaisEstoque` em estoque/local/ — os seis locais cadastrados. */
export const RESPOSTA_LOCAIS = {
  nPagina: 1, nTotPaginas: 1, nRegistros: 6, nTotRegistros: 6,
  locaisEncontrados: [
    ["001", ALMOXARIFADO, "ESTOQUE ALMOXARIFADO", "S", "N", "N", "S", "N", "07/02/2024"],
    ["002", FABRICA, "ESTOQUE FABRICA", "N", "S", "S", "S", "S", "20/02/2024"],
    ["003", TERCEIRO, "ESTOQUE TERCEIRO", "N", "S", "S", "S", "S", "02/06/2025"],
    ["004", 7756631248, "MAQUINAS E EQUIPAMENTOS", "N", "N", "N", "S", "S", "25/03/2026"],
    ["005", 7756631319, "FERRAMENTAS", "N", "N", "N", "S", "N", "25/03/2026"],
    ["006", 7756631522, "EDIFICACOES E BENFEITORIAS", "N", "N", "N", "N", "N", "25/03/2026"],
  ].map(([codigo, id, descricao, padrao, consumoOP, ordemProducao, remessa, venda, dInc]) => ({
    codigo, codigo_local_estoque: id, descricao, padrao, inativo: "N", tipo: "1",
    dispConsumoOP: consumoOP, dispOrdemProducao: ordemProducao, dispRemessa: remessa, dispVenda: venda,
    dInc, hInc: "08:39:33", uInc: "P000000001", dAlt: "02/05/2026", hAlt: "19:28:56", uAlt: "P000000001",
  })),
};

const linha = (cCodigo, nCodProd, cDescricao, local, nSaldo, nCMC) => ({
  cCodInt: "", cCodigo, cDescricao, codigo_local_estoque: local, estoque_minimo: 0,
  fisico: nSaldo, nCMC, nCodProd, nPendente: 0, nPrecoUnitario: 0, nSaldo, reservado: 0,
});

const CHAPA_3 = ["101000002", 7318291658, "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 3,00MM"];
const W610 = ["501000055", 7318294071, "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W610 X 174,0KG/M"];
const TUBO = ["201000006", 7318292134, "TUBO ACO CARBONO LAMINADO COM COSTURA (CC) SAE/DIN/NBR D. 38,10 X 2,25MM"];
const BARRA = ["301000045", 7318293093, "BARRA CHATA ACO CARBONO LAMINADA MULTINORMAS COMERCIAL DN. 3/16 X 1POL"];
const DILUENTE = ["701000003", 7318296918, "DILUENTE PARA INDUSTHANE ACR 34.019"];

/**
 * Linhas do `ListarPosEstoque` com `lista_local_estoque: "TODOS"`: UMA POR (produto, local).
 * ⚠ Saldo zero não vem; negativo vem (o consumo é baixado num local e a entrada caiu em outro).
 */
export const LINHAS = {
  // o aço que a tela mostrava como −6.480: a entrada está na Fábrica
  chapa3: [
    linha(...CHAPA_3, ALMOXARIFADO, -6480, 0),
    linha(...CHAPA_3, FABRICA, 8159.29, 6.962834),
    linha(...CHAPA_3, TERCEIRO, 1392.6, 5.740038),
  ],
  // só tem saldo positivo no Terceiro — nem aparecia na tela
  w610: [
    linha(...W610, FABRICA, -5112.6, 0),
    linha(...W610, TERCEIRO, 126606.4, 7.036942),
  ],
  // só negativo, só no Almoxarifado
  tubo: [linha(...TUBO, ALMOXARIFADO, -3230, 0)],
  // consumível só no Almoxarifado — o caso que sempre funcionou
  barra: [linha(...BARRA, ALMOXARIFADO, 320, 6.1425)],
  // positivo nos dois locais da Qtd, com CMC DIFERENTE em cada um
  diluente: [linha(...DILUENTE, ALMOXARIFADO, 38, 458.078892), linha(...DILUENTE, FABRICA, 2, 365.775)],
  // só negativo, mas o Omie ainda informa o custo médio
  escova: [linha("901000026", 7318302991, "ESCOVA ACO CIRCULAR - 4.1/2&quot;", ALMOXARIFADO, -2, 13.381429)],
  // o único saldo num local de patrimônio
  luva: [linha("181000031", 7318304897, "LUVA DE RASPA 20CM", EDIFICACOES, 11, 0)],
};

/** Monta a página `n` de uma posição, com os totais que o Omie manda (100 linhas por página, no máximo). */
export function paginaPosicao(linhas, { nPagina = 1, nTotPaginas = 1, nTotRegistros = linhas.length } = {}) {
  return { nPagina, nTotPaginas, nRegistros: linhas.length, nTotRegistros, dDataPosicao: "24/09/2026", produtos: linhas };
}
