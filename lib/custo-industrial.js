import "server-only";
import { prisma } from "./prisma";
import { CLASSES } from "./lqc";
import { grupoDaCategoria } from "./custo-casa";

/* ─── CUSTO INDUSTRIAL: SÓ O QUE TRANSFORMA AÇO ────────────────────────────────────────────────
   Vitor (09/09/2026), fechando a separação: "na parte de fabricação apenas os custos, e na aba de
   impostos e BDI você pega essas"; e sobre pintura: "tinta é o material, na fabricação é o custo
   operacional da aplicação".

   ⚠⚠ ESTA CONTA NÃO É A DO CUSTO DA CASA. `custoDaCasa` responde "o que a empresa gastou no mês";
   esta responde "quanto custa transformar um quilo". A diferença é o que sai — e cada saída tem um
   dono declarado por ele nesta conversa:

     • terceiros de fabricação → aba Terceiros do estudo, com o comparativo Torg × terceiro
     • frete de entrega        → linha própria na planilha comercial
     • inspetor de qualidade   → verba separada no estudo
     • comissão                → % por obra
     • montagem de campo       → cobrada à parte; a OCIOSIDADE dela vai no BDI
     • diretoria, ADM, aluguel, consultoria, marketing, juros → BDI
     • 7.6 prestadores MOI     → "não deve fazer parte do cálculo" (9 meses em 12, R$ 19k a 226k)

   ⚠ O QUE FICA, e por quê: folha da fábrica (rota + engenharia, PCP, qualidade, almoxarifado e
   expedição — decisão dele, "deve entrar no custo"), energia da fábrica, manutenção, consumível,
   EPI e refeição de produção, depreciação das máquinas e a PROVISÃO de rescisão de produção.

   ⚠ RESCISÃO ENTRA POR PROVISÃO, não pelo mês. Medido em 12 meses: aconteceu nos 12, R$ 354.945 no
   ano, variando de R$ 8k a R$ 69k. Não é evento excepcional — é rotativa. E segue a folha da
   pessoa: 6.4 e 7.4 (MOD/MOI) são industriais; 14.4 (ADM) é BDI.

   ⚠ HORAS EXTRAS FICAM DE FORA. São consequência de pico de produção — entram no custo variável do
   mês, não no R$/kg, senão a obra sem HE paga a HE da obra vizinha. (Decisão em aberto: se ele
   mudar de ideia, é somar `HORA_EXTRA` abaixo.) */

const MESES = 12;
const FABRICA_SETOR = /prepara|solda|montagem interna|jato|pintura|acabamento|almoxarifado|expedi|pcp|qualidade|engenharia|^produção$/i;
const APLICACAO_SETOR = /jato|pintura/i;

/** Encargo só em CLT. PJ e pró-labore vão pelo valor cheio — aplicar 1,8× em pró-labore inflava a
 *  diretoria em R$ 80 mil/mês (Vitor: "diretoria está errado, é 100k mês"). */
const ENCARGO_CLT = 1.8;
const custoPessoa = (f) => (f.salario || 0) * (String(f.tipoContrato).toUpperCase() === "CLT" ? ENCARGO_CLT : 1);

/** Despesa não-folha que serve a fábrica: energia, manutenção, consumível, EPI e refeição de produção. */
const DESPESA_FABRICA = /^5\.|^10\.|^13\.|refei[çc][õo]es produ|EPI|vale refei[çc][ãa]o mod|assist[êe]ncia m[ée]dica mod/i;

