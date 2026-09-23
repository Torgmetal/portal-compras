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
    // ⚠⚠ RESPOSTA QUEBRADA NÃO PODE VIRAR "NÃO TEM NF" (achado do Codex, 23/09/2026). Antes, um
    // corpo que não é JSON caía em `{}`, e `{}` seguia direto para o `return { nf: null }` lá
    // embaixo — indistinguível de um pedido legitimamente não faturado. Enquanto isso só
    // alimentava a coluna "nº da NF" era um campo vazio; para a conferência da cadeia vira
    // **ausência declarada de um documento fiscal**, que é outra coisa.
    //
    // ⚠⚠⚠ MAS O STATUS HTTP NÃO SERVE DE CRITÉRIO, E EU ERREI ISSO PRIMEIRO. Medido contra o Omie
    // em 23/09/2026: `ConsultarNF` de um pedido sem nota responde **HTTP 500** com
    // `{"faultstring":"ERROR: NF não cadastrada para o pedido […]"}` — ou seja, o caso NORMAL de
    // "ainda não faturado" chega como 500. Cortar em `!resp.ok` trocava um defeito pelo seu
    // espelho: em vez de erro virando ausência, ausência virava erro, e TODA medição da obra
    // aparecia como falha de consulta. O corpo manda; o status só fala quando o corpo se cala.
    const corpo = await resp.text();
    try {
      data = JSON.parse(corpo);
    } catch {
      return { error: `O Omie devolveu HTTP ${resp.status} com um corpo que não é JSON ao consultar a NF.` };
    }
    if (!resp.ok && !data?.faultstring) {
      return { error: `Omie respondeu HTTP ${resp.status} sem explicação ao consultar a NF.` };
    }
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
      natureza: ide.natOp || null,
      situacao: situacaoDaNf(compl),
      cfops: cfopsDosItens(data.det),
    },
  };
}

/**
 * OS CFOPs DOS ITENS — e `null` quando não deu para ler.
 *
 * ⚠⚠ LISTA VAZIA E "NÃO CONSEGUI LER" SÃO COISAS DIFERENTES. A nota sem nenhum CFOP legível não
 * pode casar etapa nenhuma da cadeia, mas também não pode servir de prova de que a etapa não
 * existe: ela REDUZ a cobertura da conferência. Por isso `null`, e não `[]`.
 *
 * ⚠ Uma nota tem vários itens e eles podem ter CFOPs diferentes — o critério é "a nota CONTÉM item
 * com este CFOP", nunca "o CFOP da nota".
 */
function cfopsDosItens(det) {
  if (!Array.isArray(det) || det.length === 0) return null;
  const achados = new Set();
  for (const d of det) {
    const p = d?.produto ?? d?.prod ?? {};
    const c = String(p.cfop ?? p.CFOP ?? "").replace(/\D/g, "");
    if (c.length === 4) achados.add(c);
  }
  return achados.size ? [...achados] : null;
}

/** ⚠ Nota cancelada é evidência, nunca cumprimento de etapa — quem decide isso é a conferência. */
function situacaoDaNf(compl) {
  const st = String(compl?.cStat ?? "").trim();
  if (["101", "135", "151", "155"].includes(st)) return "CANCELADA";
  if (st === "100") return "AUTORIZADA";
  return st ? `cStat ${st}` : null;
}
