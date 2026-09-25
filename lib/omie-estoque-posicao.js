// Posição de estoque do Omie POR LOCAL — de onde sai a Qtd que o portal mostra.
//
// ⚠⚠ ATÉ 25/09/2026 A QTD ERA SÓ O ALMOXARIFADO, e ninguém via. Medido ao vivo (24/09/2026, só leitura):
//   · `ListarPosEstoque` SEM filtro de local devolve só o local PADRÃO — 258 linhas, idênticas byte a
//     byte às do filtro pelo Almoxarifado. A Fábrica (onde entra o aço) e o Terceiro nunca chegavam:
//     399 de 657 produtos fora da tela e 31 negativos (chapa 3,00 mm: −6.480, com +8.159 na Fábrica).
//   · a leitura por local nunca rodou. A lista de locais vinha de `estoque/localestoque/` — serviço que
//     não existe (a doc dá 404; a chamada estourava os 3 s ou voltava `{error}` SEM `faultstring`, que o
//     `omieCall` entrega como sucesso) —, com parâmetros e chaves de resposta que também não existem; e o
//     filtro por local mandava `nCodLocal`, que o Omie RECUSA ("Tag [NCODLOCAL] não faz parte da
//     estrutura"). Tudo caía num `catch { break; }`: `ConfigEstoque.locaisOmie` nunca foi gravado e
//     0 de 2.500 itens tinham `locaisQtd`.
//
// O certo (doc + medição): `lista_local_estoque: "TODOS"` devolve UMA LINHA POR (produto, local), com
// `codigo_local_estoque` em cada uma — uma leitura só, e o detalhe por local vem junto. Saldo zero não
// vem; negativo vem (o consumo é baixado num local e a entrada caiu em outro).

import { omieCall } from "@/lib/omie-call";
import { dataBR } from "@/lib/data-br";

const URL_LOCAIS = "https://app.omie.com.br/api/v1/estoque/local/";
const URL_POSICAO = "https://app.omie.com.br/api/v1/estoque/consulta/";

/**
 * Os locais cuja soma é a Qtd do portal (`EstoqueItem.qtdAtual`) — a da tela do Compras, da consulta
 * da Produção, da busca de produto da RM e do assistente. Os demais aparecem só no detalhe por local
 * (`locaisQtd`) e no filtro da tela.
 *
 * ⚠⚠ DECISÃO DE NEGÓCIO, À ESPERA DE CONFIRMAÇÃO (25/09/2026). Entram os dois locais em uso: o
 * Almoxarifado (consumíveis; é o padrão) e a Fábrica (aço) — 47 e 34 pedidos do portal desde 28/08.
 * Fica FORA o "ESTOQUE TERCEIRO": 1,43 milhão em 273 itens, com códigos de cliente (TMSA/Vale, tinta
 * Jotun) e nenhum movimento desde fev/2025 — somado, a busca da RM ofereceria, por exemplo, 126 t de
 * W610 que ninguém sabe se existem. Ficam fora também os de patrimônio (máquinas, ferramentas,
 * edificações). ⚠ Local NOVO não entra sozinho: aparece no detalhe e espera alguém decidir aqui.
 */
export const LOCAIS_NA_QTD = new Set([
  "7315778267", // 001 ESTOQUE ALMOXARIFADO (padrão)
  "7320665233", // 002 ESTOQUE FABRICA
]);

// ⚠ Latência medida em 24/09/2026: 0,45–0,9 s por página, com picos de 25 a 29 s. Os 3 s sem
// retentativa de antes transformavam o pico em leitura pela metade; 10 s com retentativa corta o pico
// e tenta de novo, e o prazo (`ateMs`) segura o total dentro do `maxDuration` de quem chama.
const opcoes = (ateMs) => ({ timeout: 10_000, ...(ateMs ? { ateMs } : {}) });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Arredonda na precisão do Omie (6 casas): soma de frações não deixa resto de 1e-12 virar "com estoque". */
const seisCasas = (n) => Math.round(n * 1e6) / 1e6;

/** O que veio no lugar da resposta esperada, para a mensagem de erro dizer algo útil. */
function descrever(resp) {
  if (resp && typeof resp.error === "string") return resp.error;
  if (resp && typeof resp === "object") return `resposta com: ${Object.keys(resp).join(", ") || "nada"}`;
  return `resposta: ${String(resp)}`;
}

/**
 * Os locais de estoque cadastrados no Omie.
 * @returns {Promise<Array<{ cod: number, nome: string, padrao: boolean, naQtd: boolean }>>}
 */
export async function listarLocais({ ateMs } = {}) {
  const resp = await omieCall(URL_LOCAIS, "ListarLocaisEstoque", { nPagina: 1, nRegPorPagina: 50 }, opcoes(ateMs));
  // ⚠⚠ Sem `locaisEncontrados` é FALHA, não "nenhum local": era assim que o erro sumia.
  if (!Array.isArray(resp?.locaisEncontrados)) {
    throw new Error(`Omie não devolveu a lista de locais de estoque — ${descrever(resp)}`);
  }
  const locais = resp.locaisEncontrados.map((l) => ({
    cod: Number(l.codigo_local_estoque),
    nome: String(l.descricao || "").trim(),
    padrao: l.padrao === "S",
    naQtd: LOCAIS_NA_QTD.has(String(l.codigo_local_estoque)),
  }));
  // ⚠⚠ OS CÓDIGOS DA QTD SÃO FIXOS. Local apagado ou recriado no Omie muda de código, e sem esta trava a
  // Qtd de tudo o que está nele cairia a zero, calada — o mesmo defeito que este módulo corrige.
  const sumidos = [...LOCAIS_NA_QTD].filter((cod) => !locais.some((l) => String(l.cod) === cod));
  if (sumidos.length > 0) {
    throw new Error(`Local da Qtd não existe mais no cadastro do Omie: ${sumidos.join(", ")} — revise LOCAIS_NA_QTD em lib/omie-estoque-posicao.js`);
  }
  return locais;
}

