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
    name: "consultar_produtos_omie",
    description:
      "Pesquisa produtos no catálogo do Omie ERP pelo nome ou descrição. " +
      "Use para responder perguntas sobre: código do produto no Omie, saldo " +
      "de estoque no Omie, custo médio (CMC), unidade de medida. " +
      "Exemplos: 'qual o código da chapa 1/4 no Omie?', " +
      "'qual o saldo da cantoneira 2x2?', 'quanto tem de tubo 2 no Omie?'. " +
      "Dados sincronizados automaticamente do Omie todo dia às 06:00.",
    input_schema: {
      type: "object",
      properties: {
        busca:  { type: "string", description: "Nome, descrição ou código do produto (ex: 'chapa 1/4', 'cantoneira 2x2', 'tubo quadrado 50x50')" },
        limite: { type: "number", description: "Máximo de resultados (padrão 10, máximo 30)" },
      },
      required: ["busca"],
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

  // ─── Ferramentas GENÉRICAS (acesso amplo, auto-atualiza com módulos novos) ──
  // A camada lib/assistente/data-access.js controla o que cada usuário pode ler.
  {
    name: "listar_modelos_dados",
    description:
      "Lista TODAS as tabelas/entidades do portal que você pode consultar (com uma descrição curta de cada). " +
      "Use isto PRIMEIRO quando a pergunta envolver dados que as ferramentas específicas não cobrem, ou quando " +
      "precisar cruzar informações de vários módulos (ex: cronograma + materiais a comprar). " +
      "A lista se atualiza sozinha quando módulos novos entram no portal.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "descrever_modelo",
    description:
      "Mostra os campos e as relações de uma tabela/entidade do portal, para você montar a consulta certa. " +
      "Use depois de listar_modelos_dados, antes de consultar_dados.",
    input_schema: {
      type: "object",
      properties: {
        modelo: { type: "string", description: "Nome exato da tabela (ex: 'OP', 'CronogramaTarefa', 'RMItem', 'ContaReceber')." },
      },
      required: ["modelo"],
    },
  },
  {
    name: "consultar_dados",
    description:
      "Consulta genérica de LEITURA em qualquer tabela liberada do portal. Permite filtrar, ordenar, " +
      "incluir relações e limitar resultados — é a ferramenta para responder QUALQUER pergunta sobre dados do " +
      "portal, inclusive cruzando módulos. Os filtros usam a sintaxe do Prisma (where). " +
      "Ex: { modelo: 'CronogramaTarefa', filtros: { status: 'ATRASADA' }, relacionar: { cronograma: { include: { op: true } } } }. " +
      "Para totais/contagens/agrupamentos use agregar_dados.",
    input_schema: {
      type: "object",
      properties: {
        modelo:     { type: "string", description: "Nome da tabela (ver listar_modelos_dados)." },
        filtros:    { type: "object", description: "Filtro no formato Prisma 'where'. Ex: { status: 'ABERTA', dataVencimento: { lt: '2026-06-10' } }. Opcional." },
        relacionar: { type: "object", description: "Relações a incluir, formato Prisma 'include'. Ex: { op: true, itens: true }. Opcional." },
        ordenar:    { type: "object", description: "Ordenação Prisma 'orderBy'. Ex: { dataVencimento: 'asc' }. Opcional." },
        limite:     { type: "number", description: "Máximo de linhas (padrão 20, máximo 50)." },
      },
      required: ["modelo"],
    },
  },
  {
    name: "gerar_planilha",
    description:
      "Gera uma planilha Excel (.xlsx) no template da Torg com os dados que você coletou e devolve um link de download para o usuário. " +
      "Use quando o usuário pedir um relatório, planilha, lista para baixar/exportar, ou quando você montar uma tabela que valha a pena baixar. " +
      "Monte 'colunas' (cabeçalhos) e 'linhas' (cada linha é um array de células na mesma ordem das colunas). " +
      "Depois de gerar, avise o usuário que o download está disponível.",
    input_schema: {
      type: "object",
      properties: {
        titulo:    { type: "string", description: "Título do relatório (ex: 'Materiais a comprar - obras atrasadas')." },
        subtitulo: { type: "string", description: "Subtítulo/contexto (ex: filtros aplicados, período). Opcional." },
        colunas:   { type: "array", items: { type: "string" }, description: "Cabeçalhos das colunas, em ordem." },
        linhas:    { type: "array", items: { type: "array" }, description: "Linhas de dados; cada linha é um array de células na ordem das colunas." },
        totais:    { type: "array", description: "Linha opcional de totais (mesma ordem das colunas)." },
      },
      required: ["titulo", "colunas", "linhas"],
    },
  },
  {
    name: "agregar_dados",
    description:
      "Totais, contagens, somas e médias sobre uma tabela liberada — com agrupamento opcional. " +
      "Ex: somar saldo de ContaReceber por cliente; contar OPs por status; somar produzidoKg por obra. " +
      "Ex: { modelo: 'ContaReceber', agruparPor: ['clienteNome'], somar: ['saldo'], filtros: { saldo: { gt: 0 } } }.",
    input_schema: {
      type: "object",
      properties: {
        modelo:     { type: "string", description: "Nome da tabela." },
        filtros:    { type: "object", description: "Filtro Prisma 'where'. Opcional." },
        agruparPor: { type: "array", items: { type: "string" }, description: "Campos para agrupar (groupBy). Opcional." },
        somar:      { type: "array", items: { type: "string" }, description: "Campos numéricos para somar. Opcional." },
        media:      { type: "array", items: { type: "string" }, description: "Campos numéricos para média. Opcional." },
        contar:     { type: "boolean", description: "Contar registros (padrão true)." },
        limite:     { type: "number", description: "Máximo de grupos (padrão 50)." },
      },
      required: ["modelo"],
    },
  },
  {
    name: "listar_tarefas_planejamento",
    description:
      "Lista tarefas do Planejamento (quadro de Tarefas). Use para ACHAR uma tarefa antes de concluí-la, ou quando perguntarem 'quais tarefas tenho/faltam'. " +
      "Filtra por setor, status, termo (título ou número da OP) e semana/ano. Por padrão traz só as abertas (pendente + em andamento).",
    input_schema: {
      type: "object",
      properties: {
        setor: { type: "string", description: "Setor: PRODUCAO, PINTURA, PCP, EXPEDICAO, COMERCIAL, ENGENHARIA, COMPRAS, ALMOXARIFADO, FINANCEIRO, RH, PLANEJAMENTO. Opcional." },
        status: { type: "string", description: "PENDENTE | EM_ANDAMENTO | CONCLUIDA | CANCELADA. Opcional (padrão: só abertas)." },
        termo: { type: "string", description: "Texto no título ou número da OP. Opcional." },
        semana: { type: "number", description: "Semana ISO. Opcional." },
        ano: { type: "number", description: "Ano. Opcional." },
        limite: { type: "number", description: "Máx. de tarefas (padrão 20)." },
      },
    },
  },
  {
    name: "concluir_tarefa_planejamento",
    description:
      "Marca uma tarefa do Planejamento como CONCLUÍDA quando o setor avisar que terminou, e avisa o Planejamento por e-mail. " +
      "Informe tarefaId (preferido) OU termo (título/OP). Se houver mais de uma candidata, NÃO conclua: peça ao usuário confirmar qual (pelo id). Use listar_tarefas_planejamento para localizar.",
    input_schema: {
      type: "object",
      properties: {
        tarefaId: { type: "string", description: "ID exato da tarefa (vindo de listar_tarefas_planejamento)." },
        termo: { type: "string", description: "Título ou número da OP da tarefa, se não tiver o id." },
        setor: { type: "string", description: "Setor, para desambiguar. Opcional." },
        observacao: { type: "string", description: "Observação de conclusão (o que foi feito). Opcional." },
      },
    },
  },
];

