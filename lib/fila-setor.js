import "server-only";
import { prisma } from "./prisma";
import { lerProduzidoPorSetor } from "./produzido-setor";
import { OP_VIVA } from "./op-viva";
import { SO_FABRICACAO } from "./lista-pecas";
import { ehItemComprado } from "./item-comprado";
import { calcularProntidao, CONJUNTO_MONTAVEL } from "./prontidao-conjunto";
import { META_KG_DIA_ACABAMENTO, META_KG_DIA_JATO } from "./capacidade-acabamento";
import { META_KG_DIA_PINTURA } from "./capacidade-pintura";
import { consumoDoPlano } from "./consumo-tinta-plp";

// ─── A FILA DE ENTRADA DE UM SETOR ─────────────────────
//
// ⚠⚠ A CASCATA. Vitor (06/09/2026): "o que for ficando pronto da solda já deve aparecer para a fila
// do acabamento e o que for ficando pronto do acabamento aparecer na fila do jato — igual fizemos
// na solda". Não há liberação a fazer: terminar o setor anterior É a entrada no seguinte.
//
// Espelha app/pcp/fila-solda (que faz o mesmo para "montado e não soldado"), com uma diferença: lá
// o custo é peça por faixa de peso, aqui é KG contra a capacidade do setor — acabamento e jato não
// têm régua por faixa, têm uma esteira só.
//
// ⚠ PRONTO É O SYNECO, não o status da peça. `PecaConjunto.status` só avança até o corte; depois
// disso ele mente. Quem responde "terminou no setor X" é o apontamento — ver lib/produzido-setor.js.
//
// ⚠ ITEM COMPRADO FICA DE FORA: borracha, pino e cilindro não passam por jato nem acabamento, e
// somá-los cria fila que ninguém vai executar.
//
// ⚠⚠ O QUE ESTA LIB NÃO CONSEGUE FILTRAR, e vai aparecer na tela: obra ACABADA que continua com
// status ABERTA. O `OP_VIVA` corta ENCERRADA e CANCELADA, e nada mais — medido em 06/09/2026, das
// 26 OPs "abertas" só 5 estavam de fato em produção. Enquanto isso não for arrumado, as filas
// mostram trabalho morto das obras antigas (067, 084, 083, 060 lideram as duas).

// ⚠⚠ PINTURA É A PORTA DE SAÍDA DO PCP. Vitor (06/09/2026): "após passar pela pintura essas peças
// não devem nem aparecer em fila alguma mais, isso já cai para fora da tela do portal do PCP".
//
// Não é hipótese: os setores do Syneco NÃO são estritamente sequenciais. Peça pode ter pintura
// apontada sem ter acabamento — porque aquele acabamento não era necessário, ou porque ninguém
// apontou e ela seguiu. Medido em 06/09/2026, antes deste filtro: das 257 peças na fila do
// acabamento, 114 (29.375 kg — mais da METADE do peso) já estavam pintadas. No jato, 22 de 212.
//
// Sem esta regra o PCP programa trabalho que já saiu da fábrica.
const SAIDA = "PINTURA";

/** Setor anterior na cadeia — é dele que a fila de cada um se alimenta. */
export const ANTERIOR = { ACABAMENTO: "SOLDA", JATO: "ACABAMENTO", PINTURA: "JATO" };

/** Capacidade diária do setor, em kg (a meta, não o medido). */
export const CAPACIDADE = {
  ACABAMENTO: META_KG_DIA_ACABAMENTO,
  JATO: META_KG_DIA_JATO,
  PINTURA: META_KG_DIA_PINTURA,
};

/**
 * Teto de peças lidas por consulta. Alto de propósito: o valor anterior (8.000) ficava ABAIXO do
 * número real de peças de OP viva e cortava a fila sem avisar. Se este teto for atingido a função
 * devolve `truncado: true` — nunca uma fila curta em silêncio.
 */
const LIMITE_PECAS = 30000;

/** Campos de gravação do setor no PecaConjunto. */
export const CAMPOS = {
  ACABAMENTO: { dia: "acabamentoDiaProgramado", bancada: "acabamentoBancada" },
  JATO: { dia: "jatoDiaProgramado", bancada: "jatoBancada" },
  PINTURA: { dia: "pinturaDiaProgramado", bancada: "pinturaBancada" },
};

