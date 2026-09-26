// Movimentações de estoque do Omie → EstoqueMovimentacao (entradas e saídas, com o CMC do momento).
//
// ⚠⚠ ATÉ 24/09/2026 ISTO NUNCA GRAVOU UMA LINHA. A versão anterior (em lib/omie-estoque.js) chamava
// `ListarMovEstoque` em `estoque/movestoque/` — método que NÃO EXISTE ("Method not exists") — e o
// laço fazia `catch { break; }` lendo `resp.movimentos || []`. O erro virava "0 movimentos, sucesso":
// `EstoqueMovimentacao` tinha 0 linhas e o cron seguia verde no monitor. Daqui em diante NADA vira
// zero em silêncio: erro do Omie, resposta sem forma de lista, movimento que não pôde ser gravado e
// alocação FIFO que falhou LANÇAM — e o cron registra a falha no monitor.
//
// Contrato do `ListarMovimentoEstoque` (serviço `estoque/consulta`, o mesmo do `ListarPosEstoque`),
// lido na documentação e conferido numa chamada ao vivo em 24/09/2026 (54 movimentos de 17 a 24/09):
//   - lista em `movProdutoListar`; paginação em `nPagina`/`nTotPaginas`/`nTotRegistros`;
//   - `idMov` é único por LINHA — uma por item da nota (a mesma NF tem vários `idMov`);
//   - o produto vem como `idProd`, o ID NUMÉRICO do Omie (nCodProd), e NÃO o código em texto que o
//     portal guarda em `EstoqueItem.codigoOmie`. A ponte é `ProdutoOmie.codigoOmie`;
//   - `tipo` ("entrada"/"saida") dá o sentido; `qtde` veio positiva; `cmc` é o custo médio DEPOIS
//     do movimento (varia linha a linha, com `saldo` acumulando); datas "dd/mm/aaaa";
//   - `operacao`: 00 ajuste, 11/12 venda, 13 devolução de venda, 14 remessa, 16/26 complementar,
//     21/22 compra, 23 devolução ao fornecedor, 24 retorno de remessa, 28 ordem de produção;
//   - `cancelamento`/`devolucao` = "S" marcam a linha que DESFAZ uma nota.
//   ⚠ Havia DOIS locais de estoque em uso na semana (consumíveis e aço). Sem `lista_local_estoque`
//   a documentação não diz o que volta — por isso "TODOS", que foi o que a chamada ao vivo conferiu.
import { prisma } from "@/lib/prisma";
import { omieCall } from "@/lib/omie-call";
import { aplicarAlocacaoMovimentacao } from "@/lib/estoque-alocacao";
import { getConfigEstoque } from "@/lib/omie-estoque";
import { diaBRT } from "@/lib/data-br";
import { log } from "@/lib/log";

const registro = log("omie-estoque-movimentos");

const URL_CONSULTA = "https://app.omie.com.br/api/v1/estoque/consulta/";
const URL_PRODUTOS = "https://app.omie.com.br/api/v1/geral/produtos/";
const POR_PAGINA = 50;               // o valor do exemplo da documentação — o que foi conferido
const TIMEOUT_MS = 25_000;           // por tentativa; quem manda de verdade é o prazo (`ateMs`)
const PAUSA_ENTRE_PAGINAS_MS = 250;  // o limite do Omie (~3 req/s) é dividido com os outros crons

// ⚠ Lista vazia, no Omie, costuma vir como ERRO ("Não existem registros para a página [1]!") e não
// como lista vazia. Tratada como zero movimentos — só esta frase; qualquer outra falha lança.
const LISTA_VAZIA = /n[ãa]o existem registros/i;

const chaveDoMovimento = (idMov) => `omie-${idMov}`;
const paraOmie = (iso) => iso.split("-").reverse().join("/"); // "2026-09-24" → "24/09/2026"
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const TIPOS = { entrada: "ENTRADA", saida: "SAIDA" };

