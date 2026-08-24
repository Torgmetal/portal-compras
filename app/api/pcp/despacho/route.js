// POST /api/pcp/despacho — despacha peças EM ABERTO no fluxo do PCP (TV de prioridades).
// Define o `destino` da peça e, quando o destino tem efeito colateral, aplica também:
//   PRIORIDADE          → entra na fila de desenho/corte (destino marcado; sequência é à parte);
//   TERCEIRO            → status TERCEIRIZADO + volta (Montagem/Pintura/Expedição), cai em /pcp/terceirizados;
//   REVISAO             → volta pra engenharia revisar;
//   AGUARDANDO_MATERIAL → travada esperando matéria-prima;
//   CANCELADA           → fora do escopo.
// Body: { ids:[], destino, destinoTerceirizado?, obs? }  |  { ids:[], reverter:true } → volta pra EM ABERTO.
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { marcasEntreguesAExpedicao, entregueAExpedicao, noRomaneioSemProducao } from "@/lib/entregue-expedicao";
import { requireRole } from "@/lib/session";
import { whereSetorSyneco, normalizeSetorSyneco } from "@/lib/syneco-dia";
import { ehItemComprado } from "@/lib/item-comprado";
import { dedupLpcLe, renumerarPrioridades, ehLinhaLixo } from "@/lib/pecas-producao";
import { materialPorPerfil, statusCompraPorOp } from "@/lib/status-compra";
import { croquiCortado, setorRealIndex, mapaSetorReal, FLUXO_SETORES } from "@/lib/prioridades-setor";
import { z } from "zod";

export const runtime = "nodejs";

const DESTINOS = ["PRIORIDADE", "TERCEIRO", "REVISAO", "AGUARDANDO_MATERIAL", "CANCELADA"];
const VOLTA_TERCEIRO = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
const SETORES_BAIXA = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];

const SETORES_ENCAMINHAR = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];

const schema = z.object({
  ids: z.array(z.string()).optional(),
  destino: z.enum(DESTINOS).optional(),
  destinoTerceirizado: z.enum(VOLTA_TERCEIRO).optional(),
  dataPrevRetorno: z.string().optional().nullable(), // volta prevista do terceiro (romaneio RT)
  // Encaminhar direto pra um setor (pula as etapas anteriores; ex.: direto pro Jato).
  encaminharSetor: z.enum(SETORES_ENCAMINHAR).optional(),
  comPrioridade: z.boolean().optional(), // junto com o encaminhar: também numera como prioridade
  obs: z.string().max(500).optional().nullable(),
  reverter: z.boolean().optional(),
  tirarPrioridade: z.boolean().optional(), // remove SÓ a marcação de prioridade (marcou errado)
  // Baixa PORTAL (não escreve no Syneco): grava baixaSetores[baixaSetor] = { qtd, em, por }.
  baixaSetor: z.enum(SETORES_BAIXA).optional(),
  baixas: z.array(z.object({ id: z.string(), qtd: z.number().nonnegative() })).optional(), // baixa por peça+qtd
  reverterBaixa: z.boolean().optional(),
});

