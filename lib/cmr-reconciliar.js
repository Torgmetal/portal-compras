// Reconciliação CMR planilha (SharePoint) ↔ portal, chaveada pelo ÍNDICE R.
// LÓGICA ÚNICA usada pelo cron (/api/cron/cmr-reconciliar) E pelo botão manual
// (/api/compras/cmr/reconciliar) — pra os dois NUNCA divergirem (foi o que deu ruim:
// o cron pulava casca e o botão importava). Regras:
//   - Excel → portal: cria só linhas COM descrição. Casca (só o R reservado, sem
//     descrição) NÃO vira registro — é preenchida quando o material chega.
//   - Completa casca já existente: preenche SÓ os campos vazios do portal com o que
//     veio da planilha. Nunca sobrescreve o que já tem valor (o portal manda).
//   - portal → Excel: anexa no fim da planilha os R do portal que faltam lá (com descrição).
import { CMR_CAT, prefixoAno, mapearLancamento, aprenderReferencias } from "@/lib/cmr";
import { lerLinhasCmr, appendLinhasCmr } from "@/lib/cmr-sharepoint";

const so = (v) => (v == null ? "" : String(v).trim());
export function parseObsCmr(o) {
  const s = so(o);
  const m = s.match(/^Tipo:\s*(RC|R)\b\s*(\|\s*)?/i);
  return m ? { rc: m[1].toUpperCase(), obs: s.slice(m[0].length).trim() } : { rc: "", obs: s };
}
export const VAZIO_NOME = (v) => !so(v) || so(v) === "(sem descrição)";
// "casca" = R reservado sem NENHUMA informação (só o índice).
export function ehCascaVazia(r) {
  return VAZIO_NOME(r.nome)
    && !so(r.norma) && !so(r.opNumero) && !so(r.numeroCorrida) && !so(r.numeroDocumento)
    && !so(r.fornecedor) && !so(r.pedidoCompra) && !so(r.nfNumero)
    && !r.dataRecebimento && !r.pesoKg && !r.quantidade
    && !so(parseObsCmr(r.observacao).obs);
}

const CAMPOS = ["nome", "norma", "opNumero", "numeroCorrida", "numeroDocumento", "fornecedor",
                "pedidoCompra", "nfNumero", "dataRecebimento", "pesoKg", "quantidade"];

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} ano
 * @param {{ userId?: string|null }} [opts]
 */
export async function reconciliarCmr(prisma, ano, { userId = null } = {}) {
  const pre = prefixoAno(ano);
  const [sheet, dbRows] = await Promise.all([
    lerLinhasCmr(ano),
    prisma.documentoQualidade.findMany({
      where: { categoria: CMR_CAT, importRef: { startsWith: pre } },
      select: {
        importRef: true, nome: true, norma: true, opNumero: true, numeroCorrida: true,
        numeroDocumento: true, fornecedor: true, pedidoCompra: true, nfNumero: true,
        dataRecebimento: true, pesoKg: true, quantidade: true, observacao: true,
      },
    }),
  ]);
  const porR = new Map(dbRows.map((r) => [so(r.importRef), r]));
  const sheetSet = new Set(sheet.map((r) => so(r.indiceR)).filter(Boolean));
  const doExcel = sheet.filter((r) => r.indiceR && !porR.has(so(r.indiceR)));
  // portal → Excel: R do portal que faltam na planilha — só os que TÊM descrição (não anexa casca).
  const doPortal = dbRows.filter((r) => !sheetSet.has(so(r.importRef)) && !VAZIO_NOME(r.nome));

  // Completa cascas já existentes: preenche só os campos vazios do portal com a planilha.
  let completados = 0;
  for (const r of sheet) {
    const atual = porR.get(so(r.indiceR));
    if (!atual || !so(r.descricao)) continue;
    const d = mapearLancamento(r, r.indiceR, userId);
    const patch = {};
    for (const c of CAMPOS) {
      const novo = d[c];
      const velho = atual[c];
      const velhoVazio = c === "nome" ? VAZIO_NOME(velho) : velho == null || so(velho) === "";
      if (velhoVazio && novo != null && so(novo) !== "") patch[c] = novo;
    }
    if (!Object.keys(patch).length) continue;
    try {
      const u = await prisma.documentoQualidade.updateMany({ where: { categoria: CMR_CAT, importRef: so(r.indiceR) }, data: patch });
      completados += u.count ? 1 : 0;
    } catch {}
  }

  // Excel → portal: cria os que faltam, SÓ com descrição (casca não vira registro).
  let importados = 0;
  for (const r of doExcel) {
    if (!so(r.descricao)) continue;
    try {
      const d = mapearLancamento(r, r.indiceR, userId);
      d.origem = "planilha_sharepoint";
      await prisma.documentoQualidade.create({ data: d });
      importados++;
    } catch {}
  }
  await aprenderReferencias(doExcel).catch(() => {});

  // portal → Excel: anexa no fim da planilha.
  let enviados = 0;
  if (doPortal.length) {
    const linhas = doPortal.map((r) => {
      const { rc, obs } = parseObsCmr(r.observacao);
      return {
        rc, indiceR: so(r.importRef), descricao: so(r.nome), certificado: so(r.numeroDocumento),
        loteCorrida: so(r.numeroCorrida), especificacao: so(r.norma), pedidoCompra: so(r.pedidoCompra),
        dataRecebimento: r.dataRecebimento, nf: so(r.nfNumero), fornecedor: so(r.fornecedor),
        obra: so(r.opNumero), qtd: r.quantidade, pesoLitro: r.pesoKg, observacao: obs,
      };
    });
    try { const rr = await appendLinhasCmr(ano, linhas); enviados = rr.anexadas || 0; } catch {}
  }

  return {
    ano,
    planilhaLinhas: sheet.length,
    portalLinhas: dbRows.length,
    importados,
    completados,
    enviados,
    ignoradasSemIndice: sheet.filter((r) => !r.indiceR).length,
  };
}
