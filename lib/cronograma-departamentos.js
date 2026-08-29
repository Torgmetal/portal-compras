// Os SETORES do cronograma (departamento da CronogramaTarefa), com rótulo e cor.
//
// ⚠ Fica fora das telas porque os mesmos valores são lidos em três lugares: a aba Cronograma do
// Planejamento, a visão da Engenharia (/engenharia/cronograma) e o Gantt. Duplicar a lista é como
// nasce um setor que aparece com nome diferente dependendo da tela.
export const DEPTOS = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];

export const DEPT_LABEL = {
  COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", SUPRIMENTOS: "Suprimentos",
  FABRICACAO: "Fabricação", EXPEDICAO: "Expedição", MONTAGEM: "Montagem",
};

export const DEPT_COR = {
  COMERCIAL: "bg-blue-50 text-blue-700 border-blue-200",
  ENGENHARIA: "bg-purple-50 text-purple-700 border-purple-200",
  SUPRIMENTOS: "bg-amber-50 text-amber-700 border-amber-200",
  FABRICACAO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  EXPEDICAO: "bg-teal-50 text-teal-700 border-teal-200",
  MONTAGEM: "bg-orange-50 text-orange-700 border-orange-200",
};
