import "server-only";
import { comTravaDe } from "@/lib/mes/trava";

// ─── O CRACHÁ ATIVO: UM OPERADOR, UM POSTO ───────────────────────────────────
//
// Matheus (13/09/2026): *"quando um crachá de usuário estiver ativado em uma máquina, não pode ser
// aberto em outro até ele fechar operação dele na máquina aberta"*.
//
// ⚠⚠ O VÍNCULO É EXPLÍCITO, NÃO INFERIDO DAS SESSÕES (achado do Codex, e era exatamente o que eu
// ia fazer). `MesSessao.operadorId` é AUTORIA DA ABERTURA. Como "quem chega depois entra na sessão
// que já existe", a marca que o Jurandir abriu segue com o nome dele depois de o Rodrigo assumir a
// máquina — inferir presença dali trancaria o Jurandir fora da fábrica por um posto que ele não
// opera, e não representaria o Rodrigo, que está lá. Duas perguntas, dois registros.
//
// ⚠⚠ PRESENÇA NÃO É ESTADO DA MÁQUINA, e nada aqui infere um do outro. Foi o erro que este módulo
// já pagou (abrir marca apagava parada em curso).
//
// ⚠ NÃO HÁ EXCLUSIVIDADE INVERSA: vários operadores podem estar no MESMO posto. O pedido é um
// operador em duas máquinas, não duas pessoas numa máquina — e barrar a segunda faria o totem
// recusar a troca de turno na bancada.

// ⚠⚠ "ABERTA" LITERAL, e NÃO `STATUS` de `lib/mes/sessao.js`. Importar de lá fecharia um ciclo
// (`sessao` → `cracha` → `sessao`) e, num ciclo, o módulo que carrega primeiro enxerga o outro
// ainda vazio: `STATUS.ABERTA` viria `undefined` e a regra passaria a comparar contra nada. Deu
// exatamente isso em três arquivos de teste antes desta linha existir.
export const ATIVA = "ABERTA";

/** A chave de trava do crachá. Entra ORDENADA junto com as outras — ver `comTravaDe`. */
export const chaveDoCracha = (operadorId) => `cracha:${operadorId}`;

/** O vínculo ativo deste operador, com o posto, ou `null`. */
export function presencaAtiva(db, operadorId) {
  if (!operadorId) return null;
  return db.mesPresenca.findFirst({
    where: { operadorId, status: ATIVA },
    include: { recurso: { select: { id: true, codigo: true, nome: true } } },
  });
}

/** Quantas marcas estão abertas naquele posto — só para a MENSAGEM, nunca para a decisão. */
const marcasAbertas = (tx, recursoId) =>
  tx.mesSessao.count({ where: { recursoId, status: ATIVA } });

/**
 * Roda `fn` com TODAS as chaves travadas de uma vez — inclusive a do posto onde `quem` está agora,
 * que só se descobre LENDO o vínculo.
 *
 * ⚠⚠ O POSTO DE ORIGEM PRECISA ENTRAR NA TRAVA (achado do Codex, 13/09/2026). Quem decide por uma
 * CONTAGEM de marcas em outro posto e não trava aquele posto perde a corrida: outro operador, com
 * outra chave de crachá, abre uma marca lá entre a contagem e a liberação, e o vínculo morre com
 * trabalho vivo. O índice parcial não protege isso — ele garante um vínculo por crachá, não o que
 * está acontecendo no posto do outro lado da fábrica.
 *
 * ⚠ E as chaves têm de ser pedidas TODAS JUNTAS e ordenadas; acrescentar uma trava no meio da
 * transação é como se monta um abraço mortal. Daí a forma: lê fora, pede tudo, RELÊ dentro. Se a
 * origem mudou nesse intervalo, a tentativa é descartada e refeita com as chaves certas.
 */
async function comOPostoDe(prisma, { quem, chavesFixas }, fn) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const espiada = await presencaAtiva(prisma, quem);
    const origem = espiada?.recursoId ?? null;

    const r = await comTravaDe(prisma, [...chavesFixas, origem], async (tx) => {
      const atual = await presencaAtiva(tx, quem);
      if ((atual?.recursoId ?? null) !== origem) return { repetir: true };
      return fn(tx, atual);
    });
    if (!r?.repetir) return r;
  }
  // ⚠ Três tentativas e o vínculo muda toda vez: alguém está mexendo nele agora. Insistir em laço
  // aberto seguraria a transação; a saída honesta é pedir para bipar de novo.
  return { erro: "O seu crachá está sendo mexido em outro posto agora. Bipe de novo." };
}

