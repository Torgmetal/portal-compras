// ─── O ESCOPO DE QUALIDADE DA OBRA ────────────────────────────────────────────
// Vitor (22/08/2026): "pode ser que em alguns casos não vamos fazer nada além de
// certificado de qualidade e relatório de pintura, então preciso ter essa opção
// também; e essa definição deve nascer da criação da OP".
//
// São DOIS níveis, e misturá-los foi o que sempre confundiu:
//   escopo (aqui)  → QUAIS relatórios a obra exige.        Nasce na abertura da OP.
//   PIT (§10)      → o que medir DENTRO de cada relatório. Nasce no data book.
// Ver lib/pit-escopo.js para o segundo. Este módulo não repete nada de lá.
//
// Sem isto, toda obra oferecia os cinco tipos de relatório ao inspetor — inclusive
// numa obra que só tem certificado de material e pintura. Campo que não se aplica
// e campo que esqueceram têm a mesma cara: em branco.
//
// ⚠ NULO NÃO É VAZIO. OP sem escopo definido (todas as antigas) continua com tudo
// disponível. Só quem DEFINIU restringe — senão a mudança apagaria da tela do
// inspetor relatórios de obra em andamento.

import { TIPOS_RELATORIO } from "./qualidade-campo";

// Todos entram: desde que "registro geral" virou PRÉ-MONTAGEM (22/08/2026), não há mais
// tipo solto — pré-montagem é inspeção contratada como as outras, e uma obra pode não
// tê-la.
export const TIPOS_ESCOPAVEIS = [...TIPOS_RELATORIO];
const IDS = TIPOS_ESCOPAVEIS.map((t) => t.id);

/**
 * Combinações que o comercial reconhece. O objetivo é que a abertura da OP seja um
 * clique na maioria dos casos e caia no "Personalizado" só quando o contrato pede
 * algo fora do comum.
 */
export const PRESETS = [
  {
    id: "COMPLETO", nome: "Completo",
    resumo: "Dimensional, visual de solda, ultrassom, pintura e LP",
    tipos: [...IDS],
  },
  {
    id: "ESTRUTURAL", nome: "Estrutural padrão",
    resumo: "Dimensional, visual de solda e pintura — sem ensaio volumétrico",
    tipos: ["DIMENSIONAL", "VISUAL_SOLDA", "PINTURA"],
  },
  {
    id: "PINTURA", nome: "Certificados + pintura",
    resumo: "Só certificado de material e relatório de pintura",
    tipos: ["PINTURA"],
  },
  {
    id: "CERTIFICADOS", nome: "Só certificados",
    resumo: "Nenhum relatório de inspeção — apenas os certificados no data book",
    tipos: [],
  },
];

/** Limpa o que veio da tela: só ids conhecidos, sem repetição, na ordem canônica. */
export function normalizarEscopo(entrada) {
  if (!entrada) return null;
  const bruto = Array.isArray(entrada) ? entrada : entrada.tipos;
  if (!Array.isArray(bruto)) return null;
  const tipos = IDS.filter((id) => bruto.includes(id));
  // casa com um preset quando bate exatamente — assim a tela reabre no mesmo lugar
  const preset = PRESETS.find((p) => p.tipos.length === tipos.length && p.tipos.every((t) => tipos.includes(t)));
  return { preset: preset?.id || "PERSONALIZADO", tipos };
}

/**
 * O escopo efetivo da OP.
 * `definido: false` = a obra não escolheu; tudo continua disponível.
 */
export function escopoDaOP(op) {
  const e = op?.escopoQualidade;
  const tipos = Array.isArray(e?.tipos) ? IDS.filter((id) => e.tipos.includes(id)) : null;
  if (!tipos) return { definido: false, tipos: [...IDS], preset: null };
  return { definido: true, tipos, preset: e.preset || "PERSONALIZADO" };
}

/** O tipo pode ser usado nesta obra? */
export function tipoNoEscopo(op, tipo) {
  const { definido, tipos } = escopoDaOP(op);
  return !definido || tipos.includes(tipo);
}

/** Os tipos que a tela deve oferecer nesta obra. */
export function tiposDaOP(op) {
  const { tipos } = escopoDaOP(op);
  return TIPOS_RELATORIO.filter((t) => tipos.includes(t.id));
}

// ─── REFLEXO NO DATA BOOK ─────────────────────────────────────────────────────
// Seção que existe SÓ para guardar um relatório que a obra não faz nasce "N/A" — é
// a diferença entre um data book honesto e um com buraco.
//
// ⚠ De propósito, NÃO entram aqui: §15 (certificados de tinta) porque a peça pode ser
// pintada sem relatório de pintura; e §07/§08 (EPS e soldadores) porque solda existe
// independentemente de haver ensaio de solda. Marcar essas por escopo esconderia
// documento que o cliente vai cobrar.
const SECAO_POR_TIPO = {
  "11": ["DIMENSIONAL", "PRE_MONTAGEM"],
  "12": ["VISUAL_SOLDA", "ULTRASSOM", "LP"],
  "13": ["VISUAL_SOLDA", "ULTRASSOM", "LP"], // qualificação dos inspetores de END
  "14": ["PINTURA"],
};

/** Seções que já nascem N/A para este escopo. Vazio quando a obra não definiu nada. */
export function secoesForaDoEscopo(op) {
  const { definido, tipos } = escopoDaOP(op);
  if (!definido) return [];
  return Object.entries(SECAO_POR_TIPO)
    .filter(([, exigidos]) => !exigidos.some((t) => tipos.includes(t)))
    .map(([numero]) => numero);
}

/** Texto curto para a tela da OP e para o kick-off. */
export function resumoEscopo(op) {
  const { definido, tipos } = escopoDaOP(op);
  if (!definido) return "Não definido — todos os relatórios disponíveis";
  if (!tipos.length) return "Só certificados — nenhum relatório de inspeção";
  return TIPOS_ESCOPAVEIS.filter((t) => tipos.includes(t.id)).map((t) => t.label).join(" · ");
}
