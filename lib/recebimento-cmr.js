import "server-only";
import { prisma } from "./prisma";

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
// ⚠️ O CMR só cobre material RASTREÁVEL. Parafuso A325 (49 itens), diluente, cola química e
// prisioneiro nunca entram lá — esses seguem dependendo de lançamento manual.

const TOL = 0.05; // 5% — item fechado com 95% do solicitado

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
      recebimentos: { select: { qtdRecebida: true } },
    },
  });
  if (!itens.length) return { lancamentos: [], resumo: { itens: 0, kg: 0, ops: 0 }, semCmr: [] };

  const ops = [...new Set(itens.map((i) => i.rm?.op?.numero).filter(Boolean))];
  const cmr = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL", opNumero: { in: ops } },
    select: { opNumero: true, nome: true, pesoKg: true, dataRecebimento: true, nfNumero: true, importRef: true },
    orderBy: [{ dataRecebimento: "asc" }],
  });

  // OP + descrição → o que o CMR diz que chegou
  const chegou = new Map();
  for (const c of cmr) {
    const k = `${c.opNumero}|${norm(c.nome)}`;
    const g = chegou.get(k) || { kg: 0, linhas: 0, primeira: null, nfs: new Set(), rs: [] };
    g.kg += Number(c.pesoKg) || 0;
    g.linhas++;
    if (!g.primeira && c.dataRecebimento) g.primeira = c.dataRecebimento;
    if (c.nfNumero) g.nfs.add(c.nfNumero);
    if (c.importRef) g.rs.push(c.importRef);
    chegou.set(k, g);
  }

  // FIFO: a RM mais antiga consome primeiro
  const porChave = new Map();
  for (const it of itens) {
    const k = `${it.rm?.op?.numero}|${norm(it.descricao)}`;
    const arr = porChave.get(k) || [];
    arr.push(it);
    porChave.set(k, arr);
  }

  const lancamentos = [];
  const semCmr = [];
  for (const [k, lista] of porChave) {
    const g = chegou.get(k);
    if (!g || g.kg <= 0) {
      for (const it of lista) semCmr.push({ rmItemId: it.id, op: it.rm?.op?.numero, rm: it.rm?.numero, descricao: it.descricao, pesoKg: it.peso });
      continue;
    }
    lista.sort((a, b) => (a.rm?.createdAt ?? 0) - (b.rm?.createdAt ?? 0) || String(a.rm?.numero).localeCompare(String(b.rm?.numero), "pt-BR", { numeric: true }));

    // ⚠ O TETO é o peso do CMR do grupo, menos TUDO que os itens do grupo já receberam (de
    // qualquer origem). Descontar só por item não bastava: numa 2ª passada o saldo reiniciava
    // cheio e os itens parciais eram completados de novo, creditando material que não chegou.
    const jaNoGrupo = lista.reduce((s, it) => s + (it.recebimentos || []).reduce((a, r) => a + (Number(r.qtdRecebida) || 0), 0), 0);
    let saldo = g.kg - jaNoGrupo;
    for (const it of lista) {
      if (saldo <= 0.01) break;
      const jaTem = (it.recebimentos || []).reduce((s, r) => s + (Number(r.qtdRecebida) || 0), 0);
      const pedido = Number(it.peso) || 0;
      const falta = pedido - jaTem;
      if (falta <= pedido * TOL) continue; // já fechado (≥95%)
      const tomar = Math.min(falta, saldo);
      saldo -= tomar;
      lancamentos.push({
        rmItemId: it.id,
        op: it.rm?.op?.numero, rm: it.rm?.numero, descricao: it.descricao,
        pedidoKg: Math.round(pedido), jaRecebidoKg: Math.round(jaTem), lancarKg: Math.round(tomar * 10) / 10,
        fecha: jaTem + tomar >= pedido * (1 - TOL),
        dataRecebimento: g.primeira,
        nfNumero: [...g.nfs][0] || null,
        rs: [...new Set(g.rs)].slice(0, 4),
        cmrKg: Math.round(g.kg), cmrLinhas: g.linhas,
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
