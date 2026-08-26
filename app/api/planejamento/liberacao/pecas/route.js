// GET  /api/planejamento/liberacao/pecas?opId=…  → as peças da obra, para a planilha de seleção
// POST /api/planejamento/liberacao/pecas         → marca/desmarca prioridade num lote de peças
//
// Vitor (25/08/2026): "quero que deixe como planilha com filtro e um botão de podermos marcar quais
// peças são prioridades, uma opção de filtro para selecionar só as a fazer".
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { pecaCortada, poolDaPeca, POOLS } from "@/lib/liberacao-producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP"];
const TETO = 12000; // acima disso o navegador não monta a tabela

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const brutas = await prisma.pecaConjunto.findMany({
    where: { opId, fonte: "LPC_IMPORT" },
    select: {
      id: true, marca: true, opNumero: true, descricao: true, tipoPeca: true, perfil: true, material: true,
      comprimentoMm: true, qte: true, pesoUnitKg: true, pesoTotalKg: true, status: true, statusEstoque: true,
      prioridade: true, corteOrdem: true, corteConcluidoEm: true, qteProduzida: true, maquina: true,
    },
    take: TETO + 1,
  });
  if (!brutas.length) return NextResponse.json({ op, temLpc: false, pecas: [], pools: POOLS });

  // ⚠⚠ ESTAR NA LPC NÃO É TER DESENHO. Vitor (25/08/2026): "quando marcamos as marcas é porque já
  // temos projeto na pasta, ou apenas por ter o projeto listado na lista LPC?". Era só a LPC — e a
  // diferença é enorme: a OP-106 tem a lista importada e ZERO desenho em 2.5.2 Fabricação; a
  // OP-064 tem 2.449 marcas e nenhuma casa com PDF. Liberar isso manda o PCP imprimir o que não
  // existe.
  //
  // A conferência da pasta já roda (cron `pasta-engenharia`, tabela PastaEngenharia) e guarda a
  // lista de marcas sem desenho. Aqui ela vira uma marca por peça — informativa, não bloqueante:
  // o dado é de uma varredura periódica e pode estar velho, e travar a liberação por um retrato
  // de ontem seria pior que avisar.
  const pasta = await prisma.pastaEngenharia.findUnique({ where: { opId }, select: { veredito: true, checadoEm: true, detalhe: true } });
  const semDesenho = new Set((pasta?.detalhe?.semDesenho || []).map((x) => String(x.marca || "").toUpperCase()));
  const foraPadrao = new Map((pasta?.detalhe?.semDesenho || [])
    .filter((x) => x.foraPadrao).map((x) => [String(x.marca || "").toUpperCase(), x.foraPadrao]));

  // ⚠ conjunto composto fica FORA da planilha de corte: ele não se corta, é montado a partir dos
  // croquis. Quem escolhe o dia da Preparação escolhe peça P e avulsa. (Vitor, 25/08/2026)
  const comCroqui = new Set(
    (await prisma.conjuntoCroqui.findMany({ where: { conjunto: { opId } }, select: { conjuntoId: true }, distinct: ["conjuntoId"] }))
      .map((x) => x.conjuntoId)
  );

  const pecas = brutas.slice(0, TETO).map((p) => {
    const natureza = p.tipoPeca === "CROQUI" ? "croqui"
      : p.tipoPeca === "CONJUNTO" && comCroqui.has(p.id) ? "conjunto"
      : "avulsa";
    const cortada = pecaCortada(p);
    return {
      id: p.id, marca: p.marca, frente: p.opNumero, descricao: p.descricao || "",
      natureza, perfil: p.perfil || "", material: p.material || "",
      comprimentoMm: p.comprimentoMm || null, qte: p.qte, pesoUnitKg: p.pesoUnitKg,
      pesoTotalKg: Math.round((p.pesoTotalKg || 0) * 10) / 10,
      pool: poolDaPeca(p.perfil),
      status: p.status, statusEstoque: p.statusEstoque || null, maquina: p.maquina || null,
      prioridade: p.prioridade, corteOrdem: p.corteOrdem,
      cortada, feito: p.qteProduzida || 0,
      // ⚠ "a fazer" é o filtro que o Vitor pediu: o que ainda não passou pelo corte.
      aFazer: !cortada,
      // desenho na pasta 2.5.2 Fabricação — null = a obra nunca foi conferida
      temDesenho: pasta ? !semDesenho.has(String(p.marca || "").toUpperCase()) : null,
      desenhoForaPadrao: foraPadrao.get(String(p.marca || "").toUpperCase()) || null,
    };
  });

  return NextResponse.json({
    op, temLpc: true, pecas, pools: POOLS,
    truncado: brutas.length > TETO ? brutas.length - TETO : 0,
    pasta: pasta ? {
      veredito: pasta.veredito,
      checadoEm: pasta.checadoEm.toISOString(),
      semDesenho: pecas.filter((x) => x.temDesenho === false).length,
    } : null,
  });
}

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(5000),
  prioridade: z.number().int().min(1).max(999).nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });

  const { count } = await prisma.pecaConjunto.updateMany({
    where: { id: { in: parsed.data.ids } },
    data: { prioridade: parsed.data.prioridade },
  });

  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: parsed.data.prioridade == null ? "TIRAR_PRIORIDADE_PECA" : "MARCAR_PRIORIDADE_PECA",
      entity: "PecaConjunto", entityId: parsed.data.ids[0],
      diff: { pecas: count, prioridade: parsed.data.prioridade } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, alteradas: count });
}
