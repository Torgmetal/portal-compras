// Pedidos de compra PENDENTES (e recebidos parcialmente) do Omie — o que a Torg
// se comprometeu a comprar mas ainda NÃO recebeu/faturou, logo ainda não virou
// conta a pagar. Fonte de "a pagar" pré-recebimento, por obra.
//
// Omie: produtos/pedidocompra/ PesquisarPedCompra. Os filtros são flags "T"/"F";
// é preciso ligar lExibirPedidosPendentes:"T" (sem isso ele não retorna nada).
import { getFornecedoresMap } from "./omie-contas-pagar.js";
import { omieCall } from "./omie-call.js";

const URL_PED = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";

const omie = (call, param) => omieCall(URL_PED, call, param);

function parseBR(s) {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000-03:00`) : null;
}
const fmtBR = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };

// Cache em memória (10 min) + dedup de chamadas concorrentes.
let cache = { data: null, ts: 0 };
let emAndamento = null;

async function puxar() {
  const fornecedores = await getFornecedoresMap();

  const hoje = new Date();
  const ini = new Date(hoje); ini.setFullYear(ini.getFullYear() - 3); // pendentes podem ser antigos
  const fim = new Date(hoje); fim.setFullYear(fim.getFullYear() + 1);

  const pedidos = [];
  for (let pg = 1; pg <= 30; pg++) {
    const d = await omie("PesquisarPedCompra", {
      nPagina: pg,
      nRegsPorPagina: 100,
      lApenasImportadoApi: "F",
      lExibirPedidosPendentes: "T", // não recebidos → ainda não viraram conta a pagar
      // NÃO incluir recebidos parciais aqui: a parte recebida já está nas contas
      // a pagar (evita dupla contagem). Pendente = disjunto das contas.
      dDataInicial: fmtBR(ini),
      dDataFinal: fmtBR(fim),
    });
    for (const ped of (d.pedidos_pesquisa || [])) {
      const cab = ped.cabecalho_consulta || {};
      const itens = ped.produtos_consulta || [];
      const parc = ped.parcelas_consulta || [];
      const total = itens.reduce((s, i) => s + (Number(i.nValTot) || (Number(i.nQtde) * Number(i.nValUnit)) || 0), 0);
      if (total <= 0) continue;

      // Parcelas com vencimento real; se não houver, cai pro total na previsão.
      let parcelas = parc
        .map((p) => ({ venc: parseBR(p.dVencto), valor: Number(p.nValor) || 0 }))
        .filter((p) => p.venc && p.valor > 0);
      if (parcelas.length === 0) {
        parcelas = [{ venc: parseBR(cab.dDtPrevisao) || new Date(), valor: total }];
      }

      pedidos.push({
        nCodPed: cab.nCodPed ? String(cab.nCodPed) : null,
        numero: cab.cNumero || cab.cNumPedido || null,
        codProj: cab.nCodProj ? String(cab.nCodProj) : null,
        fornecedor: fornecedores.get(Number(cab.nCodFor)) || (cab.nCodFor ? `Cód. ${cab.nCodFor}` : "—"),
        etapa: cab.cEtapa || null,
        total,
        parcelas,
      });
    }
    if (pg >= Number(d.nTotalPaginas || 1)) break;
  }

  return { pedidos, geradoEm: new Date().toISOString() };
}

/**
 * Lista os pedidos de compra pendentes (não recebidos) do Omie, por obra.
 * Cacheado em memória (10 min). Best-effort: lança se o Omie falhar.
 * @param {boolean} forcar - ignora o cache
 */
export async function listarComprasPendentes(forcar = false) {
  if (!forcar && cache.data && Date.now() - cache.ts < 600_000) return cache.data;
  if (emAndamento) return emAndamento;
  emAndamento = (async () => {
    try {
      const data = await puxar();
      cache = { data, ts: Date.now() };
      return data;
    } finally {
      emAndamento = null;
    }
  })();
  return emAndamento;
}
