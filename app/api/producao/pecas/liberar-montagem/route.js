// POST /api/producao/pecas/liberar-montagem
// Libera conjuntos para montagem (muda status CORTE → MONTAGEM)
// Body: { ids: string[] } ou { ids: string[], reverter: true } para voltar MONTAGEM → CORTE
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { calcularProntidao, CONJUNTO_MONTAVEL } from "@/lib/prontidao-conjunto";

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos um conjunto"),
  reverter: z.boolean().optional(),
  // ⚠ marca/id → bancada. Gravado junto com a liberação para o papel que o encarregado recebe e a
  // tela do portal contarem a mesma história. Ver lib/montagem-capacidade.js.
  bancadaPorId: z.record(z.string(), z.string().max(60)).nullable().optional(),
  // ⚠ id → dia (YYYY-MM-DD). Vitor (01/09/2026): "minha intenção não é programar um único dia, ela
  // poderia muito bem já estar programando a montagem de dias para frente". A liberação grava o dia
  // de CADA conjunto, calculado pela capacidade da bancada — ver lib/montagem-capacidade.
  diaPorId: z.record(z.string(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
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

    // ⚠⚠ DE ONDE O CONJUNTO PODE VIR — E POR QUE "PENDENTE" ENTRA AQUI.
    //
    // Vitor (04/09/2026): "no PCP eu programei dois lotes para fabricação... consegui imprimir os
    // projetos, porém não aparece na programação". O conjunto recebia dia e bancada, o desenho saía
    // com GRD, e ele não aparecia em painel nenhum de montagem — porque a virada de status exigia
    // `status: "CORTE"`, e conjunto que nunca teve apontamento de corte no Syneco fica PENDENTE.
    // O `updateMany` casava ZERO linhas e não reclamava; as gravações de dia e bancada logo abaixo
    // não filtram status, então a peça ficava pela metade: com dia marcado e sem setor nenhum.
    // Eram 197 conjuntos assim — 185 da OP-097 (programados de 02 a 08/09) e 12 da 105.
    //
    // ⚠ Aceitar PENDENTE não afrouxa nada: quem decide se o conjunto desce é a PRONTIDÃO acima
    // (todos os croquis cortados), que roda antes e é o portão de verdade. O status do CONJUNTO
    // nunca disse nada sobre isso — quem passa pelo corte são os croquis dele.
    const statusDe = reverter ? ["MONTAGEM"] : ["PENDENTE", "CORTE"];
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
      // ⚠ e o servidor recusa marca sem sub-peça (ver CONJUNTO_MONTAVEL): a tela já filtra, mas a
      // regra não pode morar só nela — uma aba aberta desde ontem mandaria montar o que não monta.
      const conjuntos = await prisma.pecaConjunto.findMany({
        where: { id: { in: ids }, ...CONJUNTO_MONTAVEL },
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
          where: { id: { in: idsPermitidos }, status: { in: statusDe } },
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
    // e o dia de cada conjunto (uma chamada por dia, não por peça)
    if (!reverter && body.diaPorId && idsPermitidos.length) {
      const porDia = new Map();
      for (const id of idsPermitidos) {
        const d = body.diaPorId[id];
        if (!d) continue;
        if (!porDia.has(d)) porDia.set(d, []);
        porDia.get(d).push(id);
      }
      const agora2 = new Date();
      await prisma.$transaction([...porDia.entries()].flatMap(([d, ids2]) => {
        const data = new Date(d + "T00:00:00Z");
        return [
          prisma.pecaConjunto.updateMany({ where: { id: { in: ids2 } },
            data: { montagemDiaProgramado: data, montagemProgramadaEm: agora2, montagemProgramadaPor: user.name || null } }),
          // ⚠ o original só se escreve uma vez — é dele que o atraso conta (mesma regra do corte)
          prisma.pecaConjunto.updateMany({ where: { id: { in: ids2 }, montagemDiaOriginal: null },
            data: { montagemDiaOriginal: data } }),
        ];
      }));
    }
    // reverter limpa a bancada: voltar ao corte desfaz a atribuição
    if (reverter && ids.length) {
      await prisma.pecaConjunto.updateMany({ where: { id: { in: ids } },
        data: { montagemBancada: null, montagemBancadaEm: null, montagemDiaProgramado: null } });
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
