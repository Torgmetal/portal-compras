// ⚠⚠ A LISTA DOS MÓDULOS MORA AQUI, e estava duplicada em dois arquivos do admin (criar e editar).
// Enquanto duplicada, o "Fiscal" existia nos dois seletores e em nenhum lugar do banco — quem
// escolhesse tomava erro na gravação. Um lugar só, e o que aparece na tela é o que o banco aceita.
export const MODULOS_OPCOES = [
  { value: "COMERCIAL",       label: "Comercial" },
  { value: "ENGENHARIA",      label: "Engenharia" },
  { value: "COMPRAS",         label: "Compras" },
  { value: "PRODUCAO",        label: "Produção" },
  { value: "ALMOXARIFADO",    label: "Almoxarifado" },
  { value: "FINANCEIRO",      label: "Financeiro" },
  { value: "EXPEDICAO",       label: "Expedição" },
  { value: "RH",              label: "RH" },
  { value: "PLANEJAMENTO",    label: "Planejamento" },
  { value: "PCP",             label: "PCP" },
  { value: "REQUISICOES",     label: "Requisições" },
  { value: "QUALIDADE",       label: "Qualidade" },
  // ⚠ acesso do INSPETOR (inclusive o de fora): abre SÓ o portal de campo em /campo — tirar foto,
  // medir peça, abrir RNC. Não vê OP, financeiro, nem o módulo da Qualidade.
  { value: "QUALIDADE_CAMPO", label: "Qualidade — campo (só o portal do inspetor)" },
  { value: "FISCAL",          label: "Fiscal" },
];
