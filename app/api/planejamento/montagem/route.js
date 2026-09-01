// POST /api/planejamento/montagem → programação da MONTAGEM, por conjunto
//   { acao: "programar",    ids, dia "YYYY-MM-DD" }  → marca o dia de início da montagem
//   { acao: "adiar",        ids, para? "YYYY-MM-DD" } → leva para outro dia (mantém o original)
//   { acao: "desprogramar", ids }                     → tira do plano
//
// ⚠⚠ O DIA É POR CONJUNTO, NÃO POR LOTE. Vitor (01/09/2026): "será por conjunto que tenha todas as
// sub peças prontas para iniciar a montagem". Diferente do corte, onde o PCP dá uma janela e o
// portal reparte: aqui o que manda é a prontidão de CADA conjunto, e ela não chega em bloco.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { proximoDiaUtil, isoDia } from "@/lib/programacao-dia";
import { calcularProntidao } from "@/lib/prontidao-conjunto";
import { produzidoPorMarca } from "@/lib/conjuntos-setor";

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP"];

// GET ?opId=… → os conjuntos daquela obra, com a prontidão de cada um
//
// ⚠⚠ FILTRA POR opId, NÃO POR NÚMERO. A tela de Datas por setor trabalha com a OP-mãe ("105") e a
// LPC grava a SUB-OBRA em opNumero ("T105A", "T105B") — casar por texto perderia a obra inteira ou
// traria a errada. Ver a armadilha já anotada em PecaConjunto.opNumero.
export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "Informe a obra." }, { status: 400 });

  const conjuntos = await prisma.pecaConjunto.findMany({
    where: { opId, tipoPeca: "CONJUNTO" },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    select: {
      id: true, opNumero: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, status: true,
      montagemDiaProgramado: true, montagemDiaOriginal: true, montagemAdiado: true, montagemProgramadaPor: true,
      conjuntoCroquis: { select: { croqui: { select: { marca: true, qte: true, qteProduzida: true } } } },
    },
    take: 2000,
  });

  // "montado" = apontamento do Syneco no setor Montagem — o lançamento de concluído da fábrica
  const montados = await produzidoPorMarca("Montagem", conjuntos.map((c) => c.marca));

  return NextResponse.json({
    conjuntos: conjuntos.map((c) => ({ ...c, prontidao: calcularProntidao(c), conjuntoCroquis: undefined })),
    montados,
  });
}

const schema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("programar"),
    ids: z.array(z.string()).min(1, "Selecione ao menos um conjunto"),
    dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    // ⚠ só se ignora a prontidão com pedido EXPLÍCITO de quem programa — ver abaixo
    forcar: z.boolean().optional(),
  }),
  z.object({ acao: z.literal("adiar"), ids: z.array(z.string()).min(1), para: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  z.object({ acao: z.literal("desprogramar"), ids: z.array(z.string()).min(1) }),
]);

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const agora = new Date();
  const avisos = [];
  let atualizados = 0;
  // ⚠ a rota devolve QUAIS conjuntos mudaram, não só quantos: a tela precisa saber exatamente o
  // que aplicar (a ação pode pular os que não estavam prontos) sem recarregar a página inteira.
  let afetados = [];

  if (body.acao === "programar") {
    // ⚠⚠ A PRONTIDÃO É CONFERIDA NO SERVIDOR. A tela já filtra, mas a regra que decide se a fábrica
    // pode montar não pode morar só no navegador: uma seleção antiga, uma aba aberta desde ontem ou
    // um clique fora de ordem mandariam montar o que não está cortado.
    const conjuntos = await prisma.pecaConjunto.findMany({
      where: { id: { in: body.ids }, tipoPeca: "CONJUNTO" },
      select: {
        id: true, marca: true,
        conjuntoCroquis: { select: { croqui: { select: { marca: true, qte: true, qteProduzida: true } } } },
      },
    });
    const prontos = [], faltando = [];
    for (const c of conjuntos) {
      (calcularProntidao(c).pronto ? prontos : faltando).push(c);
    }
    // ⚠ "todas as sub peças prontas" é o critério do Vitor para MARCAR O DIA. A regra da metade
    // ("pode montar") segue valendo para o fluxo da fábrica — são perguntas diferentes.
    const alvo = body.forcar ? conjuntos : prontos;
    if (!body.forcar && faltando.length) {
      avisos.push(`${faltando.length} conjunto(s) fora do plano — ainda há croqui sem cortar: ${faltando.slice(0, 5).map((c) => c.marca).join(", ")}${faltando.length > 5 ? "…" : ""}.`);
    }
    if (alvo.length) {
      const dia = new Date(body.dia + "T00:00:00Z");
      await prisma.$transaction([
        prisma.pecaConjunto.updateMany({
          where: { id: { in: alvo.map((c) => c.id) } },
          data: { montagemDiaProgramado: dia, montagemProgramadaEm: agora, montagemProgramadaPor: user.name || null },
        }),
        // o original só se escreve uma vez — é dele que o atraso conta
        prisma.pecaConjunto.updateMany({
          where: { id: { in: alvo.map((c) => c.id) }, montagemDiaOriginal: null },
          data: { montagemDiaOriginal: dia },
        }),
      ]);
    }
    atualizados = alvo.length;
    afetados = alvo.map((c) => ({ id: c.id, montagemDiaProgramado: body.dia }));
  } else if (body.acao === "adiar") {
    const alvo = await prisma.pecaConjunto.findMany({
      where: { id: { in: body.ids }, tipoPeca: "CONJUNTO", montagemDiaProgramado: { not: null } },
      select: { id: true, montagemDiaProgramado: true },
    });
    const destino = body.para ? new Date(body.para + "T00:00:00Z") : null;
    const grupos = new Map();
    for (const c of alvo) {
      const k = isoDia(destino || proximoDiaUtil(c.montagemDiaProgramado));
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(c.id);
    }
    await prisma.$transaction([...grupos.entries()].map(([iso, ids]) =>
      prisma.pecaConjunto.updateMany({
        where: { id: { in: ids } },
        // ⚠ o ORIGINAL não se move: adiar não conserta o prazo, só diz onde a montagem começa agora
        data: { montagemDiaProgramado: new Date(iso + "T00:00:00Z"), montagemAdiado: { increment: 1 } },
      })
    ));
    atualizados = alvo.length;
    afetados = [...grupos.entries()].flatMap(([iso, ids]) => ids.map((id) => ({ id, montagemDiaProgramado: iso, adiou: true })));
    if (atualizados < body.ids.length) avisos.push(`${body.ids.length - atualizados} sem programação — nada a adiar.`);
  } else if (body.acao === "desprogramar") {
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: body.ids }, tipoPeca: "CONJUNTO" },
      data: { montagemDiaProgramado: null, montagemDiaOriginal: null, montagemAdiado: 0,
              montagemProgramadaEm: null, montagemProgramadaPor: null },
    });
    atualizados = r.count;
    afetados = body.ids.map((id) => ({ id, montagemDiaProgramado: null }));
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: `MONTAGEM_${body.acao.toUpperCase()}`, entity: "PecaConjunto",
        entityId: body.ids.length === 1 ? body.ids[0] : `${body.ids.length} conjuntos`,
        diff: { acao: body.acao, total: body.ids.length, atualizados,
                ...(body.acao === "programar" ? { dia: body.dia, forcado: !!body.forcar } : {}),
                ...(body.acao === "adiar" ? { para: body.para || "próximo dia útil" } : {}) },
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, atualizados, avisos, afetados });
}