export async function custoIndustrial({ meses = MESES, vidaUtilAnos = 10 } = {}) {
  const fim = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const ini = new Date(fim.getFullYear(), fim.getMonth() - meses, 1);

  const [pagos, pessoas, apontamentos] = await Promise.all([
    prisma.contaPagar.findMany({
      where: { dataVencimento: { gte: ini, lt: fim }, NOT: { status: "CANCELADO" } },
      select: { categoriaNome: true, valor: true },
    }),
    prisma.funcionario.findMany({
      where: { ativo: true, dataDemissao: null },
      select: { salario: true, tipoContrato: true, setor: { select: { nome: true } } },
    }),
    prisma.mesApontamento.findMany({
      where: { dataInicio: { gte: ini, lt: fim } },
      select: { setor: true, produzidoKg: true, dataInicio: true },
    }),
  ]);

  // ── folha, separada em fábrica × estrutura ──
  let folhaFabrica = 0, folhaAplicacao = 0, folhaEstrutura = 0;
  const porSetor = {};
  for (const p of pessoas) {
    const nome = p.setor?.nome || "—";
    const v = custoPessoa(p);
    (porSetor[nome] ??= { pessoas: 0, mensal: 0 });
    porSetor[nome].pessoas++; porSetor[nome].mensal += v;
    if (!FABRICA_SETOR.test(nome)) { folhaEstrutura += v; continue; }
    folhaFabrica += v;
    if (APLICACAO_SETOR.test(nome)) folhaAplicacao += v;
  }

  // ── despesa não-folha e provisão de rescisão ──
  let despesaFabrica = 0, rescisaoProducao = 0;
  for (const t of pagos) {
    const nome = String(t.categoriaNome || "");
    if (grupoDaCategoria(nome) !== "CASA") continue;
    if (/^(6|7)\.4/.test(nome) || /rescis/i.test(nome) && /^(6|7)\./.test(nome)) { rescisaoProducao += t.valor; continue; }
    if (DESPESA_FABRICA.test(nome)) despesaFabrica += t.valor;
  }
  despesaFabrica /= meses;
  rescisaoProducao /= meses;

  // ── depreciação das máquinas (capex de máquinas e equipamentos) ──
  const capex = pagos.filter((t) => /^21\.1/.test(String(t.categoriaNome || ""))).reduce((a, t) => a + t.valor, 0);
  const depreciacao = capex / (vidaUtilAnos * 12);

  // ── quanto a fábrica entregou por mês ──
  // ⚠ o fim da rota é a PINTURA: é o que de fato saiu pronto. Somar todos os setores contaria o
  //   mesmo aço seis vezes.
  /* ⚠ O MÊS CORRENTE FICA DE FORA. Ele está pela metade e puxa a média de kg para baixo, o que
     inflaria o custo por quilo de todo mundo. Mesma regra de lib/custo-fabricacao.js. */
  const mesCorrente = new Date().toISOString().slice(0, 7);
  const doMes = apontamentos.filter((a) => a.dataInicio.toISOString().slice(0, 7) !== mesCorrente);
  const mesesComDado = new Set(doMes.map((a) => a.dataInicio.toISOString().slice(0, 7)));
  const kgPintura = doMes.filter((a) => /pintura/i.test(a.setor || "")).reduce((s, a) => s + (a.produzidoKg || 0), 0);
  const kgMes = kgPintura / (mesesComDado.size || 1);

  const mensal = folhaFabrica + despesaFabrica + rescisaoProducao + depreciacao;
  const porKg = kgMes > 0 ? mensal / kgMes : 0;
  /* ⚠⚠ A DESPESA RATEIA JUNTO COM A FOLHA. Jato e pintura consomem energia, abrasivo, manutenção e
     depreciação como qualquer setor — atribuir só a folha deles à aplicação jogaria toda a despesa
     em cima da fabricação e faria a aplicação parecer barata (medido: 0,42 contra 0,82 /kg). O
     rateio é pela folha, que é o mesmo critério do custo-hora — dois critérios diferentes fariam as
     duas telas discordarem sobre o mesmo setor. */
  const fracaoAplicacao = folhaFabrica > 0 ? folhaAplicacao / folhaFabrica : 0;
  const aplicacaoPorKg = porKg * fracaoAplicacao;
  const fabricacaoPorKg = porKg - aplicacaoPorKg;

  /* ⚠ A TABELA DÁ A FORMA; A MEDIÇÃO DÁ O NÍVEL. Peça leve custa mais por quilo — é física, e a
     proporção entre as classes da LQC descreve isso bem. O que a tabela não sabe é quanto a
     empresa custa hoje. Calibrar é escalar a tabela até a média dela, ponderada pelo MIX REAL das
     peças, bater com o medido.
     ⚠ O MIX SAI DA LPC, não dos estudos — Vitor (09/09/2026): "pode desconsiderar essa informação,
     pois estamos justamente procurando esse número". Usar o estudo para calibrar o estudo é
     circular. */
  const mix = await mixPorClasse();
  const mediaFab = CLASSES.reduce((a, c) => a + c.fabricacao * (mix[c.key] || 0), 0);
  const mediaApl = CLASSES.reduce((a, c) => a + c.demaos[0] * (mix[c.key] || 0), 0);
  const fatorFab = mediaFab > 0 ? fabricacaoPorKg / mediaFab : 0;
  const fatorApl = mediaApl > 0 ? aplicacaoPorKg / mediaApl : 0;

  const classes = CLASSES.map((c) => ({
    key: c.key, nome: c.nome, faixa: c.faixa,
    pesoDoMix: mix[c.key] || 0,
    fabricacao: round2(c.fabricacao * fatorFab),
    // ⚠ o custo de APLICAR, não a tinta: jato, preparação de superfície e aplicação por demão
    aplicacao: c.demaos.map((d) => round2(d * fatorApl)),
  }));

  return {
    periodo: `${ini.toISOString().slice(0, 7)} a ${new Date(fim - 1).toISOString().slice(0, 7)}`,
    meses: mesesComDado.size, kgMes: Math.round(kgMes),
    composicao: {
      folhaFabrica: Math.round(folhaFabrica),
      despesaFabrica: Math.round(despesaFabrica),
      rescisaoProducao: Math.round(rescisaoProducao),
      depreciacao: Math.round(depreciacao),
      mensal: Math.round(mensal),
    },
    porKg: round2(porKg), fabricacaoPorKg: round2(fabricacaoPorKg), aplicacaoPorKg: round2(aplicacaoPorKg),
    fracaoAplicacao: round2(fracaoAplicacao * 100),
    fatorFab: round2(fatorFab), fatorApl: round2(fatorApl),
    classes, porSetor,
    forade: { folhaEstrutura: Math.round(folhaEstrutura) },
  };
}

/** Mix de peso por classe, medido nas peças da LPC pelo kg/m de cada uma. */
async function mixPorClasse() {
  const pecas = await prisma.pecaConjunto.findMany({
    where: { fonte: "LPC_IMPORT", comprimentoMm: { gt: 0 }, pesoUnitKg: { gt: 0 } },
    select: { pesoUnitKg: true, pesoTotalKg: true, comprimentoMm: true },
  });
  const faixa = (kgm) => (kgm < 10 ? "EXTRA_LEVE" : kgm < 25 ? "LEVE" : kgm < 60 ? "MEDIO" : kgm < 120 ? "PESADO" : "EXTRA_PESADO");
  const acc = {}; let total = 0;
  for (const p of pecas) {
    const kgm = p.pesoUnitKg / (p.comprimentoMm / 1000);
    if (!Number.isFinite(kgm) || kgm <= 0 || kgm > 400) continue;  // descarta lixo de import
    const kg = p.pesoTotalKg || 0;
    acc[faixa(kgm)] = (acc[faixa(kgm)] || 0) + kg; total += kg;
  }
  if (!total) return {};
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v / total]));
}

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
