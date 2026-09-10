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
import { familiaDoPerfil } from "./familia-corte";
import { pecasNoTerceiro } from "./fora-da-fabrica";
import { croquiCortado, pecaEhComposta, pecaEhCroqui, ROTA_COMPOSTA, ROTA_SOLO } from "./prioridades-setor";

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

// Marca avulsa segue Corte → Jato. Croqui é componente e não entra nas filas posteriores.
function entradaPronta(p, setor, pronto) {
  const rota = pecaEhCroqui(p) ? ['CORTE'] : pecaEhComposta(p) ? ROTA_COMPOSTA : ROTA_SOLO;
  const i = rota.indexOf(setor), anterior = i > 0 ? rota[i - 1] : null;
  return !!anterior && ((anterior === 'CORTE' && croquiCortado(p)) || pronto(p, anterior));
}

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
  // ⚠ a SOLDA entra por "o que está na bancada" (ver naBancadaAgora), não por cascata — mas precisa
  // do par dia/bancada aqui para o quadro saber onde gravar quando alguém arrastar.
  SOLDA: { dia: "soldaDiaProgramado", bancada: "soldaBancada" },
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
/* ⚠⚠ QUEM ESTÁ NO TERCEIRO NÃO ESPERA BANCADA NOSSA — e quem manda nisso é a REMESSA, não a
   marcação da peça. Ver lib/terceiros-retorno.js: são duas portas para o mesmo fato, e a RT-03 da
   OP-097 (galvanização, 74 marcas) tinha romaneio emitido sem nenhuma peça marcada. A trava por
   `terceirizado` continua logo abaixo, na montagem: uma não substitui a outra.

   ⚠ E ISSO INCLUI OS CROQUIS do conjunto que foi para fora — é o que faltava para a PREPARAÇÃO,
   onde quem espera não é o conjunto do romaneio e sim o croqui dele. Ver lib/fora-da-fabrica.js. */