/**
 * Larga o vínculo antigo, se der — ou devolve a recusa.
 *
 * ⚠ Compartilhado entre entrar e passar o posto: a pergunta é a mesma nos dois ("dá para soltar o
 * crachá de onde ele está?") e a resposta precisa ser a mesma, senão o operador aprende duas regras
 * diferentes para o mesmo crachá.
 */
async function largarOAnterior(tx, atual, recursoId) {
  if (!atual || atual.recursoId === recursoId) return { liberou: null };
  const abertas = await marcasAbertas(tx, atual.recursoId);
  if (abertas > 0) {
    return {
      erro: `Seu crachá está aberto em ${atual.recurso.nome}, com ${abertas} marca(s) em produção. `
          + "Encerre lá antes de abrir aqui.",
      ocupadoEm: { codigo: atual.recurso.codigo, nome: atual.recurso.nome, marcas: abertas },
    };
  }
  await encerrar(tx, atual.id, "posto ocioso");
  return { liberou: atual.recurso.nome };
}

/**
 * O crachá entra no posto.
 *
 * Três desfechos, e só um é recusa:
 *   · sem vínculo            → cria;
 *   · vínculo NESTE posto    → devolve o mesmo (bipar de novo não é erro, é o gesto natural);
 *   · vínculo em OUTRO posto → recusa, dizendo onde ele está e o que falta encerrar.
 *
 * ⚠⚠ O POSTO OCIOSO LIBERA SOZINHO, e sem isso a trava vira armadilha. Quem abriu um totem por
 * engano — ou bipou no fim do turno sem abrir marca nenhuma — ficaria preso àquele posto no dia
 * seguinte, e o conserto exigiria voltar fisicamente até lá. Se o posto do vínculo antigo não tem
 * NENHUMA marca aberta, não há "operação dele" para fechar: o vínculo morre e o novo nasce.
 *
 * ⚠ Com marca aberta a recusa é firme, e é o pedido. Não existe "encerrar lá e abrir aqui" daqui:
 * o operador não tem como confirmar, do outro lado da fábrica, o que está na máquina (pedido do
 * Codex). A saída é encerrar no próprio posto — ou a liberação pelo ADMIN, que fica auditada.
 */
export async function entrarNoPosto(prisma, { operadorId, recursoId, ambiente = "PROD" }) {
  if (!operadorId || !recursoId) return { erro: "Informe o operador e o recurso." };

  return comOPostoDe(prisma, { quem: operadorId, chavesFixas: [chaveDoCracha(operadorId), recursoId] },
    async (tx, atual) => {
      if (atual?.recursoId === recursoId) return { presenca: atual, jaEstava: true };
      const largou = await largarOAnterior(tx, atual, recursoId);
      if (largou.erro) return largou;
      return { presenca: await criar(tx, { operadorId, recursoId, ambiente }), jaEstava: false, liberou: largou.liberou };
    });
}

/**
 * A PASSAGEM DO POSTO — o Jurandir entrega a máquina ao Rodrigo.
 *
 * Matheus (14/09/2026), depois de eu levantar a pendência. O Codex já a tinha recomendado na
 * revisão do desenho: sem ela, a troca de turno com a barra ainda cortando só se resolve com um
 * ADMIN, porque quem sai não consegue liberar o próprio crachá (e não deve conseguir — é isso que
 * impede ele de abrir a máquina ao lado com trabalho vivo aqui).
 *
 * ⚠⚠ NÃO ENCERRA MARCA, NÃO GRAVA EVENTO, NÃO MEXE NO ESTADO DA MÁQUINA. É troca de VÍNCULO, e só.
 * O trabalho que está no posto continua exatamente como está — que é o ponto: a barra não para
 * porque o turno virou. Mesma razão pela qual a liberação do ADMIN também não fabrica
 * encerramento: tempo que ninguém viveu envenena o OEE.
 *
 * ⚠⚠ OS DOIS CRACHÁS ENTRAM NA TRAVA DESDE O INÍCIO (pedido do Codex). São dois vínculos mudando
 * na mesma transação; travar um e depois o outro é a receita do abraço mortal.
 *
 * ⚠ QUEM ASSUME PASSA PELA MESMA PORTA DE SEMPRE: se o crachá dele está aberto em outro posto com
 * marca em produção, a passagem é recusada com a mesma frase do `entrar`. Abrir uma exceção aqui
 * seria ensinar que existe um caminho lateral para estar em duas máquinas.
 */
