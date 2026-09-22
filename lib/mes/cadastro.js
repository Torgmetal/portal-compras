import "server-only";

// ─── MES — O CADASTRO DA FÁBRICA (setores, recursos, motivos, operadores) ─────
//
// Matheus: *"precisamos ter essas telas depois para criar e excluir setores, máquinas dos
// setores/bancadas"*. Até aqui o cadastro só nascia do `scripts/mes-lab/semear-cadastro.mjs`, que é
// **bootstrap de uma vez, não fonte permanente** (`docs/mes-proprio.md` §11.4): depois dele, quem
// manda é o banco — e é aqui que as telas escrevem.
//
// ⚠⚠ O QUE TEM HISTÓRICO NÃO SE APAGA, SE DESATIVA. Um recurso com apontamento é a âncora de tudo
// que foi produzido nele: apagá-lo levaria junto (ou deixaria órfão) o evento que prova quem
// produziu o quê, e o relatório do mês passado passaria a mentir. `ativo: false` some das telas de
// operação e mantém o passado de pé. Só o que NUNCA foi usado pode ser removido de verdade — aí não
// há passado para preservar, é só um cadastro errado recém-criado.
//
// ⚠⚠ O CÓDIGO É A CHAVE, E ELE CONGELA AO PRIMEIRO USO. "SOLDA 5" é o que `PecaConjunto.soldaBancada`
// grava e o que o totem usa para achar o que o PCP programou; trocá-lo depois de existir histórico
// desliga silenciosamente a bancada do que o Gantt programou para ela, e ninguém liga uma coisa à
// outra. Nome muda à vontade — é ele que a fábrica lê.

const ENTIDADES = new Set(["setores", "recursos", "motivos", "operadores"]);
export const ehEntidade = (t) => ENTIDADES.has(t);

/**
 * Códigos vêm de fonte humana e de planilha — `  solda 5 ` e `SOLDA 5` são o mesmo posto.
 *
 * ⚠ O ESPAÇO DO MEIO FICA. Os códigos do Gantt são "SOLDA 5", "MONTAGEM 1" — com espaço, e é essa
 * string que já está gravada em 21.772 peças. Tirar o espaço aqui criaria um código que não casa
 * com nada e uma bancada que nunca recebe programação.
 */
export const normalizarCodigo = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/**
 * O NOME TAMBÉM SOBE A CAIXA — é o padrão do cadastro do MES.
 *
 * Matheus (22/09/2026): *"deixei tudo em letra maiúscula por padrão os cadastros"*. Ele criou os
 * dele assim; os que o semeador trouxe do Gantt vinham em caixa mista ("Laser Chapa", "Wilson
 * Barros"), e duas grafias no mesmo cadastro é o começo de uma lista que ninguém ordena direito.
 *
 * ⚠⚠ A CAIXA SOBE AQUI, NUNCA NA FONTE. O nome vem do vocabulário do Gantt
 * (`nomeDaBancada`, `rotuloPosto`), que é compartilhado com as telas do PCP — subir a caixa lá
 * deixaria o quadro de programação gritando em letra maiúscula por causa de uma decisão do totem.
 *
 * ⚠ `toUpperCase()` preserva o acento ("Galpão 1" → "GALPÃO 1"), e é isso que se quer: tirar o
 * acento mudaria o nome da coisa, não a caixa dela.
 */
export const normalizarNome = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

const texto = (v) => String(v ?? "").trim();

/**
 * ⚠ UMA RECUSA POR CADASTRO, num mapa — não um `if` atrás do outro. São quatro entidades com regras
 * próprias; encadeadas numa função só, a quinta entra por dentro de um `else` e ninguém revisa.
 */
