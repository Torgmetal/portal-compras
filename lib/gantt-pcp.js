import "server-only";
import { previsoesTerceiro, lotesRecebidosTerceiro } from "./terceiros-previsao";
import { pecasNoTerceiro } from "./fora-da-fabrica";
import { prisma } from "./prisma";
import { OP_VIVA } from "./op-viva";
import { SO_FABRICACAO } from "./lista-pecas";
import { filasSemProgramacao } from "./fila-setor";
import { custoDoConjunto as custoMontagem, RITMO_NORMAL } from "./montagem-capacidade";
import { custoDoConjunto as custoSolda, RITMO_CONSERVADOR } from "./solda-capacidade";
import { lerProduzidoPorSetor } from "./produzido-setor";
import { lerProntidaoGantt, conferirEntradaMontagem } from "./gantt-prontidao-servidor";
import { partesAtuais, moverFaixa, expandirPeca } from "./gantt-distribuicao";
import { destinosFinais } from "./gantt-destinos";

// ─── O QUE ESTÁ PROGRAMADO, EM UMA GRADE SÓ ────────────────────────────────────────────────────
//
// Vitor (05/09/2026): "na página do PCP, quero que crie acima desse painel um gantt que seja
// visualmente fácil de ver, esse gantt tem que ser possível de migrar as programações entre setores
// e dias arrastando elas".
//
// Os campos antigos de dia/recurso continuam como âncora e sinalizam peça programada.
// GanttDistribuicao registra as faixas de unidades por setor; leitura e lista do posto expandem
// essas faixas antes de contabilizar quantidade, peso, custo e produção. Alterar dia/recurso/qte
// por outra tela invalida a distribuição. Uma regravação idêntica da âncora não é distinguível.
// A unidade visual continua sendo setor + recurso + OP + dia, podendo conter parte de uma marca.
//
// ⚠ O CUSTO VEM DAS RÉGUAS QUE JÁ EXISTEM (lib/montagem-capacidade, lib/solda-capacidade), não de
// uma conta nova aqui. Montagem = o maior entre peças/faixa e 7 t por bancada-dia; solda =
// peças/faixa. Corte não tem custo em dias: mede-se em kg contra a capacidade da máquina, e isso
// a tela resolve, porque a capacidade é do RECURSO e não da peça.

const iso = (d) => new Date(d).toISOString().slice(0, 10);

const SELECAO = {
  id: true, opId: true, opNumero: true, marca: true, qte: true, qteProduzida: true, terceirizado: true, terceirizadoRecebidoEm: true,
  pesoTotalKg: true, perfil: true, material: true, tipoPeca: true, op: { select: { numero: true, obra: true } },
};

// ⚠ O "feito" NÃO sai de `qteProduzida` — aquele campo só é escrito pelo import de corte e devolve
// zero em montagem e solda. A conta canônica mora em lib/produzido-setor.js, com a medição que
// motivou a separação. Foi este quadro que expôs o problema (OP-097 mostrava "0 de 242 feitas" com
// metade da obra montada), mas o erro não era só daqui.

