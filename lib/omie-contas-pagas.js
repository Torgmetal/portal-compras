// Contas PAGAS por período (data de pagamento/baixa).
//
// A tabela local ContaPagar não tem a data do pagamento (ListarContasPagar não
// expõe a baixa). A data vem do endpoint financas/pesquisartitulos →
// PesquisarLancamentos (cabecTitulo.dDtPagamento), filtrado por dDtPagtoDe/Ate.
// O nCodTitulo é o MESMO codigo_lancamento_omie usado como ContaPagar.id, então
// enriquecemos cada título com fornecedor/categoria/NF já sincronizados.
import { prismaDirect } from "./prisma.js";
import { getFornecedoresMap } from "./omie-contas-pagar.js";
import { omieCall } from "./omie-call.js";

const URL_PESQUISA = "https://app.omie.com.br/api/v1/financas/pesquisartitulos/";

const omie = (call, param) => omieCall(URL_PESQUISA, call, param);

// "YYYY-MM-DD" → "DD/MM/YYYY" (formato que o Omie espera)
const isoParaBR = (s) => {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};
// "DD/MM/YYYY" → ISO meia-noite BRT
const brParaISO = (s) => {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// Cache curto por período — evita martelar o Omie a cada troca de aba.
const cache = new Map(); // "de|ate" → { ts, data }
const CACHE_MS = 60_000;

/**
 * Lista os títulos de contas a pagar PAGOS no período (pela data de pagamento).
 * @param {{ de: string, ate: string }} range — datas "YYYY-MM-DD" (dia BRT)
 */
export async function listarContasPagas({ de, ate }) {
  const chave = `${de}|${ate}`;
  const hit = cache.get(chave);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.data;

  const dDtPagtoDe = isoParaBR(de);
  const dDtPagtoAte = isoParaBR(ate);
  if (!dDtPagtoDe || !dDtPagtoAte) throw new Error("Período inválido");

  // Pagina os títulos pagos no período
  const titulos = [];
  for (let pg = 1; pg <= 200; pg++) {
    const d = await omie("PesquisarLancamentos", {
      nPagina: pg, nRegPorPagina: 500, cNatureza: "P",
      dDtPagtoDe, dDtPagtoAte,
    });
    for (const t of (d.titulosEncontrados || [])) {
      const c = t.cabecTitulo || {};
      if (!c.dDtPagamento) continue; // sem baixa registrada — fora
      titulos.push(c);
    }
    if (pg >= Number(d.nTotPaginas || 1)) break;
  }

  // Enriquece com o espelho local (fornecedor/categoria/NF/pedido)
  const ids = titulos.map((c) => String(c.nCodTitulo));
  const locais = ids.length
    ? await prismaDirect.contaPagar.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, fornecedorNome: true, categoriaNome: true,
          numeroDocumento: true, numeroDocFiscal: true,
          numeroPedidoCompra: true, observacao: true,
        },
      })
    : [];
  const porId = new Map(locais.map((l) => [l.id, l]));

  // Fallback de fornecedor pra títulos ainda não sincronizados localmente
  let fornecedores = null;
  if (titulos.some((c) => !porId.get(String(c.nCodTitulo))?.fornecedorNome)) {
    try { fornecedores = await getFornecedoresMap(); } catch { /* não-fatal */ }
  }

  const rows = titulos.map((c) => {
    const local = porId.get(String(c.nCodTitulo));
    return {
      id: String(c.nCodTitulo),
      dataPagamento: brParaISO(c.dDtPagamento),
      dataVencimento: brParaISO(c.dDtVenc),
      fornecedorNome: local?.fornecedorNome
        || (fornecedores ? fornecedores.get(Number(c.nCodCliente)) : null)
        || null,
      categoriaNome: local?.categoriaNome || c.cCodCateg || null,
      numeroDocumento: local?.numeroDocumento || c.cNumTitulo || null,
      numeroDocFiscal: local?.numeroDocFiscal || (c.cNumDocFiscal && c.cNumDocFiscal !== "N.A." ? c.cNumDocFiscal : null),
      numeroParcela: c.cNumParcela || null,
      numeroPedidoCompra: local?.numeroPedidoCompra || null,
      status: c.cStatus || "PAGO",
      valor: Number(c.nValorTitulo) || 0,
    };
  }).sort((a, b) => (b.dataPagamento || "").localeCompare(a.dataPagamento || "") || b.valor - a.valor);

  const data = {
    rows,
    totais: {
      valor: rows.reduce((s, r) => s + r.valor, 0),
      qtd: rows.length,
      fornecedores: new Set(rows.map((r) => r.fornecedorNome).filter(Boolean)).size,
    },
  };
  cache.set(chave, { ts: Date.now(), data });
  return data;
}
