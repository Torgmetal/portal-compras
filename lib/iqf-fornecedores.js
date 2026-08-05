// IQF — Índice de Qualificação de Fornecedores. Nota AUTOMÁTICA (0–100) por fornecedor,
// tirada da própria rotina de compras — sem digitação. Três critérios (decisão do Vitor):
//  • RESPOSTA (30%)  — tempo de resposta às cotações no portal (Cotacao: envio→recebida).
//  • ENTREGA  (35%)  — pontualidade dos pedidos. IMPORTANTE: só conta pedido JÁ ENTREGUE e
//                      sincronizado (dataEntregaReal preenchida) com prazo previsto; assim o
//                      atraso da sync do Omie não derruba a nota — quem não sincronizou fica
//                      "sem avaliar" nesse critério (peso é rebalanceado).
//  • QUALIDADE(35%)  — reclamações abertas: RNCs de origem FORNECEDOR não encerradas ([[torg_rnc]]).
// IQF = média ponderada dos critérios DISPONÍVEIS (rebalanceia se algum faltar).
// Classe: A ≥85 · B 75–84 · C <75. "Nível mínimo B" = IQF ≥ 75.

const PESOS = { resposta: 0.30, entrega: 0.35, qualidade: 0.35 };
// A data de entrega vem da sync do Omie, que hoje atrasa muito (decisão do Vitor):
// os pedidos sincronizados aparecem "atrasados" e zerariam a entrega de quase todos.
// Então a ENTREGA é CALCULADA e MOSTRADA, mas NÃO pesa na nota até a sync estabilizar.
// Vire true quando a data de entrega for confiável.
const ENTREGA_NA_NOTA = false;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const MS = 86400000;
function diasUteis(a, b) {
  const d0 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const d1 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  let n = Math.round((d1 - d0) / MS);
  if (n <= 0) return 0;
  n = Math.min(n, 400);
  let c = 0;
  for (let i = 1; i <= n; i++) { const w = new Date(d0 + i * MS).getUTCDay(); if (w !== 0 && w !== 6) c++; }
  return c;
}
// Normaliza nome de fornecedor pra casar a RNC (texto livre) com o cadastro.
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, " ").replace(/\b(LTDA|EIRELI|ME|EPP|SA|S A|S\/A|CIA|INDUSTRIA|COMERCIO|DE|DO|DA|E)\b/g, " ").replace(/\s+/g, " ").trim();

const scoreResposta = (mediaDias) => clamp(Math.round(100 - (mediaDias - 1) * 20), 0, 100); // ≤1d=100, 4d=40, ≥6d=0
const scoreQualidade = (nAbertas) => clamp(100 - nAbertas * 25, 0, 100); // 0=100, 1=75, 2=50, 3=25, ≥4=0
const classe = (iqf) => (iqf == null ? "—" : iqf >= 85 ? "A" : iqf >= 75 ? "B" : "C");

/**
 * Calcula o IQF de cada fornecedor com atividade no período + a série mensal de
 * "% de compras com fornecedor IQF ≥ 75%" (indicador ISO "Compras nível B").
 * @returns { fornecedores:[...], serieComprasNivelB:[12], pesos }
 */