export async function passarPosto(prisma, { deOperadorId, paraOperadorId, recursoId, ambiente = "PROD" }) {
  if (!deOperadorId || !paraOperadorId || !recursoId) return { erro: "Informe quem sai, quem assume e o posto." };
  if (deOperadorId === paraOperadorId) return { erro: "O posto já é seu." };

  const chavesFixas = [chaveDoCracha(deOperadorId), chaveDoCracha(paraOperadorId), recursoId];
  return comOPostoDe(prisma, { quem: paraOperadorId, chavesFixas }, async (tx, doQueAssume) => {
    const deQuemSai = await presencaAtiva(tx, deOperadorId);
    if (!deQuemSai || deQuemSai.recursoId !== recursoId) {
      return { erro: "Quem você quer render não está mais com o crachá neste posto." };
    }

    const largou = await largarOAnterior(tx, doQueAssume, recursoId);
    if (largou.erro) return largou;

    const nomeQueSai = (await tx.mesOperador.findUnique({ where: { id: deOperadorId }, select: { nome: true } }))?.nome;
    const nomeQueAssume = (await tx.mesOperador.findUnique({ where: { id: paraOperadorId }, select: { nome: true } }))?.nome;
    await encerrar(tx, deQuemSai.id, `passou para ${String(nomeQueAssume || "").trim() || "outro operador"}`);

    // ⚠ Quem assume PODE já estar neste posto (dois operadores no mesmo posto é permitido). Aí não
    // se cria vínculo novo: ele continua com o que tem, e o que muda é só a saída do outro.
    const presenca = doQueAssume?.recursoId === recursoId
      ? doQueAssume
      : await criar(tx, { operadorId: paraOperadorId, recursoId, ambiente });

    return {
      presenca,
      saiu: String(nomeQueSai || "").trim() || "o operador anterior",
      marcasQueSeguemAbertas: await marcasAbertas(tx, recursoId),
      liberou: largou.liberou,
    };
  });
}

const criar = (tx, { operadorId, recursoId, ambiente }) =>
  tx.mesPresenca.create({
    data: { operadorId, recursoId, status: ATIVA, ambiente },
    include: { recurso: { select: { id: true, codigo: true, nome: true } } },
  });

/**
 * O crachá sai do posto.
 *
 * ⚠⚠ SÓ SAI QUEM NÃO DEIXOU TRABALHO ABERTO — é isto que dá dente à regra. Se "Sair" liberasse
 * sempre, bastariam dois toques para abrir a mesma pessoa noutra máquina com a barra ainda cortando
 * aqui, e a trava não valeria nada.
 *
 * ⚠ SAIR DA TELA NÃO É SAIR DO POSTO. Recarregar, fechar o navegador ou a volta automática da tela
 * do crachá não passam por aqui: uma operação aberta não pode ser liberada por um gesto de
 * navegação (pedido do Codex). Só o botão explícito chama esta função.
 */
export async function sairDoPosto(prisma, { operadorId, recursoId, presencaId = null }) {
  if (!operadorId || !recursoId) return { erro: "Informe o operador e o recurso." };

  return comTravaDe(prisma, [chaveDoCracha(operadorId), recursoId], async (tx) => {
    const atual = await presencaAtiva(tx, operadorId);
    if (!atual) return { jaEstava: true };

    // ⚠⚠ A ABA ANTIGA NÃO PODE SOLTAR O CRACHÁ DE OUTRO POSTO (achado do Codex sobre a
    // implementação, 13/09/2026 — e era um defeito de verdade). Sem estas duas conferências,
    // "Sair" encerrava o vínculo ATIVO, fosse ele qual fosse: entrar em A, transferir para B, e um
    // toque na aba esquecida de A liberava o crachá que estava em B, com o operador na máquina.
    if (atual.recursoId !== recursoId) {
      return { erro: `O seu crachá está em ${atual.recurso.nome}, não neste posto.` };
    }
    if (presencaId && presencaId !== atual.id) {
      return { erro: "Esta tela está desatualizada. Bipe o crachá de novo." };
    }

    const abertas = await marcasAbertas(tx, atual.recursoId);
    if (abertas > 0) {
      // ⚠ "O POSTO TEM", não "você tem" (pedido do Codex): a sessão não guarda de quem é o
      // trabalho, então a recusa é coletiva — inclusive por marca que outro operador abriu. Dizer
      // "você" acusaria o operador de um trabalho que pode não ser dele.
      return {
        erro: `O posto ${atual.recurso.nome} tem ${abertas} marca(s) aberta(s). `
            + "Encerre as marcas para liberar o crachá.",
        marcas: abertas,
      };
    }
    await encerrar(tx, atual.id, "saiu");
    return { liberou: atual.recurso.nome };
  });
}

