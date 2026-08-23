import "server-only";
import { prisma } from "./prisma";

// ─── O QUE CUSTA FABRICAR UM QUILO, DE VERDADE ────────────────────────────────
// Vitor (23/08/2026): "não quero que use minha planilha como bengala sua, quero que monte a
// sistemática que deve ser essa parte do comercial".
//
// A tabela da PARÂMETROS é um preço que alguém escreveu um dia. Ela não sabe se a fábrica ficou
// mais cara, se contratou gente, se a energia subiu ou se a produção caiu. Enquanto ela for a
// fonte, o orçamento repete o passado — e o erro só aparece no fechamento da obra, quando não dá
// mais para corrigir.
//
// A sistemática é a outra: o custo SAI DA EMPRESA, não da tabela.
//
//   custo por kg de um setor  =  o que o setor custa por mês  ÷  o que ele produz por mês
//
// Os dois números o portal já tem, e ambos se atualizam sozinhos:
//   CUSTO/MÊS   folha do setor com encargos + rateio do overhead (ConfigCustoHora — a mesma base
//               do preço-hora que o Comercial já usa em proposta de serviço)
//   KG/MÊS      o que o setor apontou no Syneco, mês a mês
//
// ⚠ NÃO SE SOMA SETOR COM SETOR NO DENOMINADOR. Cada setor processa a MESMA peça: somar a produção
// dos seis contaria o quilo seis vezes e faria o custo por kg despencar. Cada setor tem o seu
// denominador — e o custo da peça é a SOMA dos setores por onde ela passa.
//
// ⚠ E POR QUE NÃO USAR HORAS. O apontamento do Syneco grava dataInicio = dataFim: não há duração
// registrada. Calcular R$/hora e depois kg/hora seria inventar um número intermediário que os
// dados não sustentam. Custo mensal ÷ produção mensal chega no mesmo lugar sem passar por lá.

const TTL_MS = 30 * 60 * 1000;
let cache = null;

// A rota que um quilo de estrutura percorre. Galvanizado pula jato e pintura; peça solta não é
// montada. É por isso que a rota é escolhida, não fixa.
export const SETORES_ROTA = [
  { key: "PREPARAÇÃO", nome: "Preparação e corte", padrao: true },
  { key: "MONTAGEM", nome: "Montagem", padrao: true },
  { key: "SOLDAGEM", nome: "Soldagem", padrao: true },
  { key: "ACABAMENTO", nome: "Acabamento", padrao: true },
  { key: "JATO", nome: "Jato", padrao: true },
  { key: "PINTURA", nome: "Pintura", padrao: true },
];

const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
// o Syneco escreve "Corte" onde a configuração de custo chama "PREPARAÇÃO"
const APELIDOS = { CORTE: "PREPARAÇÃO", PREPARACAO: "PREPARAÇÃO", SOLDA: "SOLDAGEM" };
const canonico = (s) => APELIDOS[norm(s)] || SETORES_ROTA.find((x) => norm(x.key) === norm(s))?.key || norm(s);

export async function custoDeFabricacao(forcar = false) {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache.dados;

  const hoje = new Date();
  const desde = new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1);
  const mesCorrente = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const [cfg, ap] = await Promise.all([
    prisma.configCustoHora.findUnique({ where: { id: "default" } }),
    prisma.mesApontamento.findMany({
      where: { dataInicio: { gte: desde } },
      select: { setor: true, operacao: true, produzidoKg: true, dataInicio: true },
      take: 500000,
    }),
  ]);
  if (!cfg) return null;

  // ── quanto cada setor custa por mês ──
  const f = Number(cfg.fatorEncargos) || 1.8;
  const setores = Array.isArray(cfg.setores) ? cfg.setores : [];
  const fatura = (s) => s.faturaHora !== false;
  const mod = (s) => (Number(s.mod) > 0 ? Number(s.mod) : Number(s.salarios) * f);
  const overheadFolha = setores.reduce((a, s) => a + (fatura(s) ? 0 : mod(s) + (Number(s.cifDireto) || 0)), 0);
  const outros = (cfg.outrosCustos || []).reduce((a, x) => a + (Number(x.valor) || 0), 0);
  const overhead = overheadFolha + outros;
  const modBill = setores.reduce((a, s) => a + (fatura(s) ? mod(s) : 0), 0) || 1;

  const custoMes = {};
  for (const s of setores) {
    if (!fatura(s)) continue;
    const chave = canonico(s.nome);
    // ⚠ o overhead rateia por MOD: setor com folha maior puxa mais casa, que é a regra que a
    // própria tela de custo-hora usa. Trocar o critério aqui faria as duas telas discordarem.
    const valor = mod(s) + (Number(s.cifDireto) || 0) + overhead * (mod(s) / modBill);
    custoMes[chave] = (custoMes[chave] || 0) + valor;
  }

  // ── quanto cada setor produziu por mês ──
  const porSetorMes = new Map();
  const meses = new Set();
  for (const a of ap) {
    if (!a.dataInicio) continue;
    const mes = a.dataInicio.toISOString().slice(0, 7);
    if (mes === mesCorrente) continue; // mês em curso puxaria a média para baixo
    meses.add(mes);
    const k = canonico(a.setor || a.operacao);
    porSetorMes.set(`${k}|${mes}`, (porSetorMes.get(`${k}|${mes}`) || 0) + (Number(a.produzidoKg) || 0));
  }
  const nMeses = meses.size || 1;
  const kgMes = {};
  for (const [chave, kg] of porSetorMes) {
    const k = chave.split("|")[0];
    kgMes[k] = (kgMes[k] || 0) + kg / nMeses;
  }

  const linhas = SETORES_ROTA.map((s) => {
    const custo = custoMes[s.key] || 0;
    const kg = kgMes[s.key] || 0;
    return {
      ...s, custoMes: Math.round(custo), kgMes: Math.round(kg),
      custoPorKg: kg > 0 ? Math.round((custo / kg) * 10000) / 10000 : null,
      // ⚠ sem produção apontada não há custo por kg — e chutar aqui contamina todo preço
      semDados: !(kg > 0),
    };
  });

  const dados = {
    linhas, mesesConsiderados: nMeses,
    periodo: meses.size ? `${[...meses].sort()[0]} a ${[...meses].sort().pop()}` : null,
    custoTotalMensal: Math.round(Number(cfg.custoTotalMensal) || 0),
    overheadMensal: Math.round(overhead),
    margemPct: Number(cfg.margemPct) || 0,
    impostosVendaPct: Number(cfg.impostosVendaPct) || 0,
  };
  cache = { em: Date.now(), dados };
  return dados;
}

