import { NextResponse } from "next/server";

const OMIE_URL = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";
const OMIE_PROD_URL = "https://app.omie.com.br/api/v1/geral/produtos/";

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

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      itens,
      observacao,
      nCodFor,
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

    const codigoPedidoIntegracao = "PC-" + Date.now();
    const dataPrevisao = dDtPrevisao || hojeDDMMYYYY();
    const categoria = cCodCateg && String(cCodCateg).trim() ? String(cCodCateg).trim() : "2.01.02";

    const produtos_incluir = [];
    for (let idx = 0; idx < itens.length; idx++) {
      const item = itens[idx];
      const nCodProd = await resolverProduto(item.codigo, appKey, appSecret);
      const produto = {
        cCodIntItem: codigoPedidoIntegracao + "-" + (idx + 1),
        nCodProd,
        cDescricao: item.descricao || "",
        cUnidade: item.unidade || "KG",
        nQtde: Number(item.qtd) || 0,
        nValUnit: Number(item.precoUnit) || 0,
        nDesconto: 0,
      };
      // Local de estoque por item (Omie permite override por linha)
      if (cCodLocalEstoque && String(cCodLocalEstoque).trim()) {
        produto.cCodLocalEstoque = String(cCodLocalEstoque).trim();
      }
      // IPI por item, se informado
      if (item.ipiPct != null && Number(item.ipiPct) > 0) {
        produto.nValorIpi = Number(item.precoUnit) * Number(item.qtd) * (Number(item.ipiPct) / 100);
      }
      produtos_incluir.push(produto);
    }

    // Observação interna inclui prazo de pagamento + conta corrente desejada
    // + info adicional (RM, fornecedor, etc) — comprador completa no Omie.
    const obsPartes = [];
    if (prazoPagamento) obsPartes.push(`Prazo pagto: ${prazoPagamento}`);
    if (cContaCorrente) obsPartes.push(`Conta: ${cContaCorrente}`);
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
      cInfAdic: cInfAdic || "",
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
          payload_enviado: payload,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      codigo_pedido: data.nCodPed || "",
      codigo_pedido_integracao: codigoPedidoIntegracao,
      numero_pedido: data.cNumero || data.cNumPedido || "",
      omie_response: data,
    });
  } catch (err) {
    console.error("omie pedido-compra error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
