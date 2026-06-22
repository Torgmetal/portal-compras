// GET /api/diretoria/tarefas — tarefas do Planejamento ainda abertas, para a
// Diretoria acompanhar e cobrar (foco nas ATRASADAS). Gate exclusivo da Diretoria.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";

export async function GET() {
  try { await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const lista = await prisma.tarefaPlanejamento.findMany({
    where: { status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
    select: {
      id: true, titulo: true, setor: true, opNumero: true, dataPrevista: true,
      status: true, prioridade: true, responsavel: true,
      doCliente: true, clienteNome: true, clienteAvisadoEm: true, clienteRespostaEm: true,
      semanaIso: true, ano: true,
      op: { select: { cliente: true } },
    },
    take: 800,
  });

  const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
  const tarefas = lista.map((t) => {
    const prazo = t.dataPrevista ? new Date(t.dataPrevista) : null;
    const atrasada = !!(prazo && prazo < hoje);
    const diasAtraso = atrasada ? Math.round((hoje - prazo) / 86400000) : 0;
    return {
      id: t.id, titulo: t.titulo, setor: t.setor, opNumero: t.opNumero,
      dataPrevista: t.dataPrevista, status: t.status, prioridade: t.prioridade,
      responsavel: t.responsavel, doCliente: t.doCliente,
      clienteNome: t.clienteNome || t.op?.cliente || null,
      clienteAvisadoEm: t.clienteAvisadoEm, clienteRespostaEm: t.clienteRespostaEm,
      semanaIso: t.semanaIso, ano: t.ano, atrasada, diasAtraso,
    };
  });

  // atrasadas primeiro (maior atraso); depois por prazo asc; sem prazo por último
  tarefas.sort((a, b) => {
    if (a.atrasada !== b.atrasada) return a.atrasada ? -1 : 1;
    if (a.atrasada && b.atrasada) return b.diasAtraso - a.diasAtraso;
    const pa = a.dataPrevista ? new Date(a.dataPrevista).getTime() : Infinity;
    const pb = b.dataPrevista ? new Date(b.dataPrevista).getTime() : Infinity;
    return pa - pb;
  });

  const resumo = {
    total: tarefas.length,
    atrasadas: tarefas.filter((t) => t.atrasada).length,
    doCliente: tarefas.filter((t) => t.doCliente).length,
    atrasadasCliente: tarefas.filter((t) => t.atrasada && t.doCliente).length,
  };

  return NextResponse.json({ tarefas, resumo });
}
