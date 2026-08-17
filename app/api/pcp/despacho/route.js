// POST /api/pcp/despacho — despacha peças EM ABERTO no fluxo do PCP (TV de prioridades).
// Define o `destino` da peça e, quando o destino tem efeito colateral, aplica também:
//   PRIORIDADE          → entra na fila de desenho/corte (destino marcado; sequência é à parte);
//   TERCEIRO            → status TERCEIRIZADO + volta (Montagem/Pintura/Expedição), cai em /pcp/terceirizados;
//   REVISAO             → volta pra engenharia revisar;
//   AGUARDANDO_MATERIAL → travada esperando matéria-prima;
//   CANCELADA           → fora do escopo.
// Body: { ids:[], destino, destinoTerceirizado?, obs? }  |  { ids:[], reverter:true } → volta pra EM ABERTO.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const DESTINOS = ["PRIORIDADE", "TERCEIRO", "REVISAO", "AGUARDANDO_MATERIAL", "CANCELADA"];
const VOLTA_TERCEIRO = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  destino: z.enum(DESTINOS).optional(),
  destinoTerceirizado: z.enum(VOLTA_TERCEIRO).optional(),
  obs: z.string().max(500).optional().nullable(),
  reverter: z.boolean().optional(),
});

// GET /api/pcp/despacho?opId=... — peças da OP + placar por destino (pro drill-down da TV).
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "opId obrigatório" }, { status: 400 });

  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId },
    select: { id: true, marca: true, tipoPeca: true, pesoTotalKg: true, qte: true, status: true, destino: true, destinoTerceirizado: true, prioridade: true },
    orderBy: [{ marca: "asc" }],
  });
  // EM ABERTO = ainda não despachada e ainda no fluxo (PENDENTE), pra aparecer no painel de despacho.
  const emAberto = pecas.filter((p) => !p.destino && p.status === "PENDENTE");
  const placar = { ABERTO: emAberto.length, PRIORIDADE: 0, TERCEIRO: 0, REVISAO: 0, AGUARDANDO_MATERIAL: 0, CANCELADA: 0 };
  for (const p of pecas) if (p.destino && placar[p.destino] != null) placar[p.destino]++;

  return NextResponse.json({ opId, total: pecas.length, placar, pecas });
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

  const { ids, destino, destinoTerceirizado, obs, reverter } = body;
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
