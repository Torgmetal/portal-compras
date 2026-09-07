// GET /api/rh/ponto/[id]/export → .xlsx com os totais por funcionário (contabilidade).
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {criarExcelTabular} from "@/lib/excel-tabular";
import {bufferWorkbookTorg} from "@/lib/excel-relatorio";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export async function GET(_req, { params }) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const ponto = await prisma.pontoCompetencia.findUnique({
    where: { id: params.id },
    include: { itens: { orderBy: [{ nome: "asc" }, { pisArquivo: "asc" }] } },
  });
  if (!ponto) return NextResponse.json({ error: "Competência não encontrada" }, { status: 404 });

  const head = ["PIS", "Empresa", "Funcionário", "Dias", "HE 50%", "HE 100%", "Faltas", "Atrasos", "Adic. Noturno", "DSR", "Ajuda de Custo", "Observação"];
  const linhas = ponto.itens.map((it) => [
    it.pisArquivo, it.empresa || "", it.nome || "(não vinculado)", Array.isArray(it.marcacoes) ? it.marcacoes.length : "",
    r2(it.horasExtras50), r2(it.horasExtras100), r2(it.faltas), r2(it.atrasos),
    r2(it.adicionalNoturno), r2(it.dsr), r2(it.ajudaCusto), it.observacao || "",
  ]);

  const wb=await criarExcelTabular({titulo:`Ponto — ${ponto.competencia}`,subtitulo:ponto.empresa||"",codigoDoc:"REL-RH-002",abas:[{nome:"Ponto",headers:head,linhas,larguras:[18,20,38,10,14,14,14,14,18,14,18,40],formatos:{5:"#,##0.00",6:"#,##0.00",7:"#,##0.00",8:"#,##0.00",9:"#,##0.00",10:"#,##0.00",11:"#,##0.00"}}]});
  const buf=Buffer.from(await bufferWorkbookTorg(wb));
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": dispArquivo(`ponto-${ponto.competencia}.xlsx`, "attachment"),
    },
  });
}
