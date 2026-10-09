// POST /api/planejamento/cronogramas/[id]/areas — gerencia as Áreas do cronograma.
//  { acao: "renomear", de, para } → renomeia a área MANTENDO a cor + atualiza as tarefas
//  { acao: "definir", nomes: [...] } → (re)define a lista de áreas (cores por ordem)
//  { acao: "importarFases" } → traz as FASES da OP (lotes de entrega) como áreas — ver a nota em
//    lib/cronograma-areas.js; não duplica, não sobrescreve e não roda sozinho
//  { acao: "copiar", origem, departamento, destinos: [...], manterExternas? } → copia as tarefas de uma
//    área do setor para outras áreas vazias, com datas e encadeamento (lib/cronograma-copiar-area.js)
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { renomearArea, definirAreas, recolorArea, sincronizarAreas, importarFasesDaOP, registrarArea } from "@/lib/cronograma-areas";
import { planoCopiaArea } from "@/lib/cronograma-copiar-area";

export const runtime = "nodejs";

const schema = z.object({
  acao: z.enum(["renomear", "definir", "recolor", "sincronizar", "importarFases", "copiar"]),
  de: z.string().max(120).optional(),
  para: z.string().max(120).optional(),
  nomes: z.array(z.string().max(120)).optional(),
  nome: z.string().max(120).optional(),
  cor: z.number().int().min(0).max(9).optional(),
  // copiar
  origem: z.string().max(120).optional(),
  departamento: z.enum(["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"]).optional(),
  destinos: z.array(z.string().max(120)).max(20).optional(),
  manterExternas: z.boolean().optional(),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const crono = await prisma.cronograma.findUnique({ where: { id }, select: { id: true } });
  if (!crono) return NextResponse.json({ success: false, error: "Cronograma não encontrado" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  if (body.acao === "renomear") {
    if (!body.de?.trim() || !body.para?.trim()) return NextResponse.json({ success: false, error: "Informe 'de' e 'para'." }, { status: 400 });
    const r = await renomearArea(prisma, id, body.de, body.para);
    return NextResponse.json({ success: true, ...r });
  }
  if (body.acao === "recolor") {
    if (!body.nome?.trim() || body.cor == null) return NextResponse.json({ success: false, error: "Informe 'nome' e 'cor'." }, { status: 400 });
    const areas = await recolorArea(prisma, id, body.nome, body.cor);
    return NextResponse.json({ success: true, areas });
  }
  if (body.acao === "importarFases") {
    const r = await importarFasesDaOP(prisma, id);
    if (r.semOp) return NextResponse.json({ success: false, error: "Este cronograma não está ligado a uma OP." }, { status: 400 });
    return NextResponse.json({ success: true, ...r });
  }
  if (body.acao === "copiar") {
    if (!body.origem?.trim() || !body.departamento) return NextResponse.json({ success: false, error: "Informe a área de origem e o setor." }, { status: 400 });
    const tarefas = await prisma.cronogramaTarefa.findMany({
      where: { cronogramaId: id },
      select: {
        id: true, uidMpp: true, nome: true, departamento: true, area: true, isSummary: true, outlineLevel: true, parentUid: true,
        dataInicioPrevista: true, dataFimPrevista: true, percentualPrevisto: true, duracaoDias: true, defasagemDias: true,
        observacao: true, responsavelId: true, antecessoraIds: true,
      },
    });
    // ids novos pré-gerados (como no "Copiar para OP"): o encadeamento das cópias vai numa gravação só
    const plano = planoCopiaArea({
      tarefas, origem: body.origem, departamento: body.departamento, destinos: body.destinos || [],
      manterExternas: body.manterExternas !== false, novoId: randomUUID,
    });
    if (plano.erro) return NextResponse.json({ success: false, error: plano.erro }, { status: 400 });
    await prisma.cronogramaTarefa.createMany({ data: plano.criar.map((t) => ({ ...t, cronogramaId: id })) });
    // a área de destino já costuma estar cadastrada; se não estiver, ganha a cor fixa dela
    for (const area of Object.keys(plano.porDestino)) await registrarArea(prisma, id, area);
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "COPIAR_AREA_CRONOGRAMA", entity: "Cronograma", entityId: id,
        diff: { origem: body.origem, departamento: body.departamento, destinos: Object.keys(plano.porDestino), tarefas: plano.criar.length, manterExternas: body.manterExternas !== false },
      },
    }).catch(() => {});
    return NextResponse.json({ success: true, porDestino: plano.porDestino, criadas: plano.criar.length });
  }
  if (body.acao === "sincronizar") {
    const r = await sincronizarAreas(prisma, id);
    return NextResponse.json({ success: true, ...r });
  }
  // definir
  const areas = await definirAreas(prisma, id, body.nomes || []);
  return NextResponse.json({ success: true, areas });
}
