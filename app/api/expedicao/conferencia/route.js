// Conferência de peça — a lista de sessões e o "Iniciar conferência".
//
// GET            → as conferências recentes + as obras que podem ser conferidas
// POST { opId }  → abre uma sessão e devolve o id (a tela navega para ela)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { opsComItensExpediveis } from "@/lib/itens-expedicao";
import { STATUS, autorDe } from "@/lib/conferencia-peca";
import { log } from "@/lib/log";

const registro = log("api/expedicao/conferencia");
const PERFIS = ["ADMIN", "EXPEDICAO", "PRODUCAO", "QUALIDADE", "PCP", "PLANEJAMENTO"];

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

  // ⚠ UMA SESSÃO ABERTA POR OBRA. Duas pessoas conferindo a mesma OP ao mesmo tempo em dois
  // celulares somariam no mesmo teto sem se enxergar — e a segunda descobriria isso na forma de um
  // "já conferiu tudo" que ela não entende. Quem chega depois entra na sessão que já existe.
  const aberta = await prisma.conferenciaPeca.findFirst({
    where: { opId: op.id, status: STATUS.ABERTA },
    select: { id: true, iniciadaPorNome: true },
  });
  if (aberta) return NextResponse.json({ success: true, id: aberta.id, jaAberta: true, por: aberta.iniciadaPorNome });

  const quem = autorDe(user);
  const nova = await prisma.conferenciaPeca.create({
    data: {
      opId: op.id, opNumero: op.numero, status: STATUS.ABERTA,
      iniciadaPorId: quem.id, iniciadaPorNome: quem.nome,
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: quem.id, action: "INICIAR_CONFERENCIA_PECA",
      entity: "ConferenciaPeca", entityId: nova.id,
      diff: { op: op.numero, por: quem.nome },
    },
  }).catch(() => {});

  registro.info(`OP ${op.numero}: conferência ${nova.id} aberta por ${quem.nome || "?"}`);
  return NextResponse.json({ success: true, id: nova.id });
}