/**
 * Todas as linhas da posição de estoque, de todos os locais — ou uma exceção. Nunca metade.
 *
 * ⚠⚠ O DEFEITO MAIS CARO ERA A METADE: com `catch { break; }`, uma página lenta devolvia só as
 * anteriores como se fossem tudo, e o passo seguinte ZERAVA o saldo de todo produto que não estava
 * nelas — até a rodada da hora seguinte.
 */
export async function listarPosicao({ dataPosicao = dataBR(new Date()), ateMs } = {}) {
  const linhas = [];
  let esperadas = null;
  for (let pg = 1; ; pg++) {
    const resp = await lerPagina(pg, dataPosicao, ateMs);
    if (pg === 1) esperadas = Number(resp.nTotRegistros);
    linhas.push(...resp.produtos);
    if (pg >= Number(resp.nTotPaginas)) break;
    await sleep(100);
  }
  if (Number.isFinite(esperadas) && linhas.length !== esperadas) {
    throw new Error(`Posição de estoque do Omie incompleta: vieram ${linhas.length} linhas de ${esperadas}`);
  }
  return linhas;
}

/** Uma página da posição, já conferida — ou uma exceção que diz qual página e por quê. */
async function lerPagina(pg, dataPosicao, ateMs) {
  let resp;
  try {
    // ⚠ O Omie devolve no máximo 100 linhas por página, peça-se o que for (medido com 200 e 500).
    resp = await omieCall(URL_POSICAO, "ListarPosEstoque", {
      nPagina: pg, nRegPorPagina: 100, dDataPosicao: dataPosicao, lista_local_estoque: "TODOS",
    }, opcoes(ateMs));
  } catch (e) {
    throw new Error(`Posição de estoque do Omie, página ${pg}: ${e?.message || e}`, { cause: e });
  }
  // ⚠ `{}` não é posição vazia — mesma lição de lib/omie-encerramento.js.
  if (!Array.isArray(resp?.produtos) || !(Number(resp?.nTotPaginas) >= 1)) {
    throw new Error(`Posição de estoque do Omie sem "produtos"/"nTotPaginas" na página ${pg} — ${descrever(resp)}`);
  }
  return resp;
}

/** CMC médio ponderado pelo saldo POSITIVO — o custo do que existe, não do que foi baixado. */
function cmcPonderado(locais) {
  let qtd = 0, valor = 0;
  for (const { saldo, cmc } of locais) {
    if (saldo > 0) { qtd += saldo; valor += saldo * cmc; }
  }
  return qtd > 0 ? valor / qtd : null;
}

/**
 * Uma linha por (produto, local) → o saldo do produto.
 *
 * ⚠⚠ O CMC É POR LOCAL (134 de 136 produtos em mais de um local têm CMC diferente). O portal gravava o
 * do Almoxarifado — para aço, 0 ou 1 R$/kg — e o custo de material o usava como preço. Agora: a média
 * dos locais da Qtd ponderada pelo saldo positivo; sem saldo positivo neles, a de onde houver; sem
 * saldo positivo em lugar nenhum, o CMC que o Omie informar (o mesmo de antes para produto de um local
 * só); sem nada disso, 0.
 *
 * @returns {Map<string, { codigoOmie: string, descricao: string, cmc: number, qtdAtual: number, locaisQtd: Record<string, number> }>}
 */
export function consolidarPosicao(linhas, naQtd = LOCAIS_NA_QTD) {
  const resultado = new Map();
  for (const [cod, { descricao, locais }] of agruparPorProduto(linhas)) {
    const locaisQtd = {};
    let qtd = 0;
    for (const [local, { saldo }] of locais) {
      locaisQtd[local] = saldo;
      if (naQtd.has(local)) qtd += saldo;
    }
    const cmc = cmcDoProduto(locais, naQtd);
    resultado.set(cod, { codigoOmie: cod, descricao, cmc: seisCasas(cmc), qtdAtual: seisCasas(qtd), locaisQtd });
  }
  return resultado;
}

/** Código do produto → descrição e, por local, `{ saldo, cmc }`. */
function agruparPorProduto(linhas) {
  const porProduto = new Map();
  for (const l of linhas) {
    const cod = String(l.cCodigo ?? "").trim();
    if (!cod) continue;
    const p = porProduto.get(cod) ?? { descricao: String(l.cDescricao ?? "").trim(), locais: new Map() };
    // ⚠ Atribuição, não soma: a mesma linha repetida (página deslocada) não conta duas vezes.
    p.locais.set(String(l.codigo_local_estoque), { saldo: Number(l.nSaldo) || 0, cmc: Number(l.nCMC) || 0 });
    porProduto.set(cod, p);
  }
  return porProduto;
}

/** A escada do CMC descrita em `consolidarPosicao`. */
function cmcDoProduto(locais, naQtd) {
  const daQtd = [...locais].filter(([local]) => naQtd.has(local)).map(([, v]) => v);
  const todos = [...locais.values()];
  return cmcPonderado(daQtd)
    ?? cmcPonderado(todos)
    ?? [...daQtd, ...todos].find((v) => v.cmc > 0)?.cmc
    ?? 0;
}
