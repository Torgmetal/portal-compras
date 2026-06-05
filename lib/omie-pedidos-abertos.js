// Lista pedidos de venda (Medições) EM ABERTO/ATRASADO do Omie,
// com o PROJETO (obra) de cada um.
//
// Omie: /produtos/pedido/ ListarPedidos  + /geral/projetos/ ListarProjetos
//   - etapa 10/20/50 = em aberto; 60 = faturado; 70 = cancelado
//   - informacoes_adicionais.codProj → nome do projeto ("OP-078 - Danpower - ENC 328")
//   - total_pedido.valor_total_pedido = valor
//   - cabecalho.data_previsao → atrasado se < hoje

const URL_PEDIDO   = "https://app.omie.com.br/api/v1/produtos/pedido/";
const URL_OS       = "https://app.omie.com.br/api/v1/servicos/os/";
const URL_PROJETOS = "https://app.omie.com.br/api/v1/geral/projetos/";

async function omie(url, call, param) {
  const key = process.env.OMIE_APP_KEY, secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("Credenciais Omie não configuradas (OMIE_APP_KEY/OMIE_APP_SECRET)");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json();
  if (data.faultstring) throw new Error(data.faultstring);
  return data;
}

// Cache do mapa de projetos (muda pouco) — 10 min
let projCache = { map: null, ts: 0 };
async function getProjetoMap() {
  if (projCache.map && Date.now() - projCache.ts < 600_000) return projCache.map;
  const map = new Map();
  for (let pg = 1; ; pg++) {
    const d = await omie(URL_PROJETOS, "ListarProjetos", { pagina: pg, registros_por_pagina: 100 });
    for (const c of (d.cadastro || [])) map.set(Number(c.codigo), String(c.nome || "").trim());
    if (pg >= Number(d.total_de_paginas || 1)) break;
  }
  projCache = { map, ts: Date.now() };
  return map;
}

const ETAPAS = {
  "10": "Não Faturado", "20": "Pré-faturado", "50": "Faturado parcial",
  "60": "Faturado", "70": "Cancelado", "80": "Faturamento eletrônico",
};
const ETAPAS_ABERTAS = new Set(["10", "20", "50"]);