/**
 * A SAÍDA DE EMERGÊNCIA — só ADMIN, e fica registrada.
 *
 * ⚠⚠ LIBERA O VÍNCULO E NADA MAIS (pedido do Codex). Não encerra marca, não grava evento de
 * produção: fabricar um encerramento que ninguém viveu no chão de fábrica envenena o OEE com tempo
 * que não existiu. O trabalho continua aberto no posto onde está, para quem estiver lá resolver.
 */
export async function liberarPresenca(prisma, { operadorId, porQuem }) {
  if (!operadorId) return { erro: "Informe o operador." };

  return comTravaDe(prisma, [chaveDoCracha(operadorId)], async (tx) => {
    const atual = await presencaAtiva(tx, operadorId);
    if (!atual) return { jaEstava: true };
    await encerrar(tx, atual.id, `liberada por ${porQuem || "ADMIN"}`);
    return { liberou: atual.recurso.nome, marcasQueSeguemAbertas: await marcasAbertas(tx, atual.recursoId) };
  });
}

/**
 * O PORTEIRO DE TODA MUTAÇÃO — chamado DE DENTRO da transação que grava.
 *
 * ⚠⚠ VALIDAR SÓ NA ABERTURA DEIXA O RESTO DESCOBERTO (achado do Codex). O totem guarda o crachá em
 * `useState` e o manda em TODO comando; sem isto, quem foi recusado ao entrar ainda poderia
 * apontar, parar ou encerrar numa sessão que já existe no posto — e a trava só teria aparência.
 *
 * ⚠⚠ O RECURSO CONFERIDO É O DA SESSÃO, NÃO O DA URL. Várias ações chegam só com `sessaoId` e a
 * regra busca o recurso dono dela; conferir o posto da URL deixaria passar um comando disparado do
 * totem A contra uma sessão do totem B.
 *
 * ⚠ `presencaId` fecha a porta da TELA VELHA: a aba que ficou aberta desde antes de uma liberação
 * carrega o id do vínculo que morreu, e volta a valer quando o operador reentrar no mesmo posto.
 * Comparando o id, o comando antigo é recusado mesmo com o crachá certo no posto certo.
 *
 * @returns {Promise<string|null>} a recusa, ou `null` quando o comando pode seguir.
 */
export async function exigirPresenca(tx, { operadorId, recursoId, presencaId = null, exigirId = false }) {
  const atual = await presencaAtiva(tx, operadorId);
  if (!atual) return "Bipe o crachá neste posto antes de lançar.";
  if (atual.recursoId !== recursoId) {
    return `Seu crachá está aberto em ${atual.recurso.nome}. Encerre lá antes de trabalhar aqui.`;
  }
  // ⚠⚠ `exigirId` FECHA A PORTA DE VEZ (achado do Codex). Conferindo o id só quando ele VEM, quem
  // simplesmente não o manda pula a proteção inteira — e a tela velha é exatamente quem tende a não
  // mandar. O totem sempre exige; scripts e importações seguem pelo caminho sem contexto, que é
  // explícito e não se confunde com um comando de gente.
  if (exigirId && !presencaId) return "Bipe o crachá neste posto antes de lançar.";
  if (presencaId && presencaId !== atual.id) return "Esta tela está desatualizada. Bipe o crachá de novo.";
  return null;
}

const encerrar = (tx, id, motivoFim) =>
  tx.mesPresenca.update({
    where: { id },
    data: { status: "ENCERRADA", encerradaEm: new Date(), motivoFim },
  });
