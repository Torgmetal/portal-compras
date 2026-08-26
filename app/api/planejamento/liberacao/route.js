// GET    /api/planejamento/liberacao?opId=…  → as frentes da OP e o que já foi liberado
// POST   /api/planejamento/liberacao          → libera uma frente para o PCP
// PATCH  /api/planejamento/liberacao          → muda prioridade/setores, conclui ou cancela
//
// Vitor (25/08/2026): "o planejamento cria a demanda para o pcp indicando as prioridades e fases
// das obras... a data seria o marco para iniciar, mas podemos começar antes ou depois e isso deve
// ser medido do porquê não foi iniciado naquela data".
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { frentesDaOp, desvioDoMarco, PRIORIDADES, SETORES_LIBERAVEIS } from "@/lib/liberacao-producao";
import { FLUXO_SETORES } from "@/lib/prioridades-setor";
import { portaoDoDesenho } from "@/lib/pasta-engenharia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP"];
const KEYS = FLUXO_SETORES.map((s) => s.key);

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const { temLpc, frentes } = await frentesDaOp(opId);
  // o marco vem das datas por setor da obra (semeadas do cronograma no "Gerar Datas")
  const sol = await prisma.solicitacaoProducao.findUnique({ where: { opNumero: op.numero }, select: { datasSetor: true } });

  return NextResponse.json({
    op, temLpc, frentes,
    datasSetor: sol?.datasSetor || {},
    setores: SETORES_LIBERAVEIS,
    prioridades: PRIORIDADES,
  });
}

