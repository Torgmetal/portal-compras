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
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { getEmailsSetor, SETOR_LABEL } from "@/lib/comunicacao-setor";

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
      case "listar_tarefas_planejamento":  return await listarTarefasPlanejamento(args, user);
      case "concluir_tarefa_planejamento": return await concluirTarefaPlanejamento(args, user);
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

// ─── Tarefas do Planejamento (achar + concluir via Torguinho) ──────────────────

// módulo do usuário → setores de tarefa que ele cobre (inverso de SETOR_MODULO)
const MODULO_SETORES = {
  PRODUCAO: ["PRODUCAO", "PINTURA", "PCP"],
  EXPEDICAO: ["EXPEDICAO"], COMERCIAL: ["COMERCIAL"], ENGENHARIA: ["ENGENHARIA"],
  COMPRAS: ["COMPRAS"], ALMOXARIFADO: ["ALMOXARIFADO"], FINANCEIRO: ["FINANCEIRO"],
  RH: ["RH"], PLANEJAMENTO: ["PLANEJAMENTO"],
};

async function listarTarefasPlanejamento({ setor, status, termo, semana, ano, limite = 20 }, user) {
  const where = {};
  if (setor) {
    where.setor = setor;
  } else if (user && user.tipo !== "ADMIN" && Array.isArray(user.modulos) && user.modulos.length) {
    // sem setor explícito: foca nas tarefas dos setores que o usuário cobre
    const setores = [...new Set(user.modulos.flatMap((m) => MODULO_SETORES[m] || []))];
    if (setores.length) where.setor = { in: setores };
  }
  if (status) where.status = status;
  else where.status = { in: ["PENDENTE", "EM_ANDAMENTO"] };
  if (semana) where.semanaIso = Number(semana);
  if (ano) where.ano = Number(ano);
  if (termo && String(termo).trim()) {
    const d = String(termo).replace(/\D/g, "");
    where.OR = [{ titulo: { contains: String(termo).trim(), mode: "insensitive" } }];
    if (d) where.OR.push({ opNumero: { contains: d } });
  }

  const lista = await prisma.tarefaPlanejamento.findMany({
    where,
    select: { id: true, titulo: true, setor: true, status: true, prioridade: true, dataPrevista: true, opNumero: true, responsavel: true, semanaIso: true, ano: true },
    orderBy: [{ dataPrevista: "asc" }, { createdAt: "desc" }],
    take: Math.min(Number(limite) || 20, 50),
  });

  if (lista.length === 0) return { mensagem: "Nenhuma tarefa pendente encontrada para esses filtros." };

  const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
  const tarefas = lista.map((t) => ({
    ...t,
    atrasada: !!(t.dataPrevista && t.status !== "CONCLUIDA" && t.status !== "CANCELADA" && new Date(t.dataPrevista) < hoje),
  }));
  return { tarefas, total: tarefas.length };
}

async function concluirTarefaPlanejamento({ tarefaId, termo, setor, observacao }, user) {
  const incl = { createdBy: { select: { email: true, name: true } } };
  let tarefa = null;

  if (tarefaId) {
    tarefa = await prisma.tarefaPlanejamento.findUnique({ where: { id: tarefaId }, include: incl });
    if (!tarefa) return { erro: "Tarefa não encontrada com esse id." };
  } else if (termo && String(termo).trim()) {
    const d = String(termo).replace(/\D/g, "");
    const where = { status: { in: ["PENDENTE", "EM_ANDAMENTO"] }, OR: [{ titulo: { contains: String(termo).trim(), mode: "insensitive" } }] };
    if (d) where.OR.push({ opNumero: { contains: d } });
    if (setor) where.setor = setor;
    const cands = await prisma.tarefaPlanejamento.findMany({ where, include: incl, take: 6 });
    if (cands.length === 0) return { mensagem: "Não encontrei tarefa aberta com esse termo. Use listar_tarefas_planejamento para conferir." };
    if (cands.length > 1) return { multiplas: cands.map((c) => ({ id: c.id, titulo: c.titulo, setor: c.setor, status: c.status, prazo: c.dataPrevista })), mensagem: "Há mais de uma tarefa aberta com esse termo — peça ao usuário para confirmar qual (informe o id)." };
    tarefa = cands[0];
  } else {
    return { erro: "Informe tarefaId ou termo." };
  }

  if (tarefa.status === "CONCLUIDA") return { ok: true, jaConcluida: true, mensagem: `A tarefa "${tarefa.titulo}" já estava concluída.` };

  const quem = user?.name || user?.email || "o setor";
  const obsFinal = [tarefa.observacao, `✓ Concluída por ${quem} via Torguinho${observacao ? `: ${observacao}` : ""}`].filter(Boolean).join("\n").slice(0, 1000);

  const atualizada = await prisma.tarefaPlanejamento.update({
    where: { id: tarefa.id },
    data: { status: "CONCLUIDA", dataConcluida: new Date(), observacao: obsFinal },
  });

  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "TAREFA_CONCLUIDA_VIA_TORGUINHO", entity: "TarefaPlanejamento", entityId: tarefa.id, diff: { titulo: tarefa.titulo, setor: tarefa.setor, por: quem, observacao: observacao || null } },
  }).catch(() => {});

  // avisa o Planejamento por e-mail (quem distribuiu + matriz do Planejamento)
  let avisados = 0;
  try {
    const planEmails = await getEmailsSetor("PLANEJAMENTO");
    const to = [...new Set([tarefa.createdBy?.email, ...planEmails].filter(Boolean).map((e) => String(e).toLowerCase()))];
    if (to.length) {
      const op = tarefa.opNumero ? `OP-${String(tarefa.opNumero).padStart(3, "0")}` : null;
      const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0D1F3C;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;font-size:17px;">✅ Tarefa concluída</h2>
            <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Workspace Torg — Planejamento</p>
          </div>
    <div style="height:4px;background:#F4801F;"></div>
          <div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:14px;color:#002945;">
            <p style="margin:0 0 8px;"><b>${escapeHtml(tarefa.titulo)}</b></p>
            <p style="margin:0;font-size:13px;color:#576D7E;">${escapeHtml(SETOR_LABEL[tarefa.setor] || tarefa.setor)}${op ? ` · ${op}` : ""} · concluída por <b>${escapeHtml(quem)}</b> em ${quando}</p>
            ${observacao ? `<p style="margin:10px 0 0;font-size:13px;color:#002945;">📝 ${escapeHtml(observacao)}</p>` : ""}
            <p style="margin:14px 0 0;font-size:12px;color:#576D7E;border-top:1px solid #e5e7eb;padding-top:10px;">Veja em Planejamento › Tarefas no portal.</p>
          </div>
        </div>`;
      const r = await sendEmail({ to, subject: `✅ Concluída: ${tarefa.titulo}${op ? ` (${op})` : ""}`, html });
      if (r.ok) avisados = to.length;
    }
  } catch (e) { console.error("[torguinho] aviso de conclusão falhou:", e?.message); }

  return {
    ok: true,
    tarefa: { id: atualizada.id, titulo: atualizada.titulo, setor: atualizada.setor, status: atualizada.status },
    planejamentoAvisado: avisados,
    mensagem: `Tarefa "${atualizada.titulo}" marcada como concluída${avisados ? ` e ${avisados} aviso(s) enviado(s) ao Planejamento` : " (nenhum contato de Planejamento configurado para avisar)"}.`,
  };
}