/**
 * As bancadas de cada setor. Acabamento tem uma; o jato tem turbina e manual.
 *
 * ⚠ NA PINTURA A "BANCADA" É O GALPÃO. Vitor (06/09/2026): "temos galpões separados, hoje tem o
 * galpão 1 que fica na Torg onde pintamos quase todas as estruturas, e o Galpão 2 que seria um
 * galpão apoio que pintamos peças leves, como chapas, travamentos, coisa que daria para virar na
 * mão, até guarda-corpo". Um terceiro barracão está em negociação e NÃO entra aqui até fechar —
 * quando fechar, é uma linha nesta lista e mais nada.
 */
export const BANCADAS = {
  ACABAMENTO: [{ k: "ACABAMENTO", nome: "Acabamento" }],
  JATO: [{ k: "JATO_TURBINA", nome: "Jato Turbina" }, { k: "JATO_MANUAL", nome: "Jato Manual" }],
  PINTURA: [{ k: "GALPAO_1", nome: "Galpão 1" }, { k: "GALPAO_2", nome: "Galpão 2" }],
};

/**
 * O que terminou o setor anterior e ainda não terminou este.
 * @param {"ACABAMENTO"|"JATO"|"PINTURA"} setor
 */
export async function filaDoSetor(setor) {
  const ant = ANTERIOR[setor];
  const campos = CAMPOS[setor];
  if (!ant || !campos) throw new Error(`Setor sem fila definida: ${setor}`);

  const pecas = await prisma.pecaConjunto.findMany({
    where: { ...SO_FABRICACAO, ...OP_VIVA },
    select: {
      id: true, opId: true, marca: true, descricao: true, perfil: true, qte: true,
      pesoTotalKg: true, tipoPeca: true, status: true,
      [campos.dia]: true, [campos.bancada]: true,
      op: { select: { numero: true, obra: true, cliente: true } },
    },
    take: LIMITE_PECAS,
  });

  // ⚠⚠ TRUNCAMENTO SILENCIOSO — o bug que este limite já causou. Com `take: 8000` a consulta
  // devolvia as 8.000 primeiras peças de OP viva e a fila simplesmente NÃO via o resto: não havia
  // erro, número faltando nem aviso, só uma fila menor do que a realidade. Medido em 06/09/2026,
  // logo depois de encerrar 11 OPs terminadas: 8.083 peças de OP viva — 83 acima do teto. A fila
  // da pintura da OP-067 saltou de 158 para 186 peças só por caber, o que é como o problema
  // apareceu. Antes do encerramento, com 27 OPs abertas, o corte era muito maior.
  //
  // O teto continua existindo (a compute do Neon é pequena — ver o aviso de OOM no CLAUDE.md), mas
  // agora ele AVISA em vez de mentir: quem consome devolve o `truncado` para a tela.
  const truncado = pecas.length >= LIMITE_PECAS;

  const chaves = pecas.map((p) => ({ opId: p.opId, marca: p.marca }));
  const [feitoAnt, feitoAqui, feitoSaida] = await Promise.all([
    lerProduzidoPorSetor(chaves, [ant]),
    lerProduzidoPorSetor(chaves, [setor]),
    lerProduzidoPorSetor(chaves, [SAIDA]),
  ]);

  const pronto = (p, s, fn) => fn({ opId: p.opId, marca: p.marca }, s) >= Math.max(1, p.qte || 1);

  const fila = pecas
    .filter((p) => !ehItemComprado(p))
    // ⚠ pintada = fora do PCP, mesmo que o setor deste quadro não tenha sido apontado
    .filter((p) => !pronto(p, SAIDA, feitoSaida))
    .filter((p) => pronto(p, ant, feitoAnt) && !pronto(p, setor, feitoAqui))
    .map((p) => ({
      id: p.id, marca: p.marca, descricao: p.descricao, perfil: p.perfil,
      qte: Math.max(1, p.qte || 1), kg: Math.round(p.pesoTotalKg || 0),
      tipoPeca: p.tipoPeca,
      opNumero: p.op?.numero || null, obra: p.op?.obra || null, cliente: p.op?.cliente || null,
      dia: p[campos.dia] ? p[campos.dia].toISOString().slice(0, 10) : null,
      bancada: p[campos.bancada] || null,
      feitoAqui: Math.round(feitoAqui({ opId: p.opId, marca: p.marca }, setor)),
    }))
    .sort((a, b) => String(a.opNumero).localeCompare(String(b.opNumero)) || String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }));

  // resumo por OP: é assim que o PCP escolhe o que atacar
  const porOp = new Map();
  for (const f of fila) {
    const a = porOp.get(f.opNumero) || { opNumero: f.opNumero, obra: f.obra, pecas: 0, kg: 0, semBancada: 0 };
    a.pecas += 1; a.kg += f.kg; if (!f.bancada) a.semBancada += 1;
    porOp.set(f.opNumero, a);
  }
  const cap = CAPACIDADE[setor] || 0;
  const obras = [...porOp.values()]
    .map((o) => ({ ...o, dias: cap ? Math.round((o.kg / cap) * 10) / 10 : null }))
    .sort((a, b) => b.kg - a.kg);

  const kg = fila.reduce((s, f) => s + f.kg, 0);

  // ─── SÓ NA PINTURA: o que o PLP da obra já responde ──────────────────────────────────────────
  //
  // ⚠⚠ Vitor (07/09/2026): "para essas obras que não temos as especificações do PLP teria uma
  // maneira de, quando formos selecionar essas peças para pintura, deixar informar essas partes e
  // já fazer o cálculo?". Para a tela poder perguntar, ela primeiro precisa saber O QUE FALTA — e é
  // por obra, não por peça. Medido em 07/09: das 5 obras na fila, 4 não têm PLP nenhuma e a quinta
  // (067) tem PLP mas sem sólidos por volume, então também não fecha o litro.
  //
  // ⚠ NÃO GRAVA NADA. O que a pessoa informar na tela vai para o AuditLog da liberação e morre lá —
  // o PlanoPintura continua sendo documento da Qualidade, e tem de vir preenchido da engenharia.
  let pintura;
  if (setor === "PINTURA") {
    const ops = [...new Set(fila.map((f) => f.opNumero).filter(Boolean))];
    const [planos, area] = await Promise.all([
      prisma.planoPintura.findMany({ where: { opNumero: { in: ops } } }),
      // ⚠ por ID e depois somado pela OP da própria fila: o objeto que a fila devolve não carrega
      // `opId` (só `opNumero`), e agrupar por uma chave que não existe devolvia área ZERO em todas
      // as obras sem erro nenhum — o pior tipo de bug, o que responde com um número plausível.
      prisma.pecaConjunto.findMany({
        where: { id: { in: fila.map((f) => f.id) } },
        select: { id: true, areaPinturaM2: true },
      }),
    ]);
    const m2PorId = new Map(area.map((a) => [a.id, a.areaPinturaM2 || 0]));
    const areaPorOp = new Map();
    for (const f of fila) areaPorOp.set(f.opNumero, (areaPorOp.get(f.opNumero) || 0) + (m2PorId.get(f.id) || 0));
    const porOp = new Map(planos.map((p) => [p.opNumero, p]));
    pintura = obras.map((o) => {
      const plano = porOp.get(o.opNumero);
      const m2 = Math.round((areaPorOp.get(o.opNumero) || 0) * 100) / 100;
      const r = plano ? consumoDoPlano(plano, m2, {}) : null;
      return {
        opNumero: o.opNumero, m2,
        temPlp: !!plano,
        demaos: r ? r.camadas.length : null,
        litros: r?.total.litros ?? null,
        galoes: r?.total.galoes ?? null,
        // o que impede o cálculo, por camada — é o que a tela vai pedir
        falta: !plano ? ["PLP da obra"] : [...new Set(r.camadas.map((c) => c.falta).filter(Boolean))],
      };
    });
  }

  return {
    setor, anterior: ant, bancadas: BANCADAS[setor], capacidadeKgDia: cap, truncado,
    ...(pintura ? { pintura } : {}),
    total: { pecas: fila.length, kg, dias: cap ? Math.round((kg / cap) * 10) / 10 : null },
    obras, fila,
  };
}

