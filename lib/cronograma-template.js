import "server-only";

// MODELO PADRÃO DE CRONOGRAMA — compartilhado entre a criação manual (Planejamento) e a
// automática (abertura da OP), pra não existirem dois modelos divergentes.

// SUPRIMENTOS entra UMA VEZ na obra, antes das áreas — material é comprado por OP, e a RM não
// tem campo de área pra dividir (Vitor 19/08 pediu a possibilidade; enquanto o campo não existir,
// o percentual por área não teria de onde sair).
//
// Linhas SEPARADAS por família (Vitor 19/08): "se formos falar de matéria-prima concordo [kg]; em
// casos de parafusos, tinta, grade de piso, telhas, calhas e rufos precisam ter linhas separadas".
// Cada uma se mede na sua unidade — kg no aço, itens nas demais (lib/familia-material.js).
//
// `so` marca a linha que só nasce em certa condição: "fd" = OP com faturamento direto.
export const TEMPLATE_SUPRIMENTOS = [
  { nome: "Pedido de compra do cliente", dept: "SUPRIMENTOS", dur: 3, so: "fd" },
  { nome: "Cotação de matéria-prima (aço)", dept: "SUPRIMENTOS", dur: 5 },
  { nome: "Recebimento de matéria-prima (aço)", dept: "SUPRIMENTOS", dur: 10 },
  { nome: "Cotação de parafusos e fixação", dept: "SUPRIMENTOS", dur: 3 },
  { nome: "Recebimento de parafusos e fixação", dept: "SUPRIMENTOS", dur: 8 },
  { nome: "Cotação de tinta", dept: "SUPRIMENTOS", dur: 3 },
  { nome: "Recebimento de tinta", dept: "SUPRIMENTOS", dur: 8 },
  { nome: "Cotação de cobertura e piso", dept: "SUPRIMENTOS", dur: 3 },
  { nome: "Recebimento de cobertura e piso", dept: "SUPRIMENTOS", dur: 10 },
];

export const TEMPLATE_OP89 = [
  { nome: "Ordem de compra", dept: "COMERCIAL", dur: 1 },
  { nome: "Modelo", dept: "ENGENHARIA", dur: 3 },
  { nome: "Detalhamento", dept: "ENGENHARIA", dur: 3 },
  { nome: "Diagrama de Montagem", dept: "ENGENHARIA", dur: 4 },
  { nome: "Aprovação do projeto", dept: "ENGENHARIA", dur: 2 },
  { nome: "Preparação", dept: "FABRICACAO", dur: 4 },
  { nome: "Montagem", dept: "FABRICACAO", dur: 4 },
  { nome: "Solda", dept: "FABRICACAO", dur: 4 },
  { nome: "Pintura", dept: "FABRICACAO", dur: 6 },
  { nome: "Expedição", dept: "EXPEDICAO", dur: 2 },
];
export const DEPT_ORDER = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];
export const DEPT_LABEL = { COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", SUPRIMENTOS: "Suprimentos", FABRICACAO: "Fabricação", EXPEDICAO: "Expedição", MONTAGEM: "Montagem" };
