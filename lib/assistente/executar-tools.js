/**
 * lib/assistente/executar-tools.js
 *
 * Executa as ferramentas chamadas pelo Claude durante o tool use loop.
 * Todas as queries rodam no servidor (Next.js API Route).
 */

import { prisma } from "@/lib/prisma";
import {
  acessoDoUsuario, listarModelosPermitidos, descreverModelo,
  consultarDados, agregarDados,
} from "@/lib/assistente/data-access";
import { gerarPlanilhaTorg } from "@/lib/assistente/gerar-planilha";

/**
 * Despacha a execução da tool correta com base no nome.
 * @param {string} nome - nome da ferramenta
 * @param {object} args - argumentos vindos do Claude
 * @param {object} [user] - usuário logado (necessário para as tools genéricas)
 * @returns {Promise<object>} resultado serializado como JSON
 */
export async function executarTool(nome, args, user = null) {
  try {
    const acesso = acessoDoUsuario(user);
    switch (nome) {
      case "consultar_ops":           return await consultarOps(args);
      case "consultar_op_detalhe":    return await consultarOpDetalhe(args);
      case "consultar_estoque":       return await consultarEstoque(args);
      case "consultar_mes_producao":  return await consultarMesProducao(args);
      case "consultar_rms":           return await consultarRms(args);
      case "consultar_pedidos_compras": return await consultarPedidos(args);
      case "consultar_medicoes":        return await consultarMedicoes(args);
      case "consultar_produtos_omie":   return await consultarProdutosOmie(args);
      // genéricas (acesso amplo, governado por data-access.js)
      case "listar_modelos_dados":    return listarModelosPermitidos(acesso);
      case "descrever_modelo":        return descreverModelo(args?.modelo, acesso);
      case "consultar_dados":         return await consultarDados(args, acesso);
      case "agregar_dados":           return await agregarDados(args, acesso);
      case "gerar_planilha":          return await gerarPlanilhaTorg(args, user);
      default:
        return { erro: `Ferramenta desconhecida: ${nome}` };
    }
  } catch (e) {
    console.error(`[assistente] Erro na tool ${nome}:`, e.message);
    return { erro: `Erro ao consultar dados: ${e.message}` };
  }
}

// ─── Implementações ───────────────────────────────────────────────────────────

async function consultarOps({ numero, cliente, status, limite = 10 }) {
  const where = {};

  if (numero) {
    // Aceita T78, 078, 78 — normaliza para busca
    const n = numero.replace(/^T/i, "").replace(/^0+/, "");
    where.numero = { contains: n, mode: "insensitive" };
  }
  if (cliente) where.cliente = { contains: cliente, mode: "insensitive" };
  if (status)  where.status  = status;

  const ops = await prisma.oP.findMany({
    where,
    select: {
      numero: true,
      cliente: true,
      obra: true,
      status: true,
      dataInicio: true,
      dataFimPrevista: true,
      dataFimReal: true,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limite) || 10, 20),
  });

  if (ops.length === 0) return { mensagem: "Nenhuma OP encontrada com os filtros informados." };
  return { ops, total: ops.length };
}

async function consultarOpDetalhe({ numero }) {
  const n = String(numero).replace(/^T/i, "").replace(/^0+/, "");

  const op = await prisma.oP.findFirst({
    where: { numero: { contains: n, mode: "insensitive" } },
    select: {
      numero: true,
      cliente: true,
      obra: true,
      descricao: true,
      status: true,
      dataInicio: true,
      dataFimPrevista: true,
      dataFimReal: true,
      valorTotalContrato: true,
      itens: {
        select: { descricao: true, quantidade: true, unidade: true },
        take: 20,
      },
    },
  });

  if (!op) return { mensagem: `OP ${numero} não encontrada no portal.` };
  return { op };
}

async function consultarEstoque({ busca, limite = 15 }) {
  const where = { ativo: true };

  if (busca) {
    where.OR = [
      { descricao:       { contains: busca, mode: "insensitive" } },
      { codigoOmie:      { contains: busca, mode: "insensitive" } },
      { categoriaLabel:  { contains: busca, mode: "insensitive" } },
    ];
  }

  const itens = await prisma.estoqueItem.findMany({
    where,
    select: {
      codigoOmie: true,
      descricao: true,
      categoriaLabel: true,
      unidade: true,
      qtdAtual: true,
      estoqueTorg: true,
    },
    orderBy: { descricao: "asc" },
    take: Math.min(Number(limite) || 15, 30),
  });

  if (itens.length === 0) return { mensagem: "Nenhum item encontrado no estoque." };
  return { itens, total: itens.length };
}

