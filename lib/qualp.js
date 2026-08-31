import "server-only";
import { numeroBR } from "@/lib/numero-br";

// ─── FRETE PELA QUALP ─────────────────────────────────────────────────────────
// Vitor (23/08/2026): "conseguimos deixar uma forma de linkar com o site qualp.com.br para
// podermos fazer o cálculo para informar o valor do frete".
//
// A QualP calcula rota comercial, pedágio e a TABELA DE FRETE DA ANTT — o piso mínimo legal do
// transporte rodoviário de carga. Isso é melhor que estimar por quilo: o piso da ANTT depende de
// distância, número de eixos e tipo de carga, e é o número que o transportador usa para negociar.
//
// ⚠ PRECISA DE PLANO PAGO. A API é por assinatura (R$ 390 a R$ 702/mês em agosto/2026, conforme o
// número de consultas), e a chave sai do painel da QualP. Sem `QUALP_TOKEN` no ambiente, a rota
// devolve uma mensagem explicando isso em vez de falhar em silêncio — orçamento com frete errado
// é pior que orçamento sem frete.
//
// ⚠ E O CONTRATO É LIDO COM CUIDADO. A especificação OpenAPI publicada por eles é mínima (declara
// o endpoint e nada mais), então os nomes dos campos da resposta são procurados por VÁRIOS
// apelidos prováveis, e a resposta crua volta junto. Na primeira consulta de verdade dá para
// conferir o que veio e apertar o parser — melhor do que fingir que sei o formato exato.

const BASE = "https://api.qualp.com.br/rotas/v4";

/** Procura um número na resposta, aceitando os apelidos possíveis e caminhos aninhados. */
function achar(obj, caminhos) {
  for (const c of caminhos) {
    let v = obj;
    for (const parte of c.split(".")) {
      if (v == null) break;
      v = v[parte];
    }
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = numeroBR(v, NaN);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * Consulta rota, pedágio e piso ANTT.
 * @param {object} p { origem, destino, eixos, tipoVeiculo, cargaKg }
 */
export async function consultarFrete({ origem, destino, eixos = 6, tipoVeiculo = "caminhao", cargaKg = 0 } = {}) {
  const token = process.env.QUALP_TOKEN;
  if (!token) {
    return {
      ok: false,
      semChave: true,
      erro: "A consulta de frete precisa de uma assinatura da QualP. Contrate um plano em api.qualp.com.br e guarde a chave em QUALP_TOKEN.",
    };
  }
  if (!origem || !destino) return { ok: false, erro: "Informe origem e destino." };

  const params = new URLSearchParams({
    locations: JSON.stringify([origem, destino]),
    config: JSON.stringify({
      veiculo: { tipo: tipoVeiculo, eixos: Number(eixos) || 6 },
      rotas: { alternativa: false, otimizar: false },
      // ⚠ é `tabela_frete` que traz o piso da ANTT — sem ele, volta só distância e pedágio
      mostrar: { tabela_frete: true, pedagios: true, informacoes_da_rota: true },
    }),
    format: "json",
  });

  let bruto;
  try {
    const r = await fetch(`${BASE}?${params}`, {
      headers: { "Access-Token": token, Accept: "application/json" },
      // ⚠ orçamento não pode ficar pendurado numa API de terceiro
      signal: AbortSignal.timeout(20000),
    });
    const txt = await r.text();
    try { bruto = JSON.parse(txt); } catch { bruto = { textoCru: txt.slice(0, 2000) }; }
    if (!r.ok) return { ok: false, erro: `QualP respondeu HTTP ${r.status}`, bruto };
  } catch (e) {
    return { ok: false, erro: `Não consegui falar com a QualP: ${e.message}` };
  }

  const distanciaKm = achar(bruto, [
    "distancia", "distance", "informacoes_da_rota.distancia", "rota.distancia",
    "resumo.distancia", "distancia_total",
  ]);
  const pedagio = achar(bruto, [
    "pedagio", "pedagios.total", "pedagio_total", "informacoes_da_rota.pedagio",
    "resumo.pedagio", "tolls.total",
  ]);
  // o piso da ANTT vem por tipo de carga; pega o de carga geral quando existir
  const antt = achar(bruto, [
    "tabela_frete.carga_geral", "tabela_frete.geral", "tabela_frete.valor",
    "tabela_frete.A.carga_geral", "frete.carga_geral", "tabela_frete.total",
  ]);

  return {
    ok: true,
    distanciaKm, pedagio, pisoAntt: antt,
    // ⚠ a resposta crua volta para a primeira consulta real revelar o formato exato
    bruto,
    consultadoEm: new Date().toISOString(),
    porKg: antt && cargaKg > 0 ? Math.round((antt / cargaKg) * 10000) / 10000 : null,
  };
}
