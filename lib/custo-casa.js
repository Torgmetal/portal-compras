import "server-only";
import { prisma } from "./prisma";

// ─── O QUE A CASA CUSTA POR MÊS, MEDIDO NO QUE A TORG PAGOU ───────────────────
// Vitor (23/08/2026): "analisando nossos pagamentos × folha do RH, tudo que você tem de
// informação, esquecendo os materiais, tintas e parafusos — me traga uma análise sua para vermos
// se o preço está correto dos custos".
//
// ⚠ O NÚMERO QUE O PORTAL USAVA ERA DIGITADO. `ConfigCustoHora.custoTotalMensal` = R$ 784.270 é
// uma estimativa que alguém montou uma vez; o que a empresa paga está nas contas a pagar, com o
// plano de contas da própria Torg, e dá OUTRO número. Medido em 12 meses (ago/2025 a jul/2026):
// R$ 1.079.691/mês. São R$ 295 mil por mês a menos no custo — 27% — em cima dos quais todo preço
// foi formado.
//
// ⚠ E O QUE NÃO É CUSTO DA CASA TEM DE SAIR, senão o preço cobra duas vezes. O material, o frete
// e o terceiro já entram no orçamento linha a linha; capex é investimento, não mês; e o
// financeiro é o custo do dinheiro, que a proposta trata à parte (factoring no BDI).
//
// A separação usa o número da categoria — o plano de contas da Torg já classifica:
//   2.x  imposto           sobre a venda, já reservado no BDI
//   3.x  material          matéria-prima, tinta, fixação, telha, embalagem  → sai
//   4.x  direto da obra    inspetor de qualidade, comissão, fretes          → sai
//   5.x  consumível        ferramenta, material auxiliar, gás              → FICA (não se cobra por obra)
//   6.x  MOD               salário, INSS, FGTS, rescisão, 13º, benefício   → FICA
//   7.x  MOI               salário, prestador, refeição                    → FICA
//   8.x  empreita          fabricação terceirizada                         → sai (é terceiro da obra)
//   9.x  adiantamento      antecipação, não despesa                        → sai
//   10–14 estrutura        energia, aluguel, manutenção, consultoria, ADM   → FICA
//   20.x financeiro        juros, factoring, empréstimo                    → sai
//   21.x ativos            máquina, ampliação, informática                 → sai (capex)
export const GRUPOS_CUSTO = {
  CASA: "Custo da casa",
  MATERIAL: "Material da obra",
  OBRA: "Direto da obra",
  TERCEIROS: "Terceiros da obra",
  IMPOSTOS: "Impostos",
  FINANCEIRO: "Financeiro",
  ATIVOS: "Ativos (capex)",
  FORA: "Fora da conta",
};

/** Em que grupo cai uma categoria do plano de contas. */
export function grupoDaCategoria(nome) {
  const s = String(nome || "").trim();
  // ⚠ categoria sem número vem do tempo anterior ao plano de contas — vale pelo nome
  if (/factoring|empr[eé]stimo|juros/i.test(s)) return "FINANCEIRO";
  if (/movimenta[çc][ãa]o n[ãa]o efetivada/i.test(s)) return "FORA";
  const g = Number((s.match(/^(\d+)\./) || [])[1]);
  // ⚠ categoria SEM NÚMERO cai em CASA por padrão — e isso é uma mina: qualquer categoria nova
  // criada sem o prefixo do plano de contas entra no custo da casa em silêncio. Hoje só existem
  // duas ("Acerto Factoring", pega acima, e "Movimentação não efetivada"), então o efeito é zero;
  // o ternário que estava aqui devolvia "CASA" nos dois lados e não fazia nada.
  if (!Number.isFinite(g)) return "CASA";
  if (g === 2) return "IMPOSTOS";
  if (g === 3) return "MATERIAL";
  if (g === 4) return "OBRA";
  if (g === 8) return "TERCEIROS";
  if (g === 9) return "FORA";
  if (g === 20) return "FINANCEIRO";
  if (g === 21) return "ATIVOS";
  return "CASA";
}

const TTL_MS = 60 * 60 * 1000;
let cache = null;

/**
 * O custo da casa medido, mês a mês.
 *
 * ⚠ A JANELA IGNORA O MÊS CORRENTE. Um mês pela metade puxaria a média para baixo e faria a casa
 * parecer mais barata do que é — exatamente o erro que se paga depois, no preço.
 */
export async function custoDaCasa(forcar = false) {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache.dados;

  const hoje = new Date();
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1);

  const titulos = await prisma.contaPagar.findMany({
    where: { dataVencimento: { gte: inicio, lt: fim }, NOT: { status: "CANCELADO" } },
    select: { categoriaNome: true, valor: true, dataVencimento: true },
    take: 200000,
  });

  const porGrupo = {}, porCategoria = new Map(), porMes = new Map(), meses = new Set();
  for (const t of titulos) {
    const g = grupoDaCategoria(t.categoriaNome);
    const v = Number(t.valor) || 0;
    const mes = t.dataVencimento.toISOString().slice(0, 7);
    meses.add(mes);
    porGrupo[g] = (porGrupo[g] || 0) + v;
    if (g !== "CASA") continue;
    porMes.set(mes, (porMes.get(mes) || 0) + v);
    const c = t.categoriaNome || "(sem categoria)";
    porCategoria.set(c, (porCategoria.get(c) || 0) + v);
  }

  const nMeses = meses.size || 1;
  const valores = [...porMes.values()].sort((a, b) => a - b);
  const totalCasa = porGrupo.CASA || 0;

  const dados = {
    periodo: meses.size ? `${[...meses].sort()[0]} a ${[...meses].sort().pop()}` : null,
    meses: nMeses,
    titulos: titulos.length,
    custoMensal: Math.round(totalCasa / nMeses),
    // ⚠ a mediana ao lado da média denuncia mês fora da curva (13º, rescisão em bloco)
    mediana: valores.length ? Math.round(valores[Math.floor(valores.length / 2)]) : 0,
    porMes: [...porMes].sort().map(([mes, valor]) => ({ mes, valor: Math.round(valor) })),
    categorias: [...porCategoria]
      .map(([nome, total]) => ({ nome, mensal: Math.round(total / nMeses), pct: totalCasa > 0 ? Math.round((total / totalCasa) * 1000) / 10 : 0 }))
      .sort((a, b) => b.mensal - a.mensal),
    grupos: Object.entries(porGrupo)
      .map(([key, total]) => ({ key, nome: GRUPOS_CUSTO[key] || key, mensal: Math.round(total / nMeses) }))
      .sort((a, b) => b.mensal - a.mensal),
  };
  cache = { em: Date.now(), dados };
  return dados;
}