// ─── A FILA DENTRO DO QUADRO ───────────────────────────
//
// ⚠⚠ POR QUE ISTO EXISTE. Vitor (07/09/2026): "na parte do acabamento, jato e pintura continuam sem
// nada programado, não temos nenhuma OP que tenha saído da solda e já era para estar nessas filas?".
// Tinha — 156 peças no acabamento, 200 no jato, 246 na pintura. O quadro mostrava "sem programação"
// porque só desenha o que já tem DIA e POSTO atribuídos, e ninguém tinha atribuído nada.
//
// Isso contrariava o que ele mesmo tinha pedido em 06/09: "teria que ficar primeiramente em uma
// fila sem bancada, depois selecionar a bancada única do acabamento e jato". A faixa "sem bancada"
// existia no quadro e nascia vazia para sempre — a fila só aparecia na tela separada, e quem abria
// o Gantt via a fábrica parada nesses três setores.
//
// ⚠ UMA CARGA SÓ PARA OS TRÊS SETORES. Chamar `filaDoSetor` três vezes seriam três varreduras da
// PecaConjunto e nove leituras de produzido. Aqui a peça é lida uma vez e o `lerProduzidoPorSetor`
// cobre a cadeia inteira de uma vez.

/**
 * Setores cuja fila de entrada aparece na faixa "sem bancada" do quadro, e de onde cada um se
 * alimenta.
 *
 * ⚠ A SOLDA E A PREPARAÇÃO NÃO ENTRAM. Vitor (07/09/2026): "preparação e montagem é o planejamento
 * quem vai descer" — e a solda já tem tela própria (/pcp/fila-solda) com regra própria. A montagem
 * é a exceção e está logo abaixo, por um caminho diferente.
 */
