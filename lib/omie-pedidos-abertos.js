// Lista pedidos de venda (Medições) EM ABERTO/ATRASADO do Omie,
// com o PROJETO (obra) de cada um.
//
// Omie: /produtos/pedido/ ListarPedidos  + /geral/projetos/ ListarProjetos
//   - etapa 10/20/50 = em aberto; 60 = faturado; 70 = cancelado
//   - informacoes_adicionais.codProj → nome do projeto ("OP-078 - Danpower - ENC 328")
//   - total_pedido.valor_total_pedido = valor
//   - cabecalho.data_previsao → atrasado se < hoje

const URL_PEDIDO   = "https://app.omie.com.br/api/v1/produtos/pedido/";
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

/**
 * Retorna os pedidos de venda em aberto/atrasado com o projeto (obra).
 * @param {boolean} forcar - ignora o cache
 */
export async function listarPedidosVendaAbertos(forcar = false) {
  if (!forcar && resCache.data && Date.now() - resCache.ts < 600_000) {
    return { ...resCache.data, doCache: true };
  }
  const projMap = await getProjetoMap();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const pedidos = [];
  const MAX_PAGINAS = 30; // trava de segurança
  for (let pg = 1; pg <= MAX_PAGINAS; pg++) {
    const d = await omie(URL_PEDIDO, "ListarPedidos", {
      pagina: pg, registros_por_pagina: 50, apenas_importado_api: "N",
    });
    for (const p of (d.pedido_venda_produto || [])) {
      const cab = p.cabecalho || {};
      const etapa = String(cab.etapa || "");
      if (!ETAPAS_ABERTAS.has(etapa)) continue;

      const codProj   = Number(p.informacoes_adicionais?.codProj || 0);
      const projeto   = codProj ? (projMap.get(codProj) || `Projeto ${codProj}`) : null;
      const dataPrev  = parseBR(cab.data_previsao);
      const atrasado  = !!(dataPrev && dataPrev < hoje);

      pedidos.push({
        codigoPedido: cab.codigo_pedido,
        numero:       String(cab.numero_pedido || ""),
        projeto,
        numeroOp:     numeroOpDoProjeto(projeto),
        valor:        Number(p.total_pedido?.valor_total_pedido || 0),
        dataPrevisao: dataPrev,
        etapa,
        status:       ETAPAS[etapa] || `Etapa ${etapa}`,
        atrasado,
      });
    }
    if (pg >= Number(d.total_de_paginas || 1)) break;
  }

  // Ordena: atrasados primeiro, depois por data de previsão
  pedidos.sort((a, b) => {
    if (a.atrasado !== b.atrasado) return a.atrasado ? -1 : 1;
    return (a.dataPrevisao?.getTime() || 0) - (b.dataPrevisao?.getTime() || 0);
  });

  const totalValor    = pedidos.reduce((s, p) => s + p.valor, 0);
  const totalAtrasados = pedidos.filter(p => p.atrasado).length;

  const data = { pedidos, total: pedidos.length, totalValor, totalAtrasados, atualizadoEm: new Date().toISOString() };
  resCache = { data, ts: Date.now() };
  return data;
}