const RECUSAS = {
  setores: (d) => {
    if (!normalizarCodigo(d.codigo)) return "Informe o código do setor.";
    if (!texto(d.nome)) return "Informe o nome do setor.";
    // ⚠ A ordem é a CADEIA FÍSICA da fábrica (10, 20, 30…) — é ela que põe Preparação antes de
    // Montagem em toda tela. Sem número, o setor novo apareceria em lugar arbitrário.
    if (!Number.isInteger(Number(d.ordem))) return "A ordem do setor tem de ser um número.";
    return null;
  },

  recursos: (d) => {
    if (!normalizarCodigo(d.codigo)) return "Informe o código do posto.";
    if (!texto(d.nome)) return "Informe o nome do posto.";
    if (!texto(d.setorId)) return "Escolha o setor.";
    if (!["MAQUINA", "BANCADA", "POSTO"].includes(d.tipo || "MAQUINA")) {
      return "Tipo tem de ser MAQUINA, BANCADA ou POSTO.";
    }
    return null;
  },

  motivos: (d) => {
    if (!normalizarCodigo(d.codigo)) return "Informe o código do motivo.";
    if (!texto(d.descricao)) return "Informe a descrição do motivo.";
    return null;
  },

  // ⚠⚠ O CRACHÁ É O QUE O LEITOR BIPA. Sem ele o operador existe no cadastro e não consegue entrar
  // em terminal nenhum — um cadastro que parece completo e não serve para nada.
  operadores: (d) => {
    if (!texto(d.cracha)) return "Informe o crachá (a matrícula do RH).";
    if (!texto(d.nome)) return "Informe o nome do operador.";
    return null;
  },
};

/**
 * O que impede este cadastro de ser gravado — ou `null` quando está bom.
 *
 * @param {string} entidade
 * @param {object} dados
 * @returns {string|null}
 */
export function recusaDoCadastro(entidade, dados = {}) {
  if (!ehEntidade(entidade)) return `Cadastro desconhecido: ${entidade}`;
  return RECUSAS[entidade](dados);
}

/**
 * Pode APAGAR de verdade, ou só desativar?
 *
 * @param {number} usos quantas linhas de histórico (ou filhos) dependem deste registro
 * @param {string} oQue como chamar isso na mensagem
 * @returns {string|null} a recusa, ou null quando dá para apagar
 */
export function recusaDaExclusao(usos, oQue) {
  if (!usos) return null;
  return `Não dá para excluir: ${usos} ${oQue}. Desative em vez de excluir — o histórico precisa continuar de pé.`;
}

/**
 * Trocar o código é permitido enquanto o registro nunca foi usado.
 *
 * ⚠⚠ DEPOIS DO PRIMEIRO APONTAMENTO O CÓDIGO CONGELA. Ele é o vínculo com o que o PCP programou
 * (`PecaConjunto.soldaBancada` = "SOLDA 5") e com todo evento já gravado. Trocado, a bancada
 * continua na tela, bonita, e simplesmente para de receber a programação dela — falha silenciosa,
 * que é a pior espécie.
 */
export function recusaDaTrocaDeCodigo(codigoAtual, codigoNovo, usos) {
  const novo = normalizarCodigo(codigoNovo);
  if (!novo || novo === normalizarCodigo(codigoAtual)) return null;
  if (!usos) return null;
  return "O código não pode mudar depois que o posto já tem histórico — ele é o vínculo com a "
    + "programação do PCP e com os apontamentos. Crie outro posto e desative este.";
}

/**
 * SETOR QUE O PCP PROGRAMA E QUE NÃO TEM POSTO NENHUM NO MES.
 *
 * ⚠⚠ ESTA É A PERGUNTA QUE SOBROU, E A OUTRA FOI DESCARTADA DE PROPÓSITO. A primeira versão
 * comparava CÓDIGO A CÓDIGO com a lista do Gantt e acusava 15 postos — mas Acabamento, Pintura e as
 * máquinas `20x` da Preparação têm granularidade diferente POR DECISÃO (o Gantt planeja em balde
 * onde a capacidade é kg/dia; o chão tem os postos físicos, §11.3). Depois que `programadoPara`
 * passou a cair para o SETOR nesses casos, aquilo virou alarme falso — e alarme falso em ferramenta
 * de alarme ensina a ignorar a tarja, que é a lição que o import de listas já pagou neste projeto.
 *
 * O que continua sendo defeito de verdade: um setor programado pelo PCP sem NENHUM posto ativo no
 * MES. Aí o trabalho existe, está no Gantt, e não aparece em terminal nenhum.
 *
 * @param {string[]} setoresProgramados códigos de setor do MES que o Gantt programa
 * @param {{setor?:{codigo:string}, ativo:boolean}[]} recursos
 * @returns {string[]} os setores órfãos
 */
