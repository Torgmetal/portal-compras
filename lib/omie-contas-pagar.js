// Sincronização das Contas a Pagar do Omie → tabela local ContaPagar.
// Listagem dá os campos core; o detalhe (ConsultarContaPagar) traz observação,
// número do pedido de compra, projeto e chave NFe (só pras abertas/alteradas).
import { prismaDirect } from "./prisma.js";

const URL_CP        = "https://app.omie.com.br/api/v1/financas/contapagar/";
const URL_CLIENTES  = "https://app.omie.com.br/api/v1/geral/clientes/";
const URL_CATEGORIAS = "https://app.omie.com.br/api/v1/geral/categorias/";

async function omie(url, call, param) {
  const key = process.env.OMIE_APP_KEY, secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("Credenciais Omie não configuradas");
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

function parseBR(s) {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000-03:00`) : null;
}
const numf = (v) => { const n = parseFloat(String(v ?? "0").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// ── Mapas de apoio (fornecedor + categoria) — cache 30 min ──────────────────
let mapasCache = { fornecedores: null, categorias: null, ts: 0 };
async function getMapas() {
  if (mapasCache.fornecedores && Date.now() - mapasCache.ts < 30 * 60 * 1000) return mapasCache;

  const fornecedores = new Map();
  for (let pg = 1; pg <= 500; pg++) {
    const d = await omie(URL_CLIENTES, "ListarClientesResumido", {
      pagina: pg, registros_por_pagina: 500, apenas_importado_api: "N",
    });
    for (const c of (d.clientes_cadastro_resumido || [])) {
      const nome = (c.nome_fantasia || c.razao_social || "").trim();
      if (c.codigo_cliente) fornecedores.set(Number(c.codigo_cliente), nome);
    }
    if (pg >= Number(d.total_de_paginas || 1)) break;
  }

  const categorias = new Map();
  try {
    for (let pg = 1; pg <= 200; pg++) {
      const d = await omie(URL_CATEGORIAS, "ListarCategorias", { pagina: pg, registros_por_pagina: 500 });
      for (const c of (d.categoria_cadastro || [])) {
        categorias.set(String(c.codigo || ""), (c.descricao || c.descricao_padrao || "").trim());
      }
      if (pg >= Number(d.total_de_paginas || 1)) break;
    }
  } catch { /* categorias não-fatal */ }

  mapasCache = { fornecedores, categorias, ts: Date.now() };
  return mapasCache;
}

// Normaliza um registro da listagem → campos da ContaPagar
function normalizar(c, mapas) {
  const status = String(c.status_titulo || "").toUpperCase();
  return {
    id: String(c.codigo_lancamento_omie),
    fornecedorCodigo: c.codigo_cliente_fornecedor ? String(c.codigo_cliente_fornecedor) : null,
    fornecedorNome: mapas.fornecedores.get(Number(c.codigo_cliente_fornecedor)) || null,
    valor: numf(c.valor_documento),
    valorPago: numf(c.valor_pag),
    dataEmissao: parseBR(c.data_emissao),
    dataVencimento: parseBR(c.data_vencimento),
    dataPrevisao: parseBR(c.data_previsao),
    numeroDocumento: c.numero_documento || null,
    numeroDocFiscal: c.numero_documento_fiscal || null,
    numeroParcela: c.numero_parcela || null,
    categoriaCodigo: c.codigo_categoria || null,
    categoriaNome: mapas.categorias.get(String(c.codigo_categoria || "")) || c.codigo_categoria || null,
    tipoDocumento: c.codigo_tipo_documento || null,
    status,
    contaCorrenteId: c.id_conta_corrente ? String(c.id_conta_corrente) : null,
    dataAlteracaoOmie: parseBR(c.info?.dAlt) || null,
  };
}

const ABERTA = (st) => st && !["PAGO", "CANCELADO", "LIQUIDADO", "PAGAMENTO PARCIAL"].includes(st);

// Busca o detalhe (observação, nº pedido, projeto, chave NFe)
async function enriquecerDetalhe(id) {
  try {
    const d = await omie(URL_CP, "ConsultarContaPagar", { codigo_lancamento_omie: Number(id) });
    return {
      observacao: (d.observacao || "").trim() || null,
      numeroPedidoCompra: (d.numero_pedido || "").trim() || null,
      projetoCodigo: d.codigo_projeto ? String(d.codigo_projeto) : null,
      chaveNfe: (d.chave_nfe || "").trim() || null,
      detalheCarregado: true,
    };
  } catch { return { detalheCarregado: false }; }
}

const fmtBR = (d) => { const p = n => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };

/**
 * Sincroniza Contas a Pagar do Omie para a tabela local.
 * @param {{ incremental?: boolean, maxDetalhe?: number }} opts
 *   incremental: puxa só o que foi alterado/incluído desde o último sync.
 *   maxDetalhe: teto de detalhes (observação/pedido) a buscar nesta rodada.
 */
export async function sincronizarContasPagar({ incremental = true, maxDetalhe = 120, orcamentoMs = 45000 } = {}) {
  const t0 = Date.now();
  const mapas = await getMapas();
  const estado = await prismaDirect.omieSyncState.findUnique({ where: { id: "contapagar" } });

  // Janela do incremental: desde o último sync (com folga de 1 dia) até hoje.
  let filtroData = {};
  if (incremental && estado?.ultimoSync) {
    const desde = new Date(estado.ultimoSync.getTime() - 24 * 60 * 60 * 1000);
    filtroData = { filtrar_por_data_de: fmtBR(desde), filtrar_por_data_ate: fmtBR(new Date()) };
  }

  // Coleta (alteração + inclusão para o incremental; tudo para o full)
  const registros = new Map(); // id → registro cru
  const modos = incremental ? ["alteracao", "inclusao"] : ["full"];
  for (const modo of modos) {
    const extra = modo === "alteracao" ? { ...filtroData, filtrar_apenas_alteracao: "S" }
      : modo === "inclusao" ? { ...filtroData, filtrar_apenas_inclusao: "S" }
      : {};
    for (let pg = 1; pg <= 5000; pg++) {
      const d = await omie(URL_CP, "ListarContasPagar", {
        pagina: pg, registros_por_pagina: 500, apenas_importado_api: "N", ...extra,
      });
      for (const c of (d.conta_pagar_cadastro || [])) registros.set(String(c.codigo_lancamento_omie), c);
      if (pg >= Number(d.total_de_paginas || 1)) break;
    }
  }

  // Upsert em massa dos campos core
  let maiorAlteracao = estado?.ultimaAlteracao || null;
  const ids = [...registros.keys()];
  for (const [, c] of registros) {
    const dados = normalizar(c, mapas);
    if (dados.dataAlteracaoOmie && (!maiorAlteracao || dados.dataAlteracaoOmie > maiorAlteracao)) {
      maiorAlteracao = dados.dataAlteracaoOmie;
    }
    await prismaDirect.contaPagar.upsert({
      where: { id: dados.id },
      create: { ...dados, syncedAt: new Date() },
      update: { ...dados, syncedAt: new Date() },
    });
  }

  // Grava o estado AGORA — timestamp + dados core garantidos mesmo que o
  // enriquecimento de detalhe (abaixo) estoure o orçamento de tempo / o limite
  // de 60s da função no Vercel. Antes, o detalhe rodava antes deste upsert e,
  // quando estourava o tempo, o ultimoSync nunca era atualizado.
  const total = await prismaDirect.contaPagar.count();
  await prismaDirect.omieSyncState.upsert({
    where: { id: "contapagar" },
    create: { id: "contapagar", ultimoSync: new Date(), ultimaAlteracao: maiorAlteracao, totalRegistros: total },
    update: { ultimoSync: new Date(), ultimaAlteracao: maiorAlteracao, totalRegistros: total },
  });

  // Enriquece detalhe das ABERTAS sem detalhe ainda, dentro do orçamento de tempo.
  // Cada ConsultarContaPagar é sequencial (~0,7s); paramos antes de estourar 60s.
  let detalhados = 0;
  if (Date.now() - t0 < orcamentoMs) {
    const aEnriquecer = await prismaDirect.contaPagar.findMany({
      where: { detalheCarregado: false, status: { notIn: ["PAGO", "CANCELADO", "LIQUIDADO"] } },
      select: { id: true }, take: maxDetalhe, orderBy: { dataVencimento: "asc" },
    });
    for (const { id } of aEnriquecer) {
      if (Date.now() - t0 > orcamentoMs) break;
      const det = await enriquecerDetalhe(id);
      await prismaDirect.contaPagar.update({ where: { id }, data: det }).catch(() => {});
      detalhados++;
    }
  }

  return { sincronizados: ids.length, detalhados, total };
}