// Ferramentas genéricas — disponíveis para QUALQUER usuário logado.
// (A camada de governança controla quais tabelas/campos cada um vê de fato.)
const TOOLS_GENERICAS = ["listar_modelos_dados", "descrever_modelo", "consultar_dados", "agregar_dados", "gerar_planilha", "listar_tarefas_planejamento", "concluir_tarefa_planejamento"];

// ─── Quais ferramentas cada módulo pode usar ──────────────────────────────────

const TOOLS_POR_MODULO = {
  COMERCIAL:    ["consultar_ops", "consultar_op_detalhe"],
  ENGENHARIA:   ["consultar_ops", "consultar_op_detalhe", "consultar_rms", "consultar_produtos_omie"],
  COMPRAS:      ["consultar_ops", "consultar_op_detalhe", "consultar_estoque", "consultar_rms", "consultar_pedidos_compras", "consultar_produtos_omie"],
  PRODUCAO:     ["consultar_ops", "consultar_op_detalhe", "consultar_mes_producao", "consultar_estoque", "consultar_produtos_omie"],
  ALMOXARIFADO: ["consultar_ops", "consultar_estoque", "consultar_produtos_omie"],
  FINANCEIRO:   ["consultar_ops", "consultar_op_detalhe", "consultar_estoque", "consultar_rms", "consultar_pedidos_compras", "consultar_medicoes", "consultar_produtos_omie"],
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
  // ADMIN tem acesso a todas (específicas + genéricas)
  if (user?.tipo === "ADMIN") return TODAS_TOOLS;

  // USUARIO: une as ferramentas específicas de todos os módulos que possui
  const modulos = user?.modulos ?? [];
  const nomes = new Set();
  for (const modulo of modulos) {
    const tools = TOOLS_POR_MODULO[modulo] ?? [];
    tools.forEach((t) => nomes.add(t));
  }

  // Sem módulos reconhecidos → apenas OPs básicas
  if (nomes.size === 0) nomes.add("consultar_ops");

  // Ferramentas genéricas: liberadas a todos (a governança de dados filtra o
  // que cada um pode ler de fato — ver lib/assistente/data-access.js).
  TOOLS_GENERICAS.forEach((t) => nomes.add(t));

  return TODAS_TOOLS.filter((t) => nomes.has(t.name));
}
