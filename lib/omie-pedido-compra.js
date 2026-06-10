// Cria um Pedido de Compra no Omie. Lógica server-side reutilizável tanto
// pela API HTTP /api/omie/pedido-compra quanto pelo orquestrador
// /api/op/[id]/gerar-pedidos (que invoca diretamente, sem fetch interno).

const OMIE_URL = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";
const OMIE_PROD_URL = "https://app.omie.com.br/api/v1/geral/produtos/";
const OMIE_ESTOQUE_URL = "https://app.omie.com.br/api/v1/estoque/consulta/";
const OMIE_CLIENTES_URL = "https://app.omie.com.br/api/v1/geral/clientes/";
const OMIE_CC_URL = "https://app.omie.com.br/api/v1/geral/contacorrente/";

import { resolverCondicaoPagamento } from "@/lib/condicao-pagamento";

// Cache em memoria do nCodCC da conta Inter — evita uma chamada de listagem
// a cada pedido. Reinicia a cada deploy.
let contaInterCache = null;
// Cache COMPLETO de todos os produtos do estoque Omie.
// Carregado uma vez (lazy) — persiste enquanto o lambda estiver quente.
// Array de { codigo, descricao, descNorm }
let estoqueCache = null;
let estoqueCacheLoading = null; // Promise pra evitar carregamentos paralelos
// Cache de busca por descricao — evita chamadas repetidas ao Omie.
// Chave = descricao normalizada; valor = { codigo, unidade } | null.
const produtoDescricaoCache = new Map();

/**
 * Carrega TODOS os produtos do estoque Omie e guarda em cache.
 * Neste Omie, ListarProdutos retorna vazio (produtos inativos no cadastro
 * geral mas ativos no estoque). ListarPosEstoque e a unica fonte confiavel.
 * Cache persiste enquanto o lambda estiver quente (~5-15min no Vercel).
 */
async function carregarEstoqueCache(appKey, appSecret) {
  if (estoqueCache) return estoqueCache;
  // Evita carregamentos paralelos (ex: 2 pedidos ao mesmo tempo)
  if (estoqueCacheLoading) return estoqueCacheLoading;

  estoqueCacheLoading = (async () => {
    const todos = [];
    try {
      // Primeira pagina pra saber o total
      const resp1 = await fetch(OMIE_ESTOQUE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call: "ListarPosEstoque",
          app_key: appKey,
          app_secret: appSecret,
          param: [{ nPagina: 1, nRegPorPagina: 50, cExibeTodos: "S" }],
        }),
      });
      const data1 = await resp1.json();
      const totalPags = data1.nTotPaginas || 1;

      for (const p of (data1.produtos || [])) {
        todos.push({
          codigo: p.cCodigo || "",
          descricao: p.cDescricao || "",
          descNorm: (p.cDescricao || "").toUpperCase().replace(/[\s\-–—\/]+/g, " ").trim(),
        });
      }

      // Carrega demais paginas em lotes de 5 (respeita rate limit do Omie)
      for (let batch = 2; batch <= totalPags; batch += 5) {
        const paginas = [];
        for (let p = batch; p < batch + 5 && p <= totalPags; p++) paginas.push(p);
        const resps = await Promise.all(paginas.map((pag) =>
          fetch(OMIE_ESTOQUE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              call: "ListarPosEstoque",
              app_key: appKey,
              app_secret: appSecret,
              param: [{ nPagina: pag, nRegPorPagina: 50, cExibeTodos: "S" }],
            }),
          }).then((r) => r.json()).catch(() => ({ produtos: [] }))
        ));
        for (const d of resps) {
          for (const p of (d.produtos || [])) {
            todos.push({
              codigo: p.cCodigo || "",
              descricao: p.cDescricao || "",
              descNorm: (p.cDescricao || "").toUpperCase().replace(/[\s\-–—\/]+/g, " ").trim(),
            });
          }
        }
        // Pequena pausa entre lotes pra nao estourar rate limit
        if (batch + 5 <= totalPags) await new Promise((r) => setTimeout(r, 300));
      }

      console.log(`[estoqueCache] Carregados ${todos.length} produtos de ${totalPags} paginas`);
    } catch (e) {
      console.error("[estoqueCache] Erro carregando:", e?.message);
    }
    estoqueCache = todos;
    estoqueCacheLoading = null;
    return estoqueCache;
  })();

  return estoqueCacheLoading;
}

