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

  return comTravaDe(prisma, [chaveDoCracha(operadorId), recursoId], async (tx) => {
    const atual = await presencaAtiva(tx, operadorId);
    if (atual?.recursoId === recursoId) return { presenca: atual, jaEstava: true };

    let liberou = null;
    if (atual) {
      const abertas = await marcasAbertas(tx, atual.recursoId);
      if (abertas > 0) {
        return {
          erro: `Seu crachá está aberto em ${atual.recurso.nome}, com ${abertas} marca(s) em produção. `
              + "Encerre lá antes de abrir aqui.",
          ocupadoEm: { codigo: atual.recurso.codigo, nome: atual.recurso.nome, marcas: abertas },
        };
      }
      await encerrar(tx, atual.id, "posto ocioso");
      liberou = atual.recurso.nome;
    }

    const presenca = await tx.mesPresenca.create({
      data: { operadorId, recursoId, status: ATIVA, ambiente },
      include: { recurso: { select: { id: true, codigo: true, nome: true } } },
    });
    return { presenca, jaEstava: false, liberou };
  });
}

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
export async function sairDoPosto(prisma, { operadorId, recursoId }) {
  if (!operadorId) return { erro: "Informe o operador." };

  return comTravaDe(prisma, [chaveDoCracha(operadorId), recursoId], async (tx) => {
    const atual = await presencaAtiva(tx, operadorId);
    if (!atual) return { jaEstava: true };

    const abertas = await marcasAbertas(tx, atual.recursoId);
    if (abertas > 0) {
      return {
        erro: `Você tem ${abertas} marca(s) aberta(s) em ${atual.recurso.nome}. `
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
export async function exigirPresenca(tx, { operadorId, recursoId, presencaId = null }) {
  const atual = await presencaAtiva(tx, operadorId);
  if (!atual) return "Bipe o crachá neste posto antes de lançar.";
  if (atual.recursoId !== recursoId) {
    return `Seu crachá está aberto em ${atual.recurso.nome}. Encerre lá antes de trabalhar aqui.`;
  }
  if (presencaId && presencaId !== atual.id) return "Esta tela está desatualizada. Bipe o crachá de novo.";
  return null;
}

const encerrar = (tx, id, motivoFim) =>
  tx.mesPresenca.update({
    where: { id },
    data: { status: "ENCERRADA", encerradaEm: new Date(), motivoFim },
  });
