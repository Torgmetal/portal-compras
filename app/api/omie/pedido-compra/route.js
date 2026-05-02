import { NextResponse } from "next/server";

const OMIE_URL = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";
const OMIE_PROD_URL = "https://app.omie.com.br/api/v1/geral/produtos/";
const OMIE_CLIENTES_URL = "https://app.omie.com.br/api/v1/geral/clientes/";

export const runtime = "nodejs";
export const maxDuration = 30;

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

// Busca o codigo_cliente_omie de um fornecedor pelo CNPJ.
// Omie trata clientes e fornecedores na mesma tabela (clientes_cadastro).
// Usa ListarClientesResumido com filtro de CNPJ — só uma chamada, evita
// rate limit "REDUNDANT" do Omie.
// Devolve { codigo, error? } pra caller persistir o código resolvido.
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
      error: `CNPJ ${cnpjLimpo} não encontrado no Omie (0 resultados em ListarClientesResumido).`,
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

// Omie aceita só 6 chars na unidade. Normaliza casos comuns brasileiros.
function normalizeUnidade(u) {
  if (!u) return "KG";
  let s = String(u).trim().toUpperCase();
  if (/M[²2]\b/.test(s)) return "M2";
  if (/^PE[CÇ]A?S?$/.test(s) || /^P[CÇ]\(?S?\)?$/.test(s)) return "PC";
  if (/BARRA/.test(s)) return "BR";
  if (/TONELADA?/.test(s)) return "TON";
  if (/PARES?/.test(s)) return "PAR";
  // Genérico: remove acentos + não-alfanuméricos, limita 6
  s = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
  return s.substring(0, 6) || "KG";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      itens,
      observacao,
      nCodFor: nCodForInput,
      cnpjFornecedor, // novo: tenta resolver via CNPJ se nCodFor não vier
      cNumPedido,
      nQtdeParc,
      cInfAdic,
      // Novos campos vindos do modal
      cCodLocalEstoque,
      cCodCateg,
      dDtPrevisao,
      cContaCorrente,
      prazoPagamento, // texto descritivo (ex "28 DDL")
    } = body;

    if (!itens || !itens.length) {
      return NextResponse.json({ error: "Nenhum item informado" }, { status: 400 });
    }

    const appKey = process.env.OMIE_APP_KEY;
    const appSecret = process.env.OMIE_APP_SECRET;
    if (!appKey || !appSecret) {
      return NextResponse.json(
        { error: "Credenciais Omie não configuradas no servidor (OMIE_APP_KEY / OMIE_APP_SECRET)" },
        { status: 500 }
      );
    }

    // Resolução do fornecedor: usa nCodFor diretamente se fornecido,
    // senão busca pelo CNPJ na API Omie (ConsultarCliente + fallback).
    let nCodFor = Number(nCodForInput) || 0;
    let lookupErro = "";
    if (!nCodFor && cnpjFornecedor) {
      const r = await resolverFornecedorPorCnpj(cnpjFornecedor, appKey, appSecret);
      nCodFor = r.codigo;
      lookupErro = r.error || "";
    }
    if (!nCodFor) {
      return NextResponse.json(
        {
          error:
            "Fornecedor não identificado. " +
            (lookupErro || "Cadastre o CNPJ ou código Omie do fornecedor antes de enviar."),
        },
        { status: 400 }
      );
    }

    const codigoPedidoIntegracao = "PC-" + Date.now();
    const dataPrevisao = dDtPrevisao || hojeDDMMYYYY();
    // Omie aceita só o CÓDIGO da categoria (max 20 chars), não a descrição.
    // Se o usuário digitar "3.1 Compra de matéria prima", extrai só "3.1".
    let categoria = String(cCodCateg || "").trim();
    const codMatch = categoria.match(/^[\d.]+/);
    if (codMatch) categoria = codMatch[0].replace(/\.$/, ""); // tira ponto final se sobrar
    if (categoria.length > 20) categoria = categoria.substring(0, 20);
    if (!categoria) categoria = "2.01.02"; // default seguro

    // produtos_incluir do IncluirPedCompra. Testamos 3 variantes de tag pra
    // local de estoque (cCodLocalEstoque, cCodLocEstoq, cIdLocEstoq) — todas
    // rejeitadas. IncluirPedCompra simplesmente nao aceita local nesse nivel.
    // Solucao: criar pedido sem local, depois chamar AlterarPedCompra pra
    // ajustar o local em cada item (Plano B — feito automaticamente abaixo).
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

    // Observação interna concentra dados que a API não aceita como tags
    // próprias (Omie é restrito sobre quais campos vão em cada estrutura).
    // Comprador completa o que precisar dentro do Omie depois.
    const obsPartes = [];
    if (prazoPagamento) obsPartes.push(`Prazo pagto: ${prazoPagamento}`);
    if (cContaCorrente) obsPartes.push(`Conta: ${cContaCorrente}`);
    if (cCodLocalEstoque) obsPartes.push(`Local estoque: ${cCodLocalEstoque}`);
    if (cInfAdic) obsPartes.push(`Info: ${cInfAdic}`);
    if (observacao) obsPartes.push(observacao);
    const obsCombinada = obsPartes.join(" | ");

    // cabecalho_incluir do IncluirPedCompra do Omie. Atenção: cContaCorrente
    // NÃO faz parte dessa estrutura (a API rejeita com "Tag [CCONTACORRENTE]
    // não faz parte da estrutura..."). A conta corrente é configurada nas
    // preferências do Omie ou na geração da NF, não no pedido de compra.
    // Por isso recebemos cContaCorrente mas só usamos pra registrar na
    // observação interna (cObsInt).
    const cabecalho = {
      cCodIntPed: codigoPedidoIntegracao,
      dDtPrevisao: dataPrevisao,
      nCodFor: nCodFor || 0,
      cNumPedido: cNumPedido || "",
      cCodCateg: categoria,
      cObsInt: obsCombinada,
      nQtdeParc: Number(nQtdeParc) || 1,
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

    const resp = await fetch(OMIE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();

    if (data.faultstring) {
      return NextResponse.json(
        {
          error: data.faultstring,
          codigo_pedido_integracao: codigoPedidoIntegracao,
          // Devolve o nCodFor mesmo em erro pra o client cachear no fornecedor
          // — assim retentativas não fazem novo lookup e evitam rate limit.
          nCodFor_resolvido: nCodFor,
          payload_enviado: payload,
        },
        { status: 400 }
      );
    }

    // Plano B pra local de estoque: depois do IncluirPedCompra criar o
    // pedido (sem local), chamamos AlterarPedCompra pra ajustar o local
    // em cada item. AlterarPedCompra costuma aceitar mais campos que
    // o Incluir. Testamos várias tags em fallback até alguma passar.
    let localAplicado = false;
    let localErro = "";
    if (localEstoqueCodigo && data.nCodPed) {
      // Espaça 1.5s pra evitar rate limit "REDUNDANT" no Omie
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
            break; // tag funcionou
          }
          localErro = altData.faultstring;
          // Se erro for de tag inexistente, tenta próxima
          if (!/não faz parte|nao faz parte/i.test(localErro)) break; // erro diferente, para de tentar
        } catch (e) {
          localErro = e?.message || "erro de rede";
          break;
        }
      }
    }

    return NextResponse.json({
      success: true,
      codigo_pedido: data.nCodPed || "",
      codigo_pedido_integracao: codigoPedidoIntegracao,
      numero_pedido: data.cNumero || data.cNumPedido || "",
      // Devolve o nCodFor resolvido pro client salvar no cadastro do
      // fornecedor — evita re-lookup nas próximas chamadas.
      nCodFor_resolvido: nCodFor,
      local_aplicado: localAplicado,
      local_erro: localAplicado ? null : localErro || null,
      omie_response: data,
    });
  } catch (err) {
    console.error("omie pedido-compra error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
