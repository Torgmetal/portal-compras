// POST /api/producao/pecas/liberar-montagem
// Libera conjuntos para montagem (muda status CORTE → MONTAGEM)
// Body: { ids: string[] } ou { ids: string[], reverter: true } para voltar MONTAGEM → CORTE
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { calcularProntidao } from "@/lib/prontidao-conjunto";

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos um conjunto"),
  reverter: z.boolean().optional(),
  // ⚠ marca/id → bancada. Gravado junto com a liberação para o papel que o encarregado recebe e a
  // tela do portal contarem a mesma história. Ver lib/montagem-capacidade.js.
  bancadaPorId: z.record(z.string(), z.string().max(60)).nullable().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {
    let body;
    try {
      body = schema.parse(await req.json());
    } catch (e) {
      return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
    }

    const { ids, reverter } = body;

    const statusDe = reverter ? "MONTAGEM" : "CORTE";
    const statusPara = reverter ? "CORTE" : "MONTAGEM";

    // ⚠⚠ SÓ DESCE CONJUNTO 100% CORTADO. Vitor (01/09/2026): "lá na página do pcp sim precisamos ter
    // uma forma para podermos liberar os conjuntos de montagem somente com os croquis que estiverem
    // 100% prontos para montagem".
    //
    // ⚠ ISSO SUBSTITUI A REGRA DA METADE nesta liberação. Em 12/06/2026 ele definiu que a montagem
    // "pode começar" com ≥ metade dos croquis cortados; a regra continua existindo como leitura da
    // tela (o rótulo "pode montar"), mas quem MANDA A PEÇA para a montagem agora exige tudo pronto.
    //
    // ⚠ A CONFERÊNCIA É AQUI, não só no botão. A tela filtra, mas uma aba aberta desde ontem ou uma
    // seleção antiga mandaria para a montagem conjunto com croqui ainda na máquina — e quem recebe
    // não tem como saber que faltava peça.
    //
    // Reverter não confere nada: voltar para o corte é sempre permitido.
    let idsPermitidos = ids;
    const bloqueados = [];
    if (!reverter) {
      const conjuntos = await prisma.pecaConjunto.findMany({
        where: { id: { in: ids }, tipoPeca: "CONJUNTO" },
        select: {
          id: true, marca: true,
          conjuntoCroquis: { select: { croqui: { select: { marca: true, qte: true, qteProduzida: true } } } },
        },
      });
      const ok = new Set();
      for (const c of conjuntos) {
        const p = calcularProntidao(c);
        if (p.pronto) ok.add(c.id);
        else bloqueados.push({ marca: c.marca, cortados: p.atendidos, total: p.total });
      }
      idsPermitidos = ids.filter((id) => ok.has(id));
    }

    const result = idsPermitidos.length
      ? await prisma.pecaConjunto.updateMany({
          where: { id: { in: idsPermitidos }, status: statusDe },
          data: { status: statusPara, ultimoSetor: reverter ? "Corte" : "Montagem" },
        })
      : { count: 0 };

    // grava a bancada de cada conjunto (uma chamada por bancada, não por peça)
    if (!reverter && body.bancadaPorId && idsPermitidos.length) {
      const porBancada = new Map();
      for (const id of idsPermitidos) {
        const b = body.bancadaPorId[id];
        if (!b) continue;
        if (!porBancada.has(b)) porBancada.set(b, []);
        porBancada.get(b).push(id);
      }
      const agora = new Date();
      await prisma.$transaction([...porBancada.entries()].map(([bancada, ids2]) =>
        prisma.pecaConjunto.updateMany({ where: { id: { in: ids2 } }, data: { montagemBancada: bancada, montagemBancadaEm: agora } })
      ));
    }
    // reverter limpa a bancada: voltar ao corte desfaz a atribuição
    if (reverter && ids.length) {
      await prisma.pecaConjunto.updateMany({ where: { id: { in: ids } }, data: { montagemBancada: null, montagemBancadaEm: null } });
    }

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: reverter ? "REVERTER_MONTAGEM" : "LIBERAR_MONTAGEM",
          entity: "PecaConjunto",
          entityId: ids.length === 1 ? ids[0] : `${ids.length} conjuntos`,
          diff: {
            ids: ids.slice(0, 20),
            total: ids.length,
            de: statusDe,
            para: statusPara,
            atualizados: result.count,
            bloqueados: bloqueados.length,
          },
        },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      atualizados: result.count,
      acao: reverter ? "REVERTIDO" : "LIBERADO",
      // ⚠ quem ficou de fora volta NOMEADO, com o quanto falta: "23 ignorados" manda o PCP procurar
      // no escuro qual peça segurou a obra.
      bloqueados,
      liberadosIds: idsPermitidos,
    });
  } catch (e) {
    console.error("[liberar-montagem] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