// GET /api/pcp/despacho?opId=... — peças da OP + placar por destino (pro drill-down da TV).
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const url = new URL(req.url);
  let opId = url.searchParams.get("opId");
  const obra = url.searchParams.get("obra");
  // O dashboard é por NOME de obra ("T64", "OP-67"); resolve pro opId pelo número da OP.
  if (!opId && obra) {
    const num = String(obra).match(/\d+/)?.[0];
    if (num) {
      const n = parseInt(num, 10);
      const cands = [String(n), String(n).padStart(3, "0"), String(n).padStart(4, "0"), `OP-${n}`, `T${n}`];
      const op = await prisma.oP.findFirst({ where: { numero: { in: cands } }, select: { id: true } });
      opId = op?.id || null;
    }
  }
  if (!opId) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const opInfo = await prisma.oP.findUnique({ where: { id: opId }, select: { emProducao: true, numero: true } });
  const setor = url.searchParams.get("setor"); // opcional: escopo do setor pela ROTA da peça
  const todasRaw = await prisma.pecaConjunto.findMany({
    where: { opId },
    select: { id: true, marca: true, descricao: true, tipoPeca: true, perfil: true, fonte: true, pesoUnitKg: true, pesoTotalKg: true, qte: true, qteProduzida: true, corteConcluidoEm: true, status: true, destino: true, destinoTerceirizado: true, terceirizado: true, terceirizadoRecebidoEm: true, encaminhadoSetor: true, prioridade: true, baixaSetores: true, _count: { select: { conjuntoCroquis: true } } },
    orderBy: [{ marca: "asc" }],
  });
  // Descarta linhas-lixo do import (ex.: a linha "TOTAL" da Lista de Expedição que entrou como peça)
  // e os ITENS COMPRADOS (parafuso/porca/arruela/chumbador/telha/calha/… sem estrutura de
  // fabricação) — não são feitos por nós, não entram no fluxo de produção. (Regra do Vitor; eles
  // seguem valendo em Engenharia/Compras/Planejamento/Expedição, a LE tem 100% dos itens.)
  const ehLixo = ehLinhaLixo; // helper compartilhado (lib/pecas-producao) — mesma regra na TV
  // dedupLpcLe: a mesma marca pode ter linha na LPC e na LE — no fluxo de produção vale a da
  // LPC (senão a peça aparece 2× e é despachada/encaminhada em dobro — caso da OP-67).
  const todas = dedupLpcLe(todasRaw.filter((p) => !ehLixo(p) && !ehItemComprado(p)));
  // ROTA da peça pelos setores (regra de domínio do Vitor):
  //   • CROQUI (sub-peça "P")            → só CORTE.
  //   • CONJUNTO COMPOSTO (tem croquis)  → Montagem→Expedição (o corte é dos croquis dele).
  //   • MARCA vinda da LE numa OP que TEM LPC (ex.: guarda-corpo — vem da Lista de Expedição,
  //     hoje ainda SEM croqui na LPC e sem perfil de corte) → Montagem→Expedição. É MONTADA, não
  //     cortada. Resolve sozinho quando a LPC ganhar os croquis do GC (aí vira croqui/composta).
  //     (Vitor 17/08. Guarda por perfil: se a marca da LE tiver perfil, é avulsa de corte, fica no corte.)
  //   • SOLO/AVULSA (perfil de aço da LPC, OU OP que só tem LE) → CORTE + Acabamento→Expedição
  //     (pula Montagem/Solda).
  const temLPC = todas.some((p) => p.fonte === "LPC_IMPORT");
  const temPerfil = (p) => !!(p.perfil && String(p.perfil).trim());
  const ehCroqui = (p) => p.tipoPeca === "CROQUI";
  const ehComposta = (p) => (p._count?.conjuntoCroquis || 0) > 0;
  const ehMarcaLE = (p) => temLPC && p.fonte === "LE_IMPORT" && !ehCroqui(p) && !temPerfil(p);
  const vaiPraMontagem = (p) => ehComposta(p) || ehMarcaLE(p);
  const passaNoSetor = (p, s) => {
    if (!s) return true;
    if (ehCroqui(p)) return s === "CORTE";
    if (vaiPraMontagem(p)) return s !== "CORTE";               // Montagem→Expedição
    return s === "CORTE" || !["MONTAGEM", "SOLDA"].includes(s); // solo/avulsa pula Mont./Solda
  };
  // FIM DE LINHA DO PCP: peça em romaneio (prévio ou emitido) já é da Expedição — sai da lista.
  // Vitor (19/08): "fez o romaneio prévio, ou emitiu o romaneio, sim essa peça deve sair do portal
  // do PCP e a responsabilidade passa a ser do próximo setor". Sem esse fim, a raia de Expedição
  // virava depósito: a peça ficava lá pra sempre e o "a liberar" nunca fechava.
  //
  // Não some calada — o total sai no `entreguesAExpedicao` do placar, pra pessoa ver pra onde foi.
  const marcasEntregues = await marcasEntreguesAExpedicao(prisma, opId);
  const noSetor = setor ? todas.filter((p) => passaNoSetor(p, setor)) : todas;
  const entregues = noSetor.filter((p) => entregueAExpedicao(p, marcasEntregues));
  // ⚠ No romaneio mas SEM produção no portal: contradição, não entrega. Fica na lista e é contada
  // à parte — normalmente é lista faltando (a OP-071 está sem a LPC) ou apontamento que não chegou.
  const romaneioSemProducao = noRomaneioSemProducao(noSetor, marcasEntregues);
  const escopo = entregues.length ? noSetor.filter((p) => !entregueAExpedicao(p, marcasEntregues)) : noSetor;

  // Reconciliação com o Syneco: quantidade PRODUZIDA no mesOrdem daquele setor, por marca
  // (extremo sincronismo portal×Syneco — o histórico e o export usam isto).
  const synecoQtd = new Map(); // marca → un produzidas no Syneco (no setor)
  if (setor) {
    try {
      const syn = await prisma.mesOrdem.groupBy({
        by: ["item"],
        where: { AND: [{ opId }, whereSetorSyneco(setor), { produzidoUn: { gt: 0 } }] },
        _sum: { produzidoUn: true },
      });
      for (const s of syn) if (s.item) synecoQtd.set(s.item, Math.round(s._sum?.produzidoUn || 0));
    } catch {}
  }
  // SETOR REAL de cada peça (Syneco de TODOS os setores + status + terceiro + encaminhamento).
  // Serve pra não deixar peça que JÁ AVANÇOU aparecer na fila de um setor ANTERIOR (Vitor 18/08:
  // "peças que estiverem em outros setores não podem ficar paradas em setores para trás").
  const IDX_SETOR = Object.fromEntries(FLUXO_SETORES.map((x, i) => [x.key, i]));
  let realMapOp = new Map();
  try {
    const synAll = await prisma.mesOrdem.groupBy({ by: ["item", "setor"], where: { opId, produzidoUn: { gt: 0 } }, _sum: { produzidoUn: true } });
    realMapOp = mapaSetorReal(synAll.map((l) => ({ item: l.item, setor: l.setor })), normalizeSetorSyneco);
  } catch {}
  const jaAvancouAlem = (p) => (setor ? setorRealIndex(p, realMapOp) > (IDX_SETOR[setor] ?? -1) : false);

  // MONTAGEM — "pronto para montar" vs "pendente": um conjunto está pronto quando TODOS os croquis
  // dele já foram cortados (baixa no corte / produção no Syneco / corte concluído). Devolve também
  // a lista dos que faltam, pra poder clicar no conjunto e ver quais peças estão faltando.
  let prontoInfo = null;
  if (setor === "MONTAGEM") {
    const links = await prisma.conjuntoCroqui.findMany({
      where: { conjunto: { opId } },
      select: { conjunto: { select: { marca: true } }, croqui: { select: { marca: true } } },
    });
    const croquiMap = new Map();
    for (const p of todas) if (ehCroqui(p)) croquiMap.set(p.marca, p);
    // Quantos ainda faltam cortar deste croqui (qte total menos o já cortado/baixado).
    const faltaCortarQtd = (cr) => {
      const q = Number(cr?.qte) || 1;
      const bxC = cr?.baixaSetores && typeof cr.baixaSetores === "object" ? cr.baixaSetores.CORTE : null;
      const cortado = Math.max(Number(cr?.qteProduzida) || 0, bxC ? (bxC.qtd != null ? Number(bxC.qtd) : q) : 0);
      return Math.max(1, q - cortado);
    };
    const porConj = new Map();
    for (const lk of links) { const a = porConj.get(lk.conjunto.marca) || []; a.push(lk.croqui.marca); porConj.set(lk.conjunto.marca, a); }
    prontoInfo = new Map();
    for (const [conj, croquis] of porConj) {
      const faltam = [];
      for (const cm of croquis) {
        const cr = croquiMap.get(cm);
        // croquiCortado (critério ÚNICO, igual à TV): corte concluído / qtd produzida / baixa no corte.
        if (!croquiCortado(cr)) faltam.push({ marca: cm, descricao: cr?.descricao || null, faltaQtd: faltaCortarQtd(cr) });
      }
      prontoInfo.set(conj, { prontoMontar: faltam.length === 0, faltamCroquis: faltam, totalCroquis: croquis.length });
    }
  }

  // CORTE — quantos CONJUNTOS cada croqui está TRAVANDO. Vitor (19/08): "não pode ignorar nenhuma
  // peça que não dê sequência de montagem; se faltar uma peça de 1 kg você não deve ignorar".
  // O peso engana: na OP-089, 42 croquis somando 1.144 kg seguram 17 guarda-corpos. Aqui a
  // prioridade é POR QUANTO DESTRAVA, não por peso.
  let travaPorCroqui = new Map();
  if (setor === "CORTE") {
    try {
      const links = await prisma.conjuntoCroqui.findMany({
        where: { conjunto: { opId } },
        select: { conjunto: { select: { marca: true, status: true, baixaSetores: true } }, croqui: { select: { marca: true } } },
      });
      const montado = (c) => {
        if (realMapOp.get(c.marca) && (IDX_SETOR[realMapOp.get(c.marca)] ?? -1) >= IDX_SETOR.MONTAGEM) return true;
        const bx = c.baixaSetores && typeof c.baixaSetores === "object" ? c.baixaSetores : {};
        return !!bx.MONTAGEM || c.status === "EXPEDIDO";
      };
      const croquiMap2 = new Map(todas.filter(ehCroqui).map((p) => [p.marca, p]));
      for (const lk of links) {
        if (montado(lk.conjunto)) continue;                       // conjunto já montado: não trava
        if (croquiCortado(croquiMap2.get(lk.croqui.marca))) continue; // croqui já cortado: não trava
        const g = travaPorCroqui.get(lk.croqui.marca) || { conjuntos: [] };
        if (!g.conjuntos.includes(lk.conjunto.marca)) g.conjuntos.push(lk.conjunto.marca);
        travaPorCroqui.set(lk.croqui.marca, g);
      }
    } catch {}
  }

  // MATERIAL por peça (do CMR do Almoxarifado): o corte precisa saber, item a item, se o
  // material daquele perfil já chegou. (Vitor 18/08 — antes só existia o resumo da OP.)
  let matPorPerfil = new Map();
  let compraOp = null;
  try {
    if (opInfo?.numero) matPorPerfil = await materialPorPerfil(opInfo.numero, escopo.map((p) => p.perfil));
  } catch {}
  // Status de COMPRA da OP inteira (pro chip do cabeçalho que abre a rastreabilidade completa).
  try {
    if (opInfo?.numero) compraOp = (await statusCompraPorOp([opInfo.numero])).get(String(opInfo.numero)) || null;
  } catch {}

  // PROGRAMAÇÃO — "o programador já lançou esta peça na produção?" (Vitor 18/08).
  // Quando o programador lança a peça no Syneco, nascem as ORDENS de toda a rota dela de uma vez
  // (10 Corte, 20 Preparação, 30 Montagem, 40 Solda, 50 Acabamento, 60 Jato, 70 Pintura) com
  // status "Não Inicializada". Peça SEM ordem nenhuma = ainda não foi lançada. É o único sinal
  // real de programação que temos — o portal não escreve no Syneco.
  // Obs.: o Syneco separa "Corte" (op 10, laser/serra) de "Preparação" (op 20, furação/rosca);
  // as duas são a Preparação do portal — por isso o setor do PORTAL casa com as duas aqui (sem
  // mexer no whereSetorSyneco, que é usado pelos números de produção do dia).
  const SYNECO_DO_SETOR = {
    CORTE: /corte|prepara|serra|plasma|oxico/i,
    MONTAGEM: /montag/i,
    SOLDA: /solda|mig|mag|tig/i,
    ACABAMENTO: /acabamento|esmeril|lixamento/i,
    JATO: /jato|granalha/i,
    PINTURA: /pintura|primer/i,
    EXPEDICAO: /expedi|carregamento/i,
  };
  const progPorMarca = new Map(); // marca → { setores:[], noSetor, planejadoUn, ordens:[] }
  let ordensSincronizadasEm = null;
  try {
    // As ordens CRUAS, não um agregado: o PCP precisa poder CONFERIR o que o programador fez —
    // qual máquina, quanto planejou, qual o status e quando. (Vitor 18/08: "como posso confirmar
    // que o programador realmente programou essas peças para a preparação?")
    const ordens = await prisma.mesOrdem.findMany({
      where: { opId },
      select: {
        item: true, setor: true, operacao: true, maquina: true, status: true,
        planejadoUn: true, produzidoUn: true, pesoPlanejado: true,
        dataInicio: true, dataFim: true, updatedAt: true,
      },
    });
    const rxSetor = setor ? SYNECO_DO_SETOR[setor] : null;
    for (const o of ordens) {
      if (o.updatedAt && (!ordensSincronizadasEm || o.updatedAt > ordensSincronizadasEm)) ordensSincronizadasEm = o.updatedAt;
      if (!o.item) continue;
      const g = progPorMarca.get(o.item) || { setores: new Set(), noSetor: false, planejadoUn: 0, iniciado: false, ordens: [] };
      if (o.setor) g.setores.add(o.setor);
      g.ordens.push({
        setor: o.setor, operacao: o.operacao, maquina: o.maquina && o.maquina !== "---" ? o.maquina : null,
        status: o.status, planejadoUn: Number(o.planejadoUn) || 0, produzidoUn: Number(o.produzidoUn) || 0,
        pesoPlanejado: Number(o.pesoPlanejado) || 0,
        dataInicio: o.dataInicio ? o.dataInicio.toISOString() : null,
        dataFim: o.dataFim ? o.dataFim.toISOString() : null,
      });
      if (rxSetor ? rxSetor.test(o.setor || "") : true) {
        g.noSetor = true;
        g.planejadoUn = Math.max(g.planejadoUn, Number(o.planejadoUn) || 0); // 10 e 20 repetem a qtd
        if (o.status && o.status !== "Não Inicializada") g.iniciado = true;
      }
      progPorMarca.set(o.item, g);
    }
  } catch {}
  // Situação da programação da peça NESTE setor:
  //   NAO_LANCADA  → o programador ainda não lançou a peça no Syneco (nenhuma ordem)
  //   OUTRO_SETOR  → tem ordem lançada, mas não pra este setor (rota diferente no Syneco)
  //   PROGRAMADA   → ordem lançada e ainda não iniciada
  //   INICIADA     → a ordem deste setor já rodou (produzindo/finalizada)
  const programacaoDe = (marca, qte) => {
    const g = progPorMarca.get(marca);
    if (!g) return { situacao: "NAO_LANCADA", setores: [], planejadoUn: 0, nOrdens: 0 };
    const planejadoUn = Math.round(g.planejadoUn || 0);
    // Confere a quantidade: o programador lançou a peça INTEIRA ou só parte dela? (a qtd da LPC
    // é a verdade do portal; divergência = programação parcial ou peça relançada no Syneco)
    const qtdOk = g.noSetor && qte != null ? planejadoUn === Number(qte) : null;
    // As ORDENS cruas NÃO vão na listagem: numa OP grande são milhares de objetos repetidos e o
    // painel ficava pesado (2 MB de JSON na OP-097). O modal busca as da marca sob demanda em
    // /api/pcp/despacho/ordens. (Vitor 19/08: "senti que está ficando pesado/demorado pra abrir".)
    const base = { setores: [...g.setores], planejadoUn, qtdLpc: qte != null ? Number(qte) : null, qtdOk, nOrdens: g.ordens.length };
    if (!g.noSetor) return { situacao: "OUTRO_SETOR", ...base };
    return { situacao: g.iniciado ? "INICIADA" : "PROGRAMADA", ...base };
  };

  // EXPEDIDA POR ROMANEIO: o romaneio (importado da pasta ou do fluxo do portal) prova que a peça
  // saiu da fábrica — logo foi produzida em TODOS os setores da rota dela. Onde o Syneco não tem
  // o apontamento, é baixa a fazer lá. É essa relação que o PCP extrai. (Vitor 19/08.)
  const expedidaPorRomaneio = new Set();
  try {
    const ri = await prisma.romaneioItem.findMany({
      where: { pecaConjunto: { opId } },
      select: { pecaConjunto: { select: { marca: true } } },
    });
    for (const x of ri) if (x.pecaConjunto?.marca) expedidaPorRomaneio.add(x.pecaConjunto.marca);
  } catch {}

  // ── O CROQUI JÁ VIROU CONJUNTO? ────────────────────────────────────────────────────────────
  // Vitor (24/08/2026): "as que já foram para a montagem e já foram apontadas em alguma peça
  // consegue colocar como montado?".
  //
  // ⚠ A peça solta deixa de existir quando entra no conjunto. Enquanto a coluna só dizia o setor,
  // um croqui já soldado dentro de um guarda-corpo aparecia como se ainda estivesse por aí — e o
  // PCP ficava procurando na fábrica uma peça que virou outra coisa.
  //
  // ⚠ MONTADO É PROPRIEDADE DO CONJUNTO, LIDA DO LADO DO CROQUI. O mesmo critério que o Corte já
  // usava para saber que um conjunto não trava mais: apontamento no Syneco em Montagem ou adiante,
  // baixa de Montagem no portal, ou peça expedida.
  let montadoPorCroqui = new Map();
  try {
    const links = await prisma.conjuntoCroqui.findMany({
      where: { conjunto: { opId } },
      select: { conjunto: { select: { marca: true, status: true, baixaSetores: true } }, croqui: { select: { marca: true } } },
    });
    const conjMontado = (c) => {
      const real = realMapOp.get(c.marca);
      if (real && (IDX_SETOR[real] ?? -1) >= IDX_SETOR.MONTAGEM) return true;
      const bx = c.baixaSetores && typeof c.baixaSetores === "object" ? c.baixaSetores : {};
      return !!bx.MONTAGEM || c.status === "EXPEDIDO";
    };
    // ⚠⚠ MONTADO EM PARTE NÃO É MONTADO. O mesmo croqui entra em vários conjuntos — na OP-067 o
    // T67BT-P1 é usado em 30 e já foi para 22. Marcar só "montado" faria o PCP parar de cortar uma
    // peça que os outros 8 conjuntos ainda esperam. Por isso conta os DOIS lados: quantos conjuntos
    // usam o croqui e em quantos ele já entrou.
    for (const lk of links) {
      const g = montadoPorCroqui.get(lk.croqui.marca) || { conjuntos: [], total: new Set() };
      g.total.add(lk.conjunto.marca);
      if (conjMontado(lk.conjunto) && !g.conjuntos.includes(lk.conjunto.marca)) g.conjuntos.push(lk.conjunto.marca);
      montadoPorCroqui.set(lk.croqui.marca, g);
    }
    for (const [k, g] of montadoPorCroqui) {
      if (!g.conjuntos.length) { montadoPorCroqui.delete(k); continue; } // nenhum montado: nada a dizer
      montadoPorCroqui.set(k, { conjuntos: g.conjuntos, montados: g.conjuntos.length, total: g.total.size });
    }
  } catch { /* sem estrutura de conjunto a peça segue avulsa — informação a menos, não erro */ }

  // ── JÁ FOI LIBERADO PARA A FÁBRICA? ────────────────────────────────────────────────────────
  // Vitor (24/08/2026): liberar É imprimir a GRD. Então "liberado" não é campo novo — é a GRD
  // daquela marca, que já guarda quem emitiu, quando e quantas impressões. Sem isto na listagem, o
  // PCP não tem como saber o que já desceu e reimprime o que já está na fábrica.
  const grdPorMarca = new Map();
  if (opInfo?.numero) {
    try {
      const gs = await prisma.grdLiberacao.findMany({
        where: { opNumero: opInfo.numero },
        select: { marca: true, formato: true, impressoes: true, ultimaImpressaoEm: true, createdAt: true, liberadoPorNome: true },
      });
      for (const g of gs) {
        const k = String(g.marca || "").toUpperCase();
        const em = g.ultimaImpressaoEm || g.createdAt;
        const atual = grdPorMarca.get(k);
        // mesma marca pode ter GRD por setor: vale a mais recente, que é a que está na mão da fábrica
        if (!atual || new Date(em) > new Date(atual.em)) {
          grdPorMarca.set(k, { em: em ? new Date(em).toISOString() : null, por: g.liberadoPorNome || null, impressoes: g.impressoes || 1, formato: g.formato || null });
        }
      }
    } catch { /* GRD é informação, não pode derrubar a listagem */ }
  }

  // ── O PRODUZIDO DO SYNECO REPARTIDO ENTRE AS LINHAS DA MESMA MARCA ─────────────────────────
  // ⚠⚠ MARCA NÃO É ÚNICA NA OP: sub-obras repetem a marca com perfil diferente, e o Syneco conta por
  // MARCA. Dando o total a cada linha, a OP-089 tinha 132 peças dizendo "2/1", "3/1" — produzido
  // maior que a quantidade —, e a soma da coluna contava a mesma produção duas e três vezes.
  //
  // ⚠ A repartição é por ORDEM DE CHEGADA, não proporcional: a fábrica produz peça inteira, não
  // fração. Enche a primeira linha até a quantidade dela, depois a segunda, e o que sobrar fica na
  // última — se o Syneco produziu MAIS que a soma das linhas (relançamento), a diferença aparece
  // ali em vez de sumir.
  const restoSyneco = new Map(synecoQtd);
  const produzidoDaLinha = new Map(); // id da peça → quanto do Syneco cabe nela
  if (setor) {
    for (const p of escopo) {
      const resta = restoSyneco.get(p.marca);
      if (resta == null) continue;
      const cabe = Math.min(resta, Number(p.qte) || 0);
      produzidoDaLinha.set(p.id, cabe);
      restoSyneco.set(p.marca, resta - cabe);
    }
    // sobra (Syneco acima da soma das linhas) vai para a ÚLTIMA linha daquela marca
    const ultimaDaMarca = new Map();
    for (const p of escopo) ultimaDaMarca.set(p.marca, p.id);
    for (const [marca, sobra] of restoSyneco) {
      if (sobra <= 0) continue;
      const id = ultimaDaMarca.get(marca);
      if (id) produzidoDaLinha.set(id, (produzidoDaLinha.get(id) || 0) + sobra);
    }
  }

  const pecas = escopo.map((p) => {
    const bx = p.baixaSetores && typeof p.baixaSetores === "object" ? p.baixaSetores : {};
    const reg = setor ? bx[setor] : null;
    // Compat: baixas antigas (sem qtd) contam como peça inteira.
    const baixadoQtd = reg ? (reg.qtd != null ? Number(reg.qtd) : p.qte) : 0;
    const baixadoPortal = baixadoQtd > 0;
    const produzidoSyneco = setor ? (produzidoDaLinha.get(p.id) || 0) : null;
    // Portal à frente do Syneco: ou porque teve baixa manual, ou porque o romaneio prova que a
    // peça já saiu (e o Syneco não registrou a produção daquele setor).
    const expedida = expedidaPorRomaneio.has(p.marca) || p.status === "EXPEDIDO";
    const precisaSyneco = setor
      ? (baixadoPortal && produzidoSyneco < baixadoQtd) || (expedida && (produzidoSyneco || 0) <= 0)
      : null;
    // Montagem: só conjuntos COM croquis têm status pronto/pendente; sem croquis (ex.: GC) = null (sem chip).
    const info = prontoInfo ? prontoInfo.get(p.marca) : null;
    const mont = prontoInfo ? (info || { prontoMontar: null, faltamCroquis: [], totalCroquis: 0 }) : null;
    // avancouAlem: a peça JÁ está num setor à frente deste (Syneco/status/terceiro/encaminhada) —
    // não pode ficar pendente aqui atrás; o painel joga pro histórico (aba Peças prontas).
    // `entradas` (todas as linhas do CMR daquele material) sai fora da listagem — era repetida em
    // cada peça e sozinha respondia pela maior parte do payload. O detalhe vem do modal.
    const matFull = p.perfil ? matPorPerfil.get(String(p.perfil).trim().toUpperCase()) || null : null;
    const mat = matFull ? (({ entradas, ...resto }) => resto)(matFull) : null;
    // trava: quantos conjuntos esperam ESTE croqui pra poder montar
    const tr = travaPorCroqui.get(p.marca);
    return { ...p, material: mat, programacao: programacaoDe(p.marca, p.qte), expedida,
      grd: grdPorMarca.get(String(p.marca || "").toUpperCase()) || null,
      // ⚠⚠ ONDE A PEÇA ESTÁ ≠ POR ONDE ELA PASSA.
      // `programacao.setores` é a ROTA: todos os setores que têm ordem no Syneco para aquela marca.
      // Serve para saber o caminho, não o lugar. A tela nova do PCP saiu mostrando essa rota numa
      // coluna chamada "Onde está" e o resultado era "Preparação · Corte" alternando com "Corte ·
      // Preparação" — a ordem de um Set, que não quer dizer nada.
      // O lugar é o `realMapOp`: o setor MAIS ADIANTADO com apontamento (`produzidoUn > 0`). Já era
      // calculado aqui para não deixar peça adiantada aparecer na fila de um setor atrás; só não
      // estava saindo na listagem.
      setorReal: realMapOp.get(p.marca) || null,
      montadoEm: montadoPorCroqui.get(p.marca) || null,
      travaConjuntos: tr ? tr.conjuntos.length : 0, travaMarcas: tr ? tr.conjuntos.slice(0, 12) : null, baixadoQtd, baixadoPor: reg?.porNome || null, baixadoEm: reg?.em || null, baixadoPortal, produzidoSyneco, precisaSyneco, avancouAlem: jaAvancouAlem(p), prontoMontar: mont?.prontoMontar ?? null, faltamCroquis: mont?.faltamCroquis ?? null, totalCroquis: mont?.totalCroquis ?? null };
  });

  // "Em aberto" = ainda SEM DESTINO. Antes exigia status "PENDENTE" — mas o status diz onde a
  // peça ESTÁ no fluxo (CORTE, MONTAGEM…), e quase nenhuma fica em PENDENTE depois que a
  // produção começa. Resultado: marcar prioridade não fazia nada e o portal só dizia "selecione
  // peças em aberto". (Vitor 19/08.) Peça expedida/cancelada não se destina.
  const emAberto = pecas.filter((p) => !p.destino && !["EXPEDIDO", "CANCELADA"].includes(p.status));
  const placar = { ABERTO: emAberto.length, PRIORIDADE: 0, TERCEIRO: 0, REVISAO: 0, AGUARDANDO_MATERIAL: 0, CANCELADA: 0 };
  for (const p of pecas) if (p.destino && placar[p.destino] != null) placar[p.destino]++;
  const baixados = setor ? pecas.filter((p) => p.baixadoPortal).length : 0;
  const precisamSyneco = setor ? pecas.filter((p) => p.precisaSyneco).length : 0;

  return NextResponse.json({
    opId, opNumero: opInfo?.numero || null, emProducao: !!opInfo?.emProducao, setor: setor || null,
    total: pecas.length, placar, baixados, precisamSyneco, compra: compraOp,
    ordensSincronizadasEm: ordensSincronizadasEm ? ordensSincronizadasEm.toISOString() : null,
    // quantas saíram da lista por já estarem em romaneio — o PCP se despediu delas
    entreguesAExpedicao: entregues.length,
    romaneioSemProducao: romaneioSemProducao.length,
    pecas,
  });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const { ids, destino, destinoTerceirizado, dataPrevRetorno, encaminharSetor, comPrioridade, obs, reverter, tirarPrioridade, baixaSetor, baixas, reverterBaixa } = body;

  // ── Baixa PORTAL ──────────────────────────────────────────────────────────
  // Grava/remove a QUANTIDADE baixada da peça NAQUELE setor (PecaConjunto.baixaSetores[setor] =
  // { qtd, em, por, porNome }), sem tocar no Syneco. O extremo-sincronismo é conferido depois
  // (histórico/export) comparando a qtd baixada com a produzida no Syneco.
  if (baixaSetor) {
    let count;
    if (reverterBaixa) {
      if (!ids?.length) return NextResponse.json({ error: "Sem peças para reverter." }, { status: 400 });
      count = await prisma.$executeRaw`
        UPDATE "PecaConjunto"
        SET "baixaSetores" = COALESCE("baixaSetores", '{}'::jsonb) - ${baixaSetor}
        WHERE id IN (${Prisma.join(ids)})`;
    } else {
      let lista = (baixas || []).filter((b) => b.id && b.qtd > 0);
      if (!lista.length) return NextResponse.json({ error: "Sem peças/quantidades para dar baixa." }, { status: 400 });
      // Trava: peça que JÁ tem apontamento no Syneco naquele setor não pode ser baixada pelo portal
      // (a baixa é só o atalho pro delay do Syneco). Confere no banco (autoritativo).
      const pcs = await prisma.pecaConjunto.findMany({ where: { id: { in: lista.map((b) => b.id) } }, select: { id: true, marca: true, opId: true } });
      const marcaById = new Map(pcs.map((p) => [p.id, p.marca]));
      const opIdBaixa = pcs[0]?.opId;
      if (opIdBaixa) {
        const comSyneco = new Set();
        try {
          const syn = await prisma.mesOrdem.groupBy({ by: ["item"], where: { AND: [{ opId: opIdBaixa }, whereSetorSyneco(baixaSetor), { produzidoUn: { gt: 0 } }, { item: { in: [...new Set(pcs.map((p) => p.marca))] } }] } });
          for (const s of syn) if (s.item) comSyneco.add(s.item);
        } catch {}
        lista = lista.filter((b) => !comSyneco.has(marcaById.get(b.id)));
      }
      if (!lista.length) return NextResponse.json({ error: "Peça(s) já com apontamento no Syneco — baixa pelo portal não é necessária." }, { status: 409 });
      const nowIso = new Date().toISOString();
      const values = Prisma.join(lista.map((b) => Prisma.sql`(${b.id}::text, ${Math.round(b.qtd)}::numeric)`));
      count = await prisma.$executeRaw`
        UPDATE "PecaConjunto" p
        SET "baixaSetores" = jsonb_set(
          COALESCE(p."baixaSetores", '{}'::jsonb),
          ${`{${baixaSetor}}`}::text[],
          jsonb_build_object('qtd', v.qtd, 'em', ${nowIso}, 'por', ${user.id}, 'porNome', ${user.name || null}),
          true)
        FROM (VALUES ${values}) AS v(id, qtd)
        WHERE p.id = v.id`;
    }
    const alvo = reverterBaixa ? (ids?.length || 0) : (baixas?.length || 0);
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: reverterBaixa ? "REVERTER_BAIXA_PECA" : "BAIXA_PECA", entity: "PecaConjunto",
        entityId: alvo === 1 ? (ids?.[0] || baixas?.[0]?.id || "") : `${alvo} peças`,
        diff: { setor: baixaSetor, total: alvo, atualizados: count },
      },
    }).catch(() => {});
    return NextResponse.json({ ok: true, atualizados: count, baixaSetor });
  }

  if (!ids?.length) return NextResponse.json({ error: "Selecione ao menos uma peça" }, { status: 400 });
  const marca = { destinoEm: new Date(), destinoPor: user.id, destinoObs: (obs || "").trim() || null };
  let atualizados = 0;
  let duplicadasIgnoradas = 0; // ids da LE descartados por já existirem na LPC

  // TRAVA ANTI-DUPLICIDADE (Vitor 18/08, OP-67): a mesma marca pode ter linha na LPC e na LE.
  // No fluxo de produção vale a da LPC — se vier o id da LE e a marca existir na LPC da MESMA OP,
  // esse id é DESCARTADO (senão a peça é enviada/priorizada 2× e o peso dobra).
  async function semDuplicadas(idsAlvo) {
    const pcs = await prisma.pecaConjunto.findMany({ where: { id: { in: idsAlvo } }, select: { id: true, opId: true, marca: true, fonte: true } });
    const daLe = pcs.filter((p) => p.fonte === "LE_IMPORT");
    if (!daLe.length) return { ids: idsAlvo, descartados: 0 };
    const naLpc = await prisma.pecaConjunto.findMany({
      where: { OR: daLe.map((p) => ({ opId: p.opId, marca: p.marca, fonte: "LPC_IMPORT" })) },
      select: { opId: true, marca: true },
    });
    const chave = new Set(naLpc.map((p) => `${p.opId}|${String(p.marca).trim().toUpperCase()}`));
    const bloquear = new Set(daLe.filter((p) => chave.has(`${p.opId}|${String(p.marca).trim().toUpperCase()}`)).map((p) => p.id));
    return { ids: idsAlvo.filter((id) => !bloquear.has(id)), descartados: bloquear.size };
  }

  // Numera como prioridade (append na fila de cada OP) as peças ainda SEM número — o que faz a
  // peça aparecer nas telas de Prioridades de Produção e na TV, já ordenável.
  async function numerarPrioridade(idsAlvo) {
    const novas = await prisma.pecaConjunto.findMany({ where: { id: { in: idsAlvo }, prioridade: null }, select: { id: true, opId: true, ordemCampo: true, marca: true } });
    const porOp = {};
    for (const pc of novas) (porOp[pc.opId] ||= []).push(pc);
    for (const opId of Object.keys(porOp)) {
      const arr = porOp[opId].sort((a, b) => (a.ordemCampo ?? 1e9) - (b.ordemCampo ?? 1e9) || String(a.marca).localeCompare(String(b.marca)));
      const mx = await prisma.pecaConjunto.aggregate({ where: { opId, prioridade: { not: null } }, _max: { prioridade: true } });
      let n = mx._max.prioridade || 0;
      for (const pc of arr) { n++; await prisma.pecaConjunto.update({ where: { id: pc.id }, data: { prioridade: n } }); }
    }
  }

  if (tirarPrioridade) {
    // Tira SÓ a prioridade das selecionadas (marcou errado) — não mexe em encaminhamento/terceiro/
    // baixa. Se o destino era PRIORIDADE, limpa junto (é a mesma marcação) e renumera a OP.
    const pcs = await prisma.pecaConjunto.findMany({ where: { id: { in: ids }, prioridade: { not: null } }, select: { id: true, opId: true, destino: true } });
    if (!pcs.length) return NextResponse.json({ error: "Nenhuma das peças selecionadas está marcada como prioridade." }, { status: 400 });
    await prisma.pecaConjunto.updateMany({ where: { id: { in: pcs.map((x) => x.id) } }, data: { prioridade: null } });
    const eramPrio = pcs.filter((x) => x.destino === "PRIORIDADE").map((x) => x.id);
    if (eramPrio.length) await prisma.pecaConjunto.updateMany({ where: { id: { in: eramPrio } }, data: { destino: null, destinoEm: null, destinoPor: null } });
    for (const opIdUnico of [...new Set(pcs.map((x) => x.opId))]) await renumerarPrioridades(prisma, opIdUnico);
    atualizados = pcs.length;
  } else if (reverter) {
    // Volta pra EM ABERTO: limpa o despacho; se era terceirizado/encaminhada, volta pro fluxo normal.
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids } },
      data: {
        destino: null, destinoEm: null, destinoPor: null, destinoObs: null,
        terceirizado: false, destinoTerceirizado: null, terceirizadoRecebidoEm: null, terceiroRetornoPrevisto: null,
        encaminhadoSetor: null, encaminhadoEm: null, encaminhadoPor: null,
        prioridade: null, // "prioridade" = destino PRIORIDADE + número; ao voltar pra aberto, sai da lista
        status: "PENDENTE", ultimoSetor: null,
      },
    });
    atualizados = r.count;
  } else if (encaminharSetor) {
    // ENCAMINHAR direto pro setor (ex.: Jato): a peça pula as etapas anteriores e fica pendente
    // no setor escolhido (motor: realIdx = setor-1). Com `comPrioridade`, também numera (1,2,3…).
    const dedup = await semDuplicadas(ids);
    duplicadasIgnoradas = dedup.descartados;
    const alvo = dedup.ids;
    if (!alvo.length) return NextResponse.json({ error: "Todas as peças selecionadas são duplicatas (linha da Lista de Expedição de marcas que já estão na LPC)." }, { status: 400 });
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: alvo }, status: { not: "EXPEDIDO" } },
      data: { encaminhadoSetor: encaminharSetor, encaminhadoEm: new Date(), encaminhadoPor: user.id },
    });
    atualizados = r.count;
    if (comPrioridade) {
      await prisma.pecaConjunto.updateMany({ where: { id: { in: alvo }, status: { not: "EXPEDIDO" }, destino: null }, data: { ...marca, destino: "PRIORIDADE" } });
      await numerarPrioridade(alvo);
    }
  } else if (destino === "TERCEIRO") {
    if (!destinoTerceirizado) return NextResponse.json({ error: "Informe a volta do terceiro (Montagem/Pintura/Expedição)." }, { status: 400 });
    // Pode mandar pra terceiro de qualquer etapa (Corte, Montagem, …) — só não o que já foi expedido.
    // Tira da fila de corte (queue/máquina), mas PRESERVA o corte concluído (senão quebra o
    // "pronto para montar" dos conjuntos já cortados que vão pra terceiro montar/tratar).
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, status: { not: "EXPEDIDO" } },
      data: {
        ...marca, destino: "TERCEIRO",
        terceirizado: true, destinoTerceirizado, terceirizadoRecebidoEm: null, status: "TERCEIRIZADO", maquina: null,
        terceiroRetornoPrevisto: dataPrevRetorno ? new Date(dataPrevRetorno) : null,
        corteOrdem: null, corteDataMetaInicio: null, corteDataMetaFim: null,
      },
    });
    atualizados = r.count;
  } else {
    if (!destino) return NextResponse.json({ error: "Informe o destino." }, { status: 400 });
    const dedup = await semDuplicadas(ids);
    duplicadasIgnoradas = dedup.descartados;
    const alvo = dedup.ids;
    if (!alvo.length) return NextResponse.json({ error: "Todas as peças selecionadas são duplicatas (linha da Lista de Expedição de marcas que já estão na LPC)." }, { status: 400 });
    const r = await prisma.pecaConjunto.updateMany({ where: { id: { in: alvo } }, data: { ...marca, destino } });
    atualizados = r.count;
    // "Prioridade" = UMA coisa só: além do destino, ganha o NÚMERO de prioridade (append na fila
    // da OP) — assim aparece nas telas de Prioridades de Produção e na TV, já reordenável.
    if (destino === "PRIORIDADE") await numerarPrioridade(alvo);
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "DESPACHAR_PECA", entity: "PecaConjunto",
      entityId: ids.length === 1 ? ids[0] : `${ids.length} peças`,
      diff: { destino: reverter ? "ABERTO" : destino || null, destinoTerceirizado: destinoTerceirizado || null, encaminharSetor: encaminharSetor || null, comPrioridade: !!comPrioridade, total: ids.length, atualizados },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, atualizados, duplicadasIgnoradas });
}
