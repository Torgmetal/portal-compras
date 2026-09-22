// O QUE CADA CADASTRO TEM — colunas da tabela e campos do formulário, num lugar só.
//
// ⚠ DECLARATIVO DE PROPÓSITO. Quatro cadastros com o mesmo comportamento (listar, criar, alterar,
// ativar/desativar, excluir o que nunca foi usado) viram quatro telas quase iguais se cada um tiver
// o seu JSX — e quatro telas quase iguais divergem no primeiro ajuste que alguém esquece de repetir.

export const ABAS = [
  { tipo: "setores", titulo: "Setores", singular: "setor" },
  { tipo: "recursos", titulo: "Postos", singular: "posto" },
  { tipo: "motivos", titulo: "Motivos de parada", singular: "motivo" },
  { tipo: "operadores", titulo: "Operadores", singular: "operador" },
];

const TIPOS_DE_POSTO = [
  { valor: "MAQUINA", rotulo: "Máquina" },
  { valor: "BANCADA", rotulo: "Bancada" },
  { valor: "POSTO", rotulo: "Posto" },
];

/**
 * `chave` é o campo; `coluna` é como aparece na tabela; `form` é como se edita.
 *
 * ⚠ O CÓDIGO VEM PRIMEIRO NO FORMULÁRIO E É O ÚNICO CAMPO COM AVISO. Ele é a chave que liga o posto
 * ao que o PCP programou ("SOLDA 5" em `PecaConjunto.soldaBancada`) e congela no primeiro
 * apontamento — quem cadastra precisa saber disso ANTES de digitar, não depois de a rota recusar.
 */
export const CAMPOS = {
  setores: [
    { chave: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true,
      dica: "A chave estável: PREPARACAO, MONTAGEM. O nome muda; esta não." },
    { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
    { chave: "ordem", rotulo: "Ordem", tipo: "numero", obrigatorio: true,
      dica: "A posição na cadeia física da fábrica: 10, 20, 30… É ela que ordena toda tela." },
    { chave: "cor", rotulo: "Cor", tipo: "cor" },
  ],
  recursos: [
    { chave: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true,
      dica: "É a chave do Gantt — \"SOLDA 5\", \"LASER_CHAPA\". É por ela que o totem acha o que o "
          + "PCP programou, e ela CONGELA no primeiro apontamento." },
    { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true,
      dica: "Como a fábrica chama: \"Wilson Barros\", \"Laser Chapa\"." },
    { chave: "setorId", rotulo: "Setor", tipo: "setor", obrigatorio: true },
    { chave: "tipo", rotulo: "Tipo", tipo: "opcoes", opcoes: TIPOS_DE_POSTO },
    { chave: "codigoSyneco", rotulo: "Código no Syneco", tipo: "texto",
      dica: "Só para reconciliar enquanto os dois rodam juntos (\"40E\", \"09\"). Morre com o Syneco." },
  ],
  motivos: [
    { chave: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true },
    { chave: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true,
      dica: "É o que o operador lê no totem na hora de parar a máquina." },
    { chave: "planejada", rotulo: "Parada planejada", tipo: "sim-nao",
      dica: "Planejada (refeição, setup) TIRA do tempo disponível; não planejada conta contra a "
          + "Disponibilidade no OEE. Marcar errado aqui distorce o indicador." },
    { chave: "cor", rotulo: "Cor", tipo: "cor" },
  ],
  operadores: [
    { chave: "cracha", rotulo: "Crachá", tipo: "texto", obrigatorio: true,
      dica: "A matrícula do RH — é o que o leitor bipa no totem." },
    { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
  ],
};

/** As colunas mostradas na tabela (o resto do cadastro fica no formulário). */
export const COLUNAS = {
  setores: ["codigo", "nome", "ordem"],
  recursos: ["codigo", "nome", "setor", "tipo"],
  motivos: ["codigo", "descricao", "planejada"],
  operadores: ["cracha", "nome"],
};

export const vazioDe = (tipo) =>
  Object.fromEntries(CAMPOS[tipo].map((c) => [c.chave, c.tipo === "sim-nao" ? false : ""]));
