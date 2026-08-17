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
import { z } from "zod";

export const runtime = "nodejs";

const DESTINOS = ["PRIORIDADE", "TERCEIRO", "REVISAO", "AGUARDANDO_MATERIAL", "CANCELADA"];
const VOLTA_TERCEIRO = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
const SETORES_BAIXA = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  destino: z.enum(DESTINOS).optional(),
  destinoTerceirizado: z.enum(VOLTA_TERCEIRO).optional(),
  obs: z.string().max(500).optional().nullable(),
  reverter: z.boolean().optional(),
  // Baixa PORTAL (não escreve no Syneco): grava baixaSetores[baixaSetor].
  baixaSetor: z.enum(SETORES_BAIXA).optional(),
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
    select: { id: true, marca: true, descricao: true, tipoPeca: true, perfil: true, fonte: true, pesoTotalKg: true, qte: true, status: true, destino: true, destinoTerceirizado: true, prioridade: true, baixaSetores: true, _count: { select: { conjuntoCroquis: true } } },
    orderBy: [{ marca: "asc" }],
  });
  // Descarta linhas-lixo do import (ex.: a linha "TOTAL" da Lista de Expedição que entrou como peça).
  const ehLixo = (p) => !p.marca || !String(p.marca).trim() || /^(total|soma|subtotal)\b/i.test(String(p.marca).trim());
  const todas = todasRaw.filter((p) => !ehLixo(p));
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

  // Reconciliação com o Syneco: marcas COM produção no mesOrdem daquele setor (quem já teve baixa lá).
  // Serve pro extremo sincronismo portal×Syneco — a coluna "Syneco" do export usa isto.
  let synecoMarcas = new Set();
  if (setor) {
    try {
      const syn = await prisma.mesOrdem.groupBy({
        by: ["item"],
        where: { AND: [{ opId }, whereSetorSyneco(setor), { produzidoUn: { gt: 0 } }] },
      });
      synecoMarcas = new Set(syn.map((s) => s.item).filter(Boolean));
    } catch {}
  }
  const pecas = escopo.map((p) => {
    const bx = p.baixaSetores && typeof p.baixaSetores === "object" ? p.baixaSetores : {};
    const baixadoPortal = !!(setor && bx[setor]);
    const noSyneco = setor ? synecoMarcas.has(p.marca) : null; // já tem produção no Syneco?
    return { ...p, baixadoPortal, noSyneco, precisaSyneco: setor ? baixadoPortal && !noSyneco : null };
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

  const { ids, destino, destinoTerceirizado, obs, reverter, baixaSetor, reverterBaixa } = body;

  // ── Baixa PORTAL ──────────────────────────────────────────────────────────
  // Marca/desmarca a peça como concluída NAQUELE setor (PecaConjunto.baixaSetores),
  // sem tocar no Syneco. O extremo-sincronismo é conferido depois pela coluna Syneco.
  if (baixaSetor) {
    let count;
    if (reverterBaixa) {
      count = await prisma.$executeRaw`
        UPDATE "PecaConjunto"
        SET "baixaSetores" = COALESCE("baixaSetores", '{}'::jsonb) - ${baixaSetor}
        WHERE id IN (${Prisma.join(ids)})`;
    } else {
      const val = JSON.stringify({ em: new Date().toISOString(), por: user.id, porNome: user.name || null });
      count = await prisma.$executeRaw`
        UPDATE "PecaConjunto"
        SET "baixaSetores" = jsonb_set(COALESCE("baixaSetores", '{}'::jsonb), ${`{${baixaSetor}}`}::text[], ${val}::jsonb, true)
        WHERE id IN (${Prisma.join(ids)})`;
    }
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: reverterBaixa ? "REVERTER_BAIXA_PECA" : "BAIXA_PECA", entity: "PecaConjunto",
        entityId: ids.length === 1 ? ids[0] : `${ids.length} peças`,
        diff: { setor: baixaSetor, total: ids.length, atualizados: count },
      },
    }).catch(() => {});
    return NextResponse.json({ ok: true, atualizados: count, baixaSetor });
  }

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