function parseBR(s) {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`) : null;
}

// Extrai o número da OP do nome do projeto: "OP-078 - Danpower" → "078"
function numeroOpDoProjeto(nome) {
  const m = String(nome || "").match(/OP[-\s]*0*(\d+)/i);
  return m ? String(parseInt(m[1])).padStart(3, "0") : null;
}

// Cache do resultado (o Omie é lento ~37s pra listar pedidos) — 10 min
let resCache = { data: null, ts: 0 };
// Dedup de chamadas concorrentes (evita disparar 2x ao Omie → "Consumo redundante")
let emAndamento = null;

/**
 * Lista TODOS os pedidos de venda do Omie agrupados por OBRA (projeto),
 * com totais FATURADO vs A FATURAR. Mantém o vínculo pai (numero) → parcelas (sequencial).
 * @param {boolean} forcar - ignora o cache
 */
export async function listarPedidosVendaAbertos(forcar = false) {
  if (!forcar && resCache.data && Date.now() - resCache.ts < 600_000) {
    return { ...resCache.data, doCache: true };
  }
  // Se já há uma consulta rodando, reaproveita (não bate no Omie de novo)
  if (emAndamento) return emAndamento;

  emAndamento = (async () => {
    try {
      return await consultarOmie();
    } catch (e) {
      // Omie bloqueou por redundância → devolve o cache (mesmo vencido) se existir
      if (/REDUNDANT|redundante/i.test(e?.message || "") && resCache.data) {
        return { ...resCache.data, doCache: true, avisoOmie: e.message };
      }
      throw e;
    } finally {
      emAndamento = null;
    }
  })();
  return emAndamento;
}

async function consultarOmie() {
  const projMap = await getProjetoMap();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  // ── Coleta VENDAS (pedidos de produto) ──────────────────────────────────────
  const brutos = [];
  const MAX_PAGINAS = 30;
  for (let pg = 1; pg <= MAX_PAGINAS; pg++) {
    const d = await omie(URL_PEDIDO, "ListarPedidos", {
      pagina: pg, registros_por_pagina: 50, apenas_importado_api: "N",
    });
    for (const p of (d.pedido_venda_produto || [])) {
      const cab  = p.cabecalho || {};
      const info = p.infoCadastro || {};
      const cancelado = info.cancelado === "S", faturado = info.faturado === "S";
      const dataPrev  = parseBR(cab.data_previsao);
      brutos.push({
        origem: "venda",
        codProj: Number(p.informacoes_adicionais?.codProj || 0),
        codigoPedido: cab.codigo_pedido,
        numero: String(cab.numero_pedido || ""),
        sequencial: cab.sequencial != null ? String(cab.sequencial) : "0",
        valor: Number(p.total_pedido?.valor_total_pedido || 0),
        dataPrevisao: dataPrev, cancelado, faturado,
        atrasado: !!(dataPrev && dataPrev < hoje && !faturado && !cancelado),
        situacao: cancelado ? "Cancelado" : faturado ? "Faturado" : (ETAPAS[String(cab.etapa || "")] || "Em aberto"),
      });
    }
    if (pg >= Number(d.total_de_paginas || 1)) break;
  }

  // ── Coleta SERVIÇOS (Ordens de Serviço) ─────────────────────────────────────
  for (let pg = 1; pg <= MAX_PAGINAS; pg++) {
    const d = await omie(URL_OS, "ListarOS", {
      pagina: pg, registros_por_pagina: 50, apenas_importado_api: "N",
    });
    for (const os of (d.osCadastro || [])) {
      const cab  = os.Cabecalho || {};
      const info = os.InfoCadastro || {};
      const cancelado = info.cCancelada === "S", faturado = info.cFaturada === "S";
      const dataPrev  = parseBR(cab.dDtPrevisao);
      brutos.push({
        origem: "servico",
        codProj: Number(os.InformacoesAdicionais?.nCodProj || 0),
        codigoPedido: cab.nCodOS,
        numero: String(cab.cNumOS || ""),
        sequencial: "0",
        valor: Number(cab.nValorTotal || 0),
        dataPrevisao: dataPrev, cancelado, faturado,
        atrasado: !!(dataPrev && dataPrev < hoje && !faturado && !cancelado),
        situacao: cancelado ? "Cancelado" : faturado ? "Faturado" : "Em aberto",
      });
    }
    if (pg >= Number(d.total_de_paginas || 1)) break;
  }

  // ── Agrupa por obra (codProj), somando vendas + serviços ────────────────────
  const obrasMap = new Map();
  for (const p of brutos) {
    if (!obrasMap.has(p.codProj)) {
      obrasMap.set(p.codProj, {
        codProj: p.codProj,
        projeto: p.codProj ? (projMap.get(p.codProj) || `Projeto ${p.codProj}`) : "(Sem projeto)",
        numeroOp: p.codProj ? numeroOpDoProjeto(projMap.get(p.codProj)) : null,
        faturado: 0, aFaturar: 0, cancelado: 0, atrasado: false,
        temVenda: false, temServico: false,
        pedidos: new Map(), // chave origem+numero
      });
    }
    const o = obrasMap.get(p.codProj);
    if (p.cancelado)      o.cancelado += p.valor;
    else if (p.faturado)  o.faturado  += p.valor;
    else                  o.aFaturar  += p.valor;
    if (p.atrasado) o.atrasado = true;
    if (p.origem === "venda")   o.temVenda = true;
    if (p.origem === "servico") o.temServico = true;

    const chave = `${p.origem}-${p.numero}`;
    if (!o.pedidos.has(chave)) o.pedidos.set(chave, { numero: p.numero, origem: p.origem, faturado: 0, aFaturar: 0, parcelas: [] });
    const ped = o.pedidos.get(chave);
    if (!p.cancelado) { if (p.faturado) ped.faturado += p.valor; else ped.aFaturar += p.valor; }
    ped.parcelas.push({
      codigoPedido: p.codigoPedido, sequencial: p.sequencial, valor: p.valor,
      situacao: p.situacao, atrasado: p.atrasado, dataPrevisao: p.dataPrevisao,
    });
  }

  // Serializa
  const obras = [...obrasMap.values()].map(o => ({
    ...o,
    total: o.faturado + o.aFaturar,
    pctFaturado: (o.faturado + o.aFaturar) > 0 ? Math.round((o.faturado / (o.faturado + o.aFaturar)) * 100) : 0,
    tipo: o.temVenda && o.temServico ? "Venda+Serviço" : o.temServico ? "Serviço" : "Venda",
    pedidos: [...o.pedidos.values()].map(ped => ({
      ...ped,
      parcelas: ped.parcelas.sort((a, b) => Number(a.sequencial) - Number(b.sequencial)),
    })).sort((a, b) => (a.origem || "").localeCompare(b.origem || "") || Number(a.numero) - Number(b.numero)),
  })).sort((a, b) => b.aFaturar - a.aFaturar); // mais a faturar primeiro

  const totalFaturado = obras.reduce((s, o) => s + o.faturado, 0);
  const totalAFaturar = obras.reduce((s, o) => s + o.aFaturar, 0);

  // Lista COMPLETA de projetos do Omie (para vincular NFS-e a obras que ainda
  // não têm pedido/OS no Omie — ex: só têm nota avulsa da prefeitura).
  const projetos = [...projMap.entries()]
    .map(([codProj, nome]) => ({ codProj, nome }))
    .filter(p => p.codProj && p.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));

  const data = {
    obras,
    projetos,
    totalObras: obras.length,
    totalFaturado, totalAFaturar,
    totalContratado: totalFaturado + totalAFaturar,
    obrasComAtraso: obras.filter(o => o.atrasado).length,
    atualizadoEm: new Date().toISOString(),
  };
  resCache = { data, ts: Date.now() };
  return data;
}
