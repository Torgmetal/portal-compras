// Helper pra consultar Ordem de Servico no Omie (usado pra Medições de serviço).
// Endpoint: /api/v1/servicos/os/ + call ConsultarOS
//
// Retorna a OS normalizada pra OPMedicao OU { error } se falhar.

const OMIE_URL = "https://app.omie.com.br/api/v1/servicos/os/";

// Etapas comuns da OS no Omie (codigos podem variar por empresa).
// O Omie nao tem etapa unica fixa pra OS — geralmente eh status livre.
const ETAPAS = {
  10: "Cadastrada",
  20: "Em digitação",
  30: "Aprovada",
  40: "Faturada",
  50: "Cancelada",
  60: "Concluída",
};

/**
 * Consulta uma OS no Omie pelo numero.
 * @param {object} input - { numero?, codigo? }
 */
export async function consultarOrdemServico({ numero, codigo } = {}) {
  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) {
    return { error: "Credenciais Omie nao configuradas (OMIE_APP_KEY/OMIE_APP_SECRET)." };
  }

  // O Omie aceita filtro por nNumOS (numero) ou nCodOS (codigo interno).
  // A chamada eh ConsultarOS dentro de servicos/os/
  const param = {};
  if (codigo) param.nCodOS = Number(codigo);
  else if (numero) param.cNumOS = String(numero).trim();
  else return { error: "Informe numero ou codigo da OS." };

  try {
    const res = await fetch(OMIE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ConsultarOS",
        app_key: appKey,
        app_secret: appSecret,
        param: [param],
      }),
    });
    const data = await res.json().catch(() => ({}));
    // Log pra ajudar a debugar quando algo der errado no Vercel
    console.log("[omie-os] HTTP", res.status, "param", JSON.stringify(param), "keys", Object.keys(data || {}).join(","));

    if (!res.ok || data.faultstring) {
      return {
        error:
          data.faultstring ||
          `Omie respondeu HTTP ${res.status}. Verifique se a OS existe.`,
        status: res.status,
        raw: data,
      };
    }

    // Estrutura tipica de retorno de OS no Omie. Tenta varios formatos
    // possiveis pra robustez.
    const cab = data?.Cabecalho || data?.cabecalho || data?.ListarOS?.[0]?.Cabecalho;
    const info = data?.InformacoesAdicionais || data?.infoCadastro;
    const det = data?.ServicosPrestados || data?.servicos || data?.Servico || [];

    if (!cab) {
      console.error("[omie-os] cabecalho nao encontrado. Top-level keys:", Object.keys(data || {}));
      return {
        error: "OS nao encontrada no Omie ou retorno inesperado.",
        raw: data,
      };
    }

    const codigoOS = cab.nCodOS || cab.codigo_os || cab.codigoOS;
    const numeroOS = cab.cNumOS || cab.numero_os || cab.numeroOS;
    const etapa = cab.cEtapa || cab.etapa;
    const dataEmissao = cab.dDtPrevisao || cab.dDtEmissao || info?.dInc;
    // Valor total: testa varios campos possiveis
    const valorTotal = Number(
      cab.nValorTotal ||
      cab.valor_total ||
      cab.nValorOS ||
      data?.Total?.nValorOS ||
      data?.Total?.nValorTotal ||
      data?.total?.valor_total ||
      0
    );

    return {
      success: true,
      codigoPedido: String(codigoOS || ""),
      numeroPedido: String(numeroOS || ""),
      data: dataEmissao ? parseDataBR(dataEmissao) : null,
      valorBruto: valorTotal,
      valorLiquido: valorTotal,
      etapa: String(etapa || ""),
      status: ETAPAS[Number(etapa)] || `Etapa ${etapa || "?"}`,
      qtdItens: Array.isArray(det) ? det.length : 0,
      observacao: cab.cObservacao || cab.observacao || "",
      raw: data,
    };
  } catch (e) {
    console.error("[omie-os] excecao:", e?.message);
    return { error: "Falha ao chamar Omie: " + e.message };
  }
}

function parseDataBR(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
  return new Date(s);
}
