import "server-only";
import { prisma } from "./prisma";
import { custoDaCasa } from "./custo-casa";
import { rotaPorHora, HORAS_PESSOA_MES } from "./fabrica-horas";

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
    // ⚠ o efetivo POR SETOR vem daqui: é o único cadastro que diz quantas pessoas há em cada posto,
    // e sem ele não existe conta por hora.
    prisma.configCustoHora.findUnique({ where: { id: "default" }, select: { custoTotalMensal: true, setores: true, diasUteis: true, horasDia: true } }),
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
    // ⚠ além do kg, guarda DIAS e APONTAMENTOS: é com eles que se sabe se o mês foi fraco ou
    // apenas mal registrado — e o mal registrado, entrando na média, rebaixa a fábrica inteira.
    const atual = porSetorMes.get(chave) || { kg: 0, apontamentos: 0, diasSet: new Set() };
    atual.kg += Number(a.produzidoKg) || 0;
    atual.apontamentos += 1;
    atual.diasSet.add(a.dataInicio.toISOString().slice(0, 10));
    porSetorMes.set(chave, atual);
  }
  for (const v of porSetorMes.values()) { v.dias = v.diasSet.size; delete v.diasSet; }
  const nMeses = mesesVistos.size || 1;

  const porSetor = {};
  for (const [chave, dado] of porSetorMes) {
    const setor = chave.split("|")[0];
    porSetor[setor] = (porSetor[setor] || 0) + dado.kg;
  }

  // ─── MÉDIA NÃO É CAPACIDADE ─────────────────────────────────────────────────
  // Vitor (23/08/2026): "você pegou esse número da produção, porém eu acho que não é esse de
  // fato, pois nossa fábrica já teve alguns meses que entregou um número acima de 330 t".
  //
  // ⚠ ELE ESTÁ CERTO, E A DIFERENÇA É DE SIGNIFICADO. A média mede o que a fábrica ABSORVEU —
  // e nos últimos meses o que limitou não foi a fábrica, foi a carteira. Capacidade é outra
  // pergunta: o que ela AGUENTA. Chamar a média de capacidade faz toda obra parecer mais lenta
  // e mais cara do que precisa ser.
  //
  // ⚠ E NÃO DÁ PARA MEDIR CAPACIDADE POR HORA COM O DADO DE HOJE: no Syneco o apontamento é um
  // CARIMBO, não um intervalo — `dataFim` é igual a `dataInicio` nos 50.733 registros. Sem
  // duração não há kg/hora, e a tentativa por operador-dia explode (o acabamento fecha 63 t num
  // dia porque encerra um lote inteiro de uma vez, não porque produziu 63 t naquele dia).
  //
  // Então o que se mede honestamente são três leituras, e cada uma responde uma coisa:
  //   MÉDIA             o que a fábrica absorve hoje  → é a que forma o CUSTO por kg
  //   MELHOR TRIMESTRE  o que ela já sustentou 3 meses seguidos → piso confiável de capacidade
  //   MELHOR MÊS        o que ela já provou fazer uma vez  → teto observado
  const serie = new Map(); // setor -> [{ mes, kg, dias, apontamentos }] em ordem
  for (const [chave, dado] of porSetorMes) {
    const [setor, mes] = chave.split("|");
    if (!serie.has(setor)) serie.set(setor, []);
    serie.get(setor).push({ mes, ...dado });
  }
  // ⚠ O TRIMESTRE MENTE QUANDO O APONTAMENTO É IRREGULAR — e o do acabamento é. Vitor
  // (23/08/2026): "temos um furo enorme nos números de expedição, pintura e jato". O furo aparece
  // no kg POR APONTAMENTO: no acabamento ele salta de 129 kg (set/2025, 847 registros) para 400 kg
  // (fev/2026, 476 registros para 190 t). Não é a fábrica que acelerou — é o apontamento que
  // fechou lote atrasado de uma vez. Depois vem mai/2026 com 45 t: a ressaca do mesmo registro.
  //
  // Quem come essa distorção é a JANELA. Três meses ainda cabem inteiros dentro de um ciclo de
  // recuperação de backlog; seis, não. Por isso o número defensável é o MELHOR SEMESTRE:
  //   acabamento  trimestre 176.909 (inflado)  ·  semestre 136.220  ·  média 108.450
  //   corte       trimestre 168.865            ·  semestre 147.537  ·  média 132.055
  // Os dois semestres batem em 8% um do outro, medindo setores diferentes com registros de
  // qualidade diferente. É a melhor evidência que os dados dão do que a fábrica sustenta.
  const janela = (linha, n) => {
    let melhor = null;
    for (let i = 0; i + n - 1 < linha.length; i++) {
      const kg = linha.slice(i, i + n).reduce((a, x) => a + x.kg, 0) / n;
      if (!melhor || kg > melhor.kgMes) melhor = { kgMes: kg, de: linha[i].mes, ate: linha[i + n - 1].mes };
    }
    return melhor;
  };
  const leitura = (setor) => {
    const todos = (serie.get(setor) || []).sort((a, b) => a.mes.localeCompare(b.mes));
    if (!todos.length) return null;
    // ⚠ mês com poucos dias de apontamento não é mês fraco — é mês MAL REGISTRADO. Entrar na
    // média puxa tudo para baixo e faz a fábrica parecer mais lenta do que é.
    const linha = todos.filter((x) => x.dias >= 18);
    if (!linha.length) return { semDados: true, ultimoMes: todos[todos.length - 1].mes, mesesComDado: todos.length };
    const media = linha.reduce((a, x) => a + x.kg, 0) / linha.length;
    const pico = linha.reduce((a, x) => (x.kg > a.kg ? x : a), linha[0]);
    const tri = janela(linha, 3), sem = janela(linha, 6);
    // ⚠ granularidade: quanto o kg por apontamento oscila. Alto = registro em lote, número mensal
    // não é confiável sozinho.
    const gs = linha.map((x) => (x.apontamentos > 0 ? x.kg / x.apontamentos : 0)).filter((x) => x > 0);
    const gMin = Math.min(...gs), gMax = Math.max(...gs);
    return {
      mediaKgMes: Math.round(media),
      melhorMesKgMes: Math.round(pico.kg), melhorMes: pico.mes,
      melhorTrimestreKgMes: tri ? Math.round(tri.kgMes) : Math.round(media),
      melhorTrimestre: tri ? `${tri.de} a ${tri.ate}` : null,
      melhorSemestreKgMes: sem ? Math.round(sem.kgMes) : null,
      melhorSemestre: sem ? `${sem.de} a ${sem.ate}` : null,
      mesesCheios: linha.length,
      mesesComDado: todos.length,
      // ⚠ SEGUNDA FALHA DE REGISTRO, DIFERENTE DA PRIMEIRA: não é o lote grande, é o mês que quase
      // não tem dia apontado. Vitor (23/08/2026): "temos um furo enorme nos números de expedição,
      // pintura e jato". Na pintura só 2 dos 12 meses têm 18 dias ou mais de lançamento — os
      // outros são retratos parciais. Nenhum número dela se sustenta enquanto isso não mudar.
      registroFalho: todos.length >= 4 && linha.length / todos.length < 0.5,
      ultimoMes: todos[todos.length - 1].mes,
      // ⚠ 3× de oscilação no kg/apontamento = registro em lote; o mês isolado não vale. O corte
      // fica logo abaixo (2,6×) e é mesmo o setor mais bem registrado — 1.000 a 2.000 lançamentos
      // por mês. Acabamento (3,1×), jato e solda passam: fecham lote atrasado de uma vez.
      registroIrregular: gs.length > 2 && gMin > 0 && gMax / gMin > 3,
      kgPorApontamento: gs.length ? Math.round(gs.reduce((a, b) => a + b, 0) / gs.length) : 0,
    };
  };
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

  const leituras = leitura(entrada?.setor);
  // picos de cada setor: mostra que o teto observado não é o mesmo em toda a rota
  const picos = relevantes.map((x) => ({ setor: x.setor, ...(leitura(x.setor) || {}) }));

  const dados = {
    // ⚠ a CADÊNCIA PADRÃO continua sendo a média: é o que a fábrica absorve, e é ela que forma o
    // custo por quilo. Prometer capacidade que a carteira não enche é embutir desconto no preço.
    capacidadeKgMes: cadencia,
    leituras: leituras || null,
    picos,
    setorEntrada: entrada?.setor || null,
    // mantido para quem já lê o campo: hoje a referência é a entrada, não um gargalo
    setorGargalo: entrada?.setor || null,
    // cada setor com a fração do peso que passa por ele — é rota, não velocidade
    setores: relevantes.map((s) => ({ ...s, pctDaEntrada: cadencia > 0 ? Math.round((s.kgMes / cadencia) * 100) : 0 })),
    // ⚠ setor fora da conta não é setor parado — quase sempre é setor que PAROU DE APONTAR, e a
    // tela precisa dizer isso. A preparação some da rota desde dez/2025: as furadeiras magnéticas
    // e a rosqueadeira zeraram e não voltaram, enquanto o LASER PERFIL (que é corte mal rotulado)
    // migrou para o setor Corte. Mostrar "preparação faz 9% do peso" seria mentira de medição.
    setoresIgnorados: setores.filter((s) => s.kgMes < maior * 0.2)
      .map((s) => ({ ...s, ...(leitura(s.setor) || {}) })),
    mesesConsiderados: nMeses,
    periodo: mesesVistos.size ? `${[...mesesVistos].sort()[0]} a ${[...mesesVistos].sort().pop()}` : null,
    custoOperacionalMes: casa?.custoMensal || digitado,
    custoMedido: casa?.custoMensal || 0,
    custoDigitado: digitado,
    custoPeriodo: casa?.periodo || null,
    custoPorKg: cadencia > 0 && casa?.custoMensal ? Math.round((casa.custoMensal / cadencia) * 100) / 100 : 0,
    grupos: casa?.grupos || [],
    categorias: (casa?.categorias || []).slice(0, 12),
    diasUteis: Number(cfg?.diasUteis) || 22,
    horasDia: Number(cfg?.horasDia) || 8.75,
    horasPessoaMes: HORAS_PESSOA_MES,
  };
  // a rota posto a posto — efetivo do custo-hora casado com a produção do Syneco
  const r = rotaPorHora(Array.isArray(cfg?.setores) ? cfg.setores : [], dados.picos, HORAS_PESSOA_MES, dados.diasUteis);
  dados.rota = r.rota;
  dados.hhPorTRota = r.hhPorTRota;
  dados.pessoasChao = r.pessoas;
  cache = { em: Date.now(), dados };
  return dados;
}

