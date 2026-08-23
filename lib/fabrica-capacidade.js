import "server-only";
import { prisma } from "./prisma";
import { custoDaCasa } from "./custo-casa";

// ─── QUANTO A FÁBRICA FAZ POR MÊS, E QUANTO ELA CUSTA ─────────────────────────
// Vitor (23/08/2026): "quantos meses temos para fabricar isso para garantir esse lucro?".
//
// A resposta precisa de dois números que o portal já tem — e que não devem ser digitados de novo
// num orçamento, porque digitado envelhece e ninguém percebe:
//
//   CADÊNCIA   o que a fábrica produziu de verdade, mês a mês (apontamento do Syneco).
//   CUSTO/MÊS  o custo operacional mensal da configuração de custo-hora do Comercial — a mesma
//              base que forma o preço por hora de cada setor.
//
// ⚠ A MÉDIA IGNORA MÊS PARCIAL. O mês corrente ainda está acontecendo: entrar na média puxaria a
// capacidade para baixo e faria toda proposta parecer mais lenta do que a fábrica é.
//
// ⚠⚠ E NÃO SE SOMA SETOR COM SETOR — foi o erro que o Vitor pegou (23/08/2026): "696 t no mês não
// é uma realidade; você deve estar somando a produção de cada setor, pois uma peça que passa na
// montagem passa na solda, depois acabamento, e por aí vai".
//
// Exato. Set/2025–jul/2026, por setor: corte 132.055 · pintura 124.528 · montagem 114.417 ·
// acabamento 113.799 · jato 103.806 · solda 93.154 kg/mês. Somando dá 682 t/mês — a MESMA peça
// contada seis vezes.
//
// ⚠⚠⚠ MAS O SETOR MAIS LENTO TAMBÉM NÃO É GARGALO — E ESSA ERA A SEGUNDA VERSÃO DO MESMO ERRO.
// A primeira correção elegeu a solda (93.154 kg/mês) como gargalo e mandou o prazo por ela. Só
// que a diferença entre os setores não é fila: é ROTA. Nem toda peça é soldada (croqui, peça
// única), galvanizado pula jato e pintura, e por aí vai — os números são a fração do peso que
// passa em cada operação, não a velocidade de cada uma.
//
// A prova é aritmética: se a solda fosse gargalo de verdade, o estoque em processo antes dela
// teria crescido 39 t/mês por 11 meses — 429 toneladas paradas no chão. Não existe.
//
// E há a conferência independente: a Torg compra R$ 1.089.916/mês de material a ~R$ 7,25/kg, o
// que dá da ordem de 150.000 kg/mês entrando. O corte processa 132.055 — a diferença é a perda.
// Bate. Então a CADÊNCIA DA FÁBRICA é o que entra pelo corte, porque tudo que se fabrica se
// corta; os demais setores descrevem a rota, e é assim que eles aparecem agora.
const TTL_MS = 30 * 60 * 1000;
let cache = null;

export async function capacidadeDaFabrica(forcar = false) {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache.dados;

  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1);
  const mesCorrente = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const [ap, cfg] = await Promise.all([
    prisma.mesApontamento.findMany({
      where: { dataInicio: { gte: inicio } },
      // ⚠ SEM `setor` AQUI, TODO APONTAMENTO VIRA "—" E OS SETORES SOMAM. Era o bug: a correção do
      // "696 t/mês" que o Vitor pegou foi escrita no comentário e não na consulta, então o portal
      // continuou devolvendo 693.844 kg/mês — a fábrica inteira contada seis vezes — e todo prazo
      // de obra saía seis vezes mais curto do que é.
      select: { dataInicio: true, produzidoKg: true, setor: true, operacao: true },
      take: 500000,
    }),
    prisma.configCustoHora.findUnique({ where: { id: "default" }, select: { custoTotalMensal: true } }),
  ]);

  // kg por SETOR e por mês — a peça aparece uma vez em cada setor por onde passa
  const porSetorMes = new Map();
  const mesesVistos = new Set();
  for (const a of ap) {
    if (!a.dataInicio) continue;
    const mes = a.dataInicio.toISOString().slice(0, 7);
    if (mes === mesCorrente) continue; // mês em curso não entra na média
    mesesVistos.add(mes);
    const setor = (a.setor || a.operacao || "—").trim();
    const chave = `${setor}|${mes}`;
    porSetorMes.set(chave, (porSetorMes.get(chave) || 0) + (Number(a.produzidoKg) || 0));
  }
  const nMeses = mesesVistos.size || 1;

  const porSetor = {};
  for (const [chave, kg] of porSetorMes) {
    const setor = chave.split("|")[0];
    porSetor[setor] = (porSetor[setor] || 0) + kg;
  }
  const setores = Object.entries(porSetor)
    .map(([setor, kg]) => ({ setor, kgMes: Math.round(kg / nMeses) }))
    .sort((a, b) => b.kgMes - a.kgMes);

  // ⚠ setor residual não vale como referência. "Preparação" aponta 12 t/mês — é registro solto,
  // não rota; eleger isso como cadência travaria a fábrica inteira num número sem sentido.
  const maior = setores[0]?.kgMes || 0;
  const relevantes = setores.filter((s) => s.kgMes >= maior * 0.2);
  // ⚠ a entrada é o CORTE: tudo que se fabrica passa por lá. Se o corte não aparecer no
  // apontamento, o maior setor é a melhor aproximação do que entra.
  const entrada = relevantes.find((s) => /corte/i.test(s.setor)) || relevantes[0] || null;
  const cadencia = entrada?.kgMes || 0;

  // ⚠ o custo da casa vem MEDIDO das contas a pagar, não digitado. Vitor (23/08/2026):
  // "analisando nossos pagamentos × folha do RH, tudo que você tem de informação". O
  // `custoTotalMensal` da configuração é R$ 784.270; o que a empresa paga por mês, sem material,
  // tinta, parafuso, frete, capex nem financeiro, é R$ 1.052.966 — 34% a mais. Preço formado em
  // cima do número digitado nasce barato e ninguém percebe.
  const casa = await custoDaCasa().catch(() => null);
  const digitado = Math.round(Number(cfg?.custoTotalMensal) || 0);

  const dados = {
    capacidadeKgMes: cadencia,
    setorEntrada: entrada?.setor || null,
    // mantido para quem já lê o campo: hoje a referência é a entrada, não um gargalo
    setorGargalo: entrada?.setor || null,
    // cada setor com a fração do peso que passa por ele — é rota, não velocidade
    setores: relevantes.map((s) => ({ ...s, pctDaEntrada: cadencia > 0 ? Math.round((s.kgMes / cadencia) * 100) : 0 })),
    setoresIgnorados: setores.filter((s) => s.kgMes < maior * 0.2),
    mesesConsiderados: nMeses,
    periodo: mesesVistos.size ? `${[...mesesVistos].sort()[0]} a ${[...mesesVistos].sort().pop()}` : null,
    custoOperacionalMes: casa?.custoMensal || digitado,
    custoMedido: casa?.custoMensal || 0,
    custoDigitado: digitado,
    custoPeriodo: casa?.periodo || null,
    custoPorKg: cadencia > 0 && casa?.custoMensal ? Math.round((casa.custoMensal / cadencia) * 100) / 100 : 0,
    grupos: casa?.grupos || [],
    categorias: (casa?.categorias || []).slice(0, 12),
  };
  cache = { em: Date.now(), dados };
  return dados;
}