/**
 * A janela da consulta em dias-calendário de BRASÍLIA.
 *
 * ⚠ O servidor roda em UTC: às 22h de Brasília `getDate()` já devolve o dia seguinte. O Omie
 * registra o movimento no dia da operação, que é o de Brasília.
 */
export function janelaDeDatas(diasAtras, agora = new Date()) {
  const de = new Date(agora.getTime() - Number(diasAtras) * 864e5);
  return { dDtInicial: paraOmie(diaBRT(de)), dDtFinal: paraOmie(diaBRT(agora)) };
}

/** "dd/mm/aaaa" → Date ao meio-dia UTC: o mesmo dia em UTC e em Brasília (convenção de lib/cmr.js). */
function dataDoOmie(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? "").trim());
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12)) : null;
}

/**
 * O rótulo da tela do item ("NF de entrada" / "Baixa (produção)" / "Manual").
 *
 * Ajuste (00) é lançamento manual no Omie — nem nota fiscal nem baixa. E o ESTORNO de uma nota é nota:
 * a saída que cancela uma compra, rotulada "Baixa (produção)", diria que a fábrica consumiu um
 * material que nunca chegou.
 */
function origemDoMovimento(operacao, tipo, estorno) {
  if (String(operacao) === "00") return "MANUAL";
  return tipo === "ENTRADA" || estorno ? "OMIE_NF" : "OMIE_BAIXA";
}

const numeroOuNulo = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);

function observacaoDoMovimento(m) {
  const numDoc = String(m.numDoc ?? "").trim();
  return [
    String(m.desOrigem ?? "").trim(),
    numDoc && `NF ${numDoc}`,
    m.cancelamento === "S" && "cancelamento de NF",
    m.devolucao === "S" && "devolução de NF",
  ].filter(Boolean).join(" · ") || null;
}

/**
 * Uma linha de `movProdutoListar` → o que o portal grava, ou por que não grava.
 *
 * ⚠ Tipo fora de "entrada"/"saida" é PROBLEMA, não "AJUSTE": a versão antiga inventava um ajuste
 * para o que não entendia, e um movimento de sentido desconhecido no histórico é pior que nenhum.
 *
 * @returns {{mov: object} | {pular: "sem-quantidade"} | {problema: string}}
 */
export function interpretarMovimento(m) {
  const idMov = Number(m?.idMov);
  if (!(idMov > 0)) return { problema: "movimento sem idMov" };
  const idProd = Number(m.idProd);
  if (!(idProd > 0)) return { problema: `movimento ${idMov} sem idProd` };
  const tipo = TIPOS[semAcento(m.tipo)];
  if (!tipo) return { problema: `movimento ${idMov} com tipo "${m.tipo ?? ""}", que o portal não conhece` };
  const data = dataDoOmie(m.dtMov) || dataDoOmie(m.dtEmissao);
  if (!data) return { problema: `movimento ${idMov} sem data` };
  const quantidade = Math.abs(Number(m.qtde));
  if (!Number.isFinite(quantidade)) return { problema: `movimento ${idMov} com quantidade "${m.qtde}"` };
  // Nota complementar mexe só no VALOR: sem quantidade não há o que lançar no histórico.
  if (quantidade === 0) return { pular: "sem-quantidade" };
  // ⚠⚠ Estorno não é consumo: a saída que desfaz uma ENTRADA cancelada não pode abater a reserva de
  // uma OP — o material nunca chegou.
  const estorno = m.cancelamento === "S" || m.devolucao === "S";
  return {
    mov: {
      idMov, idProd, tipo, quantidade, data, estorno,
      origem: origemDoMovimento(m.operacao, tipo, estorno),
      cmcMomento: numeroOuNulo(m.cmc),
      observacao: observacaoDoMovimento(m),
    },
  };
}

