// Reconciliação CMR entre a planilha do SharePoint e o portal (ambos chaveados pelo ÍNDICE R):
//   - Excel → portal: rastreio digitado direto na planilha do servidor entra no portal.
//   - portal → Excel: lançamento do portal que não está na planilha é anexado (recuperação
//     de um append que tenha falhado).
//   POST { ano, dryRun } — dryRun só devolve os números.
// Não sincroniza EDIÇÕES de linhas já existentes (mesmo índice R dos dois lados = mantém).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CMR_CAT, prefixoAno, mapearLancamento, aprenderReferencias } from "@/lib/cmr";
import { lerLinhasCmr, appendLinhasCmr } from "@/lib/cmr-sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];
const so = (v) => (v == null ? "" : String(v).trim());

// DB guarda o R/RC no início da observação como "Tipo: R | resto".
function parseObs(observacao) {
  const s = so(observacao);
  const m = s.match(/^Tipo:\s*(RC|R)\b\s*(\|\s*)?/i);
  return m ? { rc: m[1].toUpperCase(), obs: s.slice(m[0].length).trim() } : { rc: "", obs: s };
}

const schema = z.object({ ano: z.number().int().optional(), dryRun: z.boolean().optional() });

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json().catch(() => ({}))); } catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const ano = body.ano || new Date().getFullYear();
  const pre = prefixoAno(ano);
  const dryRun = !!body.dryRun;

  try {
    // Estado dos dois lados, chaveado por índice R.
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

    const dbSet = new Set(dbRows.map((r) => so(r.importRef)));
    const sheetSet = new Set(sheet.map((r) => so(r.indiceR)).filter(Boolean));

    // Excel → portal: linhas com índice R que o portal não tem. Sem índice R = não dá pra chavear.
    const doExcel = sheet.filter((r) => r.indiceR && !dbSet.has(r.indiceR));
    const semIndice = sheet.filter((r) => !r.indiceR).length;
    // portal → Excel: lançamentos do portal que faltam na planilha.
    const doPortal = dbRows.filter((r) => !sheetSet.has(so(r.importRef)));

    const resumo = {
      ano,
      planilhaLinhas: sheet.length,
      portalLinhas: dbRows.length,
      importarDoExcel: doExcel.length,
      enviarAoExcel: doPortal.length,
      ignoradasSemIndice: semIndice,
      erros: [],
    };
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, ...resumo });

    // 1) Excel → portal: cria os que faltam (origem marcada como vinda da planilha).
    let importados = 0;
    for (const r of doExcel) {
      try {
        const data = mapearLancamento(r, r.indiceR, user.id);
        data.origem = "planilha_sharepoint";
        await prisma.documentoQualidade.create({ data });
        importados++;
      } catch (e) { resumo.erros.push(`importar ${r.indiceR}: ${e.message}`); }
    }
    await aprenderReferencias(doExcel).catch(() => {});

    // 2) portal → Excel: anexa os que faltam na planilha (best-effort).
    let enviados = 0;
    if (doPortal.length) {
      const linhas = doPortal.map((r) => {
        const { rc, obs } = parseObs(r.observacao);
        return {
          rc, indiceR: so(r.importRef), descricao: so(r.nome), certificado: so(r.numeroDocumento),
          loteCorrida: so(r.numeroCorrida), especificacao: so(r.norma), pedidoCompra: so(r.pedidoCompra),
          dataRecebimento: r.dataRecebimento, nf: so(r.nfNumero), fornecedor: so(r.fornecedor),
          obra: so(r.opNumero), qtd: r.quantidade, pesoLitro: r.pesoKg, observacao: obs,
        };
      });
      try { const rr = await appendLinhasCmr(ano, linhas); enviados = rr.anexadas || 0; }
      catch (e) { resumo.erros.push(`enviar ao Excel: ${e.message}`); }
    }

    resumo.importados = importados;
    resumo.enviados = enviados;
    await prisma.auditLog.create({ data: { userId: user.id, action: "CMR_RECONCILIAR", entity: "DocumentoQualidade", entityId: String(importados + enviados), diff: resumo } }).catch(() => {});
    return NextResponse.json({ success: true, ...resumo });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 502 });
  }
}
