// Constantes e helpers do módulo de Expedição.
// Define quais categorias de itens de OP/RM são "expedíveis" — ou seja,
// precisam ser fisicamente enviados para o canteiro de obra e devem
// aparecer no Checklist de Expedição por OP.

// Categorias de OPItem/RMItem consideradas expedíveis.
// Regra do Vitor: "todos exceto matéria prima e tintas".
// Galvanização = tratamento superficial, não item físico.
// Serviços e aluguéis = não são itens da expedição.
export const CATEGORIAS_EXPEDIVEIS = [
  "PARAFUSOS",
  "TELHAS",
  "CALHAS_RUFOS",
  "STEEL_DECK",
  "PLACA_WALL",
  // Categorias do Vendor List que podem aparecer em itens
  "GRADE_DE_PISO",
];

// Categorias explicitamente NÃO expedíveis
export const CATEGORIAS_NAO_EXPEDIVEIS = [
  "MATERIA_PRIMA",
  "TINTA",
  "GALVANIZACAO",
];

/**
 * Verifica se uma categoria de OPItem é expedível.
 * Categorias SERV_* (serviços) e ALUGUEL_* (alugueis) nunca são.
 * Categorias na lista de expedíveis: sim.
 * OUTRO: tratado como expedível por padrão (melhor ter no checklist e ignorar
 * do que não ter e esquecer de enviar).
 */
export function isExpedivel(categoriaItem) {
  if (!categoriaItem) return false;
  // Serviços e aluguéis nunca são expedíveis
  if (categoriaItem.startsWith("SERV_")) return false;
  if (categoriaItem.startsWith("ALUGUEL_")) return false;
  // Categorias na lista negra
  if (CATEGORIAS_NAO_EXPEDIVEIS.includes(categoriaItem)) return false;
  // Categorias na lista positiva
  if (CATEGORIAS_EXPEDIVEIS.includes(categoriaItem)) return true;
  // OUTRO e categorias desconhecidas: considerar expedível por segurança
  return categoriaItem === "OUTRO";
}

// Status de expedição de um item (derivado do progresso)
export function statusExpedicao(qtdTotal, qtdExpedida) {
  if (!qtdTotal || qtdTotal <= 0) return "SEM_QTD";
  if (qtdExpedida >= qtdTotal) return "EXPEDIDO";
  if (qtdExpedida > 0) return "PARCIAL";
  return "PENDENTE";
}

// Labels e cores por status
export const STATUS_EXPEDICAO = {
  EXPEDIDO: { label: "Expedido", cor: "bg-green-100 text-green-700", icon: "check" },
  PARCIAL:  { label: "Parcial",  cor: "bg-amber-100 text-amber-700", icon: "partial" },
  PENDENTE: { label: "Pendente", cor: "bg-gray-100 text-gray-500",   icon: "pending" },
  SEM_QTD:  { label: "—",        cor: "bg-gray-50 text-gray-300",    icon: "none" },
};

// Setores de produção que aparecem no fluxo de peças (PecaConjunto)
export const FLUXO_PECAS = [
  "PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO",
];

// ─── VALIDAÇÃO DE PRONTIDÃO PARA EXPEDIÇÃO ──────────────────────
// Peça precisa ter passado por JATO e PINTURA antes de poder ser expedida.
// Sem isso, NF não pode ser emitida — só com conferência física presencial.

// Setores ANTERIORES ao Jato — peça definitivamente não está pronta
const SETORES_ANTES_JATO = new Set(["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO"]);

/**
 * Verifica se uma peça passou por Jato e Pintura (pronta pra expedir).
 * @param {string} statusPeca - status atual da PecaConjunto
 * @returns {{ pronta: boolean, nivel: 'OK'|'ATENCAO'|'BLOQUEIO', mensagem: string }}
 *   - BLOQUEIO: não passou por Jato/Pintura → NF não pode ser emitida sem conferência
 *   - ATENCAO:  está em Jato ou Pintura → ainda em processo, verificar fisicamente
 *   - OK:       EXPEDIDO → pronta
 */
export function validarProntidaoExpedicao(statusPeca) {
  if (statusPeca === "EXPEDIDO") {
    return { pronta: true, nivel: "OK", mensagem: "" };
  }
  if (SETORES_ANTES_JATO.has(statusPeca)) {
    return {
      pronta: false,
      nivel: "BLOQUEIO",
      mensagem: `Peça ainda no setor ${statusPeca} — não passou por Jato e Pintura. NF não pode ser emitida sem conferência física.`,
    };
  }
  // JATO ou PINTURA — está no processo mas não concluiu
  return {
    pronta: false,
    nivel: "ATENCAO",
    mensagem: `Peça em ${statusPeca} — ainda não concluiu o acabamento. Confirme fisicamente antes de incluir na carga.`,
  };
}

// ─── AUTO-SYNC: Romaneio → ProducaoSemanal (setor Expedicao) ──────
// Quando um romaneio é criado/atualizado/excluído, recalcula o peso
// realizado do setor Expedicao no ProducaoSemanal para aquele dia/OP.

import { prisma } from "@/lib/prisma";
import { isoWeekString, parseSemana, semanaInicio, semanaFim } from "@/lib/semana";

/**
 * Normaliza um Date para meia-noite UTC (usado como chave de data no ProducaoSemanal).
 */
function normalizarData(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

/**
 * Calcula info da semana ISO a partir de uma data.
 */
function infoSemana(date) {
  const semana = isoWeekString(date);
  const p = parseSemana(semana);
  return {
    semana,
    dataInicio: semanaInicio(p.ano, p.semana),
    dataFim: semanaFim(p.ano, p.semana),
  };
}

/**
 * Recalcula o peso de expedição em ProducaoSemanal para um OP+data.
 * Soma todos os romaneios daquele OP naquele dia e faz upsert/delete.
 *
 * @param {string} opId - ID da OP
 * @param {Date} dataRomaneio - data do romaneio
 */
export async function syncExpedicaoProducao(opId, dataRomaneio) {
  if (!opId) return; // sem OP vinculada, nada a sincronizar

  const dataNorm = normalizarData(dataRomaneio);
  const dataInicioDia = new Date(Date.UTC(dataNorm.getUTCFullYear(), dataNorm.getUTCMonth(), dataNorm.getUTCDate(), 0, 0, 0));
  const dataFimDia = new Date(Date.UTC(dataNorm.getUTCFullYear(), dataNorm.getUTCMonth(), dataNorm.getUTCDate(), 23, 59, 59, 999));

  // Soma peso de todos os romaneios da OP nesse dia
  const agg = await prisma.romaneio.aggregate({
    where: {
      opId,
      data: { gte: dataInicioDia, lte: dataFimDia },
    },
    _sum: { pesoRealKg: true },
  });

  const pesoTotal = agg._sum.pesoRealKg || 0;
  const { semana, dataInicio, dataFim } = infoSemana(dataNorm);

  if (pesoTotal > 0) {
    await prisma.producaoSemanal.upsert({
      where: { data_opId_setor: { data: dataNorm, opId, setor: "Expedicao" } },
      create: {
        data: dataNorm,
        semana,
        dataInicio,
        dataFim,
        pesoRealizadoKg: pesoTotal,
        opId,
        setor: "Expedicao",
        fonte: "ROMANEIO",
      },
      update: { pesoRealizadoKg: pesoTotal },
    });
  } else {
    // Sem romaneios nesse dia pra essa OP → remove entrada de expedição (se existir)
    await prisma.producaoSemanal.deleteMany({
      where: { data: dataNorm, opId, setor: "Expedicao", fonte: "ROMANEIO" },
    });
  }
}
