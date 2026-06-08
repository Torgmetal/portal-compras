// Utilitário para criar compromissos vinculados a uma tarefa.
// Busca usuários ativos do setor e cria um Compromisso por pessoa.
// Best-effort: falhas não propagam.
import { prisma } from "@/lib/prisma";

// Mapeamento setor da tarefa → modulo do sistema
const SETOR_MODULO = {
  PRODUCAO: "PRODUCAO",
  PINTURA: "PRODUCAO",
  PCP: "PRODUCAO",
  EXPEDICAO: "EXPEDICAO",
  COMERCIAL: "COMERCIAL",
  ENGENHARIA: "ENGENHARIA",
  COMPRAS: "COMPRAS",
  ALMOXARIFADO: "ALMOXARIFADO",
  FINANCEIRO: "FINANCEIRO",
  RH: "RH",
  PLANEJAMENTO: "PLANEJAMENTO",
};

/**
 * Cria compromissos para todos os usuários de um setor a partir de uma tarefa.
 * @param {object} tarefa — record de TarefaPlanejamento (precisa de id, titulo, setor, opNumero, prioridade, semanaIso, ano)
 * @param {string} criadoPorId — id do usuário que disparou a criação
 * @returns {{ criados: number, usuarios: string[] }}
 */
export async function criarCompromissosDaTarefa(tarefa, criadoPorId) {
  try {
    const modulo = SETOR_MODULO[tarefa.setor] || tarefa.setor;

    // Busca usuários ativos do módulo (exceto admins para não poluir agenda de todos)
    const usuarios = await prisma.user.findMany({
      where: {
        ativo: true,
        modulos: { some: { modulo } },
      },
      select: { id: true, name: true },
    });

    if (usuarios.length === 0) return { criados: 0, usuarios: [] };

    // Calcula a data do compromisso a partir da semana ISO
    const data = dataInicioSemana(tarefa.semanaIso, tarefa.ano);

    // Evita duplicata: não cria se já existe compromisso para essa tarefa + usuário
    const existentes = await prisma.compromisso.findMany({
      where: { tarefaId: tarefa.id },
      select: { userId: true },
    });
    const jaTemSet = new Set(existentes.map((c) => c.userId));
    const novos = usuarios.filter((u) => !jaTemSet.has(u.id));

    if (novos.length === 0) return { criados: 0, usuarios: [] };

    await prisma.compromisso.createMany({
      data: novos.map((u) => ({
        titulo: tarefa.titulo,
        descricao: tarefa.observacao || null,
        data,
        userId: u.id,
        tarefaId: tarefa.id,
        opNumero: tarefa.opNumero || null,
        setor: tarefa.setor,
        prioridade: tarefa.prioridade || "MEDIA",
        criadoPorId,
      })),
    });

    return { criados: novos.length, usuarios: novos.map((u) => u.name) };
  } catch (e) {
    console.error("[compromissos] falha ao criar:", e?.message);
    return { criados: 0, usuarios: [], error: e?.message };
  }
}

/** Converte semana ISO + ano em uma Date (segunda-feira da semana). */
function dataInicioSemana(semanaIso, ano) {
  // Janeiro 4 sempre cai na semana 1 do ISO
  const jan4 = new Date(ano, 0, 4);
  const diaSemanaJan4 = (jan4.getDay() + 6) % 7; // 0=seg, 6=dom
  const segundaSemana1 = new Date(jan4);
  segundaSemana1.setDate(jan4.getDate() - diaSemanaJan4);
  const resultado = new Date(segundaSemana1);
  resultado.setDate(resultado.getDate() + (semanaIso - 1) * 7);
  resultado.setHours(8, 0, 0, 0);
  return resultado;
}