export async function filaDoSetor(setor) {
  const ant = ANTERIOR[setor];
  const campos = CAMPOS[setor];
  if (!ant || !campos) throw new Error(`Setor sem fila definida: ${setor}`);

  const pecas = await prisma.pecaConjunto.findMany({
    where: { ...SO_FABRICACAO, ...OP_VIVA },
    select: {
      id: true, opId: true, marca: true, descricao: true, perfil: true, qte: true,
      pesoTotalKg: true, tipoPeca: true, status: true,
      qteProduzida: true, corteConcluidoEm: true, baixaSetores: true, _count: { select: { conjuntoCroquis: true } },
      // ⚠⚠ JATO E PINTURA SE MEDEM EM SUPERFÍCIE. Vitor (07/09/2026): "no jato será necessário ter a
      // m² das peças". Faz sentido e vale para os dois: quem jateia e quem pinta cobre ÁREA, não
      // peso. Na fila de hoje a relação vai de 5 a 46 m² por tonelada conforme a peça — uma
      // tonelada de chapa fina jateia quase dez vezes mais que uma de perfil pesado, e programar
      // por kg trata as duas como iguais.
      //
      // ⚠ `areaPinturaM2` é a área TOTAL da linha, já multiplicada pela quantidade (o parser da LPC
      // soma quando a marca repete). Não multiplicar por `qte` de novo.
      areaPinturaM2: true,
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
    lerProduzidoPorSetor(chaves, [ant, 'CORTE']),
    lerProduzidoPorSetor(chaves, [setor]),
    lerProduzidoPorSetor(chaves, [SAIDA]),
  ]);

  const pronto = (p, s, fn) => fn({ opId: p.opId, marca: p.marca }, s) >= Math.max(1, p.qte || 1);

  const foraDaFabrica = await pecasNoTerceiro();

  const fila = pecas
    .filter((p) => !ehItemComprado(p))
    .filter((p) => !foraDaFabrica.has(p.id))
    // ⚠ pintada = fora do PCP, mesmo que o setor deste quadro não tenha sido apontado
    .filter((p) => !pronto(p, SAIDA, feitoSaida))
    .filter((p) => entradaPronta(p, setor, (peca, anterior) => pronto(peca, anterior, feitoAnt)) && !pronto(p, setor, feitoAqui))
    .map((p) => ({
      id: p.id, marca: p.marca, descricao: p.descricao, perfil: p.perfil,
      qte: Math.max(1, p.qte || 1), kg: Math.round(p.pesoTotalKg || 0),
      // null quando a LPC não trouxe — a tela mostra "sem área", que é diferente de zero
      m2: p.areaPinturaM2 == null ? null : Math.round(p.areaPinturaM2 * 100) / 100,
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
    const a = porOp.get(f.opNumero) || { opNumero: f.opNumero, obra: f.obra, pecas: 0, kg: 0, m2: 0, semArea: 0, semBancada: 0 };
    a.pecas += 1; a.kg += f.kg; if (!f.bancada) a.semBancada += 1;
    if (f.m2 == null) a.semArea += 1; else a.m2 += f.m2;
    porOp.set(f.opNumero, a);
  }
  const cap = CAPACIDADE[setor] || 0;
  const obras = [...porOp.values()]
    .map((o) => ({ ...o, m2: Math.round(o.m2 * 100) / 100, dias: cap ? Math.round((o.kg / cap) * 10) / 10 : null }))
    .sort((a, b) => b.kg - a.kg);

  const kg = fila.reduce((s, f) => s + f.kg, 0);
  const m2 = Math.round(fila.reduce((s, f) => s + (f.m2 || 0), 0) * 100) / 100;
  const semArea = fila.filter((f) => f.m2 == null).length;

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
    total: { pecas: fila.length, kg, m2, semArea, dias: cap ? Math.round((kg / cap) * 10) / 10 : null },
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
 * ⚠⚠ A SOLDA ENTROU EM 09/09/2026. Vitor: "isso só está valendo para montagem e preparação; para os
 * demais setores, quais obras estão em aberto para podermos programar". A regra de 08/09 — "só pode
 * aparecer as peças que o Gabriel programou" — vale para PREPARAÇÃO e MONTAGEM, que são o que o
 * Planejamento desce. Da solda em diante quem programa é o PCP, e ele precisa ver a fila para
 * decidir; esperar liberação ali é esperar por algo que não vem.
 *
 * ⚠ A PREPARAÇÃO CONTINUA FORA: ela é o começo da rota, não tem etapa anterior de onde cascatear, e
 * é justamente o que o Planejamento libera.
 */
export const CASCATA_FILA = { SOLDA: "MONTAGEM", ACABAMENTO: "SOLDA", JATO: "ACABAMENTO", PINTURA: "JATO" };
export const SETORES_COM_FILA = Object.keys(CASCATA_FILA);

/**
 * O que está na fila de entrada de cada setor e ainda NÃO foi programado (sem dia).
 * É o que o quadro desenha na faixa sem bancada.
 *
 * @returns {Promise<Record<string, Array<{opId,opNumero,obra,marca,qte,kg}>>>}
 */

/* ─── O QUE ESTÁ NA BANCADA AGORA ──────────────────────────────────────────────────────────────
   Vitor (08/09/2026): "traga as peças que estão nas bancadas de solda, acabamento, jato e pintura;
   nesse caso não traga apenas as que programamos, traga todas" — e, na sequência: "todas que têm
   apontamento" e "não me venha com obras antigas que nem apontamento atual têm".

   ⚠⚠ O CRITÉRIO É FATO, NÃO DEDUÇÃO. Peça com ordem ABERTA no Syneco (começou e ainda tem saldo)
   está fisicamente naquela bancada — não é fila deduzida pelo portal, que foi o que ele mandou
   tirar do quadro em 07/09 ("do restante ignora, senão você vai me deixar maluco"). Por isso esta
   lista NÃO passa pelo filtro de liberação: quem apontou já respondeu a pergunta.

   ⚠ A JANELA EXISTE POR CAUSA DA SEGUNDA FRASE. Sem corte de tempo são 203 marcas em 8 obras,
   incluindo ordem parada desde o ano passado. Medido em 08/09/2026: 7 dias → 35 marcas · 15 dias →
   50 · 30 dias → 110 · sem limite → 203. Ficou em 15 dias, que é o que responde "atual"; mudar é
   esta linha.

   ⚠ A SOLDA ENTRA SÓ POR AQUI. Ela não tem cascata como acabamento/jato/pintura (a fila dela vem da
   tela própria, /pcp/fila-solda); o que faltava no quadro era enxergar o que já está na bancada. */
const DIAS_NA_BANCADA = 15;
const SETOR_SYNECO_BANCADA = { Solda: "SOLDA", Acabamento: "ACABAMENTO", Jato: "JATO", Pintura: "PINTURA" };

async function naBancadaAgora() {
  const desde = new Date(Date.now() - DIAS_NA_BANCADA * 86400000);
  const abertas = await prisma.mesOrdem.findMany({
    where: {
      setor: { in: Object.keys(SETOR_SYNECO_BANCADA) },
      produzidoUn: { gt: 0 },   // começou
      saldoUn: { gt: 0 },       // e ainda falta
      OR: [{ dataFim: { gte: desde } }, { dataFim: null, dataInicio: { gte: desde } }],
    },
    select: { opId: true, item: true, setor: true, saldoUn: true },
  });
  const porSetor = {};
  for (const o of abertas) {
    if (!o.opId || !o.item) continue;
    const setor = SETOR_SYNECO_BANCADA[o.setor];
    (porSetor[setor] ??= new Map()).set(`${o.opId}|${String(o.item).trim().toUpperCase()}`, o.saldoUn);
  }
  return porSetor;
}

export async function filasSemProgramacao() {
  const campos = {};
  for (const s of SETORES_COM_FILA) Object.assign(campos, { [CAMPOS[s].dia]: true });

  const pecas = await prisma.pecaConjunto.findMany({
    where: { ...SO_FABRICACAO, ...OP_VIVA },
    select: {
      id: true, opId: true, marca: true, qte: true, pesoTotalKg: true, perfil: true, material: true,
      descricao: true, tipoPeca: true, ...campos,
      terceirizado: true, terceirizadoRecebidoEm: true,
      qteProduzida: true, corteConcluidoEm: true, baixaSetores: true, _count: { select: { conjuntoCroquis: true } },
      // ⚠ o corte entra por um caminho próprio (logo abaixo) e precisa destes três
      corteDiaProgramado: true, criadoEm: true, maquina: true,
      op: { select: { numero: true, obra: true } },
    },
    take: LIMITE_PECAS,
  });

  const chaves = pecas.map((p) => ({ opId: p.opId, marca: p.marca }));
  const setoresLidos = [...new Set(["CORTE", SAIDA, ...SETORES_COM_FILA, ...SETORES_COM_FILA.map((s) => CASCATA_FILA[s])])];
  const feito = await lerProduzidoPorSetor(chaves, setoresLidos);
  const pronto = (p, s) => feito({ opId: p.opId, marca: p.marca }, s) >= Math.max(1, p.qte || 1);

  const uteis = pecas.filter((p) => !ehItemComprado(p)).filter((p) => !pronto(p, SAIDA))
    // A mesma espera por recebimento do salvamento e dos lotes já programados.
    // Apontamento anterior não prova retorno; o despacho pode ainda não ter romaneio.
    .filter((p) => !(p.terceirizado && !p.terceirizadoRecebidoEm));

  const saida = {};
  for (const setor of SETORES_COM_FILA) {
    saida[setor] = uteis
      // ⚠ SÓ O QUE AINDA NÃO TEM DIA: o que já foi programado o quadro desenha na bancada, e
      // aparecer nos dois lugares faria a mesma peça ser contada duas vezes na carga do setor.
      .filter((p) => !p[CAMPOS[setor].dia])
      .filter((p) => entradaPronta(p, setor, pronto) && !pronto(p, setor))
      .map((p) => ({
        id: p.id, opId: p.opId, opNumero: p.op?.numero || null, obra: p.op?.obra || null,
        marca: p.marca, perfil: p.perfil, material: p.material, qte: Math.max(1, p.qte || 1),
        pesoTotalKg: p.pesoTotalKg || 0,
      }));
  }

  /* ─── O CORTE, pela ausência de dia ───────────────────────────────────────────────────────────
     ⚠⚠ Vitor (08/09/2026), depois de programar chapas da OP-097 e não achá-las no quadro: "nesses
     casos que não programarmos dia o correto é deixar na aba de sem máquinas e puxar para o dia da
     importação". A raia já existia em _gantt/recursos.js (CORTE → "sem máquina"); o que faltava era
     alguém alimentá-la. Peça sem dia não sumia de propósito — sumia por esquecimento.

     ⚠ NÃO HÁ CASCATA AQUI. Os outros setores entram na fila quando o ANTERIOR fecha; o corte é o
     primeiro da rota e não tem anterior. O filtro é outro: ainda não tem dia e ainda não foi
     cortada no Syneco.

     ⚠ CONJUNTO FICA DE FORA. Quem passa pelo corte é o CROQUI e a peça avulsa — o conjunto nasce na
     montagem, a partir deles. Incluí-lo contaria o mesmo aço duas vezes [[torg_peso_real_op]].

     ⚠ O DIA É O DA IMPORTAÇÃO, não hoje. Nas outras raias a fila é ancorada em hoje ("está
     esperando agora"); aqui Vitor pediu a data de entrada da peça, e ela diz mais: mostra HÁ QUANTO
     TEMPO cada lote espera programação. A OP-067 tem peça importada em 16/06 ainda sem dia. */
  saida.CORTE = uteis
    .filter((p) => !p.corteDiaProgramado && !pecaEhComposta(p))
    .filter((p) => !croquiCortado(p) && !pronto(p, "CORTE"))
    .map((p) => ({
      id: p.id, opId: p.opId, opNumero: p.op?.numero || null, obra: p.op?.obra || null,
      marca: p.marca, perfil: p.perfil, material: p.material, qte: Math.max(1, p.qte || 1),
      pesoTotalKg: p.pesoTotalKg || 0,
      dia: p.criadoEm || null,
      /* ⚠⚠ A MÁQUINA JÁ ESCOLHIDA VAI JUNTO. Vitor (08/09/2026), sobre a OP-094: "a programação
         ainda está conjunta, preciso que separe por tipo de perfil". Metade do problema era o
         classificador não conhecer a notação da casa (lib/lqs.js); a outra metade era esta fila,
         que jogava TUDO na raia "sem máquina" mesmo quando a peça já tinha laser definido — 133
         das 501 peças da 094 tinham. Sem isto o quadro nega uma decisão que já foi tomada. */
      maquina: p.maquina || null,
      /* ⚠ SÓ PARA QUEM NÃO TEM MÁQUINA: a família vira uma barra separada, para o PCP arrastar o
         ferro redondo inteiro para o laser livre sem levar a chapa junto (Vitor, 08/09/2026). Quem
         já tem máquina não precisa: a própria raia da máquina já separa. */
      familia: p.maquina ? null : familiaDoPerfil(p.perfil),
    }));

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
      id: true, opId: true, marca: true, qte: true, pesoTotalKg: true, perfil: true, material: true,
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
      marca: c.marca, perfil: c.perfil, material: c.material, qte: Math.max(1, c.qte || 1),
      pesoTotalKg: c.pesoTotalKg || 0,
    }));

  /* ⚠ O CORTE VALE PARA TODAS AS RAIAS, e por isso é feito aqui e não dentro de cada uma: são
     quatro caminhos diferentes (cascata, corte pela ausência de dia, montagem pela prontidão) e
     repetir a regra em cada um garantiria que a quinta esqueceria dela. */
  /* ⚠ A BANCADA ENTRA POR CIMA do que a cascata já trouxe — são perguntas diferentes: "já pode
     começar" (cascata) e "já está na mão de alguém" (apontamento aberto). Nenhuma das duas cobre a
     outra, e o mesmo id nunca entra duas vezes. */
  const bancada = await naBancadaAgora();
  /* ⚠⚠ SÓ AS OBRAS QUE O PCP ESTÁ TOCANDO ENTRAM NO QUADRO. Vitor (08/09/2026): "83, 84 e 89 não
     pode ser que tenha alguma coisa; prefiro que faça uma lista disso à parte, só pode aparecer
     97, 102, 103". Nada no dado separa os dois grupos (a 083 tem GRD e liberação recentes; a 089,
     54 GRDs em 15 dias) — então quem decide é o campo `OP.pcpNoQuadro`, não uma regra deduzida.
     O que fica de fora NÃO some: sai em `foraDoQuadro`, para a lista à parte do Gantt. */
  const foraDoQuadro = {};
  const noQuadro = new Set((await prisma.oP.findMany({ where: { pcpNoQuadro: true }, select: { id: true } })).map((o) => o.id));
  for (const [setor, chaves] of Object.entries(bancada)) {
    if (!chaves.size) continue;
    const jaTem = new Set((saida[setor] || []).map((p) => p.id));
    const extras = uteis.filter((p) => !pecaEhCroqui(p) && !jaTem.has(p.id)
      && chaves.has(`${p.opId}|${String(p.marca).trim().toUpperCase()}`)
      && !p[CAMPOS[setor]?.dia || "__"]);
    const linha = (p) => ({
      id: p.id, opId: p.opId, opNumero: p.op?.numero || null, obra: p.op?.obra || null,
      marca: p.marca, perfil: p.perfil, qte: Math.max(1, p.qte || 1),
      pesoTotalKg: p.pesoTotalKg || 0, naBancada: true, setor,
    });
    saida[setor] = [...(saida[setor] || []), ...extras.filter((p) => noQuadro.has(p.opId)).map(linha)];
    const deFora = extras.filter((p) => !noQuadro.has(p.opId)).map(linha);
    if (deFora.length) (foraDoQuadro[setor] ??= []).push(...deFora);
  }

  const foraDaFabrica = await pecasNoTerceiro();
  for (const setor of Object.keys(saida))
    saida[setor] = saida[setor].filter((p) => !foraDaFabrica.has(p.id));
  for (const setor of Object.keys(foraDoQuadro))
    foraDoQuadro[setor] = foraDoQuadro[setor].filter((p) => !foraDaFabrica.has(p.id));

  // ⚠ vai numa chave à parte, não misturada nas raias: o quadro desenha `saida`, a lista lê esta.
  Object.defineProperty(saida, "__foraDoQuadro", { value: foraDoQuadro, enumerable: false });
  return saida;
}
