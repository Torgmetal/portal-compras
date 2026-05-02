// Cria um Pedido de Compra no Omie. Lógica server-side reutilizável tanto
// pela API HTTP /api/omie/pedido-compra quanto pelo orquestrador
// /api/op/[id]/gerar-pedidos (que invoca diretamente, sem fetch interno).

const OMIE_URL = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";
const OMIE_PROD_URL = "https://app.omie.com.br/api/v1/geral/produtos/";
const OMIE_CLIENTES_URL = "https://app.omie.com.br/api/v1/geral/clientes/";

async function resolverProduto(codigo, appKey, appSecret) {
  if (!codigo) return 0;
  try {
    const resp = await fetch(OMIE_PROD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ConsultarProduto",
        app_key: appKey,
        app_secret: appSecret,
        param: [{ codigo: String(codigo) }],
      }),
    });
    const data = await resp.json();
    return data.codigo_produto || 0;
  } catch {
    return 0;
  }
}

async function resolverFornecedorPorCnpj(cnpj, appKey, appSecret) {
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
  if (!categoria) categoria = "2.01.02";

  const localEstoqueCodigo =
    cCodLocalEstoque && String(cCodLocalEstoque).trim()
      ? String(cCodLocalEstoque).trim()
      : null;

  const produtos_incluir = [];
  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx];
    const nCodProd = await resolverProduto(item.codigo, appKey, appSecret);
    produtos_incluir.push({
      cCodIntItem: codigoPedidoIntegracao + "-" + (idx + 1),
      nCodProd,
      cDescricao: String(item.descricao || "").substring(0, 255),
      cUnidade: normalizeUnidade(item.unidade),
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
  const cabecalho = {
    cCodIntPed: codigoPedidoIntegracao,
    dDtPrevisao: dataPrevisao,
    nCodFor: nCodFor || 0,
    cNumPedido: cNumPedido || "",
    cCodCateg: categoria,
    cObsInt: obsCombinada,
    nQtdeParc: nQtdeParc != null ? Number(nQtdeParc) : 1,
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

  // Plano B: AlterarPedCompra pra setar local de estoque por item
  let localAplicado = false;
  let localErro = "";
  if (localEstoqueCodigo && data.nCodPed) {
    await new Promise((r) => setTimeout(r, 1500));
    const tagsPossiveis = ["cCodLocEstoq", "cIdLocEstoq", "cCodLocalEstoque"];
    for (const tag of tagsPossiveis) {
      const produtos_alterar = produtos_incluir.map((p) => ({
        cCodIntItem: p.cCodIntItem,
        [tag]: localEstoqueCodigo,
      }));
      try {
        const resp = await fetch(OMIE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            call: "AlterarPedCompra",
            app_key: appKey,
            app_secret: appSecret,
            param: [{ cabecalho_alterar: { nCodPed: data.nCodPed }, produtos_alterar }],
          }),
        });
        const altData = await resp.json();
        if (!altData.faultstring) {
          localAplicado = true;
          break;
        }
        localErro = altData.faultstring;
        if (!/não faz parte|nao faz parte/i.test(localErro)) break;
      } catch (e) {
        localErro = e?.message || "erro de rede";
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
    omie_response: data,
  };
}