/**
 * Busca produto no Omie pelo texto da descricao.
 * Carrega todos os produtos do estoque em cache (lazy, 1x por lambda) e
 * busca por match de palavras-chave. Sem fallback generico — retorna null
 * se nao encontrar o produto exato (usuario deve preencher 'Codigo Omie').
 * @returns {{ codigo: string, unidade: string } | null}
 */
async function buscarProdutoPorDescricao(descricao, appKey, appSecret) {
  if (!descricao) return null;
  const descNorm = String(descricao).trim().toUpperCase();
  if (produtoDescricaoCache.has(descNorm)) return produtoDescricaoCache.get(descNorm);

  // Extrai palavras significativas (>1 char), removendo pontuacao
  const palavras = descNorm
    .split(/[\s\-–—\/]+/)
    .map((w) => w.replace(/[.,;:!?()[\]{}]/g, "").trim())
    .filter((w) => w.length > 1);
  if (palavras.length === 0) return null;

  try {
    // Carrega cache completo do estoque (lazy — ~5-10s na primeira vez)
    const produtos = await carregarEstoqueCache(appKey, appSecret);
    if (!produtos || produtos.length === 0) {
      produtoDescricaoCache.set(descNorm, null);
      return null;
    }

    const descItemNorm = descNorm.replace(/[\s\-–—\/]+/g, " ").trim();
    let melhor = null;
    let melhorScore = 0;

    for (const p of produtos) {
      // Match exato (normalizado)
      if (p.descNorm === descItemNorm) {
        melhor = p;
        melhorScore = palavras.length;
        break;
      }
      // Score: quantas palavras do item aparecem na descricao do produto
      const score = palavras.filter((w) => p.descNorm.includes(w)).length;
      if (score > melhorScore) {
        melhorScore = score;
        melhor = p;
      }
    }

    // Threshold: 40% das palavras (minimo 2)
    const scoreMinimo = Math.max(2, Math.ceil(palavras.length * 0.4));
    if (melhor && melhorScore >= scoreMinimo) {
      const res = { codigo: melhor.codigo, unidade: "UN" };
      produtoDescricaoCache.set(descNorm, res);
      return res;
    }
  } catch (e) {
    console.warn("[buscarProdutoPorDescricao] erro:", e?.message, "| descricao:", descNorm.substring(0, 60));
  }

  produtoDescricaoCache.set(descNorm, null);
  return null;
}

async function resolverContaCorrenteInter(appKey, appSecret) {
  if (contaInterCache) return contaInterCache;
  try {
    const resp = await fetch(OMIE_CC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarContasCorrentes",
        app_key: appKey,
        app_secret: appSecret,
        param: [{ nPagina: 1, nRegPorPagina: 50, cTipo: "" }],
      }),
    });
    const data = await resp.json();
    const lista = data.ListarContasCorrentes || data.contasCorrentes || [];
    const inter = lista.find((c) => /inter/i.test(c.cDescricao || ""));
    if (inter && inter.nCodCC) {
      contaInterCache = Number(inter.nCodCC);
      return contaInterCache;
    }
  } catch {
    // silencia — segue sem conta corrente
  }
  return null;
}

export async function resolverFornecedorPorCnpj(cnpj, appKey, appSecret) {
  if (!cnpj) return { codigo: 0, error: "CNPJ não informado" };
  const cnpjLimpo = String(cnpj).replace(/\D/g, "");
  if (cnpjLimpo.length < 11) return { codigo: 0, error: "CNPJ inválido (menos de 11 dígitos)" };

  try {
    const resp = await fetch(OMIE_CLIENTES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarClientesResumido",
        app_key: appKey,
        app_secret: appSecret,
        param: [
          {
            pagina: 1,
            registros_por_pagina: 5,
            apenas_importado_api: "N",
            clientesFiltro: { cnpj_cpf: cnpjLimpo },
          },
        ],
      }),
    });
    const data = await resp.json();
    if (data.faultstring) {
      return { codigo: 0, error: `Omie: ${data.faultstring}` };
    }
    const lista = data.clientes_cadastro_resumido || [];
    if (lista.length > 0 && lista[0].codigo_cliente) {
      return { codigo: lista[0].codigo_cliente };
    }
    return {
      codigo: 0,
      error: `CNPJ ${cnpjLimpo} não encontrado no Omie.`,
    };
  } catch (e) {
    return { codigo: 0, error: `Erro de rede: ${e?.message || "desconhecido"}` };
  }
}

