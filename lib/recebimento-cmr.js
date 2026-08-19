import "server-only";
import { prisma } from "./prisma";
import { omiePodeBaixar } from "./recebimento-fonte";

// CONCILIAÇÃO DO RECEBIMENTO COM O CMR.
//
// O material chega, o Almoxarifado lança no CMR (com corrida, NF, peso) — e o Portal de Compras
// continua mostrando o item como "aguardando entrega", porque lá o recebido só vinha do Omie.
// Medido em 19/08/2026: **555 itens** com pedido gerado e nenhum recebimento lançado.
//
// Vitor (18/08, sobre o status de compra do PCP): o Omie não serve — nota que chega tarde e
// material faturado direto pro cliente que nunca gera nota nossa. O CMR é lançado no recebimento,
// fica atualizado e ainda traz corrida/lote/NF. Esta lib estende a mesma fonte até o ITEM da RM.
//
// Regras acertadas com o Vitor (19/08):
//   1. peso em KG, item fechado com ≥95% do solicitado (sobra e perda de corte são normais —
//      mesma tolerância do painel do PCP);
//   2. quando duas RMs pedem o mesmo perfil, **FIFO**: abate da RM mais antiga primeiro (mesma
//      política de consumo usada pra atribuir o R às peças);
//   3. origem própria `CMR`, separada de MANUAL e OMIE_SYNC — dá pra desfazer em bloco e ninguém
//      confunde com nota lançada.
//
// ⚠️ CASA SÓ POR DESCRIÇÃO IDÊNTICA dentro da MESMA OP. Testei casamento por perfil aproximado
// (`casarPerfilComOmie`) e ele acerta 1 ou 2 itens por OP — o custo de errar é alto: marcar como
// recebido um material que não chegou trava a compra e o corte para na fábrica.
//
// 🚨 **REGRA DE DATA — material recebido ANTES do pedido não pode ser a entrega dele.** Vitor
// (19/08): "pode ser a mesma especificação, mas para fabricar essas peças em questão tivemos que
// comprar novos materiais... se tivéssemos um controle de estoque real, aí tudo bem trazer essa
// informação de datas antigas, mas nesse caso precisamos comprar tudo novo".
//
// Na 1ª rodada **20 dos 54 lançamentos** casaram entrada de CMR anterior ao pedido — um deles com
// **299 dias** de diferença (material de out/2025 creditado a pedido de jul/2026). Na OP-084 a RM
// T84-010, feita em 18/08, recebeu crédito de uma entrada de 17/06: é a compra NOVA que o Vitor
// mencionou, e o portal dizia que já tinha chegado. As RMs T84-001/003 (pedido 03/06, material
// 10–22/06) estão certas e continuam fechando.
//
// Sem controle de estoque real, mesma especificação NÃO é o mesmo material. A data do pedido é a
// única barreira objetiva que temos.

const TOL = 0.05; // 5% — item fechado com 95% do solicitado
// Folga entre o pedido e a chegada: cobre lançamento com data trocada por um dia, não os 62–299
// dias que apareceram na primeira rodada.
const GRACA_DIAS = 3;

const norm = (s) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * @param {object} p
 * @param {string[]} [p.opNumeros] — limita a essas OPs; sem isso, roda em todas as que têm CMR
 * @param {boolean} [p.simular]   — true = não grava, só devolve o que faria
 * @param {string}  [p.userId]
 * @returns {Promise<{lancamentos:[], resumo:{itens,kg,ops}, semCmr:[]}>}
 */
