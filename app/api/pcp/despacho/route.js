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
import { requireRole } from "@/lib/session";
import { whereSetorSyneco } from "@/lib/syneco-dia";
import { ehItemComprado } from "@/lib/item-comprado";
import { z } from "zod";

export const runtime = "nodejs";

const DESTINOS = ["PRIORIDADE", "TERCEIRO", "REVISAO", "AGUARDANDO_MATERIAL", "CANCELADA"];
const VOLTA_TERCEIRO = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
const SETORES_BAIXA = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];

const schema = z.object({
  ids: z.array(z.string()).optional(),
  destino: z.enum(DESTINOS).optional(),
  destinoTerceirizado: z.enum(VOLTA_TERCEIRO).optional(),
  obs: z.string().max(500).optional().nullable(),
  reverter: z.boolean().optional(),
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

  const setor = url.searchParams.get("setor"); // opcional: escopo do setor pela ROTA da peça
  const todasRaw = await prisma.pecaConjunto.findMany({
    where: { opId },
    select: { id: true, marca: true, descricao: true, tipoPeca: true, perfil: true, fonte: true, pesoUnitKg: true, pesoTotalKg: true, qte: true, qteProduzida: true, corteConcluidoEm: true, status: true, destino: true, destinoTerceirizado: true, prioridade: true, baixaSetores: true, _count: { select: { conjuntoCroquis: true } } },
    orderBy: [{ marca: "asc" }],
  });
  // Descarta linhas-lixo do import (ex.: a linha "TOTAL" da Lista de Expedição que entrou como peça)
  // e os ITENS COMPRADOS (parafuso/porca/arruela/chumbador/telha/calha/… sem estrutura de
  // fabricação) — não são feitos por nós, não entram no fluxo de produção. (Regra do Vitor; eles
  // seguem valendo em Engenharia/Compras/Planejamento/Expedição, a LE tem 100% dos itens.)
  const ehLixo = (p) => !p.marca || !String(p.marca).trim() || /^(total|soma|subtotal)\b/i.test(String(p.marca).trim());
  const todas = todasRaw.filter((p) => !ehLixo(p) && !ehItemComprado(p));
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
  const escopo = setor ? todas.filter((p) => passaNoSetor(p, setor)) : todas;

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
  // MONTAGEM — "pronto para montar" vs "pendente": um conjunto está pronto quando TODOS os croquis
  // dele já foram cortados (baixa no corte / produção no Syneco / corte concluído). Devolve também
  // a lista dos que faltam, pra poder clicar no conjunto e ver quais peças estão faltando.
  let prontoInfo = null;
  if (setor === "MONTAGEM") {
    const links = await prisma.conjuntoCroqui.findMany({
      where: { conjunto: { opId } },
      select: { conjunto: { select: { marca: true } }, croqui: { select: { marca: true } } },
    });
    const synCorte = new Map(); // croqui marca → un cortadas no Syneco
    try {
      const sc = await prisma.mesOrdem.groupBy({ by: ["item"], where: { AND: [{ opId }, whereSetorSyneco("CORTE"), { produzidoUn: { gt: 0 } }] }, _sum: { produzidoUn: true } });
      for (const s of sc) if (s.item) synCorte.set(s.item, Math.round(s._sum?.produzidoUn || 0));
    } catch {}
    const croquiMap = new Map();
    for (const p of todas) if (ehCroqui(p)) croquiMap.set(p.marca, p);
    const croquiCortado = (cr) => {
      if (!cr) return false;
      const q = Number(cr.qte) || 1;
      if (cr.corteConcluidoEm || (Number(cr.qteProduzida) || 0) >= q) return true;
      const bxC = cr.baixaSetores && typeof cr.baixaSetores === "object" ? cr.baixaSetores.CORTE : null;
      const baixaCorte = bxC ? (bxC.qtd != null ? Number(bxC.qtd) : q) : 0;
      return baixaCorte >= q || (synCorte.get(cr.marca) || 0) >= q;
    };
    const porConj = new Map();
    for (const lk of links) { const a = porConj.get(lk.conjunto.marca) || []; a.push(lk.croqui.marca); porConj.set(lk.conjunto.marca, a); }
    prontoInfo = new Map();
    for (const [conj, croquis] of porConj) {
      const faltam = [];
      for (const cm of croquis) { const cr = croquiMap.get(cm); if (!croquiCortado(cr)) faltam.push({ marca: cm, descricao: cr?.descricao || null }); }
      prontoInfo.set(conj, { prontoMontar: faltam.length === 0, faltamCroquis: faltam, totalCroquis: croquis.length });
    }
  }

  const pecas = escopo.map((p) => {
    const bx = p.baixaSetores && typeof p.baixaSetores === "object" ? p.baixaSetores : {};
    const reg = setor ? bx[setor] : null;
    // Compat: baixas antigas (sem qtd) contam como peça inteira.
    const baixadoQtd = reg ? (reg.qtd != null ? Number(reg.qtd) : p.qte) : 0;
    const baixadoPortal = baixadoQtd > 0;
    const produzidoSyneco = setor ? (synecoQtd.get(p.marca) || 0) : null;
    const precisaSyneco = setor ? baixadoPortal && produzidoSyneco < baixadoQtd : null; // portal à frente do Syneco
    // Montagem: só conjuntos COM croquis têm status pronto/pendente; sem croquis (ex.: GC) = null (sem chip).
    const info = prontoInfo ? prontoInfo.get(p.marca) : null;
    const mont = prontoInfo ? (info || { prontoMontar: null, faltamCroquis: [], totalCroquis: 0 }) : null;
    return { ...p, baixadoQtd, baixadoPor: reg?.porNome || null, baixadoEm: reg?.em || null, baixadoPortal, produzidoSyneco, precisaSyneco, prontoMontar: mont?.prontoMontar ?? null, faltamCroquis: mont?.faltamCroquis ?? null, totalCroquis: mont?.totalCroquis ?? null };
  });

  const emAberto = pecas.filter((p) => !p.destino && p.status === "PENDENTE");
  const placar = { ABERTO: emAberto.length, PRIORIDADE: 0, TERCEIRO: 0, REVISAO: 0, AGUARDANDO_MATERIAL: 0, CANCELADA: 0 };
  for (const p of pecas) if (p.destino && placar[p.destino] != null) placar[p.destino]++;
  const baixados = setor ? pecas.filter((p) => p.baixadoPortal).length : 0;
  const precisamSyneco = setor ? pecas.filter((p) => p.precisaSyneco).length : 0;

  return NextResponse.json({ opId, setor: setor || null, total: pecas.length, placar, baixados, precisamSyneco, pecas });
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

  const { ids, destino, destinoTerceirizado, obs, reverter, baixaSetor, baixas, reverterBaixa } = body;

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
      const lista = (baixas || []).filter((b) => b.id && b.qtd > 0);
      if (!lista.length) return NextResponse.json({ error: "Sem peças/quantidades para dar baixa." }, { status: 400 });
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

  if (reverter) {
    // Volta pra EM ABERTO: limpa o despacho; se era terceirizado, volta pro fluxo de corte.
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids } },
      data: {
        destino: null, destinoEm: null, destinoPor: null, destinoObs: null,
        terceirizado: false, destinoTerceirizado: null, terceirizadoRecebidoEm: null,
        status: "PENDENTE", ultimoSetor: null,
      },
    });
    atualizados = r.count;
  } else if (destino === "TERCEIRO") {
    if (!destinoTerceirizado) return NextResponse.json({ error: "Informe a volta do terceiro (Montagem/Pintura/Expedição)." }, { status: 400 });
    // Só peças que ainda não avançaram podem virar terceirizadas (não passam pelo corte).
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, status: { in: ["PENDENTE", "CORTE"] } },
      data: {
        ...marca, destino: "TERCEIRO",
        terceirizado: true, destinoTerceirizado, terceirizadoRecebidoEm: null, status: "TERCEIRIZADO", maquina: null,
        corteOrdem: null, corteDataMetaInicio: null, corteDataMetaFim: null, corteIniciadoEm: null, corteConcluidoEm: null,
      },
    });
    atualizados = r.count;
  } else {
    if (!destino) return NextResponse.json({ error: "Informe o destino." }, { status: 400 });
    const r = await prisma.pecaConjunto.updateMany({ where: { id: { in: ids } }, data: { ...marca, destino } });
    atualizados = r.count;
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "DESPACHAR_PECA", entity: "PecaConjunto",
      entityId: ids.length === 1 ? ids[0] : `${ids.length} peças`,
      diff: { destino: reverter ? "ABERTO" : destino || null, destinoTerceirizado: destinoTerceirizado || null, total: ids.length, atualizados },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, atualizados });
}
