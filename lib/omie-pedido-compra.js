// Cria um Pedido de Compra no Omie. Lógica server-side reutilizável tanto
// pela API HTTP /api/omie/pedido-compra quanto pelo orquestrador
// /api/op/[id]/gerar-pedidos (que invoca diretamente, sem fetch interno).

const OMIE_URL = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";
const OMIE_PROD_URL = "https://app.omie.com.br/api/v1/geral/produtos/";
const OMIE_ESTOQUE_URL = "https://app.omie.com.br/api/v1/estoque/consulta/";
const OMIE_CLIENTES_URL = "https://app.omie.com.br/api/v1/geral/clientes/";
const OMIE_CC_URL = "https://app.omie.com.br/api/v1/geral/contacorrente/";

// Cache em memoria do nCodCC da conta Inter — evita uma chamada de listagem
// a cada pedido. Reinicia a cada deploy.
let contaInterCache = null;
// Cache do codigo de um produto generico do Omie pra usar como ultimo
// fallback quando nenhuma busca por descricao retorna resultado.
let produtoGenericoCache = null;
// Cache de busca por descricao — evita chamadas repetidas ao Omie.
// Chave = descricao normalizada; valor = { codigo, unidade } | null.
const produtoDescricaoCache = new Map();

// Busca um produto cadastrado no Omie pra usar como ULTIMO fallback.
// Estrategia: pega o PRIMEIRO produto da listagem.
// NOTA: neste Omie, ListarProdutos retorna vazio (produtos inativos no cadastro
// mas ativos no estoque). Por isso usamos ListarPosEstoque como fonte principal.
async function resolverProdutoGenerico(appKey, appSecret) {
  if (produtoGenericoCache) return produtoGenericoCache;

  // Tentativa 1: ListarPosEstoque (fonte mais confiavel — sempre tem produtos)
  try {
    const resp = await fetch(OMIE_ESTOQUE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarPosEstoque",
        app_key: appKey,
        app_secret: appSecret,
        param: [{ nPagina: 1, nRegPorPagina: 5, cExibeTodos: "S" }],
      }),
    });
    const data = await resp.json();
    const lista = data.produtos || [];
    if (lista.length > 0) {
      const cod = lista[0].cCodigo || "";
      if (cod) {
        produtoGenericoCache = cod;
        return produtoGenericoCache;
      }
    }
    console.warn("[resolverProdutoGenerico] ListarPosEstoque sem resultado");
  } catch (e) {
    console.warn("[resolverProdutoGenerico] ListarPosEstoque erro:", e?.message);
  }

  // Tentativa 2: ListarProdutos (cadastro geral — pode retornar vazio)
  try {
    const resp = await fetch(OMIE_PROD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarProdutos",
        app_key: appKey,
        app_secret: appSecret,
        param: [{ pagina: 1, registros_por_pagina: 5 }],
      }),
    });
    const data = await resp.json();
    const lista = data.produto_servico_cadastro || data.produto_servico_resumido || [];
    if (lista.length > 0) {
      const p = lista[0];
      const cod = p.codigo || p.codigo_produto?.toString() || "";
      if (cod) {
        produtoGenericoCache = cod;
        return produtoGenericoCache;
      }
    }
  } catch (e) {
    console.warn("[resolverProdutoGenerico] ListarProdutos erro:", e?.message);
  }

  return null;
}

/**
 * Busca produto no Omie pelo texto da descricao.
 * Estrategia dupla:
 *   1) ListarProdutos com filtrar_apenas_descricao (cadastro geral)
 *   2) ListarPosEstoque varrendo paginas (estoque — mais confiavel neste Omie
 *      onde ListarProdutos pode retornar vazio)
 * @returns {{ codigo: string, unidade: string } | null}
 */
