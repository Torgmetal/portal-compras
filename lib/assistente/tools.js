/**
 * lib/assistente/tools.js
 *
 * Define as ferramentas (tools) disponíveis para o Torguinho e quais
 * módulos/roles têm acesso a cada uma.
 */

// ─── Definição completa das ferramentas ───────────────────────────────────────

export const TODAS_TOOLS = [
  {
    name: "consultar_ops",
    description:
      "Consulta Ordens de Produção (OPs) com filtros opcionais. " +
      "Use para responder perguntas sobre obras, projetos e clientes.",
    input_schema: {
      type: "object",
      properties: {
        numero:  { type: "string",  description: "Número da OP (ex: '078', '78', 'T78')" },
        cliente: { type: "string",  description: "Nome ou parte do nome do cliente" },
        status:  { type: "string",  description: "Status: ABERTA, EM_ANDAMENTO, CONCLUIDA, CANCELADA" },
        limite:  { type: "number",  description: "Máximo de resultados (padrão 10, máximo 20)" },
      },
    },
  },
  {
    name: "consultar_op_detalhe",
    description:
      "Retorna detalhes completos de uma OP: cliente, obra, status, " +
      "cronograma, itens e valor de contrato. Use quando o usuário perguntar " +
      "sobre uma OP específica.",
    input_schema: {
      type: "object",
      properties: {
        numero: { type: "string", description: "Número da OP (ex: '078')" },
      },
      required: ["numero"],
    },
  },
  {
    name: "consultar_estoque",
    description:
      "Consulta itens do estoque Torg com quantidade atual. " +
      "Use para perguntas sobre materiais disponíveis, saldos e reservas.",
    input_schema: {
      type: "object",
      properties: {
        busca:  { type: "string", description: "Nome ou parte do nome do material" },
        limite: { type: "number", description: "Máximo de resultados (padrão 15)" },
      },
    },
  },
  {
    name: "consultar_mes_producao",
    description:
      "Consulta dados de produção do MES (SKA Syneco): peso produzido (kg), " +
      "unidades, apontamentos por OP e setor. Use para perguntas sobre " +
      "produção, rastreabilidade, peso e apontamentos.",
    input_schema: {
      type: "object",
      properties: {
        obra:  { type: "string", description: "Código da obra no SKA (ex: 'T78'). Opcional." },
        de:    { type: "string", description: "Data início no formato YYYY-MM-DD. Opcional." },
        ate:   { type: "string", description: "Data fim no formato YYYY-MM-DD. Opcional." },
        setor: { type: "string", description: "Setor (Solda, Corte, Montagem, Jato, Pintura...). Opcional." },
      },
    },
  },
  {
    name: "consultar_rms",
    description:
      "Consulta Requisições de Material (RMs): abertas, em cotação, atendidas. " +
      "Use para perguntas sobre solicitações de materiais e suprimentos.",
    input_schema: {
      type: "object",
      properties: {
        opNumero: { type: "string", description: "Número da OP relacionada. Opcional." },
        status:   { type: "string", description: "Status: ABERTA, EM_COTACAO, ATENDIDA, CANCELADA. Opcional." },
        limite:   { type: "number", description: "Máximo de resultados (padrão 10)" },
      },
    },
  },
  {
    name: "consultar_pedidos_compras",
    description:
      "Consulta pedidos de compra no Omie ERP: fornecedor, valor total, status. " +
      "Use para perguntas sobre compras realizadas.",
    input_schema: {
      type: "object",
      properties: {
        opId:   { type: "string", description: "ID interno da OP no portal. Opcional." },
        limite: { type: "number", description: "Máximo de resultados (padrão 10)" },
      },
    },
  },
  {
    name: "consultar_medicoes",
    description:
      "Consulta medições e faturamento de OPs: valor bruto medido, " +
      "status, pedidos Omie vinculados. EXCLUSIVO para FINANCEIRO e ADMIN.",
    input_schema: {
      type: "object",
      properties: {
        opNumero: { type: "string", description: "Número da OP. Opcional." },
        limite:   { type: "number", description: "Máximo de resultados (padrão 10)" },
      },
    },
  },
];

// ─── Quais ferramentas cada módulo pode usar ──────────────────────────────────

const TOOLS_POR_MODULO = {
  COMERCIAL:    ["consultar_ops", "consultar_op_detalhe"],
  ENGENHARIA:   ["consultar_ops", "consultar_op_detalhe", "consultar_rms"],
  COMPRAS:      ["consultar_ops", "consultar_op_detalhe", "consultar_estoque", "consultar_rms", "consultar_pedidos_compras"],
  PRODUCAO:     ["consultar_ops", "consultar_op_detalhe", "consultar_mes_producao", "consultar_estoque"],
  ALMOXARIFADO: ["consultar_ops", "consultar_estoque"],
  FINANCEIRO:   ["consultar_ops", "consultar_op_detalhe", "consultar_estoque", "consultar_rms", "consultar_pedidos_compras", "consultar_medicoes"],
  EXPEDICAO:    ["consultar_ops", "consultar_op_detalhe"],
};

/**
 * Retorna as ferramentas disponíveis para um usuário com base no seu
 * tipo (ADMIN ou USUARIO) e módulos atribuídos.
 *
 * @param {{ tipo: string, modulos: string[] }} user
 * @returns {object[]} lista de tool definitions para a Claude API
 */
export function getToolsParaUser(user) {
  // ADMIN tem acesso a tudo
  if (user?.tipo === "ADMIN") return TODAS_TOOLS;

  // USUARIO: une as ferramentas de todos os módulos que possui
  const modulos = user?.modulos ?? [];
  const nomes = new Set();
  for (const modulo of modulos) {
    const tools = TOOLS_POR_MODULO[modulo] ?? [];
    tools.forEach((t) => nomes.add(t));
  }

  // Sem módulos reconhecidos → apenas OPs básicas
  if (nomes.size === 0) nomes.add("consultar_ops");

  return TODAS_TOOLS.filter((t) => nomes.has(t.name));
}
