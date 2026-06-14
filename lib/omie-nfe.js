// Consulta a NF-e de produto (saída) emitida para um pedido de venda no Omie.
// Endpoint: produtos/nfconsultar / call ConsultarNF { nIdPedido }.
//
// IMPORTANTE: nIdPedido é o CÓDIGO INTERNO do pedido no Omie
// (OPMedicao.codigoPedidoOmie, ex.: 7779376728), NÃO o número do pedido
// (numeroPedidoOmie, ex.: "236"). Passar o número retorna
// "NF não cadastrada para o pedido".
//
// Retorna { nf } | { nf: null } (sem NF / ainda não faturado) | { error }.
const OMIE_NF_URL = "https://app.omie.com.br/api/v1/produtos/nfconsultar/";

const semZeros = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.replace(/^0+/, "") || s; // tira zeros à esquerda, mas não some com "0"
};

/**
 * @param {string|number} codigoPedidoOmie - código interno do pedido (nIdPedido)
 */
export async function consultarNFePorPedido(codigoPedidoOmie) {
  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) return { error: "Credenciais Omie não configuradas (OMIE_APP_KEY/OMIE_APP_SECRET)." };
  if (!codigoPedidoOmie) return { nf: null };

  let data;
  try {
    const resp = await fetch(OMIE_NF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ConsultarNF",
        app_key: appKey,
        app_secret: appSecret,
        param: [{ nIdPedido: Number(codigoPedidoOmie) }],
      }),
    });
    data = await resp.json().catch(() => ({}));
  } catch (e) {
    return { error: "Falha ao consultar NF no Omie: " + e.message };
  }

  if (data?.faultstring) {
    // pedido faturável ainda sem NF cadastrada → não é erro, só não tem NF
    if (/n[ãa]o cadastrada/i.test(data.faultstring)) return { nf: null };
    if (/REDUNDANT|redundante|Aguarde/i.test(data.faultstring)) {
      return { error: "O Omie está bloqueando consultas repetidas. Aguarde 1-2 minutos e tente de novo." };
    }
    return { error: "Omie: " + data.faultstring };
  }

  const ide = data.ide || {};
  const compl = data.compl || {};
  if (!ide.nNF && !compl.cChaveNFe) return { nf: null };

  return {
    nf: {
      numero: semZeros(ide.nNF),
      serie: semZeros(ide.serie),
      chave: compl.cChaveNFe || null,
      dataEmissao: ide.dEmi || null, // "DD/MM/YYYY"
      nIdNF: compl.nIdNF || null,
    },
  };
}