export async function conciliarRecebimentoCmr({ opNumeros = null, simular = true, userId = null } = {}) {
  const wherePeca = {
    status: "PEDIDO_GERADO",
    canceladoEm: null,
    peso: { gt: 0 },
    ...(opNumeros?.length ? { rm: { op: { numero: { in: opNumeros } } } } : {}),
  };
  const itens = await prisma.rMItem.findMany({
    where: wherePeca,
    select: {
      id: true, descricao: true, peso: true, unidade: true,
      rm: { select: { id: true, numero: true, createdAt: true, op: { select: { numero: true } } } },
      pedidoOmie: { select: { numeroPedido: true, createdAt: true } },
      recebimentos: { select: { qtdRecebida: true } },
    },
  });
  if (!itens.length) return { lancamentos: [], resumo: { itens: 0, kg: 0, ops: 0 }, semCmr: [] };

  // UM DONO POR ITEM: o que é do Omie (consumível de oficina, telha/calha/rufo/grade de piso) sai
  // daqui, senão as duas rotinas lançariam recebimento no mesmo item. O CMR até tem 16 linhas de
  // cobertura, mas são exceção — quem fecha esses é o Omie.
  const doOmie = new Set();
  for (const i of itens) if (await omiePodeBaixar(i.descricao)) doOmie.add(i.id);
  const meus = itens.filter((i) => !doOmie.has(i.id));
  if (!meus.length) return { lancamentos: [], resumo: { itens: 0, kg: 0, ops: 0 }, semCmr: [] };

  const ops = [...new Set(meus.map((i) => i.rm?.op?.numero).filter(Boolean))];
  const cmr = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL", opNumero: { in: ops } },
    select: { opNumero: true, nome: true, pesoKg: true, dataRecebimento: true, nfNumero: true, importRef: true },
    orderBy: [{ dataRecebimento: "asc" }],
  });

  // OP + descrição → o que o CMR diz que chegou
  // Guarda as ENTRADAS uma a uma (não só o total): a data de cada uma é que decide se ela pode ser
  // a entrega de um pedido.
  const chegou = new Map();
  for (const c of cmr) {
    const k = `${c.opNumero}|${norm(c.nome)}`;
    const g = chegou.get(k) || { entradas: [] };
    g.entradas.push({ pesoKg: Number(c.pesoKg) || 0, data: c.dataRecebimento || null, nf: c.nfNumero || null, r: c.importRef || null });
    chegou.set(k, g);
  }

  // FIFO: a RM mais antiga consome primeiro
  const porChave = new Map();
  for (const it of meus) {
    const k = `${it.rm?.op?.numero}|${norm(it.descricao)}`;
    const arr = porChave.get(k) || [];
    arr.push(it);
    porChave.set(k, arr);
  }

  const lancamentos = [];
  const semCmr = [];
  const quando = (it) => it.pedidoOmie?.createdAt || it.rm?.createdAt || null;

  for (const [k, lista] of porChave) {
    const g = chegou.get(k);
    if (!g || !g.entradas.length) {
      for (const it of lista) semCmr.push({ rmItemId: it.id, op: it.rm?.op?.numero, rm: it.rm?.numero, descricao: it.descricao, pesoKg: it.peso });
      continue;
    }
    // FIFO pela data do PEDIDO (é ela que casa com a chegada), não pela criação da RM
    lista.sort((a, b) => (quando(a) ?? 0) - (quando(b) ?? 0) || String(a.rm?.numero).localeCompare(String(b.rm?.numero), "pt-BR", { numeric: true }));

    // Entradas do CMR, da mais antiga pra mais nova, cada uma com o seu saldo.
    const entradas = g.entradas.map((e) => ({ ...e, saldo: Number(e.pesoKg) || 0 })).sort((a, b) => (a.data ?? 0) - (b.data ?? 0));

    for (const it of lista) {
      const pedido = Number(it.peso) || 0;
      const jaTem = (it.recebimentos || []).reduce((s2, r) => s2 + (Number(r.qtdRecebida) || 0), 0);
      const ref = quando(it);
      const limite = ref ? new Date(ref.getTime() - GRACA_DIAS * 86400000) : null;
      // 🚫 a barreira: entrada anterior ao pedido é de outra compra
      const elegiveis = entradas.filter((e) => !(limite && e.data && e.data < limite));

      // ⚠ IDEMPOTÊNCIA: antes de pegar o que falta, o item "reconsome" das MESMAS entradas o que
      // já recebeu. Descontar isso do grupo inteiro pelas entradas mais antigas (como eu fiz na
      // 1ª versão) não fecha: com a barreira de data, o item não podia ter usado as antigas, e a
      // 2ª passada liberava as novas de novo.
      let repor = jaTem;
      for (const e of elegiveis) {
        if (repor <= 0.01) break;
        const t = Math.min(e.saldo, repor);
        e.saldo -= t; repor -= t;
      }

      let falta = pedido - jaTem;
      if (falta <= pedido * TOL) continue; // já fechado

      let tomado = 0;
      const usadas = [];
      for (const e of elegiveis) {
        if (falta <= 0.01) break;
        if (e.saldo <= 0.01) continue;
        const t = Math.min(e.saldo, falta);
        e.saldo -= t; falta -= t; tomado += t;
        usadas.push(e);
      }
      // ⚠ Piso de meio quilo: sobra de fração criava recebimento de **0 kg** e, como ela nunca
      // fechava o item, voltava a ser criada em toda passada.
      if (Math.round(tomado * 10) / 10 < 0.5) {
        semCmr.push({ rmItemId: it.id, op: it.rm?.op?.numero, rm: it.rm?.numero, descricao: it.descricao, pesoKg: pedido, motivo: "sem entrada de CMR posterior ao pedido" });
        continue;
      }
      lancamentos.push({
        rmItemId: it.id,
        op: it.rm?.op?.numero, rm: it.rm?.numero, descricao: it.descricao,
        pedidoKg: Math.round(pedido), jaRecebidoKg: Math.round(jaTem), lancarKg: Math.round(tomado * 10) / 10,
        fecha: jaTem + tomado >= pedido * (1 - TOL),
        dataRecebimento: usadas[usadas.length - 1]?.data || null,
        nfNumero: usadas.map((e) => e.nf).find(Boolean) || null,
        rs: [...new Set(usadas.map((e) => e.r).filter(Boolean))].slice(0, 4),
        cmrKg: Math.round(g.entradas.reduce((a, e) => a + (Number(e.pesoKg) || 0), 0)), cmrLinhas: g.entradas.length,
      });
    }
  }

  if (!simular && lancamentos.length) {
    // em blocos pequenos: o pool do Neon é curto
    for (let i = 0; i < lancamentos.length; i += 10) {
      await Promise.all(lancamentos.slice(i, i + 10).map((l) => prisma.recebimento.create({
        data: {
          rmItemId: l.rmItemId,
          qtdRecebida: l.lancarKg,
          unidade: "KG",
          dataRecebimento: l.dataRecebimento || new Date(),
          origem: "CMR",
          nfNumero: l.nfNumero,
          createdById: userId,
          observacao: `Conciliacao CMR — ${l.cmrLinhas} linha(s), ${l.cmrKg} kg na OP${l.rs.length ? ` · R ${l.rs.join(", ")}` : ""}`,
        },
      })));
    }
  }

  return {
    lancamentos,
    semCmr,
    resumo: {
      itens: lancamentos.length,
      kg: Math.round(lancamentos.reduce((a, l) => a + l.lancarKg, 0)),
      fechados: lancamentos.filter((l) => l.fecha).length,
      ops: new Set(lancamentos.map((l) => l.op)).size,
      semCmr: semCmr.length,
    },
  };
}
