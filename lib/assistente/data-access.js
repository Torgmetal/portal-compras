/**
 * lib/assistente/data-access.js
 *
 * Camada de governança de acesso a dados do Torguinho. Permite que o agente
 * consulte QUALQUER tabela do portal (via Prisma DMMF — módulos novos entram
 * automaticamente), mas com guarda-corpos por MÓDULO do usuário:
 *
 *  - Operacional (OPs, cronograma, RMs, compras, produção, estoque…) → todos.
 *  - Valores comerciais (contrato/obra/OP, orçamentos, propostas)      → COMERCIAL ou FINANCEIRO.
 *  - Financeiro (contas a pagar/receber, fluxo, medições, verbas)      → FINANCEIRO.
 *  - RH / pessoal / saúde (funcionários, ponto, férias, acidentes…)    → RH.
 *  - Credenciais (senha/token/hash)                                    → ninguém, nunca.
 *  (ADMIN tem todos os acessos.)
 *
 * Cada usuário enxerga só o que impacta o seu dia a dia. Somente LEITURA
 * (findMany / groupBy / aggregate), com teto de linhas.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ─── Classificação de modelos ────────────────────────────────────────────────

// Nunca acessíveis no chat (auth/config/auditoria).
const MODELOS_BLOQUEADOS = new Set([
  "User", "PasswordResetToken", "UserModulo", "ConfigAssistente", "AuditLog",
]);

// RH / pessoal / saúde — só ADMIN / RH.
const MODELOS_RH = new Set([
  "Funcionario", "Dependente", "Ponto", "Ferias", "Beneficio",
  "FuncionarioBeneficio", "Competencia", "CargoCompetencia",
  "FuncionarioCompetencia", "Documento", "Vaga", "Afastamento",
  "AcidenteTrabalho", "Treinamento", "TreinamentoParticipante",
  "Cargo", "Setor", "PmpMeta",
]);

// Financeiro (contas, fluxo, medições, verbas) — só ADMIN / FINANCEIRO.
const MODELOS_FINANCEIROS = new Set([
  "OPMedicao", "FluxoCaixa", "SolicitacaoVerba", "ContaPagar", "ContaReceber",
  "FaturamentoEvento", "FaturamentoCache", "Meta", "FreteCotacao",
  "NfseConchalVinculo", "CustoItem",
]);

// Valores comerciais (orçamentos, propostas, receitas) — ADMIN / COMERCIAL / FINANCEIRO.
const MODELOS_COMERCIAIS = new Set([
  "Orcamento", "OrcamentoRevisao", "PropostaEstudo", "PropostaDocumento",
  "EstudoCotacao", "EstudoCotacaoItem", "OPReceita",
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
  Orcamento: "Orçamentos comerciais.",
  Funcionario: "Cadastro de funcionários (RH).",
};

// ─── Campos sensíveis ────────────────────────────────────────────────────────

// Credenciais — nunca retornadas (nem para ADMIN).
const CAMPO_SEGREDO = /senha|password|hash|salt|secret|^token$|apptoken/i;
// Pessoais/RH — só para quem tem acesso de RH.
const CAMPO_RH = /cpf|^rg$|inscricaoest|^pis$|ctps|matricula|salari|remunerac|nascimento|dependente|chavepix|contacorrente|conta_corrente/i;
// Valores comerciais/financeiros — só para COMERCIAL/FINANCEIRO.
const CAMPO_VALOR = /valor|preco|^cmc$|custo|faturad|receita|verba|orcament|margem|lucro|contrato|saldo|desconto|comissao/i;

// Um campo é visível para este usuário?
function campoVisivel(nome, acesso) {
  if (CAMPO_SEGREDO.test(nome)) return false;
  if (CAMPO_RH.test(nome) && !acesso.rh) return false;
  if (CAMPO_VALOR.test(nome) && !acesso.valores) return false;
  return true;
}

// ─── DMMF: mapa de modelos ───────────────────────────────────────────────────

const MODELOS = Prisma.dmmf.datamodel.models;
const POR_NOME = new Map(MODELOS.map((m) => [m.name, m]));

function delegateDe(nomeModelo) {
  const prop = nomeModelo.charAt(0).toLowerCase() + nomeModelo.slice(1);
  return prisma[prop] || null;
}

// ─── Perfil de acesso do usuário ─────────────────────────────────────────────

export function acessoDoUsuario(user) {
  const ehAdmin = user?.tipo === "ADMIN";
  const modulos = user?.modulos ?? [];
  const has = (m) => ehAdmin || modulos.includes(m);
  const comercial = has("COMERCIAL");
  const financeiro = has("FINANCEIRO");
  return {
    ehAdmin,
    rh: has("RH"),
    comercial,
    financeiro,
    valores: comercial || financeiro, // pode ver valores de obra/OP/contrato
    modulos,
  };
}

function categoria(nomeModelo) {
  if (MODELOS_BLOQUEADOS.has(nomeModelo)) return "BLOQUEADO";
  if (MODELOS_RH.has(nomeModelo)) return "RH";
  if (MODELOS_FINANCEIROS.has(nomeModelo)) return "FINANCEIRO";
  if (MODELOS_COMERCIAIS.has(nomeModelo)) return "COMERCIAL";
  return "OPERACIONAL";
}

export function modeloPermitido(nomeModelo, acesso) {
  switch (categoria(nomeModelo)) {
    case "BLOQUEADO":  return false;
    case "RH":         return !!acesso.rh;
    case "FINANCEIRO": return !!acesso.financeiro;
    case "COMERCIAL":  return !!acesso.valores;
    default:           return true;
  }
}

// Dentro de um modelo de RH, quem tem acesso de RH vê também os campos de valor
// (ex: valor de benefício) — eles são dados de RH, não "valores comerciais".
function acessoParaModelo(nomeModelo, acesso) {
  if (categoria(nomeModelo) === "RH" && acesso.rh && !acesso.valores) {
    return { ...acesso, valores: true };
  }
  return acesso;
}

// Lista os modelos que o usuário pode consultar (agrupados por área).
export function listarModelosPermitidos(acesso) {
  const grupos = { operacional: [], comercial: [], financeiro: [], rh: [] };
  for (const m of MODELOS) {
    const cat = categoria(m.name);
    if (!modeloPermitido(m.name, acesso)) continue;
    const item = { modelo: m.name, descricao: DESCRICOES[m.name] || "" };
    if (cat === "RH") grupos.rh.push(item);
    else if (cat === "FINANCEIRO") grupos.financeiro.push(item);
    else if (cat === "COMERCIAL") grupos.comercial.push(item);
    else grupos.operacional.push(item);
  }
  return grupos;
}

// Descreve campos e relações de um modelo (respeitando o acesso do usuário).
export function descreverModelo(nomeModelo, acesso) {
  if (!modeloPermitido(nomeModelo, acesso)) return { erro: `Modelo '${nomeModelo}' indisponível para o seu perfil.` };
  const m = POR_NOME.get(nomeModelo);
  if (!m) return { erro: `Modelo '${nomeModelo}' não existe.` };

  const ac = acessoParaModelo(nomeModelo, acesso);
  const campos = [];
  const relacoes = [];
  for (const f of m.fields) {
    if (f.kind === "object") {
      if (modeloPermitido(f.type, acesso)) relacoes.push({ campo: f.name, modelo: f.type, lista: !!f.isList });
      continue;
    }
    if (!campoVisivel(f.name, ac)) continue;
    campos.push({ campo: f.name, tipo: f.type });
  }
  return { modelo: nomeModelo, descricao: DESCRICOES[nomeModelo] || "", campos, relacoes };
}

// ─── Sanitização e redação ───────────────────────────────────────────────────

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

// Remove campos não visíveis de uma linha (recursivo).
function redigir(valor, acesso) {
  if (Array.isArray(valor)) return valor.map((v) => redigir(v, acesso));
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(valor)) {
      if (!campoVisivel(k, acesso)) continue;
      out[k] = redigir(v, acesso);
    }
    return out;
  }
  return valor;
}

// ─── Execução de consultas ───────────────────────────────────────────────────

const TETO_LINHAS = 50;

export async function consultarDados({ modelo, filtros, ordenar, relacionar, limite }, acesso) {
  if (!modelo) return { erro: "Informe o 'modelo' a consultar." };
  if (!modeloPermitido(modelo, acesso)) return { erro: `Você não tem acesso ao modelo '${modelo}'.` };
  const delegate = delegateDe(modelo);
  if (!delegate?.findMany) return { erro: `Modelo '${modelo}' não é consultável.` };

  const ac = acessoParaModelo(modelo, acesso);
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
      dados: linhas.map((l) => redigir(l, ac)),
    };
  } catch (e) {
    return { erro: `Falha na consulta de '${modelo}': ${e.message}` };
  }
}

export async function agregarDados({ modelo, filtros, agruparPor, somar, contar = true, media, ordenar, limite }, acesso) {
  if (!modelo) return { erro: "Informe o 'modelo' a agregar." };
  if (!modeloPermitido(modelo, acesso)) return { erro: `Você não tem acesso ao modelo '${modelo}'.` };
  const delegate = delegateDe(modelo);
  if (!delegate) return { erro: `Modelo '${modelo}' não é consultável.` };

  const ac = acessoParaModelo(modelo, acesso);
  const proibido = (campo) => !campoVisivel(campo, ac);
  const somarOk = (Array.isArray(somar) ? somar : []).filter((c) => !proibido(c));

  try {
    if (Array.isArray(agruparPor) && agruparPor.length) {
      if (agruparPor.some(proibido)) return { erro: "Não é possível agrupar por um campo restrito ao seu perfil." };
      const args = { by: agruparPor, take: Math.min(Number(limite) || 50, 200) };
      if (filtros && typeof filtros === "object") args.where = filtros;
      if (contar) args._count = true;
      if (somarOk.length) args._sum = Object.fromEntries(somarOk.map((c) => [c, true]));
      if (Array.isArray(media)) { const m = media.filter((c) => !proibido(c)); if (m.length) args._avg = Object.fromEntries(m.map((c) => [c, true])); }
      if (ordenar && typeof ordenar === "object") args.orderBy = ordenar;
      const grupos = await delegate.groupBy(args);
      return { modelo, grupos: redigir(grupos, ac) };
    }
    const args = {};
    if (filtros && typeof filtros === "object") args.where = filtros;
    if (contar) args._count = true;
    if (somarOk.length) args._sum = Object.fromEntries(somarOk.map((c) => [c, true]));
    const r = await delegate.aggregate(args);
    return { modelo, resumo: redigir(r, ac) };
  } catch (e) {
    return { erro: `Falha na agregação de '${modelo}': ${e.message}` };
  }
}