async function buscarProdutoPorDescricao(descricao, appKey, appSecret) {
  if (!descricao) return null;
  const descNorm = String(descricao).trim().toUpperCase();
  if (produtoDescricaoCache.has(descNorm)) return produtoDescricaoCache.get(descNorm);

  // Extrai palavras significativas (>1 char), removendo pontuacao isolada
  const palavras = descNorm
    .split(/[\s\-–—\/]+/)
    .map((w) => w.replace(/[.,;:!?()[\]{}]/g, "").trim())
    .filter((w) => w.length > 1);
  if (palavras.length === 0) return null;

  // Score: quantas palavras do item aparecem na descricao do produto
  function calcScore(descProd) {
    const dp = descProd.toUpperCase();
    return palavras.filter((w) => dp.includes(w)).length;
  }

  // Threshold: 40% das palavras (minimo 2)
  const scoreMinimo = Math.max(2, Math.ceil(palavras.length * 0.4));

  // --- Tentativa 1: ListarProdutos com filtro de descricao (rapido, mas pode retornar vazio) ---
  async function tentarListarProdutos(termo) {
    try {
      const resp = await fetch(OMIE_PROD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call: "ListarProdutos",
          app_key: appKey,
          app_secret: appSecret,
          param: [{
            pagina: 1,
            registros_por_pagina: 20,
            filtrar_apenas_descricao: termo,
          }],
        }),
      });
      const data = await resp.json();
      if (data.faultstring) return [];
      return (data.produto_servico_cadastro || []).map((p) => ({
        codigo: p.codigo || String(p.codigo_produto || ""),
        descricao: p.descricao || "",
        unidade: p.unidade || "UN",
      }));
    } catch { return []; }
  }

  // --- Tentativa 2: ListarPosEstoque (mais lento, mas sempre funciona) ---
  // Varre ate 5 paginas de estoque buscando match por descricao
  async function tentarEstoque() {
    try {
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
      let melhor = null;
      let melhorScore = 0;

      function avaliarPagina(produtos) {
        for (const p of produtos) {
          const desc = p.cDescricao || "";
          // Match exato (normalizado)
          const descProdNorm = desc.toUpperCase().replace(/[\s\-–—\/]+/g, " ").trim();
          const descItemNorm = descNorm.replace(/[\s\-–—\/]+/g, " ").trim();
          if (descProdNorm === descItemNorm) {
            melhor = { codigo: p.cCodigo, descricao: desc, unidade: "UN" };
            melhorScore = palavras.length;
            return true; // match exato, para
          }
          const sc = calcScore(desc);
          if (sc > melhorScore) {
            melhorScore = sc;
            melhor = { codigo: p.cCodigo, descricao: desc, unidade: "UN" };
          }
        }
        return false;
      }

      // Avalia primeira pagina
      if (avaliarPagina(data1.produtos || [])) return melhor;

      // Se nao achou match exato, varre mais paginas (ate 10 ou total, o que for menor)
      const maxPags = Math.min(totalPags, 10);
      for (let pag = 2; pag <= maxPags; pag++) {
        // Para de varrer se ja achou um match bom (>=70%)
        if (melhorScore >= Math.ceil(palavras.length * 0.7)) break;
        try {
          const resp = await fetch(OMIE_ESTOQUE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              call: "ListarPosEstoque",
              app_key: appKey,
              app_secret: appSecret,
              param: [{ nPagina: pag, nRegPorPagina: 50, cExibeTodos: "S" }],
            }),
          });
          const dataP = await resp.json();
          if (avaliarPagina(dataP.produtos || [])) return melhor;
        } catch { break; }
      }

      return melhorScore >= scoreMinimo ? melhor : null;
    } catch (e) {
      console.warn("[buscarProdutoPorDescricao] estoque erro:", e?.message);
      return null;
    }
  }

  // Funcao principal
  function melhorMatch(lista) {
    if (!lista || lista.length === 0) return null;
    let melhor = null;
    let melhorScore = 0;
    for (const p of lista) {
      const descProd = String(p.descricao || "").trim().toUpperCase();
      const descProdNorm = descProd.replace(/[\s\-–—\/]+/g, " ").trim();
      const descItemNorm = descNorm.replace(/[\s\-–—\/]+/g, " ").trim();
      if (descProdNorm === descItemNorm) return p;
      const score = calcScore(descProd);
      if (score > melhorScore) {
        melhorScore = score;
        melhor = p;
      }
    }
    return melhor && melhorScore >= scoreMinimo ? melhor : null;
  }

  try {
    // Fase 1: ListarProdutos (rapido — busca textual nativa do Omie)
    const termo1 = palavras.slice(0, 4).join(" ");
    let lista = await tentarListarProdutos(termo1);
    let resultado = melhorMatch(lista);

    if (!resultado && palavras.length > 2) {
      lista = await tentarListarProdutos(palavras.slice(0, 2).join(" "));
      resultado = melhorMatch(lista);
    }
    if (!resultado && palavras.length > 1) {
      lista = await tentarListarProdutos(palavras[0]);
      resultado = melhorMatch(lista);
    }

    // Fase 2: se ListarProdutos nao achou, busca no estoque (funciona sempre)
    if (!resultado) {
      resultado = await tentarEstoque();
    }

    if (resultado) {
      const res = { codigo: resultado.codigo, unidade: resultado.unidade || "UN" };
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

  // Produto generico: codigo de um produto cadastrado no Omie pra usar como
  // guarda-chuva quando o item do RM nao tem codigo proprio. Busca automatica
  // — pega o primeiro produto cadastrado no Omie (descricao real do item fica
  // no cDescricao da linha). Pode ser sobrescrito via env var se quiser
  // forcar um produto especifico.
  let codigoGenerico = String(process.env.OMIE_PRODUTO_GENERICO_CODIGO || "").trim();
  if (!codigoGenerico) {
    codigoGenerico = (await resolverProdutoGenerico(appKey, appSecret)) || "";
  }

  const produtos_incluir = [];
  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx];
    const codigoItem = item.codigo ? String(item.codigo).trim() : "";

    // Cadeia de resolucao do codigo do produto:
    // 1) Codigo explicito do item (vem de codigoOmieEstoque no RMItem ou codigoOmie no OPItem)
    // 2) Busca por descricao no catalogo Omie (match inteligente)
    // 3) Fallback pro produto generico (ultimo recurso — pode ser impreciso)
    let cProduto = codigoItem;
    let unidadeResolvida = item.unidade || null;

    if (!cProduto && item.descricao) {
      const buscaDesc = await buscarProdutoPorDescricao(item.descricao, appKey, appSecret);
      if (buscaDesc) {
        cProduto = buscaDesc.codigo;
        // Se o item nao tinha unidade definida, usa a do produto encontrado
        if (!unidadeResolvida) unidadeResolvida = buscaDesc.unidade;
      }
    }

    if (!cProduto) cProduto = codigoGenerico;

    if (!cProduto) {
      const descTrunc = String(item.descricao || "").substring(0, 80);
      console.error(
        `[criarPedidoOmie] Falha resolucao produto: "${descTrunc}"`,
        `| codigo direto: ${codigoItem || "nenhum"}`,
        `| generico: ${codigoGenerico || "nenhum"}`,
      );
      return {
        error:
          `Nao foi possivel resolver codigo de produto para o item "${descTrunc}". ` +
          `Tentativas: 1) codigo direto: ${codigoItem || "nenhum"}, 2) busca por descricao: sem match, 3) produto generico: ${codigoGenerico || "nenhum"}. ` +
          "Garanta que existe pelo menos 1 produto cadastrado no Omie, ou preencha o campo 'Codigo Omie' no item da RM.",
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
  const numParcelas = nQtdeParc != null ? Number(nQtdeParc) : 1;

  const cabecalho = {
    cCodIntPed: codigoPedidoIntegracao,
    dDtPrevisao: dataPrevisao,
    nCodFor: nCodFor || 0,
    cNumPedido: cNumPedido || "",
    cCodCateg: categoria,
    cObsInt: obsCombinada,
    nQtdeParc: numParcelas,
    ...(nCodCCPadrao ? { nCodCC: nCodCCPadrao } : {}),
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

  // Plano B: AlterarPedCompra pra setar local de estoque
  let localAplicado = false;
  let localErro = "";
  const tentativasLog = [];
  if (localEstoqueCodigo && data.nCodPed) {
    await new Promise((r) => setTimeout(r, 1500));
    const valorNumerico = Number(localEstoqueCodigo) || 0;
    // Tenta TODAS combinacoes — log de cada resposta vai pra PedidoOmie.resposta
    const tentativas = [
      { tag: "nCodLocal", valor: valorNumerico, em: "cabecalho" },
      { tag: "nLocalEstoque", valor: valorNumerico, em: "cabecalho" },
      { tag: "nCodLocEstoq", valor: valorNumerico, em: "cabecalho" },
      { tag: "cCodLocEstoq", valor: String(localEstoqueCodigo), em: "cabecalho" },
      { tag: "nCodLocal", valor: valorNumerico, em: "produtos" },
      { tag: "nLocalEstoque", valor: valorNumerico, em: "produtos" },
      { tag: "nCodLocEstoq", valor: valorNumerico, em: "produtos" },
      { tag: "cCodLocEstoq", valor: String(localEstoqueCodigo), em: "produtos" },
    ];
    for (const t of tentativas) {
      if (!t.valor) continue;
      const param =
        t.em === "produtos"
          ? {
              cabecalho_alterar: { nCodPed: data.nCodPed },
              produtos_alterar: produtos_incluir.map((p) => ({
                cCodIntItem: p.cCodIntItem,
                [t.tag]: t.valor,
              })),
            }
          : {
              cabecalho_alterar: { nCodPed: data.nCodPed, [t.tag]: t.valor },
            };
      try {
        const resp = await fetch(OMIE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            call: "AlterarPedCompra",
            app_key: appKey,
            app_secret: appSecret,
            param: [param],
          }),
        });
        const altData = await resp.json();
        tentativasLog.push({
          tag: t.tag,
          valor: t.valor,
          em: t.em,
          response: altData,
        });
        if (!altData.faultstring) {
          // Sucesso aparente — mas NAO assume "aplicado" ainda. Continua tentando
          // pra logar todas. Marca aplicado se pelo menos uma deu sem faultstring
          // (e idealmente vamos verificar via ConsultarPedCompra, futuro).
          localAplicado = true;
          break;
        }
        localErro = altData.faultstring;
        if (!/não faz parte|nao faz parte/i.test(localErro)) break;
      } catch (e) {
        localErro = e?.message || "erro de rede";
        tentativasLog.push({ tag: t.tag, em: t.em, error: e?.message });
        break;
      }
    }
  }

  return {
    success: true,
    codigo_pedido: data.nCodPed || "",
    codigo_pedido_integracao: codigoPedidoIntegracao,
    numero_pedido: data.cNumero || data.cNumPedido || "",
    nCodFor_resolvido: nCodFor,
    local_aplicado: localAplicado,
    local_erro: localAplicado ? null : localErro || null,
    local_tentativas: tentativasLog,
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
