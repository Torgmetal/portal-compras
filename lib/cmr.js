import "server-only";
import { prisma } from "@/lib/prisma";
import { numeroBR } from "./numero-br";

// CMR — Controle de Materiais Rastreáveis. As entradas ficam em DocumentoQualidade
// (categoria "MATERIAL"). Índice R = `YY` + sequencial de 4 dígitos, reiniciado por ano
// (ex.: 2026 → 260001, 260002…). Aba do estoque lança aqui; concilia com as RMs.

export const CMR_CAT = "MATERIAL";
export const CMR_TIPO = "Certificado de material";

/** Prefixo do ano no índice R (2 últimos dígitos). */
export const prefixoAno = (ano) => String(Number(ano) % 100).padStart(2, "0");

/** Próximo índice R do ano (maior existente + 1). Não é 100% à prova de corrida — o insert
 *  reconfirma; em conflito raro, tenta o seguinte. */
export async function proximoIndiceR(ano) {
  const pre = prefixoAno(ano);
  const ultimo = await prisma.documentoQualidade.findFirst({
    where: { categoria: CMR_CAT, importRef: { startsWith: pre } },
    orderBy: { importRef: "desc" },
    select: { importRef: true },
  });
  const seq = ultimo ? Number(String(ultimo.importRef).slice(2)) || 0 : 0;
  return `${pre}${String(seq + 1).padStart(4, "0")}`;
}

const s = (v) => (v == null ? null : String(v).trim() || null);
// ⚠⚠ APAGAVA O PONTO SEMPRE: "35.64" virava 3564 — cem vezes maior. E o outro parser do MESMO CMR
// (lib/parse-cmr) fazia o contrário, listando "35.64" como entrada válida no comentário. Dois
// parsers do mesmo dado com regras opostas; um estava errado por definição. Agora é um só.
const n = (v) => { const x = numeroBR(v, NaN); return Number.isFinite(x) ? x : null; };

/** Converte data (Date | "dd/mm/aaaa" | "aaaa-mm-dd" | serial Excel) → Date meio-dia UTC. */
export function parseData(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const str = String(v).trim();
  if (/^\d{5}$/.test(str)) { // serial Excel
    const d = new Date(Date.UTC(1899, 11, 30) + Number(str) * 864e5);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
  }
  let m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12));
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

/** Um lançamento do form → dados do DocumentoQualidade (categoria MATERIAL). */
// ⚠⚠ A OBRA PRECISA SAIR NORMALIZADA DAQUI. A planilha escreve "OP 067" e, nas OPs de 3 dígitos,
// "OP 0105" (zero extra); o portal casa material com a obra por `opNumero` EXATO ("105"). Este
// mapeador gravava cru, então toda linha importada pelo cron entrava como "OP 0105" e nunca
// encontrava a OP — o Planejamento lia "material não comprado" no aço que estava no pátio com
// certificado. A importação manual (lib/parse-cmr.js) já normalizava; o caminho do cron, não.
// Medido em 26/08/2026: 96 registros presos na forma crua.
//
// ⚠ "RC", "R/C", "CONS.INT" NÃO SÃO OBRA — são consumo interno e retrabalho. Sem dígito, fica null,
// que é o certo: material que não pertence a obra nenhuma.
export const obraCanonica = (v) => {
  const m = String(v || "").match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) && n > 0 ? String(n).padStart(3, "0") : null;
};

export function mapearLancamento(l, indiceR, userId) {
  return {
    categoria: CMR_CAT,
    tipo: CMR_TIPO,
    nome: s(l.descricao) || "(sem descrição)",
    norma: s(l.especificacao) || s(l.norma),
    opNumero: obraCanonica(l.obra),
    numeroCorrida: s(l.corrida) || s(l.loteCorrida),
    numeroDocumento: s(l.certificado),
    fornecedor: s(l.fornecedor),
    pedidoCompra: s(l.pedidoCompra),
    nfNumero: s(l.nf) || s(l.nfNumero),
    dataRecebimento: parseData(l.dataRecebimento),
    pesoKg: n(l.pesoLitro ?? l.pesoKg),
    quantidade: n(l.qtd ?? l.quantidade),
    observacao: [l.rc ? `Tipo: ${s(l.rc)}` : "", s(l.observacao)].filter(Boolean).join(" | ") || null,
    importRef: indiceR,
    origem: "registro_manual",
    createdById: userId || null,
    arquivoUrl: s(l.arquivoUrl),
    arquivoNome: s(l.arquivoNome),
  };
}

/** Registra descrições/normas usadas nas listas de referência (autocomplete cresce sozinho). */
export async function aprenderReferencias(lancamentos) {
  const vals = new Set();
  for (const l of lancamentos) {
    const desc = s(l.descricao); if (desc) vals.add(`DESCRICAO|${desc}`);
    const norma = s(l.especificacao) || s(l.norma); if (norma) vals.add(`NORMA|${norma}`);
  }
  for (const v of vals) {
    const [tipo, valor] = v.split("|");
    await prisma.cmrReferencia.upsert({
      where: { tipo_valor: { tipo, valor } },
      create: { tipo, valor, usos: 1 },
      update: { usos: { increment: 1 } },
    }).catch(() => {});
  }
}