// ⚠⚠ O QUADRO SÓ OLHA A LPC, E SÓ OBRA VIVA. Vitor (07/09/2026): "alguns números que foram puxados
// não está fazendo muito sentido". Não estavam: as seis consultas abaixo filtravam APENAS "tem dia
// programado", sem `SO_FABRICACAO` e sem `OP_VIVA`. Entravam duas coisas que não são trabalho:
//
//   1. A LE. Medido em 07/09/2026 na montagem: 12 peças e **12.198 kg** de `LE_IMPORT` — 20% do peso
//      do quadro. Pior, era a MESMA MARCA duas vezes: na OP-105 a 105A15 aparecia como LE (8.518 kg)
//      e como LPC (8.607 kg), lado a lado, com peso diferente. Quem olhava via marca repetida com
//      número que não fecha. É a regra que Vitor já pediu antes: "na produção você vai olhar somente
//      a LPC" — ver lib/lista-pecas.js e a nota em torg_producao_e_lpc.
//
//   2. OP encerrada. Corte 71 peças / 7.536 kg e solda 28 / 3.772 kg de obra já fechada.
//
// Efeito da correção: corte 166.780 → 159.244 kg, montagem 59.821 → 47.623 kg, solda 16.525 →
// 12.753 kg. Nada foi apagado — o que saiu nunca deveria ter entrado.
/** Todas as programações vivas dos três setores, agrupadas em lotes. */
export async function lotesProgramados() {
  let [corte, montagem, solda, acabamento, jato, pintura] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where: { ...SO_FABRICACAO, ...OP_VIVA, corteDiaProgramado: { not: null } },
      select: { ...SELECAO, corteDiaProgramado: true, corteAdiado: true, maquina: true },
    }),
    prisma.pecaConjunto.findMany({
      where: { ...SO_FABRICACAO, ...OP_VIVA, montagemDiaProgramado: { not: null } },
      select: { ...SELECAO, montagemDiaProgramado: true, montagemAdiado: true, montagemBancada: true },
    }),
    prisma.pecaConjunto.findMany({
      where: { ...SO_FABRICACAO, ...OP_VIVA, soldaDiaProgramado: { not: null } },
      select: { ...SELECAO, soldaDiaProgramado: true, soldaBancada: true },
    }),
    prisma.pecaConjunto.findMany({
      where: { ...SO_FABRICACAO, ...OP_VIVA, acabamentoDiaProgramado: { not: null } },
      select: { ...SELECAO, acabamentoDiaProgramado: true, acabamentoBancada: true },
    }),
    prisma.pecaConjunto.findMany({
      where: { ...SO_FABRICACAO, ...OP_VIVA, jatoDiaProgramado: { not: null } },
      select: { ...SELECAO, jatoDiaProgramado: true, jatoBancada: true },
    }),
    prisma.pecaConjunto.findMany({
      where: { ...SO_FABRICACAO, ...OP_VIVA, pinturaDiaProgramado: { not: null } },
      select: { ...SELECAO, pinturaDiaProgramado: true, pinturaBancada: true },
    }),
  ]);

  // ⚠ A GRD É POR (opNumero da OP, marca) — é assim que lib/desenhos-lote.js grava. Sem ela o
  // Gantt não consegue responder "esse projeto já foi impresso?", que é a pergunta de quem vai
  // liberar o maço. Uma consulta só para todas as marcas: por marca seriam milhares.
  const marcas = [...new Set([...corte, ...montagem, ...solda].map((p) => p.marca))];
  const grds = marcas.length
    ? await prisma.grdLiberacao.findMany({
        where: { marca: { in: marcas } },
        select: { opNumero: true, marca: true, impressoes: true, ultimaImpressaoEm: true,
                  createdAt: true, liberadoPorNome: true, formato: true },
      })
    : [];
  const chave = (op, m) => `${op}|${String(m).trim().toUpperCase()}`;
  const porMarca = new Map();
  for (const g of grds) {
    const k = chave(g.opNumero, g.marca);
    const em = g.ultimaImpressaoEm || g.createdAt;
    const atual = porMarca.get(k);
    // a mais recente manda, mas as cópias somam: o que interessa é "quando foi a última e quantas"
    if (!atual) porMarca.set(k, { em, por: g.liberadoPorNome, n: g.impressoes, fm: g.formato });
    else { atual.n += g.impressoes; if (+em > +atual.em) { atual.em = em; atual.por = g.liberadoPorNome; atual.fm = g.formato; } }
  }

  /* ⚠ A MESMA CONSULTA SERVE DUAS PERGUNTAS. Ela já existia no fim desta função (para desenhar a
     previsão de retorno); subiu para cá porque agora também DECIDE quem não entra no quadro. */
  const remessas = await prisma.romaneioTerceiro.findMany({where:{status:{not:"CANCELADO"}},select:{id:true,numero:true,status:true,opRefId:true,opRefNumero:true,dataPrevRetorno:true,itens:true,retornos:true}});
  const foraDaFabrica = await pecasNoTerceiro();

  // ⚠ uma consulta só para todos os setores: por peça seriam milhares.
  const feitoDe = await lerProduzidoPorSetor([...corte, ...montagem, ...solda, ...acabamento, ...jato, ...pintura], SETORES_GANTT);

  const todas = [...corte, ...montagem, ...solda, ...acabamento, ...jato, ...pintura];
  const distribuicoes = todas.length ? await prisma.ganttDistribuicao.findMany({where:{pecaId:{in:[...new Set(todas.map(p=>p.id))]}}}) || [] : [];
  const distPorId = new Map(distribuicoes.map(d=>[`${d.pecaId}|${d.setor}`,d]));
  const expandir = (pecas,setor) => pecas.flatMap(p=>expandirPeca(p,CAMPO[setor],distPorId.get(`${p.id}|${setor}`),feitoDe(p,setor)));
  [corte,montagem,solda,acabamento,jato,pintura] = [corte,montagem,solda,acabamento,jato,pintura].map((pecas,i)=>expandir(pecas,SETORES_GANTT[i]));
  const feitoEfetivo = (p,setor) => p.feitoDistribuido ?? feitoDe(p,setor);
  const lotes = new Map();
  const hoje = iso(new Date());

  /* ⚠⚠ PROGRAMAÇÃO VENCIDA E NÃO ATENDIDA VEM PARA HOJE. Vitor (08/09/2026): "sempre que não for
     atendido a programação na data estimada sempre jogar para o dia vigente para não ficar
     perdido". Uma barra parada num dia de junho não é plano nenhum — ninguém rola o quadro até lá,
     e o trabalho some da vista justamente por estar atrasado.

     ⚠ SÓ O QUE NÃO FOI ATENDIDO. Lote concluído fica no dia em que aconteceu: é histórico, e
     arrastá-lo para hoje falsificaria quando a fábrica produziu.

     ⚠ O DIA ORIGINAL NÃO SE PERDE — vai em `veioDe`, e a tela mostra "programado para dd/mm".
     Mover sem dizer de onde apagaria o atraso, que é o oposto do pedido: o mesmo erro que o
     `corteDiaOriginal` existe para evitar [[torg_programacao_dia]]. No banco nada muda; isto é
     leitura do quadro, não reprogramação silenciosa de milhares de peças.

     ⚠ NÃO VALE PARA A FILA sem dia (a faixa "sem posto"): aquela é ancorada na data de importação,
     a pedido dele no dia anterior, e mostra há quanto tempo espera. São dois casos diferentes —
     "foi programado e não saiu" contra "nunca foi programado". */
  const diaVigente = (d, p, setor) => {
    const dia = iso(d);
    if (!dia || dia >= hoje) return dia;
    return feitoEfetivo(p, setor) >= Math.max(1, p.qte || 1) ? dia : hoje;
  };

  const juntar = (setor, recurso, dia, p, custo, adiado, veioDe, over, fila, familia) => {
    if (setor !== "CORTE" && p.tipoPeca === "CROQUI") return;
    // Fora da fábrica: previsão/recebimentos vêm do romaneio, nunca da programação antiga.
    if(p.terceirizado && !p.terceirizadoRecebidoEm)return;
    /* ⚠⚠ E A REMESSA VALE SOZINHA — pelo conjunto E pelos croquis dele. Ver lib/fora-da-fabrica.js:
       a marcação da peça e o romaneio são duas portas (a RT-03 tinha romaneio e nenhuma peça
       marcada), e o romaneio lista o CONJUNTO enquanto quem espera no corte é o CROQUI. */
    if(foraDaFabrica.has(p.id))return;
    const op = p.op?.numero || p.opNumero || "?";
    /* ⚠ a ORIGEM entra na chave: dois lotes vencidos de dias diferentes caem os dois em hoje, e
       sem isto virariam UMA barra — com um "programado para" só, escolhido por acaso. */
    const k = `${setor}|${recurso || "—"}|${op}|${dia}|${veioDe && veioDe !== dia ? veioDe : ""}|${familia || ""}`;
    let l = lotes.get(k);
    if (!l) {
      l = { id: k, setor, recurso: recurso || null, dia, op, obra: p.op?.obra || null,
            pecas: 0, kg: 0, custo: 0, feitas: 0, adiado: 0, itens: [],
            ...(veioDe && veioDe !== dia ? (fila ? { desde: veioDe } : { veioDe }) : {}),
            ...(familia ? { familia } : {}), ...(fila ? { fila: true } : {}) };
      lotes.set(k, l);
    }
    const total = Math.max(1, p.qte || 1);
    /* ⚠ `over` divide a peça entre dois dias: o que já foi feito fica no dia em que aconteceu e o
       SALDO vai para hoje. Sem isso a barra inteira viajava e o dia de hoje mostrava trabalho que
       já tinha saído da fábrica. */
    const qte = over ? over.qte : total;
    const kg = (p.pesoTotalKg || 0) * (qte / total);
    const feito = over ? over.feito : Math.min(feitoEfetivo(p, setor), total);
    l.pecas += qte; l.kg += kg; l.feitas += feito; l.custo += custo;
    l.adiado = Math.max(l.adiado, adiado || 0);
    const g = porMarca.get(chave(op, p.marca));
    l.itens.push({
      id: p.id, inicioUnidade: (p.inicioUnidade || 0) + (over?.inicio || 0), qTotal: p.qTotal || p.qte || 1, m: p.marca, q: qte, kg, c: custo,
      ...(feito ? { f: feito } : {}),
      ...(p.perfil ? { pf: p.perfil } : {}),
      ...(p.material ? { mt: p.material } : {}),
      ...(g ? { g: { em: iso(g.em), por: g.por || null, n: g.n, fm: g.fm || null } } : {}),
    });
  };

  // ⚠ o custo é do que FALTA (`qtePendente`): conjunto com 4 peças e 3 prontas não custa 4 — a
  // regra já está nas duas libs de capacidade, aqui só se informa o pendente.
  // ⚠ o custo é do que FALTA (`qtePendente`): conjunto com 4 peças e 3 prontas não custa 4 — a
  // regra já está nas duas libs de capacidade, aqui só se informa o pendente. Isto também estava
  // saindo de `qteProduzida`, então a ocupação de montagem e solda vinha SUPERESTIMADA desde que o
  // quadro existe: conjunto já montado continuava contando como trabalho a fazer.
  const pendente = (p, setor) =>
    ({ ...p, qtePendente: Math.max(0, (p.qte || 1) - feitoEfetivo(p, setor)) });

  /* ⚠⚠ O SALDO SEGUE A BANCADA. Vitor (08/09/2026): "as peças que não foram atendidas nas datas, o
     saldo delas deveria estar seguindo as bancadas, e hoje isso não acontece — exemplo da OP-97".
     Quando o dia venceu com parte feita, a peça vira DUAS barras: a parte concluída fica no dia em
     que saiu (é histórico) e o saldo vai para hoje, no MESMO posto. Levar tudo mostraria como
     trabalho de hoje o que já foi entregue; deixar tudo para trás esconderia o que falta. */
  const lancar = (setor, recurso, p, custo, adiado, dia) => {
    if (!dia) { juntar(setor, recurso, hoje, p, custo, adiado, undefined, undefined, true); return; }
    const orig = iso(dia);
    const vig = diaVigente(dia, p, setor);
    const total = Math.max(1, p.qte || 1);
    const f = Math.min(feitoEfetivo(p, setor), total);
    if (vig === orig || f === 0) { juntar(setor, recurso, vig, p, custo, adiado, orig); return; }
    juntar(setor, recurso, orig, p, 0, adiado, orig, { qte: f, feito: f });
    juntar(setor, recurso, vig, p, custo, adiado, orig, { qte: total - f, feito: 0, inicio: f });
  };

  for (const p of corte) lancar("CORTE", p.maquina, p, 0, p.corteAdiado, p.corteDiaProgramado);
  for (const p of montagem) lancar("MONTAGEM", p.montagemBancada, p,
    custoMontagem(pendente(p, "MONTAGEM"), RITMO_NORMAL), p.montagemAdiado, p.montagemDiaProgramado);
  for (const p of solda) lancar("SOLDA", p.soldaBancada, p,
    custoSolda(pendente(p, "SOLDA"), RITMO_CONSERVADOR), 0, p.soldaDiaProgramado);
  // ⚠ acabamento e jato NÃO têm régua de peças por faixa: o custo é o próprio peso, medido contra a
  // capacidade em kg/dia do recurso — igual ao corte. A tela resolve a divisão, como já faz lá.
  for (const p of acabamento) lancar("ACABAMENTO", p.acabamentoBancada, p, 0, 0, p.acabamentoDiaProgramado);
  for (const p of jato) lancar("JATO", p.jatoBancada, p, 0, 0, p.jatoDiaProgramado);
  // ⚠ a pintura mede em kg como as duas acima, mas o PRAZO dela não é só peso: entre demãos a peça
  // seca ocupando o galpão sem consumir capacidade. Esse piso mora em diasDePintura(), em
  // lib/capacidade-pintura.js — o custo aqui continua sendo o peso, como no acabamento e no jato.
  for (const p of pintura) lancar("PINTURA", p.pinturaBancada, p, 0, 0, p.pinturaDiaProgramado);

  // ─── A FILA DE ENTRADA, NA FAIXA SEM POSTO ───────────────────────────────────────────────────
  //
  // ⚠⚠ Vitor (07/09/2026): "não temos nenhuma OP que tenha saído da solda e já era para estar
  // nessas filas?" e "as linhas de sem bancadas precisamos listar essas OPs mesmo sem datas
  // programadas, pois aí que precisamos puxar elas". O quadro só desenhava o que já tinha dia e
  // posto, então a faixa "sem bancada" nascia vazia e não dava para puxar nada de dentro dele.
  //
  // ⚠ SÓ ACABAMENTO, JATO E PINTURA. Vitor, na mesma conversa: "preparação e montagem é o
  // planejamento quem vai descer" — o dia desses dois não se puxa de fila aqui.
  //
  // ⚠ ANCORADAS EM HOJE, e isso é escolha. A peça na fila não tem dia (é justamente o que falta
  // decidir), mas o quadro é uma grade de dias: sem uma coluna ela não teria onde ser desenhada.
  // Hoje é o lugar honesto — "isto está esperando AGORA" — e é de onde o PCP arrasta para a
  // bancada e para o dia de verdade. Quem arrasta grava dia e posto, e a barra sai da fila sozinha.
  //
  // ⚠ NÃO CONTA DUAS VEZES: `filasSemProgramacao` exclui o que já tem dia, então o mesmo conjunto
  // nunca aparece na fila e na bancada ao mesmo tempo.
  /* ⚠⚠ O QUADRO SÓ MOSTRA O QUE ALGUÉM COLOCOU NELE. Vitor (08/09/2026): "para arrumar essa bagunça,
     na tela do Gantt só pode aparecer as peças que o Gabriel programou, do restante ignora, senão
     você vai me deixar maluco".

     Eu vinha somando FILAS derivadas pelo próprio portal — o que terminou o setor anterior, o que
     entrou na LPC e nunca foi programado — e elas cresceram até 856 itens e 62 t que ninguém
     mandou para lugar nenhum. Programação é decisão de gente: ou a peça tem DIA, ou veio numa
     liberação do Planejamento. O resto o portal deduziu, e deduzir não é programar.

     ⚠ Isto REVERTE, para o que não está liberado, a fila que ele pediu em 07/09 ("as linhas de sem
     bancadas precisamos listar essas OPs mesmo sem datas programadas"). A fila continua existindo —
     mas só para peça que o Planejamento liberou, que é onde a pergunta "o que puxo agora?" tem
     resposta. */
  const filas = await filasSemProgramacao();
  /* ⚠ A lista à parte viaja junto com os lotes, não numa rota nova: quem abre o quadro precisa ver
     na mesma carga que existe peça na bancada de obra que ele tirou do quadro — senão "sumiu" e
     "não existe" viram a mesma coisa na tela. */
  const foraDoQuadro = filas.__foraDoQuadro || {};
  const libIds = new Set((await prisma.liberacaoProducao.findMany({ select: { pecaIds: true } }))
    .flatMap((l) => (Array.isArray(l.pecaIds) ? l.pecaIds : [])));
  for (const [setor, itens] of Object.entries(filas)) {
    /* ⚠⚠ A FILA TAMBÉM FICA EM HOJE — a data de importação vira IDADE, não posição. Eu tinha
       ancorado o corte no dia em que a peça entrou, como Vitor pediu de manhã ("puxar para o dia da
       importação"). Ele voltou no mesmo dia: "as liberações de corte ainda estão ficando no dia que
       foi programado, não está saindo, digo os da fila sem máquinas". E é coerente: uma barra em
       26/08 está tão perdida quanto a programação vencida que acabamos de trazer para a frente —
       ninguém rola o quadro para trás. O que a data de entrada tem de bom é dizer HÁ QUANTO TEMPO
       espera, e isso ela continua dizendo, em `desde`.
       ⚠ `desde` e não `veioDe`: são coisas diferentes e a tela fala diferente. "Vinha de" é
       programação que venceu; "esperando desde" é peça que nunca foi programada. Trocar as duas
       diria que alguém marcou um dia que não marcou.
       ⚠ A data entra na CHAVE do lote (via juntar), então cada data de entrada continua sendo sua
       própria barra: a OP-067 de junho não se mistura com a 097 de setembro. */
    // ⚠ o corte manda a máquina quando ela já foi escolhida; os demais setores não têm posto na fila
    for (const p of itens) {
      /* ⚠⚠ QUEM JÁ ESTÁ NA BANCADA NÃO PRECISA DE LIBERAÇÃO PARA APARECER. Vitor (08/09/2026):
         "traga as peças que estão nas bancadas de solda, acabamento, jato e pintura... todas que
         têm apontamento". A trava de liberação continua valendo para o resto — ela é o que tirou do
         quadro as 856 filas deduzidas —, mas apontamento aberto no Syneco é fato, não dedução: a
         peça está na mão de alguém agora. Ver `naBancadaAgora` em lib/fila-setor.js. */
      /* ⚠⚠ A TRAVA DE LIBERAÇÃO VALE SÓ PARA CORTE E MONTAGEM. Vitor (09/09/2026): "isso só está
         valendo para montagem e preparação; para os demais setores, se quiser me trazer aqui quais
         obras estão em aberto para podermos programar, pode trazer". São esses dois que o
         Planejamento desce — da solda em diante quem decide é o PCP, e ele não tem o que esperar.
         Medido no dia: solda 101 peças/10,8 t · acabamento 247/18,3 t · jato 83/7,2 t ·
         pintura 259/9,8 t, em 5 obras. Tamanho de tela, não as 856 filas deduzidas de 08/09. */
      const exigeLiberacao = setor === "CORTE" || setor === "MONTAGEM";
      if (exigeLiberacao && !p.naBancada && !libIds.has(p.id)) continue;
      juntar(setor, p.maquina || null, hoje, { ...p, op: { numero: p.opNumero, obra: p.obra } },
        0, 0, p.dia ? iso(p.dia) : undefined, undefined, true, p.familia || null);
    }
  }

  // Totais alimentam capacidade; o arredondamento pertence apenas aos rótulos da interface.
  const saida = [...lotes.values()];
  // A prontidão vem do corte atual, inclusive para conjuntos programados antes de estarem prontos.
  const prontidao = await lerProntidaoGantt(saida.filter(l => l.setor === 'MONTAGEM').flatMap(l => l.itens.map(i => i.id)));
  for (const l of saida) if (l.setor === 'MONTAGEM') for (const i of l.itens) {
    i.prontidao = prontidao.get(i.id) || { pronto: false, total: 0, cortados: 0, motivo: 'Conjunto indisponível — atualize a programação' };
  }
  saida.sort((a, b) => a.dia.localeCompare(b.dia) || a.setor.localeCompare(b.setor)
    || String(a.recurso).localeCompare(String(b.recurso)));
  const vivas = await prisma.oP.findMany({where:{status:{notIn:["ENCERRADA","CANCELADA"]}},select:{numero:true}});
  const numeros = new Set(vivas.map(o=>String(o.numero).replace(/^0+/,"")));
  const ativas = remessas.filter(r=>numeros.has(String(r.opRefNumero).replace(/^0+/,"")));
  const alvosRetorno=ativas.flatMap(r=>(r.retornos||[]).flatMap(ret=>(ret.itens||[]).map(i=>({opId:r.opRefId,marca:i.marca}))));
  const feitoRetorno=await lerProduzidoPorSetor(alvosRetorno,SETORES_GANTT);
  const recebidos=lotesRecebidosTerceiro(ativas,hoje,(r,i)=>feitoRetorno({opId:r.opRefId,marca:i.marca},i.destino));
  for(const l of recebidos){const p={qte:l.pecas,qtePendente:l.pecas-l.feitas,pesoTotalKg:l.kg};l.custo=l.setor==='MONTAGEM'?custoMontagem(p,RITMO_NORMAL):l.setor==='SOLDA'?custoSolda(p,RITMO_CONSERVADOR):0;l.itens[0].c=l.custo;}
  /* ⚠⚠ LOTE CONCLUÍDO E VELHO SAI DO QUADRO. Vitor (08/09/2026), sobre a OP-067: "ela deveria sim
     [aparecer], não deve estar em montagem e preparação pois já foi feito tudo, mas solda ainda
     falta". O quadro desenhava 1.457 peças de corte de junho, todas já cortadas — ocupando a raia
     de uma obra cuja única pendência é a solda.

     ⚠ NÃO É "esconder o concluído". Medido no dia: dos 27 lotes 100% feitos no quadro, 20 (20.628
     kg) são dos ÚLTIMOS 7 DIAS — é a produção da semana, e quem abre o quadro quer ver. Os outros
     7 vão de 16/06 a agosto. O corte é a idade, não a conclusão: histórico recente fica, museu sai.

     ⚠ Vale por LOTE, não por obra. A 067 continua no quadro pela solda, que é onde ela tem 16 peças
     por apontar — que é exatamente o que ele pediu. */
  /* ⚠⚠ OBRA FORA DO QUADRO SAI DE TODAS AS RAIAS, não só da lista de bancada. Vitor (08/09/2026):
     "a 83 e a 89 precisamos corrigir amanhã, irei verificar no Syneco e dar baixa; mostra apenas as
     que eu te falei". É estado temporário — a obra volta virando o campo, sem tocar em código nem
     apagar programação de ninguém. O que ela tem programado continua no banco, intacto. */
  const foraDoQuadroOps = new Set((await prisma.oP.findMany({ where: { pcpNoQuadro: false }, select: { numero: true } }))
    .map((o) => String(o.numero)));

  const HISTORICO_DIAS = 7;
  const limiteHistorico = iso(new Date(Date.now() - HISTORICO_DIAS * 86400000));
  const vivos = saida
    .filter((l) => !foraDoQuadroOps.has(String(l.op)))
    .filter((l) => !(l.pecas > 0 && l.feitas >= l.pecas && l.dia < limiteHistorico));

  /* o que saiu por estar fora do quadro vai para a lista à parte, com peso e peças — some da grade,
     não da vista: "sumiu" e "não existe" não podem virar a mesma coisa na tela */
  for (const l of saida.filter((x) => foraDoQuadroOps.has(String(x.op)))) {
    (foraDoQuadro[l.setor] ??= []).push(...(l.itens || []).map((i) => ({
      id: i.id, opNumero: l.op, obra: l.obra, marca: i.m, qte: i.q, pesoTotalKg: i.kg,
      setor: l.setor, dia: l.dia, recurso: l.recurso, feitas: i.f || 0, programado: true,
    })));
  }

  const saidaFinal = [...vivos,...previsoesTerceiro(ativas),...recebidos];
  Object.defineProperty(saidaFinal, "foraDoQuadro", { value: foraDoQuadro, enumerable: false });
  return saidaFinal;
}

