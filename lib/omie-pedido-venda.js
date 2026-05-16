// Helper pra consultar Pedido de Venda no Omie (usado pra Medições).
// Usa endpoint /api/v1/produtos/pedido/ + call ConsultarPedido.
//
// Retorna o pedido normalizado pra OPMedicao OU { error } se falhar.

const OMIE_URL = "https://app.omie.com.br/api/v1/produtos/pedido/";

const ETAPAS = {
  10: "Não Faturado",
  20: "Pré-faturado",
  50: "Faturado parcialmente",
  60: "Faturado",
  70: "Cancelado",
  80: "Faturamento eletrônico",
};

/**
 * Consulta um pedido de venda no Omie pelo numero ou codigo.
 * @param {object} input - { numeroPedido?, codigoPedido? }
 */
export async function consultarPedidoVenda({ numeroPedido, codigoPedido } = {}) {
  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) {
    return { error: "Credenciais Omie nao configuradas (OMIE_APP_KEY/OMIE_APP_SECRET)." };
  }

  // Tenta consultar via varios formatos de filtro porque o Omie aceita
  // numero_pedido e codigo_pedido com diferentes regras dependendo da empresa.
  // Tenta em sequencia ate algum funcionar.
  const tentativas = [];
  if (codigoPedido) {
    tentativas.push({ codigo_pedido: Number(codigoPedido) });
  }
  if (numeroPedido) {
    const num = String(numeroPedido).trim();
    tentativas.push({ numero_pedido: num });
    // Se o numero tem "/", tenta tambem so a parte antes
    if (num.includes("/")) {
      tentativas.push({ numero_pedido: num.split("/")[0] });
    }
    // Tenta como codigo_pedido (numerico) caso o user tenha digitado o codigo
    const numNumerico = num.replace(/\D/g, "");
    if (numNumerico && numNumerico !== num) {
      tentativas.push({ codigo_pedido: Number(numNumerico) });
    }
  }
  if (tentativas.length === 0) return { error: "Informe numeroPedido ou codigoPedido." };

  let data = null;
  let res = null;
  let ultimoErro = null;
  for (let i = 0; i < tentativas.length; i++) {
    const param = tentativas[i];
    try {
      res = await fetch(OMIE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call: "ConsultarPedido",
          app_key: appKey,
          app_secret: appSecret,
          param: [param],
        }),
      });
      data = await res.json().catch(() => ({}));
      console.log(`[omie-pedido-venda] tentativa ${i+1}/${tentativas.length}`, JSON.stringify(param), "→ HTTP", res.status, "keys", Object.keys(data || {}).join(","));

      if (res.ok && !data.faultstring && (data.pedido_venda_produto?.cabecalho || data.cabecalho)) {
        // Funcionou
        break;
      }
      ultimoErro = data.faultstring || `HTTP ${res.status}`;
      data = null; // reset pra tentar proxima
    } catch (e) {
      ultimoErro = e.message;
    }
  }

  try {
    if (!data) {
      return {
        error: `Omie nao retornou o pedido de venda. ${ultimoErro || "Verifique se o numero existe."} Tentativas: ${tentativas.map((t) => JSON.stringify(t)).join(", ")}`,
        raw: null,
      };
    }
    if (data.faultstring) {
      return { error: data.faultstring, raw: data };
    }

    const cab = data?.pedido_venda_produto?.cabecalho || data?.cabecalho;
    const total = data?.pedido_venda_produto?.total_pedido || data?.totalPedido;
    const det = data?.pedido_venda_produto?.det || data?.det || [];
    const info = data?.pedido_venda_produto?.infoCadastro || data?.infoCadastro;
    const listaParcelas = data?.pedido_venda_produto?.lista_parcelas
      || data?.pedido_venda_produto?.listaParcelas
      || data?.lista_parcelas || [];

    if (!cab) {
      return { error: "Pedido nao encontrado no Omie.", raw: data };
    }

    const codigo = cab.codigo_pedido || cab.codigoPedido;
    const numero = cab.numero_pedido || cab.numeroPedido;
    const etapaRaw = cab.etapa || cab.etap_pedido || cab.cEtapa;
    const etapaNum = Number(etapaRaw) || 0;
    const dataEmissao = cab.data_previsao || info?.dInc || info?.dInclusao;

    const valorTotalPedido = Number(total?.valor_total_pedido || total?.valorTotalPedido || 0);
    const valorMercadorias = Number(total?.valor_mercadorias || total?.valorMercadorias || 0);

    // Calcula valor JA FATURADO das parcelas (pra Caso B onde o pedido pai
    // tem parcelas que viram medicoes a cada faturamento)
    let valorFaturadoAuto = 0;
    for (const p of listaParcelas) {
      const ehFaturada =
        Number(p.nFatura || p.numero_fatura || 0) > 0
        || p.cFaturado === "S"
        || p.cStatus === "FATURADA"
        || (p.dDtPagamento && p.dDtPagamento !== "" && p.dDtPagamento !== "00/00/0000");
      if (ehFaturada) {
        valorFaturadoAuto += Number(p.valor || p.nValor || p.valor_parcela || 0);
      }
    }

    // Decide qual valor usar como medicao:
    // - Se ha parcelas faturadas (Caso B: pedido pai com medicoes parciais) →
    //   usa soma das parcelas faturadas
    // - Se etapa = 60 (Faturado integralmente) → usa total do pedido
    // - Senao → usa total do pedido (Caso A: pedido = medicao unica)
    const usarFaturado = valorFaturadoAuto > 0;
    const valorMedicao = usarFaturado ? valorFaturadoAuto : valorTotalPedido;

    return {
      success: true,
      codigoPedido: String(codigo || ""),
      numeroPedido: String(numero || ""),
      data: dataEmissao ? parseDataBR(dataEmissao) : null,
      valorBruto: valorMedicao,
      valorLiquido: valorMercadorias,
      valorContratado: valorTotalPedido,
      valorFaturado: valorFaturadoAuto,
      etapa: String(etapaRaw || ""),
      status: ETAPAS[etapaNum] || `Etapa ${etapaRaw || "?"}`,
      qtdItens: Array.isArray(det) ? det.length : 0,
      observacao: cab.observacoes || cab.cObs || "",
      raw: data,
    };
  } catch (e) {
    return { error: "Falha ao chamar Omie: " + e.message };
  }
}

function parseDataBR(s) {
  if (!s) return null;
  // "20/03/2026" -> Date
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
  return new Date(s);
}
