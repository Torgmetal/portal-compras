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
import { calcularProntidao, CONJUNTO_MONTAVEL } from "@/lib/prontidao-conjunto";
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
    where: { opId, ...CONJUNTO_MONTAVEL },
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
    // ⚠⚠ SEM TRAVA DE PRONTIDÃO. Vitor (01/09/2026): "para a liberação da montagem no planejamento
    // não precisa estar com os croquis prontos para ele liberar, apenas colocar para poder lançar
    // para o PCP". A versão anterior só deixava programar conjunto com TODOS os croquis cortados e
    // exigia um `forcar` para o resto — isso invertia quem decide: o planejamento marca a data
    // olhando o cronograma e a preparação, e o corte corre atrás. A prontidão continua aparecendo
    // na tela, como informação; ela não é mais porteiro.
    const conjuntos = await prisma.pecaConjunto.findMany({
      where: { id: { in: body.ids }, tipoPeca: "CONJUNTO" },
      select: { id: true, opId: true, opNumero: true, pesoTotalKg: true },
    });
    if (conjuntos.length) {
      const dia = new Date(body.dia + "T00:00:00Z");
      const ids = conjuntos.map((c) => c.id);
      await prisma.$transaction([
        prisma.pecaConjunto.updateMany({
          where: { id: { in: ids } },
          data: { montagemDiaProgramado: dia, montagemProgramadaEm: agora, montagemProgramadaPor: user.name || null },
        }),
        // o original só se escreve uma vez — é dele que o atraso conta
        prisma.pecaConjunto.updateMany({
          where: { id: { in: ids }, montagemDiaOriginal: null },
          data: { montagemDiaOriginal: dia },
        }),
      ]);
    }
    // ── E A LIBERAÇÃO PARA O PCP ────────────────────────────────────────────────────────────
    // Vitor (01/09/2026): "apenas colocar para poder lançar para o PCP" — e, ao não achar nada na
    // tela: "vc não está trazendo nessa tela? por isso que não estou achando?".
    //
    // ⚠⚠ EU TINHA CRIADO UM SEGUNDO MECANISMO DE LIBERAÇÃO. Marcar o dia gravava só
    // `montagemDiaProgramado`, um campo que a tela de trabalho do PCP (/pcp/producao) não conhece.
    // Aquela tela lê `LiberacaoProducao` — e como a única liberação da OP-113 era de CORTE, com 79
    // croquis e nenhum conjunto, a aba Montagem listava zero enquanto o cabeçalho dizia 9.931 kg.
    // Programar agora GRAVA A LIBERAÇÃO, que é o caminho que já existia para "descer para o PCP".
    //
    // ⚠ UMA LIBERAÇÃO POR FRENTE E POR DIA. A frente é o `opNumero` do conjunto (T113A) — é assim
    // que o resto do portal separa sub-obra —, e o dia entra em `dataProgramada`. Reprogramar o
    // mesmo conjunto no mesmo dia SOMA na liberação existente em vez de criar outra, senão a
    // Central do PCP encheria de lotes repetidos a cada clique.
    const porFrente = new Map();
    for (const c of conjuntos) {
      if (!c.opId) continue; // conjunto sem OP não desce: o PCP acha a fila pela OP
      const k = `${c.opId}|${c.opNumero || ""}`;
      const g = porFrente.get(k) || { opId: c.opId, frente: c.opNumero || "", ids: [], kg: 0 };
      g.ids.push(c.id); g.kg += Number(c.pesoTotalKg) || 0;
      porFrente.set(k, g);
    }
    const diaProg = new Date(`${body.dia}T12:00:00Z`);
    for (const g of porFrente.values()) {
      const existente = await prisma.liberacaoProducao.findFirst({
        where: { opId: g.opId, frente: g.frente, dataProgramada: diaProg,
                 status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
        select: { id: true, pecaIds: true, setores: true, totalPecas: true, totalKg: true },
      });
      if (existente) {
        const atuais = Array.isArray(existente.pecaIds) ? existente.pecaIds : [];
        const unidos = [...new Set([...atuais, ...g.ids])];
        const setores = [...new Set([...(Array.isArray(existente.setores) ? existente.setores : []), "MONTAGEM"])];
        await prisma.liberacaoProducao.update({
          where: { id: existente.id },
          data: { pecaIds: unidos, setores, totalPecas: unidos.length,
                  totalKg: (Number(existente.totalKg) || 0) + g.kg },
        });
      } else {
        const op = await prisma.oP.findUnique({ where: { id: g.opId }, select: { numero: true } });
        await prisma.liberacaoProducao.create({
          data: {
            opId: g.opId, opNumero: op?.numero || g.frente, frente: g.frente,
            setores: ["MONTAGEM"], prioridade: "MEDIA",
            pecaIds: g.ids, dataProgramada: diaProg,
            totalPecas: g.ids.length, totalKg: g.kg,
            // ⚠ sem marco: o desvio do corte mede a liberação contra o cronograma; aqui o dia da
            // montagem É a decisão do planejamento, não um atraso a explicar.
            liberadoEm: agora, liberadoPorId: user.id, liberadoPorNome: user.name || null,
            status: "LIBERADA",
          },
        });
      }
    }

    atualizados = conjuntos.length;
    afetados = conjuntos.map((c) => ({ id: c.id, montagemDiaProgramado: body.dia }));
    if (atualizados < body.ids.length) {
      avisos.push(`${body.ids.length - atualizados} item(ns) ignorado(s) — não são conjuntos.`);
    }
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
                ...(body.acao === "programar" ? { dia: body.dia } : {}),
                ...(body.acao === "adiar" ? { para: body.para || "próximo dia útil" } : {}) },
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, atualizados, avisos, afetados });
}
