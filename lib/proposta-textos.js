// Textos padrão de inclusos/exclusos da proposta de serviço. São editáveis por
// proposta (OrcamentoServico.inclusos/exclusos JSON); quando não customizados,
// usa-se estes padrões. Arquivo plain — importável pelo client e pelo server.
export const DEFAULT_INCLUSOS = [
  "Descarga dos materiais;",
  "Consumíveis para execução dos trabalhos;",
  "Fornecimento de relatório visual dos trabalhos;",
  "Fornecimento de uma cópia de data book e projetos em arquivo eletrônico.",
];

export const DEFAULT_EXCLUSOS = [
  "Montagem das estruturas metálicas;",
  "Fornecimento de materiais;",
  "Colocação de componentes em vigas cortadas;",
  "Serviços de engenharia;",
  "Aproveitamento de materiais;",
  "Frete;",
  "Despesas com ensaios tecnológicos;",
  "E tudo o mais não expressamente orçado.",
];