// ─── GRAVAR O QUE FOI ARRASTADO ────────────────────────────────────────────────────────────────
//
// ⚠⚠ ARRASTAR PARA FRENTE É ADIAR; PARA TRÁS NÃO É. O contador (`corteAdiado`/`montagemAdiado`) e o
// `*DiaOriginal` existem para que puxar a peça a semana inteira apareça — se o remanejo mexesse nos
// dois, o atraso sumiria do relatório. Então: o ORIGINAL só se escreve uma vez, e o contador só
// sobe quando o dia novo é DEPOIS do que estava lá.
//
// ⚠ SOLTAR NA LINHA "SEM BANCADA" TIRA SÓ O RECURSO, não o dia. É diferente da rota da solda, que
// ao limpar a bancada limpa o dia junto — lá "sem bancada" quer dizer desprogramar; aqui é uma
// LINHA do quadro, onde a programação fica esperando bancada no mesmo dia. Apagar o dia faria a
// barra sumir da tela em que a pessoa acabou de largá-la.
// ⚠⚠ ACABAMENTO E JATO ENTRARAM EM 06/09/2026. Vitor: "o Gantt ficou muito didático para
// visualizar e programar (…) teria que ficar primeiramente em uma fila sem bancada, depois
// selecionar a bancada única do acabamento e jato". Antes disto a obra sumia do quadro depois da
// solda — e é justamente onde a fila é mais longa (acabamento 18 dias, jato 14,7).
//
// ⚠ BANCADA ÚNICA ≠ SEM BANCADA. Com uma bancada NOMEADA, os dois setores ficam estruturalmente
// idênticos a montagem e solda: mesma fila de entrada, mesma faixa, mesmo arraste. O quadro não
// ganha conceito novo — só mais duas linhas.
//
// ⚠⚠ A PINTURA ENTROU EM 07/09/2026, fechando a cadeia. A regra que faltava veio no dia anterior:
// os postos são GALPÕES (1 = estruturas, na Torg; 2 = apoio, peças leves) e o prazo tem um piso que
// os outros setores não têm — entre demãos a peça seca ocupando o galpão sem consumir capacidade,
// então um lote de 3 demãos leva 3 dias mesmo cabendo num só. Ver lib/capacidade-pintura.js.
//
// ⚠ É A ÚLTIMA LINHA DO QUADRO por definição: peça pintada sai de todas as filas do PCP.
export const CAMPO = {
  CORTE: { dia: "corteDiaProgramado", original: "corteDiaOriginal", adiado: "corteAdiado", recurso: "maquina" },
  MONTAGEM: { dia: "montagemDiaProgramado", original: "montagemDiaOriginal", adiado: "montagemAdiado", recurso: "montagemBancada" },
  SOLDA: { dia: "soldaDiaProgramado", original: null, adiado: null, recurso: "soldaBancada" },
  ACABAMENTO: { dia: "acabamentoDiaProgramado", original: null, adiado: null, recurso: "acabamentoBancada" },
  JATO: { dia: "jatoDiaProgramado", original: null, adiado: null, recurso: "jatoBancada" },
  PINTURA: { dia: "pinturaDiaProgramado", original: null, adiado: null, recurso: "pinturaBancada" },
};