async function consultarMesProducao({ obra, de, ate, setor }) {
  const where = {};
  if (obra)  where.obra  = { contains: obra,  mode: "insensitive" };
  if (setor) where.setor = { contains: setor, mode: "insensitive" };
  if (de || ate) {
    where.dataInicio = {};
    if (de)  where.dataInicio.gte = new Date(de  + "T00:00:00.000Z");
    if (ate) where.dataInicio.lte = new Date(ate + "T23:59:59.999Z");
  }

  const [grupos, totalApont] = await Promise.all([
    prisma.mesApontamento.groupBy({
      by: ["obra", "setor"],
      where,
      _sum:   { produzidoKg: true, produzidoUn: true },
      _count: { productionId: true },
      orderBy: [{ obra: "asc" }],
    }),
    prisma.mesApontamento.count({ where }),
  ]);

  if (grupos.length === 0) return { mensagem: "Nenhum apontamento MES encontrado para os filtros informados." };

  // Agrega totais por obra para facilitar leitura do Claude
  const porObra = {};
  for (const g of grupos) {
    if (!porObra[g.obra]) porObra[g.obra] = { obra: g.obra, totalKg: 0, totalUn: 0, setores: [] };
    porObra[g.obra].totalKg += g._sum?.produzidoKg || 0;
    porObra[g.obra].totalUn += g._sum?.produzidoUn || 0;
    porObra[g.obra].setores.push({
      setor: g.setor,
      kg: g._sum?.produzidoKg || 0,
      un: g._sum?.produzidoUn || 0,
      apontamentos: g._count?.productionId || 0,
    });
  }

  return {
    obras: Object.values(porObra),
    totalApontamentos: totalApont,
  };
}

async function consultarRms({ opNumero, status, limite = 10 }) {
  const where = {};
  if (status) where.status = status;

  if (opNumero) {
    const n = String(opNumero).replace(/^T/i, "").replace(/^0+/, "");
    const op = await prisma.oP.findFirst({
      where: { numero: { contains: n, mode: "insensitive" } },
      select: { id: true },
    });
    if (op) where.opId = op.id;
  }

  const rms = await prisma.rM.findMany({
    where,
    select: {
      numero: true,
      descricao: true,
      status: true,
      tipoRM: true,
      createdAt: true,
      op: { select: { numero: true, cliente: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limite) || 10, 20),
  });

  if (rms.length === 0) return { mensagem: "Nenhuma RM encontrada." };
  return { rms, total: rms.length };
}

async function consultarPedidos({ opId, limite = 10 }) {
  const where = {};
  if (opId) where.opId = opId;

  const pedidos = await prisma.pedidoOmie.findMany({
    where,
    select: {
      numeroPedido: true,
      fornecedorNome: true,
      total: true,
      status: true,
      faturamentoDireto: true,
      createdAt: true,
      op: { select: { numero: true, cliente: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limite) || 10, 20),
  });

  if (pedidos.length === 0) return { mensagem: "Nenhum pedido de compra encontrado." };
  return { pedidos, total: pedidos.length };
}

async function consultarProdutosOmie({ busca, limite = 10 }) {
  if (!busca?.trim()) return { mensagem: "Informe um termo de busca para pesquisar produtos no Omie." };

  const itens = await prisma.estoqueItem.findMany({
    where: {
      OR: [
        { descricao:  { contains: busca, mode: "insensitive" } },
        { codigoOmie: { contains: busca, mode: "insensitive" } },
      ],
    },
    select: {
      codigoOmie:    true,
      descricao:     true,
      unidade:       true,
      qtdAtual:      true,
      cmc:           true,
      categoriaLabel:true,
      estoqueTorg:   true,
      ativo:         true,
      ultimaSincOmie:true,
    },
    orderBy: { descricao: "asc" },
    take: Math.min(Number(limite) || 10, 30),
  });

  if (itens.length === 0) {
    return { mensagem: `Nenhum produto encontrado no catálogo Omie para "${busca}". Tente termos diferentes ou verifique se a sincronização foi executada hoje.` };
  }

  return {
    produtos: itens,
    total: itens.length,
    nota: "Dados sincronizados do Omie ERP diariamente às 06:00. Saldo e CMC refletem a última sincronização.",
  };
}

async function consultarMedicoes({ opNumero, limite = 10 }) {
  const where = {};

  if (opNumero) {
    const n = String(opNumero).replace(/^T/i, "").replace(/^0+/, "");
    const op = await prisma.oP.findFirst({
      where: { numero: { contains: n, mode: "insensitive" } },
      select: { id: true },
    });
    if (op) where.opId = op.id;
  }

  const medicoes = await prisma.oPMedicao.findMany({
    where,
    select: {
      numeroPedidoOmie: true,
      descricao: true,
      valorBruto: true,
      valorContratado: true,
      status: true,
      data: true,
      op: { select: { numero: true, cliente: true } },
    },
    orderBy: { data: "desc" },
    take: Math.min(Number(limite) || 10, 20),
  });

  if (medicoes.length === 0) return { mensagem: "Nenhuma medição encontrada." };
  return { medicoes, total: medicoes.length };
}
