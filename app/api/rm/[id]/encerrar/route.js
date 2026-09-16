import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { podeCancelarRM, podeForcarCancelamentoRM } from "@/lib/permissao-rm";


const schema = z.object({
  motivo: z.string().min(1),
  force: z.boolean().optional(),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Sessão expirada. Entre de novo." }, { status: 401 });
  }
  // ⚠ 401 acima (sem sessão) e 403 aqui (sem a permissão) são problemas diferentes — quem recebe
  // 403 precisa pedir a permissão a um admin, não tentar entrar de novo.
  if (!podeCancelarRM(user)) {
    return NextResponse.json({ error: "Você não tem permissão para cancelar RMs." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Motivo do cancelamento e obrigatorio." }, { status: 400 });
  }

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: { itens: { select: { id: true, status: true } } },
  });
  if (!rm) return NextResponse.json({ error: "RM não encontrada." }, { status: 404 });
  if (rm.status === "CANCELADA") {
    return NextResponse.json({ error: "RM já está cancelada." }, { status: 409 });
  }
  // PEDIDO_GERADO bloqueia por padrao, mas com force=true ADMIN pode cancelar
  if (rm.status === "PEDIDO_GERADO" && !body.force) {
    return NextResponse.json({
      error: "Esta RM já gerou pedido no Omie. Cancelar aqui não cancela no Omie — você precisa cancelar manualmente lá também.",
      requiresForce: true,
    }, { status: 409 });
  }
  // ⚠⚠ FORÇAR SOBRE PEDIDO JÁ GERADO CONTINUA SENDO SÓ DO ADMIN. O estrago deste caso não mora no
  // portal: o pedido segue vivo no Omie e alguém precisa ir lá cancelar à mão. A permissão fina
  // cobre o caso do dia a dia — RM criada errada ou duplicada, ainda sem pedido; deixá-la
  // atravessar esse aviso transformaria "cancelar uma RM" em "descolar o portal do ERP".
  if (rm.status === "PEDIDO_GERADO" && body.force && !podeForcarCancelamentoRM(user)) {
    return NextResponse.json({
      error: "Esta RM já gerou pedido no Omie — só um administrador pode forçar o cancelamento, e o pedido precisa ser cancelado no Omie também.",
    }, { status: 403 });
  }

  // Itens ainda nao finalizados sao cancelados com o motivo do encerramento
  const itensPraCancelar = rm.itens.filter((i) =>
    i.status === "PENDENTE" || i.status === "EM_COTACAO" || i.status === "COTADO"
  );

  await prisma.$transaction(async (tx) => {
    if (itensPraCancelar.length > 0) {
      await tx.rMItem.updateMany({
        where: { id: { in: itensPraCancelar.map((i) => i.id) } },
        data: {
          status: "CANCELADO",
          canceladoMotivo: `Encerramento da RM: ${body.motivo}`,
          canceladoEm: new Date(),
        },
      });
    }
    await tx.rM.update({
      where: { id: params.id },
      data: { status: "CANCELADA", observacao: rm.observacao ? `${rm.observacao} | Encerrada: ${body.motivo}` : `Encerrada: ${body.motivo}` },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "encerrar_rm",
        entity: "RM",
        entityId: params.id,
        // ⚠ Registra por qual permissão passou: agora existem dois caminhos até aqui, e
        // "quem cancelou e com que direito" é a pergunta que a auditoria vai fazer.
        diff: { motivo: body.motivo, itensCancelados: itensPraCancelar.length, permissao: user.tipo === "ADMIN" ? "ADMIN" : "podeCancelarRM", forcado: rm.status === "PEDIDO_GERADO" },
      },
    });
  });

  return NextResponse.json({ ok: true, itensCancelados: itensPraCancelar.length });
}
