// ─── OS IMPOSTOS DE UMA OBRA: O QUE O COMERCIAL CADASTROU AO LADO DA REGRA ───
//
// Matheus (26/09/2026): *"o simulador pode trazer a porcentagem dos impostos quando eu seleciono a
// obra — o comercial já cadastra o imposto estimado do cliente"*. O cadastro são as linhas de
// `OPReceita` (41 das 50 obras): CFOP e % de ICMS, IPI, PIS, COFINS, ISS, IRRF e CSLL.
//
// ⚠⚠ AS DUAS COLUNAS FICAM LADO A LADO; A TELA NÃO CORRIGE O CADASTRO. Quando o Comercial e a regra
// divergem (IPI 0 % cadastrado, 5 % na TIPI), a linha é marcada — é o aviso que o módulo existe para
// dar. O valor sai pela REGRA quando ela existe, e pelo cadastrado quando só ele existe.
//
// ⚠ IBS/CBS vem das nossas NFs (lib/fiscal/regras-ibs-cbs.js): sem nota, ou com notas divergentes,
// não há valor — nunca um percentual chutado.
import { ncmNaDescricao } from "./pedido-omie";

const r2 = (n) => Math.round(n * 100) / 100;
const dig = (v) => String(v ?? "").replace(/\D/g, "");

/** Uma linha de `OPReceita` na forma que o simulador usa. ⚠ CFOP ausente fica null: não se adivinha. */
export function linhaDaReceita(r) {
  if (!r) return null;
  const cfop = dig(r.cfop);
  return {
    id: r.id, descricao: r.descricao,
    cfop: cfop.length === 4 ? cfop : null,
    ncm: ncmNaDescricao(r.descricao),
    valor: Number(r.valor) || 0,
    pct: { icms: r.icmsPct ?? null, ipi: r.ipiPct ?? null, pis: r.pisPct ?? null, cofins: r.cofinsPct ?? null,
      iss: r.issPct ?? null, irrf: r.irrfPct ?? null, csll: r.csllPct ?? null },
  };
}

/**
 * O IPI do `ipiDaTipi` na forma do simulador da obra. ⚠ O `ipiDaTipi` devolve `valor`/`tipo`, e "NT"
 * sem valor: NT é 0 % com a nota, e o NCM com Ex TIPI mantém a geral, AVISANDO que pode ser outra.
 */
export function ipiDaRegra(r) {
  if (!r?.determinado) return { determinado: false, aliquota: null, motivo: r?.motivo ?? null };
  if (r.tipo === "NT") return { determinado: true, aliquota: 0, motivo: "NT — não tributado na TIPI." };
  return { determinado: r.valor != null, aliquota: r.valor ?? null,
    motivo: r.inconclusivo ? "Este NCM tem Ex TIPI: se o produto se enquadrar, a alíquota é outra." : null };
}

const linha = (tributo, cadastrado, regra, valor, nota = null) => {
  const usa = regra ?? cadastrado;
  return {
    tributo, cadastrado, regra, nota,
    valor: usa == null || !(valor > 0) ? null : r2(valor * usa / 100),
    divergente: cadastrado != null && regra != null && Number(cadastrado) !== Number(regra),
  };
};

const notaDoIbsCbs = (ibsCbs) => {
  if (!ibsCbs || ibsCbs.situacao === "SEM_NF") return "Nenhuma NF nossa usou este NCM/CFOP ainda.";
  if (ibsCbs.situacao === "DIVERGENTE") {
    return `As NFs usaram alíquotas diferentes para este NCM/CFOP: ${ibsCbs.linhas
      .map((l) => `CBS ${l.pCbs}% / IBS ${l.pIbsUf}% (NF ${l.ultimaNf})`).join(" · ")}`;
  }
  return `Como na NF ${ibsCbs.linhas[0].ultimaNf}.`;
};

/**
 * @param {{ receita, valor, ipiRegra, icmsRegra, ibsCbs }} e
 *   receita: `linhaDaReceita(...)` ou null · ipiRegra: `ipiDaTipi(...)` · icmsRegra: `estimarIcms(...)`
 *   · ibsCbs: `situacaoDaRegra(...)`
 */
export function impostosDaObra({ receita, valor, ipiRegra, icmsRegra, ibsCbs }) {
  const p = receita?.pct ?? {};
  const unica = ibsCbs?.situacao === "UNICA" ? ibsCbs.linhas[0] : null;
  const notaIbs = notaDoIbsCbs(ibsCbs);
  const linhas = [
    linha("ICMS", p.icms ?? null, icmsRegra?.estado === "REFERENCIA" ? icmsRegra.aliquota : null, valor, icmsRegra?.motivo ?? null),
    linha("IPI", p.ipi ?? null, ipiRegra?.determinado ? ipiRegra.aliquota : null, valor, ipiRegra?.motivo ?? null),
    linha("PIS", p.pis ?? null, null, valor),
    linha("COFINS", p.cofins ?? null, null, valor),
    linha("ISS", p.iss ?? null, null, valor),
    linha("IRRF", p.irrf ?? null, null, valor),
    linha("CSLL", p.csll ?? null, null, valor),
    linha("CBS", null, unica ? unica.pCbs : null, valor, notaIbs),
    linha("IBS", null, unica ? unica.pIbsUf : null, valor, notaIbs),
  ];
  return { linhas, total: r2(linhas.reduce((s, l) => s + (l.valor ?? 0), 0)) };
}
