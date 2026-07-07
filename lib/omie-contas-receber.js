// Sincronização das Contas a Receber do Omie → tabela local ContaReceber.
//
// Fonte: financas/mf (movimentos financeiros) com cNatureza="R". Diferente do
// financas/contareceber, o mf expõe o SALDO em aberto (nValAberto) e o valor
// recebido (nValPago) — então captura corretamente os títulos "recebidos
// parcialmente" (status RECEBIDO no Omie, mas com saldo a receber). Foi a única
// fonte que bate com o painel do Omie (23 atrasadas / R$ 242.047,19).
//
// O mf pagina de 100 em 100 e satura sob rajada; usamos cNatureza="R" (≈2200
// movimentos / ~22 páginas) + um respiro entre páginas pra evitar rate-limit.
import { prismaDirect } from "./prisma.js";

const URL_MF        = "https://app.omie.com.br/api/v1/financas/mf/";
const URL_CLIENTES  = "https://app.omie.com.br/api/v1/geral/clientes/";
const URL_CATEGORIAS = "https://app.omie.com.br/api/v1/geral/categorias/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Erros/faults TEMPORÁRIOS do Omie que valem retry em vez de derrubar o cron:
// - rate-limit: método já em execução ("Já existe uma requisição...") / consumo
//   redundante (a própria msg pede "Aguarde N segundos");
// - instabilidade do servidor: "SOAP-ERROR: Broken response from Application
//   Server (BG)" e afins. Também tratamos corpo não-JSON e timeout como transitórios.
const FAULT_RETRY = /sendo executada|Consumo (redundante|indevido)|tente novamente|tentar novamente|SOAP-00097|em processamento|Broken response|Application Server|SOAP-ERROR/i;
const MAX_TENTATIVAS = 5;

async function omie(url, call, param, tentativa = 0) {
  const key = process.env.OMIE_APP_KEY, secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("Credenciais Omie não configuradas");

  // Espera respeitando o "Aguarde N segundos" do Omie; senão backoff progressivo.
  const retry = async (msg) => {
    if (tentativa >= MAX_TENTATIVAS) throw new Error(msg);
    const m = /aguarde\s+(\d+)\s*segundo/i.exec(msg);
    const espera = m ? Math.min(Number(m[1]) + 2, 60) * 1000 : 1500 * (tentativa + 1);
    await sleep(espera);
    return omie(url, call, param, tentativa + 1);
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    return retry(e?.message || "Falha de rede no Omie"); // timeout/rede → transitório
  }

  // Corpo pode vir quebrado (não-JSON) no "Broken response" — trata como transitório.
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { return retry(`Resposta inválida do Omie (HTTP ${res.status})`); }

  if (data.faultstring) {
    if (FAULT_RETRY.test(data.faultstring)) return retry(data.faultstring);
    throw new Error(data.faultstring);
  }
  return data;
}

function parseBR(s) {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000-03:00`) : null;
}
const numf = (v) => { const n = parseFloat(String(v ?? "0").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// ── Mapas de apoio (cliente + categoria) — cache 30 min ─────────────────────
let mapasCache = { clientes: null, categorias: null, ts: 0 };
async function getMapas() {
  if (mapasCache.clientes && Date.now() - mapasCache.ts < 30 * 60 * 1000) return mapasCache;

  const clientes = new Map();
  for (let pg = 1; pg <= 500; pg++) {
    const d = await omie(URL_CLIENTES, "ListarClientesResumido", {
      pagina: pg, registros_por_pagina: 500, apenas_importado_api: "N",
    });
    for (const c of (d.clientes_cadastro_resumido || [])) {
      const nome = (c.nome_fantasia || c.razao_social || "").trim();
      if (c.codigo_cliente) clientes.set(Number(c.codigo_cliente), nome);
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

  mapasCache = { clientes, categorias, ts: Date.now() };
  return mapasCache;
}

// Normaliza um movimento financeiro (natureza R) → campos da ContaReceber
function normalizar(mv, mapas) {
  const det = mv.detalhes || {}, res = mv.resumo || {};
  const status = String(det.cStatus || "").toUpperCase();
  return {
    id: String(det.nCodTitulo),
    clienteCodigo: det.nCodCliente ? String(det.nCodCliente) : null,
    clienteNome: mapas.clientes.get(Number(det.nCodCliente)) || null,
    valor: numf(det.nValorTitulo),
    valorRecebido: numf(res.nValPago),
    saldo: numf(res.nValAberto),
    dataEmissao: parseBR(det.dDtEmissao),
    dataVencimento: parseBR(det.dDtVenc),
    dataPrevisao: parseBR(det.dDtPrevisao),
    numeroDocumento: det.cNumTitulo || null,
    numeroDocFiscal: det.cNumDocFiscal || null,
    numeroParcela: det.cNumParcela || null,
    numeroOS: det.cNumOS || null,
    categoriaCodigo: det.cCodCateg || null,
    categoriaNome: mapas.categorias.get(String(det.cCodCateg || "")) || det.cCodCateg || null,
    tipoDocumento: det.cTipo || null,
    status,
    contaCorrenteId: det.nCodCC ? String(det.nCodCC) : null,
  };
}

/**
 * Sincroniza Contas a Receber (movimentos financeiros natureza R) do Omie.
 * @param {{ orcamentoMs?: number }} opts
 */
export async function sincronizarContasReceber({ orcamentoMs = 50000 } = {}) {
  const t0 = Date.now();
  const mapas = await getMapas();

  // Coleta todos os movimentos natureza R (paginação de 100; respiro entre
  // páginas pra não saturar o mf). Para no orçamento de tempo.
  //
  // Um título (nCodTitulo) aparece em vários movimentos (emissão + baixas).
  // O saldo em aberto (nValAberto) fica numa única linha; as demais vêm 0.
  // Então, por título, guardamos o movimento com MAIOR nValAberto — a linha
  // que carrega o saldo a receber (e o nValPago coerente).
  const registros = new Map();
  for (let pg = 1; pg <= 1000; pg++) {
    const d = await omie(URL_MF, "ListarMovimentos", { nPagina: pg, nRegPorPagina: 100, cNatureza: "R" });
    for (const mv of (d.movimentos || [])) {
      const cod = mv?.detalhes?.nCodTitulo;
      if (!cod) continue;
      const k = String(cod);
      const ant = registros.get(k);
      const abertoNovo = Number(mv?.resumo?.nValAberto || 0);
      const abertoAnt = Number(ant?.resumo?.nValAberto || 0);
      if (!ant || abertoNovo > abertoAnt) registros.set(k, mv);
    }
    if (pg >= Number(d.nTotPaginas || 1)) break;
    if (Date.now() - t0 > orcamentoMs) break;
    await sleep(120);
  }

  // Upsert em massa
  const ids = [...registros.keys()];
  for (const [, mv] of registros) {
    const dados = normalizar(mv, mapas);
    if (!dados.id || dados.id === "null") continue;
    await prismaDirect.contaReceber.upsert({
      where: { id: dados.id },
      create: { ...dados, syncedAt: new Date() },
      update: { ...dados, syncedAt: new Date() },
    });
  }

  const total = await prismaDirect.contaReceber.count();
  await prismaDirect.omieSyncState.upsert({
    where: { id: "contareceber" },
    create: { id: "contareceber", ultimoSync: new Date(), totalRegistros: total },
    update: { ultimoSync: new Date(), totalRegistros: total },
  });

  return { sincronizados: ids.length, total };
}