/**
 * A resposta é um RETRATO de página, ou lixo com cara de resposta? `null` quando não é.
 *
 * ⚠ Ausência de campo não é campo com zero (a lição de lib/omie-encerramento.js): `{}` — Omie fora do
 * ar, proxy engolindo o corpo, contrato mudado — não é "nenhum movimento". Só vale como vazio o que
 * DIZ que é vazio: `nTotRegistros: 0` explícito (ou a frase do Omie, tratada em `lerPagina`).
 */
function retratoDaPagina(d) {
  if (Array.isArray(d?.movProdutoListar) && Number.isFinite(Number(d.nTotPaginas))) {
    return { lista: d.movProdutoListar, totalPaginas: Number(d.nTotPaginas) };
  }
  if (d?.nTotRegistros != null && Number(d.nTotRegistros) === 0) return { lista: [], totalPaginas: 0 };
  return null;
}

/** Uma página do `ListarMovimentoEstoque`, ou erro. */
async function lerPagina(janela, nPagina, ateMs) {
  let d;
  try {
    d = await omieCall(URL_CONSULTA, "ListarMovimentoEstoque",
      { nPagina, nRegPorPagina: POR_PAGINA, ...janela, lista_local_estoque: "TODOS" },
      { timeout: TIMEOUT_MS, ateMs });
  } catch (e) {
    if (LISTA_VAZIA.test(e?.message || "")) return { lista: [], totalPaginas: 0 };
    throw e;
  }
  const retrato = retratoDaPagina(d);
  if (retrato) return retrato;
  throw new Error(`resposta do Omie sem movProdutoListar/nTotPaginas (nTotRegistros: ${d?.nTotRegistros ?? "ausente"})`);
}

/**
 * idProd (numérico) → id do EstoqueItem, pelo cache `ProdutoOmie` e, para o que faltar, no Omie.
 *
 * ⚠⚠ O cache é SEMANAL e produto novo nasce na ENTRADA DA NOTA — o movimento dele chega antes do
 * cache. Sem a consulta, o movimento sairia da janela de 2 dias do cron sem nunca ter sido gravado.
 *
 * @returns {Promise<{itemDe: Map<number,string>, motivo: Map<number,string>}>}
 */
async function itensDosProdutos(idsProd, ateMs) {
  const ids = [...new Set(idsProd)];
  const codigoDe = new Map();
  const cache = await prisma.produtoOmie.findMany({
    where: { codigoOmie: { in: ids.map(String) } },
    select: { codigo: true, codigoOmie: true, atualizadoEm: true },
  });
  // ⚠ Código trocado no Omie deixa a linha velha no cache com o MESMO nCodProd: vale a mais recente.
  [...cache].sort((a, b) => new Date(a.atualizadoEm) - new Date(b.atualizadoEm))
    .forEach((p) => codigoDe.set(Number(p.codigoOmie), p.codigo));

  const motivo = new Map();
  for (const id of ids.filter((i) => !codigoDe.has(i))) {
    try {
      const d = await omieCall(URL_PRODUTOS, "ConsultarProduto", { codigo_produto: id }, { timeout: TIMEOUT_MS, ateMs });
      const codigo = String(d?.codigo ?? "").trim();
      if (codigo) codigoDe.set(id, codigo);
      else motivo.set(id, `produto ${id}: o Omie não devolveu o código`);
    } catch (e) {
      motivo.set(id, `produto ${id} sem código no portal (${e?.message || "falha ao consultar o Omie"})`);
    }
  }

  const itens = await prisma.estoqueItem.findMany({
    where: { codigoOmie: { in: [...new Set(codigoDe.values())] } },
    select: { id: true, codigoOmie: true },
  });
  const itemDoCodigo = new Map(itens.map((i) => [i.codigoOmie, i.id]));
  const itemDe = new Map();
  for (const [id, codigo] of codigoDe) {
    if (itemDoCodigo.has(codigo)) itemDe.set(id, itemDoCodigo.get(codigo));
    else motivo.set(id, `produto ${id} (código ${codigo}) sem item de estoque no portal`);
  }
  return { itemDe, motivo };
}