function hojeDDMMYYYY() {
  const d = new Date();
  return (
    String(d.getDate()).padStart(2, "0") +
    "/" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "/" +
    d.getFullYear()
  );
}

function normalizeUnidade(u) {
  if (!u) return "KG";
  let s = String(u).trim().toUpperCase();
  if (/M[²2]\b/.test(s)) return "M2";
  if (/^PE[CÇ]A?S?$/.test(s) || /^P[CÇ]\(?S?\)?$/.test(s)) return "PC";
  if (/BARRA/.test(s)) return "BR";
  if (/TONELADA?/.test(s)) return "TON";
  if (/PARES?/.test(s)) return "PAR";
  s = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/g, "");
  return s.substring(0, 6) || "KG";
}

/**
 * Cria um pedido de compra no Omie.
 * @param {Object} input
 * @returns {Promise<{success?: true, error?: string, codigo_pedido?, numero_pedido?, codigo_pedido_integracao?, nCodFor_resolvido?, local_aplicado?, local_erro?}>}
 */
export async function criarPedidoOmie(input) {
  const {
    itens,
    observacao,
    nCodFor: nCodForInput,
    cnpjFornecedor,
    cNumPedido,
    nQtdeParc,
    cInfAdic,
    cCodLocalEstoque,
    cCodCateg,
    dDtPrevisao,
    cContaCorrente,
    prazoPagamento,
    nCodProj,
  } = input;

  if (!itens || !itens.length) {
    return { error: "Nenhum item informado" };
  }

  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) {
    return { error: "Credenciais Omie não configuradas (OMIE_APP_KEY/OMIE_APP_SECRET)." };
  }

  let nCodFor = Number(nCodForInput) || 0;
  let lookupErro = "";
  if (!nCodFor && cnpjFornecedor) {
    // eslint-disable-next-line no-use-before-define
    const r = await resolverFornecedorPorCnpj(cnpjFornecedor, appKey, appSecret);
    nCodFor = r.codigo;
    lookupErro = r.error || "";
  }
  if (!nCodFor) {
    return {
      error:
        "Fornecedor não identificado. " +
        (lookupErro || "Cadastre o CNPJ ou código Omie do fornecedor antes de enviar."),
    };
  }

  const codigoPedidoIntegracao = "PC-" + Date.now();
  const dataPrevisao = dDtPrevisao || hojeDDMMYYYY();

  let categoria = String(cCodCateg || "").trim();
  const codMatch = categoria.match(/^[\d.]+/);
  if (codMatch) categoria = codMatch[0].replace(/\.$/, "");
  if (categoria.length > 20) categoria = categoria.substring(0, 20);
  if (!categoria) categoria = String(process.env.OMIE_CATEGORIA_PADRAO || "2.01.02");

  const localEstoqueCodigo =
    cCodLocalEstoque && String(cCodLocalEstoque).trim()
      ? String(cCodLocalEstoque).trim()
      : null;

  const produtos_incluir = [];
  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx];
    const codigoItem = item.codigo ? String(item.codigo).trim() : "";

    // Cadeia de resolucao do codigo do produto:
    // 1) Codigo explicito do item (vem de codigoOmieEstoque no RMItem ou codigoOmie no OPItem)
    // 2) Busca por descricao no catalogo do estoque Omie (match por palavras-chave)
    // SEM fallback generico — cada item deve ter o produto correto pra
    // movimentar estoque de verdade.
    let cProduto = codigoItem;
    let unidadeResolvida = item.unidade || null;

    if (!cProduto && item.descricao) {
      const buscaDesc = await buscarProdutoPorDescricao(item.descricao, appKey, appSecret);
      if (buscaDesc) {
        cProduto = buscaDesc.codigo;
        if (!unidadeResolvida) unidadeResolvida = buscaDesc.unidade;
      }
    }

    if (!cProduto) {
      const descTrunc = String(item.descricao || "").substring(0, 100);
      console.error(`[criarPedidoOmie] Produto nao encontrado: "${descTrunc}" | codigo direto: ${codigoItem || "nenhum"}`);
      return {
        error:
          `Produto nao encontrado no Omie: "${descTrunc}". ` +
          (codigoItem
            ? `O codigo "${codigoItem}" nao foi reconhecido. `
            : "O item nao tem codigo Omie e a busca por descricao no estoque nao encontrou match. ") +
          "Preencha o campo 'Codigo Omie' no item da RM com o codigo correto do produto no Omie.",
      };
    }
    produtos_incluir.push({
      cCodIntItem: codigoPedidoIntegracao + "-" + (idx + 1),
      cProduto,
      cDescricao: String(item.descricao || "").substring(0, 255),
      cUnidade: normalizeUnidade(unidadeResolvida),
      nQtde: Number(item.qtd) || 0,
      nValUnit: Number(item.precoUnit) || 0,
      nDesconto: 0,
      // Local de estoque é por item no Omie (campo codigo_local_estoque, string).
      // Enviar já na criação faz o Omie respeitar a seleção em vez do default.
      ...(cCodLocalEstoque ? { codigo_local_estoque: String(cCodLocalEstoque).trim() } : {}),
    });
  }

  const obsPartes = [];
  if (prazoPagamento) obsPartes.push(`Prazo pagto: ${prazoPagamento}`);
  if (cContaCorrente) obsPartes.push(`Conta: ${cContaCorrente}`);
  if (cCodLocalEstoque) obsPartes.push(`Local estoque: ${cCodLocalEstoque}`);
  if (cInfAdic) obsPartes.push(`Info: ${cInfAdic}`);
  if (observacao) obsPartes.push(observacao);
  const obsCombinada = obsPartes.join(" | ");

  // Omie aceita nQtdeParc=0? Se passar 0, tipicamente assume 1. Pra
  // faturamento direto vamos usar 0 mesmo (vamos fechar manual no Omie
  // se preciso) — a flag fica pelo menos registrada na observacao.
  // Conta corrente padrao Inter — busca dinamicamente no Omie pelo nome.
  // Fallback pra env var OMIE_CONTA_CORRENTE_PADRAO se quiser hardcodar.
  let nCodCCPadrao = Number(process.env.OMIE_CONTA_CORRENTE_PADRAO) || null;
  if (!nCodCCPadrao) {
    nCodCCPadrao = await resolverContaCorrenteInter(appKey, appSecret);
  }

  // nQtdeParc: padrao 1 parcela. Em faturamento direto, passamos 0 explicito
  // (Omie nao gera contas a pagar). Tentei cParcCustom pra label "1 parcela"
  // mas Omie rejeita essa tag em cabecalho_incluir — pra ter label "1 parcela"
  // no Omie, cadastre uma condicao de pagamento "1 parcela" no Omie e configure
  // ela como default (Configurações > Pedido de Compra > Condicao padrao).
  let numParcelas = nQtdeParc != null ? Number(nQtdeParc) : 1;

  // Condição de pagamento: mapeia o prazo da cotação (texto livre) para um
  // código cadastrado no Omie (cCodParc). Só fora do faturamento direto
  // (numParcelas !== 0). Prazo não mapeado → sem cCodParc (default do Omie).
  let cCodParc = null;
  if (numParcelas !== 0 && prazoPagamento) {
    const cond = resolverCondicaoPagamento(prazoPagamento);
    if (cond) {
      cCodParc = cond.cCodParc;
      numParcelas = cond.nQtdeParc;
    }
  }

  const cabecalho = {
    cCodIntPed: codigoPedidoIntegracao,
    dDtPrevisao: dataPrevisao,
    nCodFor: nCodFor || 0,
    cNumPedido: cNumPedido || "",
    cCodCateg: categoria,
    cObsInt: obsCombinada,
    nQtdeParc: numParcelas,
    ...(cCodParc ? { cCodParc } : {}),
    ...(nCodCCPadrao ? { nCodCC: nCodCCPadrao } : {}),
    // Vincula o projeto (obra) JÁ cadastrado no Omie pelo código, em vez de
    // deixar em branco (= manual) ou o Omie criar um novo projeto.
    ...(Number(nCodProj) > 0 ? { nCodProj: Number(nCodProj) } : {}),
  };

  const payload = {
    call: "IncluirPedCompra",
    app_key: appKey,
    app_secret: appSecret,
    param: [
      {
        cabecalho_incluir: cabecalho,
        produtos_incluir,
        frete_incluir: { nCodTransp: 0, cTpFrete: "9" },
      },
    ],
  };

  let data;
  try {
    const resp = await fetch(OMIE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    data = await resp.json();
  } catch (e) {
    return { error: `Falha ao chamar Omie: ${e?.message || "erro de rede"}` };
  }

  if (data.faultstring) {
    return {
      error: data.faultstring,
      codigo_pedido_integracao: codigoPedidoIntegracao,
      nCodFor_resolvido: nCodFor,
      payload_enviado: payload,
    };
  }

  // Local de estoque já vai no item (codigo_local_estoque) na criação do pedido,
  // então o antigo "Plano B" via AlterarPedCompra (que adivinhava nomes de campo
  // e quebrava por tipo) foi removido.

  return {
    success: true,
    codigo_pedido: data.nCodPed || "",
    codigo_pedido_integracao: codigoPedidoIntegracao,
    numero_pedido: data.cNumero || data.cNumPedido || "",
    nCodFor_resolvido: nCodFor,
    local_aplicado: !!localEstoqueCodigo,
    omie_response: data,
  };
}

