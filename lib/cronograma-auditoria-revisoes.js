import { dataBR } from "./data-br";
import { numRAI } from "./auditoria-interna";

// HISTÓRICO DE REVISÕES DO CRONOGRAMA DE AUDITORIA.
// A revisão do documento só sobe quando ele é ENVIADO PARA ASSINATURA (Vitor, 27/08/2026) — mexer
// no cronograma durante o mês não é revisão, é rascunho. Cada envio guarda um SNAPSHOT das
// auditorias; comparando um snapshot com o anterior sai exatamente "o que mudou nesta revisão"
// (inclusão de auditoria, mudança de data/setor/responsável, exclusão). É esse comparativo que
// responde à auditoria de certificação quando ela pergunta por que o plano mudou.

// Campos que fazem parte do DOCUMENTO. `status` fica de fora de propósito: realizar uma auditoria
// é execução do plano, não revisão dele — senão toda revisão viraria uma lista de mudanças de status.
const CAMPOS = [
  { k: "setor", l: "Setor" },
  { k: "dataAuditoria", l: "Data", data: true },
  { k: "responsavelAcompanhamento", l: "Responsável" },
  { k: "escopo", l: "Escopo" },
];

const val = (a, c) => {
  const v = a?.[c.k];
  if (v == null || v === "") return "—";
  return c.data ? dataBR(v) : String(v);
};

export const rotuloAuditoria = (a) => `${numRAI(a?.numero)}${a?.setor ? ` · ${a.setor}` : ""}`;

/** Lista de auditorias → mapa por número (a chave do documento). */
const porNumero = (lista) => {
  const m = new Map();
  for (const a of Array.isArray(lista) ? lista : []) if (a?.numero != null) m.set(String(a.numero), a);
  return m;
};

/**
 * Compara dois estados do cronograma.
 * @returns {{incluidas:Array, removidas:Array, alteradas:Array, total:number}}
 */
export function diffCronograma(antes, depois) {
  const a = porNumero(antes);
  const d = porNumero(depois);
  const incluidas = [];
  const removidas = [];
  const alteradas = [];

  for (const [k, nova] of d) {
    const velha = a.get(k);
    if (!velha) { incluidas.push({ numero: nova.numero, rotulo: rotuloAuditoria(nova), data: val(nova, CAMPOS[1]), responsavel: val(nova, CAMPOS[2]) }); continue; }
    const mudancas = CAMPOS.map((c) => ({ campo: c.l, de: val(velha, c), para: val(nova, c) })).filter((m) => m.de !== m.para);
    if (mudancas.length) alteradas.push({ numero: nova.numero, rotulo: rotuloAuditoria(nova), mudancas });
  }
  for (const [k, velha] of a) if (!d.has(k)) removidas.push({ numero: velha.numero, rotulo: rotuloAuditoria(velha), data: val(velha, CAMPOS[1]) });

  const ordem = (x, y) => Number(x.numero) - Number(y.numero);
  incluidas.sort(ordem); removidas.sort(ordem); alteradas.sort(ordem);
  return { incluidas, removidas, alteradas, total: incluidas.length + removidas.length + alteradas.length };
}

/** Resumo em uma linha ("2 incluída(s) · 1 alterada(s)"). */
export function resumoDiff(diff) {
  const p = [];
  if (diff?.incluidas?.length) p.push(`${diff.incluidas.length} incluída${diff.incluidas.length > 1 ? "s" : ""}`);
  if (diff?.alteradas?.length) p.push(`${diff.alteradas.length} alterada${diff.alteradas.length > 1 ? "s" : ""}`);
  if (diff?.removidas?.length) p.push(`${diff.removidas.length} excluída${diff.removidas.length > 1 ? "s" : ""}`);
  return p.join(" · ") || "sem alteração no cronograma";
}

/** As auditorias guardadas no snapshot de um envio. */
export const auditoriasDoSnapshot = (envio) => (Array.isArray(envio?.snapshot?.auditorias) ? envio.snapshot.auditorias : []);
