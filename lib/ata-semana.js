// Acha a ata de uma semana (numero = semana ISO → uma ata por semana) ou cria o
// rascunho dela. Usado pelo desdobramento (ao responder, manda a nova tarefa pra
// ata da semana do prazo) e pela criação de ata (pra não duplicar a semana).
import { prisma } from "@/lib/prisma";

/**
 * @param {import("@prisma/client").PrismaClient} db - prisma ou tx de transação
 * @param {{ ano:number, semana:number, envolvidos?:any[], createdById?:string|null, titulo?:string|null }} opts
 * @returns {Promise<{ id:string, numero:number, semanaIso:number, ano:number, status:string, criada:boolean }>}
 */
export async function acharOuCriarAtaDaSemana(db, { ano, semana, envolvidos = [], createdById = null, titulo = null }) {
  const cli = db || prisma;
  // Prefere um RASCUNHO da semana (é onde faz sentido acrescentar tarefa); se só
  // houver enviada, reaproveita ela mesmo assim (uma ata por semana).
  const existentes = await cli.ataReuniao.findMany({
    where: { ano, semanaIso: semana },
    orderBy: { createdAt: "asc" },
    select: { id: true, numero: true, semanaIso: true, ano: true, status: true },
  });
  if (existentes.length) {
    const rascunho = existentes.find((a) => a.status === "RASCUNHO");
    return { ...(rascunho || existentes[0]), criada: false };
  }

  const nova = await cli.ataReuniao.create({
    data: {
      numero: semana,
      semanaIso: semana,
      ano,
      titulo: (titulo && titulo.trim()) || `Reunião semanal — semana ${semana}/${ano}`,
      status: "RASCUNHO",
      envolvidos: Array.isArray(envolvidos) ? envolvidos : [],
      createdById: createdById || null,
    },
    select: { id: true, numero: true, semanaIso: true, ano: true, status: true },
  });
  return { ...nova, criada: true };
}