/**
 * Ajusta as quantidades de um pedido de compra no Omie pra igualar ao
 * recebimento real (NF de entrada). Resolve o problema de diferença entre
 * peso teórico (pedido) e peso real (NF), que deixa o pedido "aberto".
 *
 * Fluxo:
 * 1. Consulta o pedido no Omie (ConsultarPedCompra)
 * 2. Compara nQtde (pedido) vs nQtdeRec (recebido) de cada item
 * 3. Altera nQtde pra igualar nQtdeRec (AlterarPedCompra)
 *
 * @param {string|number} nCodPed - Codigo interno do pedido no Omie
 * @returns {Promise<{success?: boolean, error?: string, ajustados: number, ajustes: Array}>}
 */
export async function ajustarQuantidadesPedido(nCodPed) {
  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) {
    return { error: "Credenciais Omie não configuradas (OMIE_APP_KEY/OMIE_APP_SECRET)" };
  }

  // 1. Consulta pedido atual no Omie
  let pedido;
  try {
    const resp = await fetch(OMIE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ConsultarPedCompra",
        app_key: appKey,
        app_secret: appSecret,
        param: [{ nCodPed: Number(nCodPed) }],
      }),
    });
    pedido = await resp.json();
    if (pedido.faultstring) {
      return { error: `Omie ConsultarPedCompra: ${pedido.faultstring}` };
    }
  } catch (e) {
    return { error: `Erro ao consultar pedido no Omie: ${e?.message || "erro de rede"}` };
  }

  // 2. Extrai itens e identifica diferencas de quantidade
  const itens = pedido.produtos_consulta || pedido.det || [];
  if (itens.length === 0) {
    return { error: "Pedido sem itens no Omie" };
  }

  const ajustes = [];
  for (const item of itens) {
    const prod = item.produto || item;
    const nQtde = Number(prod.nQtde) || 0;
    const nQtdeRec = Number(prod.nQtdeRec) || 0;

    if (nQtdeRec > 0 && Math.abs(nQtde - nQtdeRec) > 0.001) {
      // Identificador do item: cCodProdInt (consulta) = cCodIntItem (alteracao)
      const codInt = prod.cCodProdInt || prod.cCodIntItem || "";
      ajustes.push({
        cCodIntItem: codInt,
        nItem: prod.nItem || 0,
        descricao: prod.cDescricao || prod.cProduto || "",
        unidade: prod.cUnidade || "KG",
        qtdOriginal: nQtde,
        qtdRecebida: nQtdeRec,
        diferenca: +(nQtdeRec - nQtde).toFixed(4),
      });
    }
  }

  if (ajustes.length === 0) {
    return {
      success: true,
      ajustados: 0,
      ajustes: [],
      mensagem: "Nenhum item precisa de ajuste — quantidades já conferem ou sem recebimento registrado no Omie",
    };
  }

  // 3. Monta payload de alteracao
  // Tenta primeiro por cCodIntItem (codigo de integracao); se nao tiver, usa nItem
  const produtos_alterar = ajustes.map((a) => {
    const ident = a.cCodIntItem
      ? { cCodIntItem: a.cCodIntItem }
      : { nItem: a.nItem };
    return { ...ident, nQtde: a.qtdRecebida };
  });

  try {
    const resp = await fetch(OMIE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "AlterarPedCompra",
        app_key: appKey,
        app_secret: appSecret,
        param: [
          {
            cabecalho_alterar: { nCodPed: Number(nCodPed) },
            produtos_alterar,
          },
        ],
      }),
    });
    const data = await resp.json();

    if (data.faultstring) {
      return {
        error: `Omie AlterarPedCompra: ${data.faultstring}`,
        ajustes,
        payload_enviado: { produtos_alterar },
      };
    }

    return {
      success: true,
      ajustados: ajustes.length,
      ajustes,
      omie_response: data,
    };
  } catch (e) {
    return { error: `Erro ao alterar pedido no Omie: ${e?.message || "erro de rede"}`, ajustes };
  }
}