/**
 * Custo de industrialização de um quilo, somando os setores da rota escolhida.
 * @param {object} base saída de custoDeFabricacao
 * @param {string[]} rota chaves dos setores por onde a peça passa
 */
export function custoPorKgDaRota(base, rota) {
  const escolhidos = (base?.linhas || []).filter((l) => (rota || []).includes(l.key));
  const comDados = escolhidos.filter((l) => !l.semDados);
  return {
    setores: escolhidos,
    semDados: escolhidos.filter((l) => l.semDados).map((l) => l.nome),
    custoPorKg: Math.round(comDados.reduce((a, l) => a + l.custoPorKg, 0) * 10000) / 10000,
  };
}

// ─── CALIBRAR A TABELA CONTRA O CUSTO MEDIDO ──────────────────────────────────
// O custo medido é uma MÉDIA sobre o que a fábrica produziu — não sai por classe de peso, porque
// o apontamento do Syneco grava a descrição da peça ("VIGA TRELIÇADA"), não a marca, e sem isso
// não há como ligar hora de setor a peça e à sua classe.
//
// O que dá para fazer, e é honesto: a TABELA dá a FORMA (peça leve custa mais por quilo — a razão
// entre as classes é física e estável) e a MEDIÇÃO dá o NÍVEL. Calibrar é escalar a tabela até
// que a média dela, PESADA PELO MIX REAL DA FÁBRICA, bata com o custo medido.
//
// ⚠ O MIX IMPORTA. Uma tabela pode estar certa em cada linha e errada na média se a fábrica
// produz mais peça leve do que ela supõe. O mix sai da própria LPC: kg/m de cada peça (peso
// unitário ÷ comprimento) diz a classe, e o peso diz quanto ela pesa na média.
export async function mixDeClasses() {
  const pecas = await prisma.pecaConjunto.findMany({
    where: { comprimentoMm: { gt: 0 }, pesoUnitKg: { gt: 0 }, pesoTotalKg: { gt: 0 } },
    select: { pesoUnitKg: true, comprimentoMm: true, pesoTotalKg: true },
    take: 300000,
  });
  const faixa = (kgm) => (kgm <= 10 ? "EXTRA LEVE" : kgm <= 25 ? "LEVE" : kgm <= 60 ? "MÉDIO" : kgm <= 120 ? "PESADO" : "EXTRA PESADO");
  const g = {};
  let total = 0;
  for (const x of pecas) {
    const kgm = x.pesoUnitKg / (x.comprimentoMm / 1000);
    // ⚠ acima de 500 kg/m é erro de cadastro, não perfil: entraria como "extra pesado" e puxaria
    // a média da classe mais barata para baixo.
    if (!(kgm > 0) || kgm > 500) continue;
    const k = faixa(kgm);
    g[k] = (g[k] || 0) + x.pesoTotalKg;
    total += x.pesoTotalKg;
  }
  return {
    total: Math.round(total), pecas: pecas.length,
    porClasse: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, Math.round((v / total) * 10000) / 10000])),
  };
}

/**
 * Compara a tabela de preços com o custo medido, pesando pelo mix real.
 * @param {Array} classes CLASSES de lib/lqc (nome, fabricacao, demaos)
 * @param {number} custoMedidoPorKg saída de custoPorKgDaRota
 * @param {object} mix saída de mixDeClasses
 * @param {number} iDemaos índice da coluna de demãos usada
 */
export function calibrarTabela(classes, custoMedidoPorKg, mix, iDemaos = 1) {
  const linhas = (classes || []).map((c) => ({
    key: c.key, nome: c.nome, faixa: c.faixa,
    tabela: Math.round((c.fabricacao + c.demaos[iDemaos]) * 100) / 100,
    peso: mix?.porClasse?.[c.nome.toUpperCase()] || 0,
  }));
  const mediaTabela = linhas.reduce((a, l) => a + l.tabela * l.peso, 0);
  const fator = mediaTabela > 0 && custoMedidoPorKg > 0 ? custoMedidoPorKg / mediaTabela : null;
  return {
    linhas: linhas.map((l) => ({ ...l, calibrado: fator ? Math.round(l.tabela * fator * 100) / 100 : null })),
    mediaTabela: Math.round(mediaTabela * 10000) / 10000,
    custoMedido: custoMedidoPorKg,
    fator: fator ? Math.round(fator * 10000) / 10000 : null,
    diferencaPct: fator ? Math.round((1 / fator - 1) * 10000) / 100 : null,
  };
}