const CASCATA_FILA = { ACABAMENTO: "SOLDA", JATO: "ACABAMENTO", PINTURA: "JATO" };
const SETORES_COM_FILA = Object.keys(CASCATA_FILA);

/**
 * O que está na fila de entrada de cada setor e ainda NÃO foi programado (sem dia).
 * É o que o quadro desenha na faixa sem bancada.
 *
 * @returns {Promise<Record<string, Array<{opId,opNumero,obra,marca,qte,kg}>>>}
 */
export async function filasSemProgramacao() {
  const campos = {};
  for (const s of SETORES_COM_FILA) Object.assign(campos, { [CAMPOS[s].dia]: true });

  const pecas = await prisma.pecaConjunto.findMany({
    where: { ...SO_FABRICACAO, ...OP_VIVA },
    select: {
      id: true, opId: true, marca: true, qte: true, pesoTotalKg: true, perfil: true,
      descricao: true, tipoPeca: true, ...campos,
      op: { select: { numero: true, obra: true } },
    },
    take: LIMITE_PECAS,
  });

  const chaves = pecas.map((p) => ({ opId: p.opId, marca: p.marca }));
  const setoresLidos = [...new Set([SAIDA, ...SETORES_COM_FILA, ...SETORES_COM_FILA.map((s) => CASCATA_FILA[s])])];
  const feito = await lerProduzidoPorSetor(chaves, setoresLidos);
  const pronto = (p, s) => feito({ opId: p.opId, marca: p.marca }, s) >= Math.max(1, p.qte || 1);

  const uteis = pecas.filter((p) => !ehItemComprado(p)).filter((p) => !pronto(p, SAIDA));

  const saida = {};
  for (const setor of SETORES_COM_FILA) {
    const ant = CASCATA_FILA[setor];
    saida[setor] = uteis
      // ⚠ SÓ O QUE AINDA NÃO TEM DIA: o que já foi programado o quadro desenha na bancada, e
      // aparecer nos dois lugares faria a mesma peça ser contada duas vezes na carga do setor.
      .filter((p) => !p[CAMPOS[setor].dia])
      .filter((p) => pronto(p, ant) && !pronto(p, setor))
      .map((p) => ({
        id: p.id, opId: p.opId, opNumero: p.op?.numero || null, obra: p.op?.obra || null,
        marca: p.marca, perfil: p.perfil, qte: Math.max(1, p.qte || 1),
        pesoTotalKg: p.pesoTotalKg || 0,
      }));
  }

  // ─── A MONTAGEM, pela prontidão do conjunto ────────────────────────────────────────────────
  //
  // ⚠⚠ ELA ENTRA, MAS POR OUTRO CAMINHO. Vitor (07/09/2026): "se você tem peças cortadas que dão
  // montagem realmente você deve listar elas na montagem como sem bancada". O dia continua sendo do
  // Planejamento — o que a faixa faz é MOSTRAR o que já dá para programar, não decidir por ele.
  //
  // ⚠ NÃO DÁ PARA USAR A CASCATA AQUI, e tentar produz número absurdo: "pronto no corte e não
  // montado" devolvia 3.759 peças e 281 t, das quais 96% eram CROQUI (3.387 peças, 245 t). Croqui
  // não vai para bancada — é componente. O conjunto nunca é "cortado" no Syneco; quem é cortado são
  // os croquis dele. A regra certa mora em lib/prontidao-conjunto.js e é dura de propósito: Vitor
  // (01/09/2026) pediu "por conjunto que tenha todas as sub peças prontas para iniciar a montagem".
  // Com ela a fila real é 22 conjuntos e 9.166 kg.
  const conjuntos = await prisma.pecaConjunto.findMany({
    where: { ...CONJUNTO_MONTAVEL, ...OP_VIVA, montagemDiaProgramado: null },
    select: {
      id: true, opId: true, marca: true, qte: true, pesoTotalKg: true, perfil: true,
      terceirizado: true, terceirizadoRecebidoEm: true,
      op: { select: { numero: true, obra: true } },
      conjuntoCroquis: { select: { croqui: { select: { marca: true, qte: true, qteProduzida: true } } } },
    },
    take: LIMITE_PECAS,
  });
  // ⚠⚠ SETOR POSTERIOR PROVA A MONTAGEM. Vitor (07/09/2026) perguntou se alguma das marcas "em
  // aberto na montagem" tinha apontamento em outro setor. Tinha: dos 441 conjuntos sem dia, 139
  // (5.740 kg, sendo 137 da OP-067) já estavam apontados em solda, acabamento, jato ou pintura.
  // Se a peça foi SOLDADA, ela foi montada — o que faltou foi apontar a montagem, não montar.
  //
  // É a mesma regra que já vale para a pintura ("peça pintada sai de todas as filas"), estendida a
  // toda a cadeia seguinte: qualquer apontamento adiante tira o conjunto da fila de montagem.
  const POSTERIORES = ["SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
  const feitoConj = await lerProduzidoPorSetor(
    conjuntos.map((c) => ({ opId: c.opId, marca: c.marca })), ["MONTAGEM", ...POSTERIORES]
  );
  const prontoConj = (c, s) => feitoConj({ opId: c.opId, marca: c.marca }, s) >= Math.max(1, c.qte || 1);
  const andouAdiante = (c) => POSTERIORES.some((s) => feitoConj({ opId: c.opId, marca: c.marca }, s) > 0);

  saida.MONTAGEM = conjuntos
    .filter((c) => !prontoConj(c, "MONTAGEM") && !andouAdiante(c))
    // ⚠ O QUE ESTÁ NO TERCEIRO NÃO ESPERA BANCADA NOSSA. Enquanto não voltar
    // (`terceirizadoRecebidoEm` nulo) ele não é fila de montagem. Medido em 07/09/2026 na OP-085:
    // dos 50 conjuntos sem dia, 46 são terceirizados — os guarda-corpos que Vitor mandou para fora.
    .filter((c) => !(c.terceirizado && !c.terceirizadoRecebidoEm))
    // ⚠ `pronto`, não `podeLiberar`: a regra da metade serve para a fábrica COMEÇAR; para marcar o
    // dia o critério é ter tudo cortado. São perguntas diferentes e a lib separa as duas.
    .filter((c) => calcularProntidao(c).pronto)
    .map((c) => ({
      id: c.id, opId: c.opId, opNumero: c.op?.numero || null, obra: c.op?.obra || null,
      marca: c.marca, perfil: c.perfil, qte: Math.max(1, c.qte || 1),
      pesoTotalKg: c.pesoTotalKg || 0,
    }));

  return saida;
}
