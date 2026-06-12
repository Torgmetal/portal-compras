/**
 * lib/assistente/data-access.js
 *
 * Camada de governança de acesso a dados do Torguinho. Permite que o agente
 * consulte QUALQUER tabela do portal (via Prisma DMMF — módulos novos entram
 * automaticamente), mas com guarda-corpos:
 *
 *  - RH / pessoal / saúde / auth / PII  → BLOQUEADO para todos no chat.
 *  - Financeiro detalhado               → só ADMIN / FINANCEIRO.
 *  - Operacional                        → liberado a qualquer usuário logado.
 *  - Campos sensíveis (senha, cpf, etc.) são sempre removidos do resultado.
 *  - Campos financeiros (valor, custo…) são removidos para quem não é financeiro.
 *  - Somente LEITURA (findMany / groupBy / count / aggregate), com teto de linhas.
 *
 * Decisão de produto: a pessoa antes do dado — não expomos RH/saúde no chat.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ─── Classificação de modelos ────────────────────────────────────────────────

// Bloqueados para todos (RH, pessoal, saúde, auth, auditoria com PII, config).
const MODELOS_BLOQUEADOS = new Set([
  "User", "PasswordResetToken", "UserModulo", "ConfigAssistente",
  "Funcionario", "Dependente", "Ponto", "Ferias", "Beneficio",
  "FuncionarioBeneficio", "Competencia", "CargoCompetencia",
  "FuncionarioCompetencia", "Documento", "Vaga", "Afastamento",
  "AcidenteTrabalho", "Treinamento", "TreinamentoParticipante",
  "Cargo", "Setor", "Notificacao", "EmailNotificacao", "AuditLog",
  "Compromisso", "PmpMeta",
]);

// Financeiro detalhado — só ADMIN / FINANCEIRO.
const MODELOS_FINANCEIROS = new Set([
  "OPMedicao", "OPReceita", "FluxoCaixa", "SolicitacaoVerba", "Orcamento",
  "OrcamentoRevisao", "ContaPagar", "ContaReceber", "FaturamentoEvento",
  "FaturamentoCache", "Meta", "EstudoCotacao", "EstudoCotacaoItem",
  "CustoItem", "FreteCotacao", "NfseConchalVinculo",
]);

// Descrições curtas dos modelos mais usados (ajuda o agente a escolher).
const DESCRICOES = {
  OP: "Ordens de Produção (obras/projetos): cliente, obra, status, datas, contrato.",
  OPItem: "Itens de uma OP.",
  RM: "Requisições de Material (Engenharia → Compras).",
  RMItem: "Itens de uma RM: material, quantidade, status de atendimento/compra.",
  PedidoOmie: "Pedidos de compra gerados no Omie: fornecedor, total, status.",
  Cotacao: "Cotações de fornecedores.",
  CotacaoItem: "Itens cotados.",
  Cronograma: "Cronograma de uma OP/obra.",
  CronogramaTarefa: "Tarefas do cronograma: datas previstas/reais, % e status (atraso).",
  CronogramaRegistro: "Registros/avanços das tarefas do cronograma.",
  EstoqueItem: "Itens de estoque (espelho Omie): saldo, unidade, categoria.",
  EstoqueReserva: "Reservas de estoque.",
  EstoqueMovimentacao: "Movimentações de estoque.",
  MesApontamento: "Apontamentos de produção (MES/Syneco): kg, unidades, setor, OP.",
  Romaneio: "Romaneios de expedição.",
  ProducaoSemanal: "Produção semanal.",
  PecaConjunto: "Peças e conjuntos.",
  Fornecedor: "Cadastro de fornecedores.",
  Revisao: "Revisões de projeto da OP.",
  Aditivo: "Aditivos contratuais da OP.",
  ContaPagar: "Contas a pagar (Omie): vencimento, valor, fornecedor, categoria.",
  ContaReceber: "Contas a receber (Omie): vencimento, saldo, cliente, % recebido.",
  OPMedicao: "Medições/faturamento das OPs.",
};

// ─── Padrões de campos sensíveis ─────────────────────────────────────────────

// Sempre removidos do resultado (PII / segredo), em qualquer modelo.
const CAMPO_PII = /senha|password|hash|salt|^token$|secret|cpf|cnpj|inscricaoest|^rg$|pis|ctps|matricula|salari|remunerac|agencia|contacorrente|conta_corrente|chavepix|chave_?nfe|email|telefone|celular|endereco|logradouro|^cep$|nascimento/i;

// Removidos para quem NÃO é financeiro.
const CAMPO_FINANCEIRO = /valor|preco|custo|^cmc$|faturad|receita|verba|orcament|margem|lucro|contrato|saldo|desconto|comissao/i;

// ─── DMMF: mapa de modelos ───────────────────────────────────────────────────

const MODELOS = Prisma.dmmf.datamodel.models; // [{ name, fields: [{name, kind, type, isList, relationName}] }]
const POR_NOME = new Map(MODELOS.map((m) => [m.name, m]));

// Nome do modelo → propriedade do Prisma Client (primeira letra minúscula).
function delegateDe(nomeModelo) {
  const prop = nomeModelo.charAt(0).toLowerCase() + nomeModelo.slice(1);
  return prisma[prop] || null;
}

// ─── Perfil de acesso do usuário ─────────────────────────────────────────────

export function acessoDoUsuario(user) {
  const ehAdmin = user?.tipo === "ADMIN";
  const modulos = user?.modulos ?? [];
  const financeiro = ehAdmin || modulos.includes("FINANCEIRO");
  return { ehAdmin, financeiro, modulos };
}

function categoria(nomeModelo) {
  if (MODELOS_BLOQUEADOS.has(nomeModelo)) return "BLOQUEADO";
  if (MODELOS_FINANCEIROS.has(nomeModelo)) return "FINANCEIRO";
  return "OPERACIONAL";
}

export function modeloPermitido(nomeModelo, acesso) {
  const cat = categoria(nomeModelo);
  if (cat === "BLOQUEADO") return false;
  if (cat === "FINANCEIRO") return !!acesso.financeiro;
  return true;
}

// Lista os modelos que o usuário pode consultar (com descrição curta).
export function listarModelosPermitidos(acesso) {
  const operacional = [];
  const financeiro = [];
  for (const m of MODELOS) {
    if (categoria(m.name) === "BLOQUEADO") continue;
    if (categoria(m.name) === "FINANCEIRO") {
      if (acesso.financeiro) financeiro.push({ modelo: m.name, descricao: DESCRICOES[m.name] || "" });
    } else {
      operacional.push({ modelo: m.name, descricao: DESCRICOES[m.name] || "" });
    }
  }
  return { operacional, financeiro };
}

// Descreve os campos e relações de um modelo (para o agente montar a query).
export function descreverModelo(nomeModelo, acesso) {
  if (!modeloPermitido(nomeModelo, acesso)) return { erro: `Modelo '${nomeModelo}' indisponível para o seu perfil.` };
  const m = POR_NOME.get(nomeModelo);
  if (!m) return { erro: `Modelo '${nomeModelo}' não existe.` };

  const campos = [];
  const relacoes = [];
  for (const f of m.fields) {
    if (f.kind === "object") {
      // relação — só expõe se o modelo-alvo também for permitido
      if (modeloPermitido(f.type, acesso)) relacoes.push({ campo: f.name, modelo: f.type, lista: !!f.isList });
      continue;
    }
    if (CAMPO_PII.test(f.name)) continue; // não revela campos PII
    if (!acesso.financeiro && CAMPO_FINANCEIRO.test(f.name)) continue;
    campos.push({ campo: f.name, tipo: f.type });
  }
  return { modelo: nomeModelo, descricao: DESCRICOES[nomeModelo] || "", campos, relacoes };
}

// ─── Sanitização e redação ───────────────────────────────────────────────────

// Remove de um objeto de include/select as relações que apontam para modelos
// não permitidos (recursivo, profundidade limitada).
function sanitizarInclude(nomeModelo, include, acesso, prof = 0) {
  if (!include || typeof include !== "object" || prof > 3) return undefined;
  const m = POR_NOME.get(nomeModelo);
  if (!m) return undefined;
  const relPorNome = new Map(m.fields.filter((f) => f.kind === "object").map((f) => [f.name, f.type]));
  const out = {};
  for (const [k, v] of Object.entries(include)) {
    const alvo = relPorNome.get(k);
    if (!alvo || !modeloPermitido(alvo, acesso)) continue; // dropa relação bloqueada
    if (v === true) out[k] = true;
    else if (v && typeof v === "object") {
      const sub = {};
      if (v.where) sub.where = v.where;
      if (v.orderBy) sub.orderBy = v.orderBy;
      if (v.take) sub.take = Math.min(Number(v.take) || 10, 50);
      if (v.include) sub.include = sanitizarInclude(alvo, v.include, acesso, prof + 1);
      if (v.select) sub.select = v.select;
      out[k] = Object.keys(sub).length ? sub : true;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

// Remove campos sensíveis de uma linha (recursivo em objetos/arrays).
function redigir(valor, acesso) {
  if (Array.isArray(valor)) return valor.map((v) => redigir(v, acesso));
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(valor)) {
      if (CAMPO_PII.test(k)) continue;
      if (!acesso.financeiro && CAMPO_FINANCEIRO.test(k)) continue;
      out[k] = redigir(v, acesso);
    }
    return out;
  }
  return valor;
}

// ─── Execução de consultas ───────────────────────────────────────────────────

const TETO_LINHAS = 50;

/**
 * Consulta de leitura genérica (findMany) sobre um modelo permitido.
 */