const schemaPost = z.object({
  opId: z.string().min(1),
  frente: z.string().min(1).max(40),
  setores: z.array(z.enum(KEYS)).min(1, "Escolha ao menos um setor"),
  prioridade: z.enum(["ALTA", "MEDIA", "BAIXA"]).default("MEDIA"),
  dataMarco: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  desvioMotivo: z.string().max(400).nullable().optional(),
  observacao: z.string().max(400).nullable().optional(),
  // ⚠ as peças escolhidas. Vazio = a frente inteira (como era antes desta coluna existir).
  pecaIds: z.array(z.string().min(1)).max(12000).optional(),
  metaKg: z.number().nullable().optional(),
  totalKg: z.number().nullable().optional(),
  totalPecas: z.number().int().nullable().optional(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => null);
  const parsed = schemaPost.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const op = await prisma.oP.findUnique({ where: { id: d.opId }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  // ⚠ SEM LPC NÃO LIBERA — regra do Vitor, e não é formalidade: sem lista o PCP não tem o que
  // imprimir nem o que baixar, e a "liberação" seria uma linha que não vira trabalho.
  const { temLpc, frentes } = await frentesDaOp(d.opId);
  if (!temLpc) return NextResponse.json({ error: `A ${op.numero} não tem LPC importada. Sem a lista não há o que liberar.` }, { status: 400 });
  // ⚠ a frente só é validada quando a liberação é da frente INTEIRA. Com peças escolhidas a mão, a
  // seleção pode cruzar frentes — e aí o rótulo é "N frentes", que não existe na LPC de propósito.
  if (!d.pecaIds?.length && !frentes.some((f) => f.frente === d.frente)) {
    return NextResponse.json({ error: `A frente "${d.frente}" não existe na LPC desta obra.` }, { status: 400 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // O PORTÃO DO DESENHO. Vitor (26/08/2026): "só pode ser liberado as marcas que possuem projetos
  // nas pastas".
  //
  // ⚠ AQUI, E NÃO SÓ NA TELA. Filtro de tela é sugestão: basta um POST fora dela — ou a tela
  // abrir com o retrato velho — para descer peça sem desenho. Vitor, sobre o portão do material:
  // "não vamos criar uma maneira de burlarmos". Vale igual para o desenho.
  //
  // ⚠ 2.5.5 NÃO CONTA. A conferência só casa PDF de 2.5.2 Fabricação; a pasta de envio ao cliente
  // entra apenas para explicar o motivo (marca desenhada e guardada no lugar errado).
  const portao = await portaoDoDesenho(prisma, d.opId);
  if (!portao.conferida) {
    return NextResponse.json({
      error: portao.erroPasta
        ? `Não deu para ler a pasta da ${op.numero} na última conferência: ${portao.erroPasta}. Confira de novo antes de liberar.`
        : `A pasta da ${op.numero} nunca foi conferida. Sem saber quais marcas têm desenho não dá para liberar — confira a pasta e tente de novo.`,
      precisaConferir: true,
    }, { status: 400 });
  }
  // ⚠ os dois jeitos de a lista de faltantes estar incompleta — e incompleta ela LIBERA, não barra
  if (!portao.confiavel) {
    return NextResponse.json({
      error: portao.truncado > 0
        ? `A conferência da ${op.numero} veio truncada (${portao.truncado} marca(s) fora da lista). Refaça a conferência da pasta antes de liberar.`
        : `A conferência da ${op.numero} é de antes da lista atual: olhou ${portao.marcas} marca(s) e a LPC hoje tem ${portao.marcasHoje}. Reconfira a pasta antes de liberar.`,
      precisaConferir: true,
    }, { status: 400 });
  }

  // ⚠ as marcas vêm do BANCO, não do que o cliente mandou: o corpo do POST traz ids, e é o id que
  // se resolve em marca aqui. Confiar numa marca enviada pela tela seria o mesmo furo de novo.
  const alvo = d.pecaIds?.length
    ? await prisma.pecaConjunto.findMany({ where: { id: { in: d.pecaIds }, opId: op.id }, select: { id: true, marca: true } })
    : await prisma.pecaConjunto.findMany({ where: { opId: op.id, fonte: "LPC_IMPORT", opNumero: d.frente }, select: { id: true, marca: true } });

  const barradas = new Map();
  for (const p of alvo) {
    const k = String(p.marca || "").trim().toUpperCase();
    if (portao.semDesenho.has(k) && !barradas.has(k)) {
      barradas.set(k, portao.foraPadrao.get(k) ? "arquivo com outro nome" : portao.soEnvio.has(k) ? "só em 2.5.5" : "sem desenho");
    }
  }
  if (barradas.size) {
    const amostra = [...barradas.entries()].slice(0, 8).map(([m, por]) => `${m} (${por})`);
    return NextResponse.json({
      error: `${barradas.size} marca(s) desta liberação não têm desenho em 2.5.2 Fabricação: ${amostra.join(", ")}${barradas.size > 8 ? "…" : ""}. Só desce para o PCP o que tem projeto na pasta.`,
      semDesenho: barradas.size,
      marcas: [...barradas.keys()],
      checadoEm: portao.checadoEm,
    }, { status: 400 });
  }

  const agora = new Date();
  const marco = d.dataMarco ? new Date(`${d.dataMarco}T12:00:00Z`) : null;
  const desvio = desvioDoMarco(marco, agora);

  // ⚠ atraso sem motivo não entra: é justamente o que Vitor pediu para medir. Adiantar não exige
  // explicação — só o atraso, porque é o que custa prazo.
  if (desvio != null && desvio > 0 && !String(d.desvioMotivo || "").trim()) {
    return NextResponse.json({
      error: `Esta frente está sendo liberada ${desvio} dia(s) depois do marco (${d.dataMarco}). Informe o motivo.`,
      precisaMotivo: true, desvioDias: desvio,
    }, { status: 400 });
  }

  const dados = {
    opNumero: op.numero, frente: d.frente, setores: d.setores, prioridade: d.prioridade,
    dataMarco: marco, desvioDias: desvio, desvioMotivo: (d.desvioMotivo || "").trim() || null,
    observacao: (d.observacao || "").trim() || null,
    pecaIds: d.pecaIds?.length ? d.pecaIds : null,
    metaKg: d.metaKg ?? null, totalKg: d.totalKg ?? null, totalPecas: d.totalPecas ?? null,
    liberadoEm: agora, liberadoPorId: user?.id || null, liberadoPorNome: user?.name || user?.email || null,
    status: "LIBERADA", canceladaEm: null, canceladaMotivo: null,
  };
  const lib = await prisma.liberacaoProducao.upsert({
    where: { opId_frente: { opId: op.id, frente: d.frente } },
    create: { opId: op.id, ...dados },
    update: dados,
  });

  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "LIBERAR_PRODUCAO", entity: "LiberacaoProducao", entityId: lib.id,
      diff: { op: op.numero, frente: d.frente, setores: d.setores, prioridade: d.prioridade,
              desvioDias: desvio, motivo: dados.desvioMotivo, pecas: d.pecaIds?.length || null, totalKg: d.totalKg } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, liberacao: lib });
}

const schemaPatch = z.object({
  id: z.string().min(1),
  prioridade: z.enum(["ALTA", "MEDIA", "BAIXA"]).optional(),
  setores: z.array(z.enum(KEYS)).min(1).optional(),
  status: z.enum(["LIBERADA", "EM_PRODUCAO", "CONCLUIDA", "CANCELADA"]).optional(),
  motivo: z.string().max(400).nullable().optional(),
});

export async function PATCH(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const parsed = schemaPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const atual = await prisma.liberacaoProducao.findUnique({ where: { id: d.id } });
  if (!atual) return NextResponse.json({ error: "Liberação não encontrada." }, { status: 404 });

  // ⚠ cancelar exige motivo: tirar trabalho da fila do PCP sem dizer por quê é o tipo de coisa que
  // ninguém consegue explicar duas semanas depois.
  if (d.status === "CANCELADA" && !String(d.motivo || "").trim()) {
    return NextResponse.json({ error: "Informe o motivo do cancelamento." }, { status: 400 });
  }

  const dados = {
    ...(d.prioridade ? { prioridade: d.prioridade } : {}),
    ...(d.setores ? { setores: d.setores } : {}),
    ...(d.status ? { status: d.status } : {}),
    ...(d.status === "CONCLUIDA" ? { concluidaEm: new Date() } : {}),
    ...(d.status === "CANCELADA" ? { canceladaEm: new Date(), canceladaMotivo: (d.motivo || "").trim() } : {}),
  };
  const lib = await prisma.liberacaoProducao.update({ where: { id: d.id }, data: dados });

  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "ALTERAR_LIBERACAO_PRODUCAO", entity: "LiberacaoProducao", entityId: lib.id,
      diff: { de: { prioridade: atual.prioridade, status: atual.status, setores: atual.setores }, para: dados } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, liberacao: lib });
}