/** Grava um movimento e, se for saída de consumo e a alocação estiver ligada, aloca nas reservas (FIFO). */
async function gravarMovimento(m, itemEstoqueId, { r, problemas, abaterReservas }) {
  let criado;
  try {
    criado = await prisma.estoqueMovimentacao.create({
      data: {
        itemEstoqueId, tipo: m.tipo, origem: m.origem, quantidade: m.quantidade,
        cmcMomento: m.cmcMomento, observacao: m.observacao,
        syncCodigoOmie: chaveDoMovimento(m.idMov), createdAt: m.data,
      },
    });
  } catch (e) {
    // ⚠ Só a CHAVE repetida é inofensiva (outra rodada gravou entre a leitura e aqui). A versão
    // antiga engolia QUALQUER erro de gravação como se fosse esse.
    if (e?.code === "P2002") { r.jaExistiam++; return; }
    throw e;
  }
  if (m.tipo === "ENTRADA") r.entradas++;
  else r.saidas++;
  r.total = r.entradas + r.saidas;
  if (!abaterReservas || m.tipo !== "SAIDA" || m.estorno) return;
  try {
    const res = await aplicarAlocacaoMovimentacao(criado.id);
    if (res?.error) throw new Error(res.error);
  } catch (e) {
    // ⚠⚠ Era `.catch(() => {})`: a saída ficava sem OP e parecia "sem reserva", que é o estado
    // normal — ninguém tinha como saber. E a rodada seguinte não tenta de novo (o movimento existe).
    r.falhasAlocacao++;
    problemas.push(`alocação FIFO do movimento ${m.idMov} falhou (${e?.message})`);
  }
}

async function gravarPagina(lista, ctx) {
  const { r, problemas } = ctx;
  const novos = [];
  for (const linha of lista) {
    const x = interpretarMovimento(linha);
    if (x.pular) r.semQuantidade++;
    else if (x.problema) { r.naoGravados++; problemas.push(x.problema); }
    else novos.push(x.mov);
  }
  if (!novos.length) return;

  const existentes = new Set((await prisma.estoqueMovimentacao.findMany({
    where: { syncCodigoOmie: { in: novos.map((m) => chaveDoMovimento(m.idMov)) } },
    select: { syncCodigoOmie: true },
  })).map((e) => e.syncCodigoOmie));
  const aGravar = novos.filter((m) => !existentes.has(chaveDoMovimento(m.idMov)));
  r.jaExistiam += novos.length - aGravar.length;
  if (!aGravar.length) return;

  const { itemDe, motivo } = await itensDosProdutos(aGravar.map((m) => m.idProd), ctx.ateMs);
  for (const m of aGravar) {
    const itemId = itemDe.get(m.idProd);
    if (itemId) await gravarMovimento(m, itemId, ctx);
    else { r.naoGravados++; problemas.push(`movimento ${m.idMov}: ${motivo.get(m.idProd)}`); }
  }
}

/** Erro que carrega o que a rodada já fez — quem lê o monitor precisa saber o tamanho do estrago. */
function falha(mensagem, r) {
  const e = new Error(`${mensagem} — ${r.total} movimento(s) gravado(s) nesta rodada`);
  e.resumo = r;
  return e;
}

/** ⚠ Antes da 1ª página o total ainda não é conhecido — "de 1" seria inventado. */
function conferirPrazo(ateMs, pagina, totalPaginas, r) {
  if (!ateMs || Date.now() < ateMs) return;
  throw falha(`tempo esgotado antes da página ${pagina}${pagina > 1 ? ` de ${totalPaginas}` : ""}`, r);
}

