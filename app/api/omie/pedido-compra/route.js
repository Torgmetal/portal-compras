import { NextResponse } from "next/server";

const OMIE_URL = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";

export async function POST(request) {
  try {
    const { itens, observacao } = await request.json();
    if (!itens || !itens.length) {
      return NextResponse.json({ error: "Nenhum item informado" }, { status: 400 });
    }

    const appKey = process.env.OMIE_APP_KEY;
    const appSecret = process.env.OMIE_APP_SECRET;
    if (!appKey || !appSecret) {
      return NextResponse.json({ error: "Credenciais Omie n\u00e3o configuradas" }, { status: 500 });
    }

    const codigoPedidoIntegracao = "PC-" + Date.now();
    const hoje = new Date();
    const dataPrevisao = String(hoje.getDate()).padStart(2, "0") + "/" + String(hoje.getMonth() + 1).padStart(2, "0") + "/" + hoje.getFullYear();

    const produtos_incluir = itens.map((item, idx) => ({
      cCodIntItem: codigoPedidoIntegracao + "-" + (idx + 1),
      nCodProd: Number(item.codigo) || 0,
      cDescricao: item.descricao || "",
      cUnidade: item.unidade || "KG",
      nQtde: Number(item.qtd) || 0,
      nValUnit: Number(item.precoUnit) || 0,
      nDesconto: 0
    }));

    const payload = {
      call: "IncluirPedCompra",
      app_key: appKey,
      app_secret: appSecret,
      param: [{
        cabecalho_incluir: {
          cCodIntPed: codigoPedidoIntegracao,
          dDtPrevisao: dataPrevisao,
          nCodFor: 0,
          cNumPedido: "",
            cObs: observacao || ""
        },
        produtos_incluir: produtos_incluir,
        frete_incluir: { nCodTransp: 0, cTpFrete: "9" },
      }]
    };

    const resp = await fetch(OMIE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();

    if (data.faultstring) {
      return NextResponse.json({ error: data.faultstring, codigo_pedido_integracao: codigoPedidoIntegracao }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      codigo_pedido: data.nCodPed || "",
      codigo_pedido_integracao: codigoPedidoIntegracao,
      numero_pedido: data.cNumero || data.cNumPedido || "",
      omie_response: data
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
