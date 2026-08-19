// Prioridades de PRODUÇÃO — UMA ABA POR SETOR (Painel de Produção).
// GET  — SÓ as OPs enviadas pra produção (OP.emProducao). Por SETOR (Preparação · Montagem · Solda ·
//        Acabamento · Jato · Pintura) e por OP: PRIORITÁRIAS em cima (na ordem) + as DEMAIS
//        pendentes embaixo, com o PRAZO do setor ("até quando"). Cada peça aparece só no setor
//        ONDE ELA ESTÁ agora (realMap = Syneco + status + terceiro + encaminhamento).
// POST — reordena: troca a prioridade entre DUAS peças da MESMA OP (↑/↓ na tela).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { carregarPrioridadesPorObra } from "@/lib/prioridades-setor-data";
import { setorRealIndex, FLUXO_SETORES, noTerceiroAgora, entregaDoSetor, croquiCortado } from "@/lib/prioridades-setor";
import { ehItemComprado } from "@/lib/item-comprado";
import { ehLinhaLixo } from "@/lib/pecas-producao";
import { dedupLpcLe, renumerarPrioridades } from "@/lib/pecas-producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES_VER = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"];
const ROLES_EDIT = ["ADMIN", "PLANEJAMENTO", "PCP"];
const LIMITE_DEMAIS = 40; // teto de "demais" por OP/bloco na tela

// Uma aba por SETOR (Vitor 18/08: "deixa uma aba por setor"). Expedição fica de fora (a peça
// expedida sai das telas de produção).
const BLOCOS = [
  { key: "preparacao", label: "Preparação", setores: ["CORTE"] },
  { key: "montagem", label: "Montagem", setores: ["MONTAGEM"] },
  { key: "solda", label: "Solda", setores: ["SOLDA"] },
  { key: "acabamento", label: "Acabamento", setores: ["ACABAMENTO"] },
  { key: "jato", label: "Jato", setores: ["JATO"] },
  { key: "pintura", label: "Pintura", setores: ["PINTURA"] },
];
// setor canônico → key da aba
const ABA_DO_SETOR = { CORTE: "preparacao", MONTAGEM: "montagem", SOLDA: "solda", ACABAMENTO: "acabamento", JATO: "jato", PINTURA: "pintura" };
const IDX = Object.fromEntries(FLUXO_SETORES.map((s, i) => [s.key, i]));
const LABEL = Object.fromEntries(FLUXO_SETORES.map((s) => [s.key, s.label]));

// ROTA da peça (por onde ela passa): conjunto COMPOSTO é montado (o corte é dos croquis dele);
// peça SOLO/avulsa é cortada e PULA Montagem/Solda.
const ROTA_COMPOSTA = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
const ROTA_SOLO = ["CORTE", "ACABAMENTO", "JATO", "PINTURA"];

// Em qual setor a peça precisa ser TRABALHADA AGORA = o PRÓXIMO da rota dela depois do que já
// foi feito. (Vitor 18/08: "as que já forem apontadas no Syneco você já manda para acabamento, as
// que forem dadas baixa no acabamento já manda para o jato, do jato para a pintura e por aí vai".)
// realIdx = setor mais avançado já alcançado (Syneco + status + terceiro + encaminhamento).
function proximoSetor(pc, realIdx, composta) {
  // Encaminhamento manual / volta do terceiro mandam: o próximo é o setor escolhido.
  if (pc.encaminhadoSetor && IDX[pc.encaminhadoSetor] === realIdx + 1) return pc.encaminhadoSetor;
  if (noTerceiroAgora(pc) && IDX[pc.destinoTerceirizado] === realIdx + 1) return pc.destinoTerceirizado;
  for (const s of composta ? ROTA_COMPOSTA : ROTA_SOLO) if (IDX[s] > realIdx) return s;
  return null; // passou de Pintura → Expedição, fora das telas de produção
}