export function setoresSemPosto(setoresProgramados = [], recursos = []) {
  const comPosto = new Set(
    recursos.filter((r) => r.ativo && r.setor?.codigo).map((r) => r.setor.codigo),
  );
  return setoresProgramados.filter((s) => !comPosto.has(s)).sort();
}

/**
 * O QUE SEGURA UM CADASTRO — todas as relações, não só as duas óbvias.
 *
 * ⚠⚠ FALTAVAM TRÊS, E A CONTA ERRADA NÃO DÁ RECUSA: DÁ ERRO DE BANCO (achado do Codex sobre o
 * semeador, 22/09/2026 — fui conferir e a TELA tinha o mesmo buraco). `MesRecurso` também é
 * apontado por `presencas`, `dispositivos` e `reservas`, e nenhuma dessas FKs tem cascade. Um posto
 * onde alguém só bipou o crachá — sem nenhum apontamento — passava pela checagem como "nunca
 * usado", e o `delete` estourava violação de chave estrangeira. O operador via um erro de banco no
 * lugar da frase que explica o que fazer.
 *
 * ⚠ A LISTA MORA AQUI para a tela e os scripts contarem a MESMA coisa. Duas listas divergiriam na
 * primeira relação nova — foi exatamente assim que estas três ficaram de fora.
 *
 * @returns {Promise<number>} quantas linhas dependem deste registro
 */
export async function usosDoCadastro(prisma, entidade, id) {
  const contas = {
    // Setor não tem histórico próprio; quem o segura são os postos dentro dele.
    setores: [() => prisma.mesRecurso.count({ where: { setorId: id } })],
    recursos: [
      () => prisma.mesEvento.count({ where: { recursoId: id } }),
      () => prisma.mesSessao.count({ where: { recursoId: id } }),
      () => prisma.mesPresenca.count({ where: { recursoId: id } }),
      () => prisma.mesDispositivo.count({ where: { recursoId: id } }),
      () => prisma.mesUnidadeReserva.count({ where: { recursoId: id } }),
    ],
    motivos: [() => prisma.mesEvento.count({ where: { motivoId: id } })],
    operadores: [
      () => prisma.mesEvento.count({ where: { operadorId: id } }),
      () => prisma.mesSessao.count({ where: { operadorId: id } }),
      () => prisma.mesPresenca.count({ where: { operadorId: id } }),
    ],
  };
  const somas = await Promise.all((contas[entidade] || []).map((f) => f()));
  return somas.reduce((t, n) => t + n, 0);
}

/** O Postgres recusando apagar linha que alguém passou a apontar. */
export const ehConflitoDeVinculo = (e) => e?.code === "P2003";

/**
 * APAGAR SÓ SE NINGUÉM SEGURAR — e a corrida vira RECUSA, não erro.
 *
 * ⚠⚠ CONTAR E APAGAR SÃO DOIS MOMENTOS (achado do Codex, 22/09/2026). Entre a contagem e o
 * `delete`, alguém pode bipar o crachá naquele posto: o filtro `none` não enxerga uma inserção
 * ainda não confirmada, e se ela confirmar enquanto o delete espera, o Postgres recusa por chave
 * estrangeira. Sem tratar, isso sobe como exceção — no script, derrubava a execução antes de
 * semear os crachás; na tela, entregava erro de banco a quem tentou excluir.
 *
 * ⚠ Só o `P2003` vira recusa. Qualquer outro erro SOBE: engolir o resto transformaria defeito em
 * "não deu para excluir", e ninguém iria atrás.
 *
 * @param {() => Promise<unknown>} apagar o delete de quem chamou (a lib não conhece os modelos)
 * @returns {Promise<{excluido:true}|{recusa:string}>}
 */
export async function excluirSeLivre(prisma, entidade, id, { nomeDoUso, apagar }) {
  const recusa = recusaDaExclusao(await usosDoCadastro(prisma, entidade, id), nomeDoUso);
  if (recusa) return { recusa };
  try {
    await apagar();
    return { excluido: true };
  } catch (e) {
    if (!ehConflitoDeVinculo(e)) throw e;
    return { recusa: "Não dá para excluir: alguém passou a usar este cadastro agora mesmo. Recarregue a lista e confira." };
  }
}