export const SETORES_GANTT = Object.keys(CAMPO);

/**
 * Aplica os blocos remanejados. Cada bloco é `{ setor, ids[], recurso|null, dia "YYYY-MM-DD" }`.
 * Devolve quantas peças mudaram de fato, por setor.
 */
export async function aplicarRemanejo(blocos, user) {
  if (blocos.some(b=>b.ids.some(id=>id.startsWith("previsao:")))) throw new Error("Registre o retorno do terceiro antes de programar a produção.");
  try {
    return await prisma.$transaction(banco => gravarRemanejo(blocos.some(b => b.fracoes) ? blocos : destinosFinais(blocos), user, banco), { timeout: 45000, isolationLevel: "Serializable" });
  } catch (e) {
    if (e.code === 'P2034') throw new Error('Outra pessoa alterou a programação durante o salvamento. Nenhuma alteração sua foi salva. Atualize o quadro e confira os destinos antes de tentar novamente.');
    throw e;
  }
}

async function gravarRemanejo(blocos, user, banco) {
  // Conferir todos os blocos antes da primeira escrita: uma seleção antiga não libera croqui pendente.
  await conferirEntradaMontagem(blocos, banco);
  const ids = [...new Set(blocos.flatMap(b => b.ids))];
  const camposLidos = Object.fromEntries(Object.values(CAMPO).flatMap(c => [c.dia, c.original, c.recurso]).filter(Boolean).map(c => [c, true]));
  const existentes = await banco.pecaConjunto.findMany({ where: { id: { in: ids }, ...SO_FABRICACAO, ...OP_VIVA }, select: { id: true, qte: true, terceirizado: true, terceirizadoRecebidoEm: true, ...camposLidos } });
  const porId = new Map(existentes.map(p => [p.id, p]));
  if (ids.some(id => !porId.has(id))) throw new Error('Há peças removidas ou reimportadas nesta seleção. Atualize o quadro antes de programar.');
  const fora = await pecasNoTerceiro(banco);
  if (existentes.some(p => fora.has(p.id) || (p.terceirizado && !p.terceirizadoRecebidoEm))) throw new Error('Há peças ainda no terceiro. Confira o recebimento antes de programar.');
  const registros = await banco.ganttDistribuicao.findMany({ where: { pecaId: { in: ids } } }) || [];
  const originais = new Map(registros.map(d => [`${d.pecaId}|${d.setor}`, d]));
  const planos = new Map();
  // Validar e resolver TODOS os intervalos antes de escrever qualquer peça.
  for (const b of blocos) {
    const campos = CAMPO[b.setor];
    if (!campos) throw new Error('Setor inválido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dia) || !Number.isFinite(+new Date(b.dia)) || iso(b.dia) !== b.dia) throw new Error('Data inválida.');
    if (b.fracoes && (!b.fracoes.length || b.fracoes.some(f => !b.ids.includes(f.id)) || b.ids.some(id => !b.fracoes.some(f => f.id === id)))) throw new Error('Faixas incompatíveis com as peças selecionadas.');
    for (const id of new Set(b.ids)) {
      const p = porId.get(id), k = `${id}|${b.setor}`;
      const anterior = planos.get(k);
      let partes = anterior?.partes || partesAtuais(p, campos, originais.get(k));
      if (b.fracoes) for (const f of b.fracoes.filter(f => f.id === id)) partes = moverFaixa(partes, {...f,dia:b.dia,recurso:b.recurso}, Math.max(1,p.qte||1));
      else partes = [{inicio:0,quantidade:Math.max(1,p.qte||1),dia:b.dia,recurso:b.recurso||null}];
      planos.set(k, {id,setor:b.setor,partes,fracionado:!!b.fracoes,bloco:b});
    }
  }
  // Agrupar âncoras iguais mantém o salvamento de centenas de marcas em poucas consultas.
  const grupos = new Map();
  for (const plano of planos.values()) {
    const ancora = [...plano.partes].filter(p => p.dia).sort((a,b)=>a.dia.localeCompare(b.dia)||a.inicio-b.inicio)[0];
    plano.ancora = ancora;
    const chave = JSON.stringify([plano.setor,ancora.dia,ancora.recurso]);
    if (!grupos.has(chave)) grupos.set(chave,{setor:plano.setor,dia:ancora.dia,recurso:ancora.recurso,ids:[]});
    grupos.get(chave).ids.push(plano.id);
  }
  const blocosFinais = [...grupos.values()];
  const agora = new Date();
  const porSetor = {};
  let total = 0;

  for (const b of blocosFinais) {
    const campos = CAMPO[b.setor];
    if (!campos || !b.ids?.length) continue;
    const data = new Date(`${b.dia}T00:00:00Z`); // @db.Date: meia-noite UTC, sem converter fuso

    const antes = b.ids.map(id => porId.get(id));
    const paraFrente = antes.filter((p) => p[campos.dia] && +new Date(p[campos.dia]) < +data).map((p) => p.id);
    const semOriginal = campos.original ? antes.filter((p) => !p[campos.original]).map((p) => p.id) : [];

    const escrita = { [campos.dia]: data, [campos.recurso]: b.recurso || null };
    if (b.setor === "MONTAGEM") {
      escrita.montagemBancadaEm = b.recurso ? agora : null;
      escrita.montagemProgramadaEm = agora;
      escrita.montagemProgramadaPor = user?.name || null;
    }
    if (b.setor === "SOLDA") {
      escrita.soldaBancadaEm = b.recurso ? agora : null;
      escrita.soldaBancadaPor = b.recurso ? (user?.name || null) : null;
    }

    const r = await banco.pecaConjunto.updateMany({ where: { id: { in: b.ids } }, data: escrita });
    if (r.count !== b.ids.length) throw new Error('Uma peça foi alterada durante a gravação. Nenhuma programação foi salva; atualize o quadro.');
    if (b.setor === 'MONTAGEM' && b.recurso) {
      await banco.pecaConjunto.updateMany({ where: { id: { in: b.ids }, status: { in: ['PENDENTE', 'CORTE'] } },
        data: { status: 'MONTAGEM', ultimoSetor: 'Montagem' } });
    }
    if (semOriginal.length) {
      await banco.pecaConjunto.updateMany({ where: { id: { in: semOriginal } }, data: { [campos.original]: data } });
    }
    if (campos.adiado && paraFrente.length) {
      await banco.pecaConjunto.updateMany({ where: { id: { in: paraFrente } }, data: { [campos.adiado]: { increment: 1 } } });
    }

    porSetor[b.setor] = (porSetor[b.setor] || 0) + r.count;
    total += r.count;
  }

  const limparPorSetor = new Map();
  for (const plano of planos.values()) {
    const p = porId.get(plano.id);
    // Uma faixa integral já está representada pelos campos antigos; não criar JSON redundante.
    if (plano.partes.length === 1) {
      if (!limparPorSetor.has(plano.setor)) limparPorSetor.set(plano.setor,[]);
      limparPorSetor.get(plano.setor).push(plano.id);
    } else {
      const ancora = plano.ancora;
      const dados = {pecaId:plano.id,setor:plano.setor,quantidade:Math.max(1,p.qte||1),ancoraDia:new Date(`${ancora.dia}T00:00:00Z`),ancoraRecurso:ancora.recurso||null,partes:plano.partes};
      await banco.ganttDistribuicao.upsert({where:{pecaId_setor:{pecaId:plano.id,setor:plano.setor}},create:dados,update:dados});
    }
  }
  if (limparPorSetor.size) await banco.ganttDistribuicao.deleteMany({where:{OR:[...limparPorSetor].map(([setor,ids])=>({setor,pecaId:{in:ids}}))}});
  await banco.auditLog.create({data:{userId:user?.id,action:'PCP_GANTT_REMANEJAR',entity:'PecaConjunto',entityId:`${total} peças`,diff:{antes:{pecas:existentes,distribuicoes:registros},depois:[...planos.values()].map(({id,setor,partes})=>({id,setor,partes})),porSetor}}});
  return { total, porSetor };
}

/* ─── APAGAR UMA PROGRAMAÇÃO ────────────────────────────────────────────────────────────────────
   Vitor (08/09/2026): "precisa ter um botão para podermos deletar uma programação, e com isso sair
   da fila, o planejamento terá que reprogramar novas peças pois pode ter sido revisão, lançamento
   duplo e etc".

   ⚠⚠ SÓ LIMPAR O DIA NÃO TIRA DA FILA. O quadro desenha na faixa "sem bancada" toda peça que está
   numa liberação do Planejamento e não tem dia — então apagar apenas o dia devolveria a peça ao
   quadro na linha de baixo, que é o oposto do pedido. O id sai também da `LiberacaoProducao`: quem
   decide se ela volta é o Planejamento, liberando de novo.

   ⚠ O QUE NÃO SE APAGA: a GRD (é registro de auditoria — o desenho foi impresso, e isso aconteceu),
   o apontamento do Syneco, e o `corteDiaOriginal`. Se a peça voltar um dia, o atraso original não
   pode ter sumido junto [[torg_programacao_dia]].

   ⚠ E NÃO MEXE NO SYNECO. A ordem lançada no MES continua aberta; cancelar lá é ato de gente. */
export async function apagarProgramacao(blocos, user, motivo) {
  try {
    return await prisma.$transaction(banco => apagarProgramacaoNoBanco(blocos,user,motivo,banco), {timeout:45000,isolationLevel:'Serializable'});
  } catch (e) {
    if (e.code === 'P2034') throw new Error('Outra pessoa alterou a programação durante a exclusão. Nada foi apagado. Atualize o quadro antes de tentar novamente.');
    throw e;
  }
}

async function apagarProgramacaoNoBanco(blocos,user,motivo,banco) {
  const antes = await banco.ganttDistribuicao.findMany({where:{OR:blocos.map(b=>({setor:b.setor,pecaId:{in:b.ids}}))}}) || [];
  const porSetor = {}; let total = 0; const idsTodos = [];
  for (const b of blocos) {
    const campos = CAMPO[b.setor];
    if (!campos || !b.ids?.length) continue;
    const ids = b.ids.filter((id) => !String(id).includes(":")); // retorno/previsão de terceiro não é peça
    if (!ids.length) continue;

    await banco.ganttDistribuicao.deleteMany({ where: { pecaId: { in: ids }, setor: b.setor } });
    const limpa = { [campos.dia]: null, [campos.recurso]: null };
    if (b.setor === "MONTAGEM") { limpa.montagemBancadaEm = null; limpa.montagemProgramadaEm = null; limpa.montagemProgramadaPor = null; }
    if (b.setor === "SOLDA") { limpa.soldaBancadaEm = null; limpa.soldaBancadaPor = null; }

    const r = await banco.pecaConjunto.updateMany({ where: { id: { in: ids } }, data: limpa });
    porSetor[b.setor] = (porSetor[b.setor] || 0) + r.count;
    total += r.count; idsTodos.push(...ids);
  }

  // tira da liberação: é isso que faz sair da fila em vez de cair na faixa "sem bancada"
  let liberacoesTocadas = 0;
  if (idsTodos.length) {
    const fora = new Set(idsTodos);
    const libs = await banco.liberacaoProducao.findMany({ select: { id: true, pecaIds: true } });
    for (const l of libs) {
      const atuais = Array.isArray(l.pecaIds) ? l.pecaIds : [];
      const restam = atuais.filter((id) => !fora.has(id));
      if (restam.length === atuais.length) continue;
      await banco.liberacaoProducao.update({ where: { id: l.id }, data: { pecaIds: restam } });
      liberacoesTocadas++;
    }
  }

  await banco.auditLog.create({
    data: {
      userId: user?.id, action: "PCP_GANTT_APAGAR_PROGRAMACAO", entity: "PecaConjunto",
      entityId: `${total} peças`,
      diff: {
        antes, depois: [], motivo: motivo || null, porSetor, liberacoesTocadas,
        lotes: blocos.slice(0, 40).map((b) => `${b.setor} · ${b.recurso || "sem recurso"} · ${b.dia || "sem dia"} · ${b.ids.length} peça(s)`),
        marcas: (blocos.flatMap((b) => b.marcas || [])).slice(0, 200),
      },
    },
  });

  return { total, porSetor, liberacoesTocadas };
}
