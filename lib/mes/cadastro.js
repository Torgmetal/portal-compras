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
