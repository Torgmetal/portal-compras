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

    const det = itens.map((item, idx) => ({
      ide: { codigo_item_integracao: codigoPedidoIntegracao + "-" + (idx + 1) },
      produto: {
        codigo_produto: Number(item.codigo) || 0,
        descricao: item.descricao || "",
        quantidade: Number(item.qtd) || 0,
        valor_unitario: Number(item.precoUnit) || 0,
        tipo_desconto: "V",
        valor_desconto: 0,
        unidade: item.unidade || "KG"
      }
    }));

    const payload = {
      call: "IncluirPedidoCompra",
      app_key: appKey,
      app_secret: appSecret,
      param: [{
        cabecalho: {
          codigo_pedido_integracao: codigoPedidoIntegracao,
          numero_pedido: "",
          codigo_cliente_fornecedor: 0,
          data_previsao: dataPrevisao,
          quantidade_itens: itens.length,
          etapa: "10"
        },
        det: det,
        frete: { modalidade: "9" },
        observacoes: { obs_venda: observacao || "" },
        informacoes_adicionais: {
          codigo_categoria: "",
          codigo_conta_corrente: 0,
          consumidor_final: "N",
          utilizar_emails: "N"
        }
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
      codigo_pedido: data.codigo_pedido || data.numero_pedido || "",
      codigo_pedido_integracao: codigoPedidoIntegracao,
      numero_pedido: data.numero_pedido || "",
      omie_response: data
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
