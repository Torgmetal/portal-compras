// Lista fixa de contatos para o "Enviar lembrete" das tarefas (Planejamento).
// O Vitor definiu quem entra — só essas pessoas aparecem no modal, agrupadas por
// área. Para incluir/remover alguém, edite aqui (ou peça pra mover pra Matriz de
// comunicação, que é editável na tela). Um e-mail avulso ainda pode ser digitado.
export const CONTATOS_TAREFAS = [
  {
    area: "Comercial",
    contatos: [
      { nome: "Matheus Lima", email: "matheus.lima@torg.com.br" },
      { nome: "Patricia Maiochi", email: "comercial@torg.com.br" },
    ],
  },
  {
    area: "Engenharia",
    contatos: [
      { nome: "Diego Dias", email: "engenharia@torg.com.br" },
      { nome: "Mike Braga", email: "engenharia2@torg.com.br" },
      { nome: "Gabriel Rodrigues", email: "engenharia3@torg.com.br" },
      { nome: "John Cornia", email: "engenharia4@torg.com.br" },
    ],
  },
  {
    area: "Qualidade",
    contatos: [
      { nome: "Geraldo Tank", email: "qualidade@torg.com.br" },
    ],
  },
  {
    area: "PCP",
    contatos: [
      { nome: "Larissa Mantovani", email: "pcp@torg.com.br" },
    ],
  },
  {
    area: "Diretoria",
    contatos: [
      { nome: "Vitor Costa", email: "vitor@torg.com.br" },
      { nome: "Guilherme Campos", email: "guilherme@torg.com.br" },
      { nome: "Fabrine Susigan", email: "fabrine@torg.com.br" },
    ],
  },
];

// Setor da tarefa → área a pré-marcar no modal (o setor responsável já vem
// selecionado; as outras áreas ficam disponíveis pra marcar).
export const SETOR_AREA_TAREFA = {
  COMERCIAL: "Comercial",
  ENGENHARIA: "Engenharia",
  PCP: "PCP",
  QUALIDADE: "Qualidade",
};
