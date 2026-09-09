// Conferência de peça — a lista de sessões e o "Iniciar conferência".
//
// GET            → as conferências recentes + as obras que podem ser conferidas
// POST { opId }  → abre uma sessão e devolve o id (a tela navega para ela)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { opsComItensExpediveis } from "@/lib/itens-expedicao";
import { STATUS, autorDe, comTravaDaObra } from "@/lib/conferencia-peca";
import { log } from "@/lib/log";

const registro = log("api/expedicao/conferencia");
// ⚠ Matheus (09/09/2026): "Todos que tiver acesso ao módulos Expedição pode fazer conferencia" —
// só EXPEDICAO (+ ADMIN), igual ao que `middleware.js` já exige pra abrir a tela. Achado do Codex
// (09/09/2026): a API aceitava mais perfis do que a tela deixava entrar — quem tivesse só
// PRODUCAO/QUALIDADE/PCP/PLANEJAMENTO passava aqui sem conseguir nem abrir a página.
const PERFIS = ["ADMIN", "EXPEDICAO"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });

export async function GET() {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const [conferencias, ops] = await Promise.all([
    prisma.conferenciaPeca.findMany({
      where: { status: { not: STATUS.CANCELADA } },
      orderBy: { iniciadaEm: "desc" },
      take: 50,
      select: {
        id: true, opId: true, opNumero: true, status: true, iniciadaEm: true,
        iniciadaPorNome: true, finalizadaEm: true, observacao: true,
        _count: { select: { itens: true } },
      },
    }),
    opsComItensExpediveis(prisma),
  ]);

  // O nome da obra vem da OP, não fica copiado na sessão: se o cadastro mudar, a lista acompanha.
  const porId = new Map(ops.map((o) => [o.id, o]));
  return NextResponse.json({
    success: true,
    ops,
    conferencias: conferencias.map((c) => ({
      ...c,
      lancamentos: c._count.itens,
      cliente: porId.get(c.opId)?.cliente || "",
      obra: porId.get(c.opId)?.obra || "",
      _count: undefined,
    })),
  });
}

const esquema = z.object({ opId: z.string().min(1, "Escolha a obra.") });

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const lido = esquema.safeParse(corpo);
  if (!lido.success) {
    return NextResponse.json({ success: false, error: lido.error.issues[0]?.message }, { status: 400 });
  }

  const op = await prisma.oP.findUnique({ where: { id: lido.data.opId }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ success: false, error: "OP não encontrada" }, { status: 404 });

  const quem = autorDe(user);

  // ⚠⚠ UMA SESSÃO ABERTA POR OBRA — E É TRAVADO, NÃO SÓ CONFERIDO (achado do Codex, 09/09/2026:
  // duas aberturas simultâneas criavam duas sessões pra mesma OP porque o findFirst e o create
  // rodavam sem exclusão mútua). Duas pessoas conferindo a mesma OP ao mesmo tempo em dois
  // celulares somariam no mesmo teto sem se enxergar — e a segunda descobriria isso na forma de um
  // "já conferiu tudo" que ela não entende. Quem chega depois entra na sessão que já existe.
  const resultado = await comTravaDaObra(prisma, op.id, async (tx) => {
    const aberta = await tx.conferenciaPeca.findFirst({
      where: { opId: op.id, status: STATUS.ABERTA },
      select: { id: true, iniciadaPorNome: true },
    });
    if (aberta) return { jaAberta: true, id: aberta.id, por: aberta.iniciadaPorNome };

    let nova;
    try {
      nova = await tx.conferenciaPeca.create({
        data: {
          opId: op.id, opNumero: op.numero, status: STATUS.ABERTA,
          iniciadaPorId: quem.id, iniciadaPorNome: quem.nome,
        },
        select: { id: true },
      });
    } catch (e) {
      // Backstop do índice único parcial (ver ensure-mes-tables.mjs) — se ele disparar mesmo com a
      // trava (não deveria, mas é o que a garante de verdade), devolve a sessão que ganhou a corrida.
      if (e.code === "P2002") {
        const jaAberta = await tx.conferenciaPeca.findFirst({
          where: { opId: op.id, status: STATUS.ABERTA }, select: { id: true, iniciadaPorNome: true },
        });
        if (jaAberta) return { jaAberta: true, id: jaAberta.id, por: jaAberta.iniciadaPorNome };
      }
      throw e;
    }

    await tx.auditLog.create({
      data: {
        userId: quem.id, action: "INICIAR_CONFERENCIA_PECA",
        entity: "ConferenciaPeca", entityId: nova.id,
        diff: { op: op.numero, por: quem.nome },
      },
    }).catch(() => {});

    return { id: nova.id };
  });

  if (!resultado.jaAberta) registro.info(`OP ${op.numero}: conferência ${resultado.id} aberta por ${quem.nome || "?"}`);
  return NextResponse.json({ success: true, ...resultado });
}
