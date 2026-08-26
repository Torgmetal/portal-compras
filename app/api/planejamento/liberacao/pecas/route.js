// GET  /api/planejamento/liberacao/pecas?opId=…  → as peças da obra, para a planilha de seleção
// POST /api/planejamento/liberacao/pecas         → marca/desmarca prioridade num lote de peças
//
// Vitor (25/08/2026): "quero que deixe como planilha com filtro e um botão de podermos marcar quais
// peças são prioridades, uma opção de filtro para selecionar só as a fazer".
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { portaoDoDesenho, temDesenhoNaPasta, temMaquinaNaPasta } from "@/lib/pasta-engenharia";
import { analisarMaterial, statusMaterialPlanejamento } from "@/lib/material-liberacao";
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
  // ⚠ AGORA BLOQUEIA. Vitor (26/08/2026): "só pode ser liberado as marcas que possuem projetos nas
  // pastas". Era aviso; virou portão. O critério mora em `portaoDoDesenho` para a tela pintar
  // exatamente o que o POST vai cobrar — e 2.5.5 continua não contando, que é a outra metade do
  // pedido ("vamos ignorar os projetos da pasta 2.5.5").
  // ⚠ o que JÁ FOI PROGRAMADO sai da escolha do próximo dia — senão "preencher o dia" devolveria
  // sempre o mesmo lote e a semana nunca avançaria.
  const abertas = await prisma.liberacaoProducao.findMany({
    where: { opId, status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    select: { id: true, frente: true, dataProgramada: true, pecaIds: true, liberadoEm: true },
    orderBy: [{ dataProgramada: "asc" }, { liberadoEm: "asc" }],
  });
  const programada = new Map();
  for (const l of abertas) {
    for (const id of (Array.isArray(l.pecaIds) ? l.pecaIds : [])) {
      if (!programada.has(id)) programada.set(id, l.dataProgramada ? l.dataProgramada.toISOString().slice(0, 10) : "sem data");
    }
  }

  const portao = await portaoDoDesenho(prisma, opId);

  // ⚠ MATERIAL AQUI É INFORMAÇÃO, NÃO PORTÃO. Vitor (26/08/2026): "aqui no planejamento já seria
  // importante o status do material tbm se foi entregue ou não" — ele pediu o STATUS.
  //
  // ⚠⚠ E QUEM TRAVA POR MATERIAL É O PCP, por decisão dele mesmo (25/08/2026): "o planejamento
  // solta a lista, pcp recebe a solicitação, manda separar o material, analisa se está tudo em
  // estoque (…) caso não tenha o material não libera aquele projeto para preparar". Barrar aqui
  // tiraria do PCP a etapa que é dele — e material chega no meio da semana, então o Planejamento
  // precisa poder programar o que ainda está a caminho.
  //
  // A conta é a MESMA do painel do PCP (lib/material-liberacao.js): duas leituras diferentes do
  // mesmo aço fariam as duas telas discordarem sobre a mesma peça.
  const material = await analisarMaterial(op.numero, brutas).catch(() => null);

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
    const mat = material?.porPeca?.get(p.id) || null;
    return {
      id: p.id, marca: p.marca, frente: p.opNumero, descricao: p.descricao || "",
      // ⚠ `aco` é o AÇO da peça (A36, ASTM…). Chamava-se `material` e o status do material o
      // sobrescrevia calado — dois significados no mesmo nome.
      natureza, perfil: p.perfil || "", aco: p.material || "",
      comprimentoMm: p.comprimentoMm || null, qte: p.qte, pesoUnitKg: p.pesoUnitKg,
      pesoTotalKg: Math.round((p.pesoTotalKg || 0) * 10) / 10,
      pool: poolDaPeca(p.perfil),
      status: p.status, statusEstoque: p.statusEstoque || null, maquina: p.maquina || null,
      prioridade: p.prioridade, corteOrdem: p.corteOrdem,
      cortada, feito: p.qteProduzida || 0,
      // ⚠ "a fazer" é o filtro que o Vitor pediu: o que ainda não passou pelo corte.
      aFazer: !cortada,
      // desenho na pasta 2.5.2 Fabricação — null = a obra nunca foi conferida
      temDesenho: temDesenhoNaPasta(portao, p.marca),
      desenhoForaPadrao: portao.foraPadrao.get(String(p.marca || "").trim().toUpperCase()) || null,
      // desenhado, mas fora da fabricação — o dado fica, a tela não mostra
      desenhoSoEnvio: portao.soEnvio.has(String(p.marca || "").trim().toUpperCase()),
      // ⚠ NC1/DXF/IGS: o que a MÁQUINA lê. Ter desenho não é ter arquivo de máquina.
      temMaquina: temMaquinaNaPasta(portao, p.marca, false),
      // material: NA_OP (chegou nesta obra) · ESTOQUE (existe, é de outra OP) · SEM_MATERIAL
      // dia já programado para esta peça — "sem data" = liberada sem marcar o dia
      programadaEm: programada.get(p.id) || null,
      material: mat ? mat.estado : null,
      materialFalta: mat?.falta || null,
      materialRs: mat?.rs?.length || 0,
    };
  });

  return NextResponse.json({
    op, temLpc: true, pecas, pools: POOLS,
    truncado: brutas.length > TETO ? brutas.length - TETO : 0,
    // ⚠ O PORTÃO VAI NA RESPOSTA para a tela desenhar exatamente o que o POST vai cobrar.
    pasta: {
      conferida: portao.conferida, confiavel: portao.confiavel, truncado: portao.truncado || 0,
      marcasConferidas: portao.marcas || 0, marcasHoje: portao.marcasHoje || 0,
      veredito: portao.veredito, checadoEm: portao.checadoEm, erro: portao.erroPasta || null,
      semDesenho: pecas.filter((x) => x.temDesenho === false).length,
      maquinaMedida: portao.maquinaMedida, semMaquina: pecas.filter((x) => x.temMaquina === false).length,
      soEnvio: pecas.filter((x) => x.desenhoSoEnvio).length,
    },
    // ⚠ o resumo do material vem do MESMO cálculo do painel do PCP
    material: material ? {
      ...material.resumo,
      // ⚠ o resumo do lib conta ESTOQUE à parte; aqui ele já entrou na fila de compra
      naoEntregue: pecas.filter((x) => x.material && x.material !== "ENTREGUE").length,
      kgNaoEntregue: Math.round(pecas.filter((x) => x.material && x.material !== "ENTREGUE")
        .reduce((a, x) => a + (x.pesoTotalKg || 0), 0)),
    } : null,
    // os dias já programados desta obra, para a tela mostrar a semana montada
    dias: [...abertas.reduce((m, l) => {
      const k = l.dataProgramada ? l.dataProgramada.toISOString().slice(0, 10) : "";
      const g = m.get(k) || { dia: k || null, lotes: 0, pecas: 0 };
      g.lotes++; g.pecas += (Array.isArray(l.pecaIds) ? l.pecaIds.length : 0);
      return m.set(k, g);
    }, new Map()).values()].sort((a, b) => String(a.dia).localeCompare(String(b.dia))),
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