export async function calcularIQF(prisma, { yIni, yFim }) {
  // 1) Cotações do ano por fornecedor (resposta) + seus pedidos (entrega + compras).
  const cotacoes = await prisma.cotacao.findMany({
    where: { fornecedorId: { not: null }, createdAt: { gte: yIni, lt: yFim } },
    select: {
      fornecedorId: true, fornecedorNome: true, createdAt: true, recebidaEm: true, status: true,
      fornecedor: { select: { razaoSocial: true, nomeFantasia: true, ativo: true } },
      pedidosOmie: { select: { total: true, createdAt: true, dataEntregaReal: true, prazoEntregaPrevisto: true, status: true } },
    },
  });

  // 2) Reclamações abertas de fornecedor (RNC origem FORNECEDOR, não encerrada).
  const rncs = await prisma.naoConformidade.findMany({
    where: { origem: "FORNECEDOR", status: { not: "ENCERRADA" } },
    select: { fornecedor: true },
  });
  const rncNomes = rncs.map((r) => norm(r.fornecedor)).filter((n) => n.length >= 3);

  // Agrupa por fornecedor.
  const map = new Map();
  for (const c of cotacoes) {
    const id = c.fornecedorId;
    if (!map.has(id)) map.set(id, {
      id, nome: c.fornecedor?.razaoSocial || c.fornecedorNome, ativo: c.fornecedor?.ativo !== false,
      nCotacoes: 0, respostas: [], entregasAval: 0, entregasOnTime: 0, comprasAno: 0, comprasMes: Array(12).fill(0),
    });
    const f = map.get(id);
    f.nCotacoes++;
    if (c.recebidaEm) f.respostas.push(diasUteis(c.createdAt, c.recebidaEm));
    for (const p of c.pedidosOmie || []) {
      if (p.status === "ERRO") continue;
      const tot = p.total || 0;
      f.comprasAno += tot;
      if (p.createdAt && p.createdAt >= yIni && p.createdAt < yFim) f.comprasMes[p.createdAt.getUTCMonth()] += tot;
      // Entrega: só conta pedido ENTREGUE e sincronizado (dataEntregaReal) com prazo previsto.
      if (p.dataEntregaReal && p.prazoEntregaPrevisto) {
        f.entregasAval++;
        if (p.dataEntregaReal <= p.prazoEntregaPrevisto) f.entregasOnTime++;
      }
    }
  }

  // Casa as RNCs abertas com cada fornecedor pelo nome normalizado (contido).
  const rncAbertasDe = (nome) => {
    const n = norm(nome);
    if (n.length < 3) return 0;
    return rncNomes.filter((rn) => rn === n || rn.includes(n) || n.includes(rn)).length;
  };

  const fornecedores = [];
  for (const f of map.values()) {
    const nResp = f.respostas.length;
    const avgResp = nResp ? f.respostas.reduce((a, b) => a + b, 0) / nResp : null;
    // Resposta: pela média de dias; se teve cotação mas nunca respondeu, nota 0.
    const resposta = nResp ? scoreResposta(avgResp) : (f.nCotacoes > 0 ? 0 : null);
    const entrega = f.entregasAval ? Math.round((f.entregasOnTime / f.entregasAval) * 100) : null;
    const nRnc = rncAbertasDe(f.nome);
    const qualidade = scoreQualidade(nRnc);

    // IQF = média ponderada dos critérios disponíveis.
    let somaP = 0, somaW = 0;
    if (resposta != null) { somaP += resposta * PESOS.resposta; somaW += PESOS.resposta; }
    if (ENTREGA_NA_NOTA && entrega != null) { somaP += entrega * PESOS.entrega; somaW += PESOS.entrega; }
    if (qualidade != null) { somaP += qualidade * PESOS.qualidade; somaW += PESOS.qualidade; }
    const iqf = somaW > 0 ? Math.round(somaP / somaW) : null;

    fornecedores.push({
      id: f.id, nome: f.nome, ativo: f.ativo,
      resposta, entrega, qualidade, iqf, classe: classe(iqf),
      nCotacoes: f.nCotacoes, nRespostas: nResp, avgRespostaDias: avgResp != null ? Math.round(avgResp * 10) / 10 : null,
      nEntregasAvaliadas: f.entregasAval, nRncAbertas: nRnc, comprasAno: Math.round(f.comprasAno), comprasMes: f.comprasMes.map((v) => Math.round(v)),
    });
  }
  fornecedores.sort((a, b) => (b.comprasAno || 0) - (a.comprasAno || 0));

  // Indicador ISO "Compras nível B": % das compras (R$) de cada mês feitas com
  // fornecedor de IQF ≥ 75. Base = pedidos ligados a cotação (fornecedor conhecido).
  const iqfDe = new Map(fornecedores.map((f) => [f.id, f.iqf]));
  const gastoMes = Array(12).fill(0), gastoNivelBMes = Array(12).fill(0);
  for (const f of map.values()) {
    const ok = (iqfDe.get(f.id) ?? 0) >= 75;
    for (let m = 0; m < 12; m++) { gastoMes[m] += f.comprasMes[m]; if (ok) gastoNivelBMes[m] += f.comprasMes[m]; }
  }
  const serieComprasNivelB = gastoMes.map((g, m) => (g > 0 ? Math.round((gastoNivelBMes[m] / g) * 1000) / 10 : null));

  return { fornecedores, serieComprasNivelB, pesos: PESOS };
}