function falhaDosProblemas(r, problemas) {
  const partes = [];
  if (r.naoGravados) partes.push(`${r.naoGravados} movimento(s) do Omie NÃO gravado(s)`);
  if (r.falhasAlocacao) partes.push(`${r.falhasAlocacao} saída(s) gravada(s) sem a alocação FIFO`);
  const mais = problemas.length > 3 ? `; e mais ${problemas.length - 3}` : "";
  return falha(`${partes.join(" e ")}: ${problemas.slice(0, 3).join("; ")}${mais}`, r);
}

/**
 * Traz as movimentações da janela e grava as novas. Idempotente pela chave `omie-<idMov>`.
 *
 * ⚠⚠ LANÇA em vez de devolver zero quando algo não deu certo — e o erro carrega `resumo` com o que
 * foi gravado. `ultimaSincMov` só avança numa rodada inteira sem problema.
 *
 * ⚠⚠ AS SAÍDAS NÃO ABATEM AS RESERVAS DAS OPs — decisão do Vitor (26/09/2026), até definirmos quais
 * saídas são consumo de verdade (venda 11? remessa 14? ajuste 00? só ordem de produção 28?). A
 * alocação FIFO (lib/estoque-alocacao.js) mexe em `EstoqueReserva` das OPs e nunca rodou em produção;
 * ela continua aqui, testada, atrás de `abaterReservas`. ⚠ Saída gravada com isto desligado NÃO é
 * alocada depois sozinha: a rodada seguinte vê o movimento como já existente.
 *
 * @param {number} diasAtras
 * @param {{ateMs?: number, abaterReservas?: boolean}} [opts] `ateMs`: prazo ABSOLUTO (`Date.now()`
 *   limite). O cron passa um prazo dentro do `maxDuration` — morrendo por timeout da Vercel, o `catch`
 *   não roda e o monitor fica sem registro.
 */
export async function sincronizarMovimentacoes(diasAtras = 7, { ateMs, abaterReservas = false } = {}) {
  const cfg = await getConfigEstoque();
  const janela = janelaDeDatas(diasAtras);
  const r = {
    entradas: 0, saidas: 0, total: 0, lidos: 0, jaExistiam: 0, semQuantidade: 0,
    naoGravados: 0, falhasAlocacao: 0, paginas: 0, janela,
  };
  const problemas = [];
  const ctx = { r, problemas, ateMs, abaterReservas };

  for (let pagina = 1, totalPaginas = 1; pagina <= totalPaginas; pagina++) {
    conferirPrazo(ateMs, pagina, totalPaginas, r);
    let lista;
    try {
      ({ lista, totalPaginas } = await lerPagina(janela, pagina, ateMs));
    } catch (e) {
      throw falha(`Omie falhou na página ${pagina}: ${e?.message}`, r);
    }
    r.paginas = pagina;
    r.lidos += lista.length;
    try {
      await gravarPagina(lista, ctx);
    } catch (e) {
      throw falha(`erro ao gravar a página ${pagina}: ${e?.message}`, r);
    }
    if (pagina < totalPaginas) await new Promise((ok) => setTimeout(ok, PAUSA_ENTRE_PAGINAS_MS));
  }

  if (problemas.length) throw falhaDosProblemas(r, problemas);
  // Registro de controle: não transforma em falha uma rodada cujos movimentos já estão gravados.
  await prisma.configEstoque.update({ where: { id: cfg.id }, data: { ultimaSincMov: new Date() } })
    .catch((e) => registro.aviso("[movimentos] ultimaSincMov não gravou:", e?.message));
  return r;
}

/** Uma linha para o heartbeat do monitor. */
export function resumoDaSincronizacao(r) {
  return `${r.total} novo(s): ${r.entradas} entrada(s), ${r.saidas} saída(s) · ` +
    `${r.jaExistiam} já existiam · ${r.lidos} lido(s) no Omie (${r.janela.dDtInicial} a ${r.janela.dDtFinal})`;
}
