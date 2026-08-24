import "server-only";
import { prisma } from "@/lib/prisma";

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
const n = (v) => { const x = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) ? x : null; };

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
export function mapearLancamento(l, indiceR, userId) {
  return {
    categoria: CMR_CAT,
    tipo: CMR_TIPO,
    nome: s(l.descricao) || "(sem descrição)",
    norma: s(l.especificacao) || s(l.norma),
    opNumero: s(l.obra),
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