// Anexa arquivos a um pedido de compra ja criado no Omie.
// Usa a API de anexos com URL externa (cArquivo do Vercel Blob).
// Best-effort: erro em um anexo nao trava os outros. Retorna log
// detalhado pra cada arquivo tentado.
//
// nCodPed: id do pedido (data.nCodPed retornado em criarPedidoOmie)
// anexos:  array de { nomeArquivo, blobUrl, tipo? }
const OMIE_ANEXO_URL = "https://app.omie.com.br/api/v1/geral/anexo/";

export async function anexarAoPedidoOmie({ nCodPed, anexos, appKey, appSecret }) {
  const APP_KEY = appKey || process.env.OMIE_APP_KEY;
  const APP_SECRET = appSecret || process.env.OMIE_APP_SECRET;
  if (!APP_KEY || !APP_SECRET) {
    return { anexados: 0, erros: [{ error: "OMIE credentials missing" }] };
  }
  if (!nCodPed) {
    return { anexados: 0, erros: [{ error: "nCodPed obrigatorio" }] };
  }
  if (!Array.isArray(anexos) || anexos.length === 0) {
    return { anexados: 0, erros: [] };
  }

  const resultados = [];
  for (let i = 0; i < anexos.length; i++) {
    const a = anexos[i];
    if (!a?.blobUrl || !a?.nomeArquivo) {
      resultados.push({ nome: a?.nomeArquivo, error: "sem url/nome" });
      continue;
    }
    // Detecta extensao pra cTipoArquivo
    const extMatch = a.nomeArquivo.match(/\.([a-z0-9]+)$/i);
    const cTipoArquivo = (extMatch?.[1] || "pdf").toLowerCase();
    // Omie aceita ate ~100 chars no nome do arquivo
    const cNomeArquivo = String(a.nomeArquivo).substring(0, 95);

    const payload = {
      call: "IncluirAnexo",
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param: [
        {
          cCodIntAnexo: `anx-${nCodPed}-${i + 1}-${Date.now()}`,
          cTabela: "ped-compra", // tabela do pedido de compra
          nId: Number(nCodPed),
          cNomeArquivo,
          cTipoArquivo,
          cURLExterna: a.blobUrl,
        },
      ],
    };
    try {
      const resp = await fetch(OMIE_ANEXO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (data.faultstring) {
        resultados.push({ nome: cNomeArquivo, error: data.faultstring });
      } else {
        resultados.push({ nome: cNomeArquivo, ok: true, nIdAnexo: data.nIdAnexo || null });
      }
    } catch (e) {
      resultados.push({ nome: cNomeArquivo, error: e?.message || "erro de rede" });
    }
    // Pequena pausa entre uploads pra nao estourar rate limit
    await new Promise((r) => setTimeout(r, 500));
  }
  const anexados = resultados.filter((r) => r.ok).length;
  const erros = resultados.filter((r) => r.error);
  return { anexados, erros, detalhes: resultados };
}