export async function consultarDados({ modelo, filtros, ordenar, relacionar, limite }, acesso) {
  if (!modelo) return { erro: "Informe o 'modelo' a consultar." };
  if (!modeloPermitido(modelo, acesso)) return { erro: `Você não tem acesso ao modelo '${modelo}'.` };
  const delegate = delegateDe(modelo);
  if (!delegate?.findMany) return { erro: `Modelo '${modelo}' não é consultável.` };

  const take = Math.min(Number(limite) || 20, TETO_LINHAS);
  const args = { take };
  if (filtros && typeof filtros === "object") args.where = filtros;
  if (ordenar && typeof ordenar === "object") args.orderBy = ordenar;
  const include = sanitizarInclude(modelo, relacionar, acesso);
  if (include) args.include = include;

  try {
    const linhas = await delegate.findMany(args);
    return {
      modelo,
      total: linhas.length,
      truncado: linhas.length >= take,
      dados: linhas.map((l) => redigir(l, acesso)),
    };
  } catch (e) {
    return { erro: `Falha na consulta de '${modelo}': ${e.message}` };
  }
}

/**
 * Agregação (groupBy / count / sum / avg) sobre um modelo permitido.
 */
export async function agregarDados({ modelo, filtros, agruparPor, somar, contar = true, media, ordenar, limite }, acesso) {
  if (!modelo) return { erro: "Informe o 'modelo' a agregar." };
  if (!modeloPermitido(modelo, acesso)) return { erro: `Você não tem acesso ao modelo '${modelo}'.` };
  const delegate = delegateDe(modelo);
  if (!delegate) return { erro: `Modelo '${modelo}' não é consultável.` };

  // Bloqueia somar/agrupar por campos sensíveis/financeiros sem acesso.
  const proibido = (campo) => CAMPO_PII.test(campo) || (!acesso.financeiro && CAMPO_FINANCEIRO.test(campo));
  const somarOk = (Array.isArray(somar) ? somar : []).filter((c) => !proibido(c));

  try {
    if (Array.isArray(agruparPor) && agruparPor.length) {
      if (agruparPor.some(proibido)) return { erro: "Não é possível agrupar por um campo restrito." };
      const args = { by: agruparPor, take: Math.min(Number(limite) || 50, 200) };
      if (filtros && typeof filtros === "object") args.where = filtros;
      if (contar) args._count = true;
      if (somarOk.length) args._sum = Object.fromEntries(somarOk.map((c) => [c, true]));
      if (Array.isArray(media)) { const m = media.filter((c) => !proibido(c)); if (m.length) args._avg = Object.fromEntries(m.map((c) => [c, true])); }
      if (ordenar && typeof ordenar === "object") args.orderBy = ordenar;
      const grupos = await delegate.groupBy(args);
      return { modelo, grupos: redigir(grupos, acesso) };
    }
    // sem agrupamento → aggregate/count global
    const args = {};
    if (filtros && typeof filtros === "object") args.where = filtros;
    if (contar) args._count = true;
    if (somarOk.length) args._sum = Object.fromEntries(somarOk.map((c) => [c, true]));
    const r = await delegate.aggregate(args);
    return { modelo, resumo: redigir(r, acesso) };
  } catch (e) {
    return { erro: `Falha na agregação de '${modelo}': ${e.message}` };
  }
}