// Prazo do bloco p/ uma OP = a data mais PRÓXIMA entre os setores do bloco (das datas por setor).
function prazoDoBloco(datasSetor, setores, entregaFallback, now) {
  let best = null;
  for (const s of setores) {
    const e = entregaDoSetor(datasSetor || {}, s, entregaFallback, now);
    if (e.entrega && (!best || new Date(e.entrega) < new Date(best.entrega))) best = e;
  }
  if (!best) best = entregaDoSetor(datasSetor || {}, setores[0], entregaFallback, now);
  return best.entrega ? { entrega: best.entrega, atrasoDias: best.atrasoDias, doSetor: best.doSetor } : null;
}

export async function GET() {
  try { await requireRole(ROLES_VER); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { porObra, now } = await carregarPrioridadesPorObra();
  // SÓ as OPs enviadas pra produção (as não selecionadas somem da tela).
  const emProd = porObra.filter((o) => o.emProducao);
  const opInfo = new Map(emProd.map((o) => [o.opId, o]));
  const acc = Object.fromEntries(BLOCOS.map((b) => [b.key, new Map()])); // bloco → (opNumero → { info, pecas })

  // Todas as peças (conjuntos + avulsas, sem croqui) das OPs em produção — direto do banco (LPC ou
  // LE). O setor atual de cada uma sai do realMap (Syneco + status). Priorizadas + demais.
  const opIds = [...opInfo.keys()];
  const pecas = opIds.length ? await prisma.pecaConjunto.findMany({
    // "não croqui" INCLUINDO tipoPeca NULL (avulsas/solo) — `{ not: "CROQUI" }` sozinho descarta os NULL.
    where: { opId: { in: opIds }, OR: [{ tipoPeca: { not: "CROQUI" } }, { tipoPeca: null }] },
    select: { id: true, opId: true, marca: true, descricao: true, tipoPeca: true, perfil: true, qte: true, pesoUnitKg: true, pesoTotalKg: true, prioridade: true, status: true, terceirizado: true, destinoTerceirizado: true, terceirizadoRecebidoEm: true, terceiroRetornoPrevisto: true, encaminhadoSetor: true, _count: { select: { conjuntoCroquis: true } } },
  }) : [];

  // "LIBERADO PARA MONTAGEM": um conjunto só pode ser montado quando TODOS os croquis dele já
  // foram cortados (critério ÚNICO `croquiCortado` — o mesmo do painel de Liberar e da TV).
  // Vitor 18/08: "quando forma um conjunto de peças de croqui precisa aparecer na montagem que
  // essa peça está liberada para montagem". Devolve também quantos/quais faltam cortar.
  const prontoPorOpMarca = new Map(); // `${opId}|${marcaConjunto}` → { pronto, faltam:[{marca,faltaQtd}] }
  if (opIds.length) {
    const [croquis, links] = await Promise.all([
      prisma.pecaConjunto.findMany({ where: { opId: { in: opIds }, tipoPeca: "CROQUI" }, select: { opId: true, marca: true, descricao: true, qte: true, qteProduzida: true, corteConcluidoEm: true, baixaSetores: true } }),
      prisma.conjuntoCroqui.findMany({ where: { conjunto: { opId: { in: opIds } } }, select: { conjunto: { select: { opId: true, marca: true } }, croqui: { select: { marca: true } } } }),
    ]);
    const croquiPorChave = new Map(croquis.map((c) => [`${c.opId}|${c.marca}`, c]));
    const faltaQtd = (cr) => {
      const q = Number(cr?.qte) || 1;
      const bx = cr?.baixaSetores && typeof cr.baixaSetores === "object" ? cr.baixaSetores.CORTE : null;
      const feito = Math.max(Number(cr?.qteProduzida) || 0, bx ? (bx.qtd != null ? Number(bx.qtd) : q) : 0);
      return Math.max(1, q - feito);
    };
    for (const lk of links) {
      const chave = `${lk.conjunto.opId}|${lk.conjunto.marca}`;
      if (!prontoPorOpMarca.has(chave)) prontoPorOpMarca.set(chave, { pronto: true, faltam: [] });
      const reg = prontoPorOpMarca.get(chave);
      const cr = croquiPorChave.get(`${lk.conjunto.opId}|${lk.croqui.marca}`);
      if (!croquiCortado(cr)) {
        reg.pronto = false;
        if (reg.faltam.length < 12) reg.faltam.push({ marca: lk.croqui.marca, descricao: cr?.descricao || null, faltaQtd: faltaQtd(cr) });
      }
    }
  }

  // dedupLpcLe: mesma marca com linha na LPC e na LE conta 1× (a da LPC) — senão a peça
  // aparece duplicada na tela do setor. Aplicado POR OP (a regra é dentro da OP).
  const porOp = new Map();
  for (const pc of pecas) { if (!porOp.has(pc.opId)) porOp.set(pc.opId, []); porOp.get(pc.opId).push(pc); }
  const pecasDedup = [...porOp.values()].flatMap((arr) => dedupLpcLe(arr));

  for (const pc of pecasDedup) {
    const o = opInfo.get(pc.opId);
    if (!o) continue;
    // Itens comprados (sem peso; ou cobertura/piso: telha/rufo/calha/grade de piso) NÃO são
    // produção — não aparecem em nenhum setor. (Regra do peso, lib/item-comprado.)
    if (ehLinhaLixo(pc) || ehItemComprado(pc)) continue; // linha "TOTAL.:" da LE não é peça
    // Setor que precisa TRABALHAR a peça agora (o próximo da rota) — peça apontada na Solda já
    // aparece no Acabamento, e assim por diante.
    const composta = pc.tipoPeca === "CONJUNTO" && (pc._count?.conjuntoCroquis || 0) > 0;
    const idx = setorRealIndex(pc, o.realMap);
    const setorKey = proximoSetor(pc, idx, composta);
    if (!setorKey) continue; // já passou da Pintura (expedição) → fora
    const bloco = ABA_DO_SETOR[setorKey];
    if (!bloco) continue;
    const m = acc[bloco];
    if (!m.has(o.opNumero)) m.set(o.opNumero, { opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, datasSetor: o.datasSetor, entrega: o.entrega, pecas: [] });
    const terc = noTerceiroAgora(pc);
    // Conjunto composto: liberado pra montar? (só faz sentido enquanto ele ainda está na Montagem)
    // "liberado p/ montar" só faz sentido na MONTAGEM (Vitor: na Solda não precisa dessa info).
    const infoMont = composta && setorKey === "MONTAGEM" ? prontoPorOpMarca.get(`${pc.opId}|${pc.marca}`) : null;
    m.get(o.opNumero).pecas.push({
      id: pc.id, marca: pc.marca, descricao: pc.descricao || null,
      prontoMontar: infoMont ? infoMont.pronto : null,
      faltamCroquis: infoMont && !infoMont.pronto ? infoMont.faltam : null,
      qte: Number(pc.qte) || 1, pesoUnitKg: Math.round((Number(pc.pesoUnitKg) || 0) * 10) / 10,
      pesoTotalKg: Math.round(Number(pc.pesoTotalKg) || 0),
      prioridade: pc.prioridade, setor: LABEL[setorKey] || setorKey,
      // ÚLTIMA ETAPA CONCLUÍDA — o que a peça JÁ passou (a coluna "setor" repetia o nome da aba e
      // não dizia se a peça estava parada esperando ou se já tinha sido apontada ali). Vitor 18/08.
      ultimaEtapa: idx >= 0 ? (LABEL[FLUXO_SETORES[idx]?.key] || null) : null,
      enviadaPeloPcp: pc.encaminhadoSetor ? (LABEL[pc.encaminhadoSetor] || pc.encaminhadoSetor) : null,
      terceiro: terc, retornoPrevisto: terc ? (pc.terceiroRetornoPrevisto || null) : null,
    });
  }

  const blocos = BLOCOS.map((b) => {
    const ops = [...acc[b.key].values()].map((op) => {
      const prioritarias = op.pecas.filter((p) => p.prioridade != null).sort((a, z) => a.prioridade - z.prioridade);
      // Demais: na Montagem os LIBERADOS (croquis cortados) vêm primeiro — é o que dá pra fazer agora.
      const demaisAll = op.pecas.filter((p) => p.prioridade == null).sort((a, z) => {
        if (b.key === "montagem" && (a.prontoMontar === true) !== (z.prontoMontar === true)) return a.prontoMontar === true ? -1 : 1;
        return String(a.marca).localeCompare(String(z.marca), "pt-BR", { numeric: true });
      });
      return {
        opNumero: op.opNumero, obra: op.obra, cliente: op.cliente,
        prazo: prazoDoBloco(op.datasSetor, b.setores, op.entrega, now),
        prioritarias, demais: demaisAll.slice(0, LIMITE_DEMAIS), demaisTotal: demaisAll.length,
        pesoKg: op.pecas.reduce((s, x) => s + x.pesoTotalKg, 0),
      };
    }).sort((a, z) => {
      // urgência: atrasadas primeiro, depois prazo mais próximo, depois nº da OP
      const aa = a.prazo?.atrasoDias > 0, za = z.prazo?.atrasoDias > 0;
      if (aa !== za) return aa ? -1 : 1;
      if (a.prazo?.entrega && z.prazo?.entrega && a.prazo.entrega !== z.prazo.entrega) return new Date(a.prazo.entrega) - new Date(z.prazo.entrega);
      if (!!a.prazo?.entrega !== !!z.prazo?.entrega) return a.prazo?.entrega ? -1 : 1;
      return String(a.opNumero).localeCompare(String(z.opNumero), "pt-BR", { numeric: true });
    });
    return { key: b.key, label: b.label, ops, total: ops.reduce((s, op) => s + op.prioritarias.length + op.demaisTotal, 0) };
  });

  return NextResponse.json({ blocos, geradoEm: new Date().toISOString() });
}

// Reordena trocando a prioridade entre duas peças da MESMA OP (o "de fato 1,2,3").
export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES_EDIT); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { aId, bId, removerId } = await req.json().catch(() => ({}));

  // REMOVER prioridade (marcou errado): tira o número da peça e renumera a OP (1,2,3… sem buraco).
  if (removerId) {
    const pc = await prisma.pecaConjunto.findUnique({ where: { id: removerId }, select: { id: true, opId: true, marca: true, prioridade: true, destino: true } });
    if (!pc) return NextResponse.json({ error: "Peça não encontrada." }, { status: 404 });
    await prisma.pecaConjunto.update({
      where: { id: pc.id },
      // se o destino era PRIORIDADE (veio do painel de Liberar), limpa junto — é a mesma marcação.
      data: { prioridade: null, ...(pc.destino === "PRIORIDADE" ? { destino: null, destinoEm: null, destinoPor: null } : {}) },
    });
    const total = await renumerarPrioridades(prisma, pc.opId);
    await prisma.auditLog.create({ data: { userId: user.id, action: "REMOVER_PRIORIDADE", entity: "PecaConjunto", entityId: pc.id, diff: { marca: pc.marca, prioridadeAntiga: pc.prioridade, restantes: total } } }).catch(() => {});
    return NextResponse.json({ ok: true, removida: pc.marca, restantes: total });
  }

  if (!aId || !bId || aId === bId) return NextResponse.json({ error: "Informe duas peças distintas." }, { status: 400 });

  const [a, b] = await Promise.all([
    prisma.pecaConjunto.findUnique({ where: { id: aId }, select: { id: true, opId: true, prioridade: true, marca: true } }),
    prisma.pecaConjunto.findUnique({ where: { id: bId }, select: { id: true, opId: true, prioridade: true, marca: true } }),
  ]);
  if (!a || !b) return NextResponse.json({ error: "Peça não encontrada." }, { status: 404 });
  if (a.opId !== b.opId) return NextResponse.json({ error: "As peças são de OPs diferentes." }, { status: 400 });
  if (a.prioridade == null || b.prioridade == null) return NextResponse.json({ error: "Ambas precisam estar marcadas como prioridade." }, { status: 400 });

  await prisma.$transaction([
    prisma.pecaConjunto.update({ where: { id: a.id }, data: { prioridade: b.prioridade } }),
    prisma.pecaConjunto.update({ where: { id: b.id }, data: { prioridade: a.prioridade } }),
  ]);
  await prisma.auditLog.create({ data: { userId: user.id, action: "REORDENAR_PRIORIDADE", entity: "PecaConjunto", entityId: `${a.marca}↔${b.marca}`, diff: { [a.marca]: b.prioridade, [b.marca]: a.prioridade } } }).catch(() => {});

  return NextResponse.json({ ok: true });
}
