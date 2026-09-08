// GET /api/rh/folha/[id]/export → .xlsx (aba Folha completa + aba Resumo agrupado
// por empresa/centro de custo, com salário e horas extras separados). Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcDerivados, resumo } from "@/lib/folha-calc";
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

  const folha = await prisma.folhaCompetencia.findUnique({
    where: { id: params.id },
    include: { itens: { orderBy: [{ empresa: "asc" }, { tipoContrato: "asc" }, { nome: "asc" }] } },
  });
  if (!folha) return NextResponse.json({ error: "Competência não encontrada" }, { status: 404 });


  // Aba Folha — horas (do Ponto) + valores calculados + Salário Final
  const head = ["Empresa", "Tipo", "Centro de Custo", "Nome", "CPF", "Salário Base",
    "HE 50% (h)", "HE 60% (h)", "HE 80% (h)", "HE 100% (h)", "HE 150% (h)", "Ad. Noturno (h)", "Faltas (h)", "Atrasos (h)",
    "Valor-hora", "Valor HE", "Ad. Noturno", "Adicionais", "Desc. Faltas", "Desc. Atrasos", "Descontos",
    "Base INSS", "INSS", "INSS Patronal", "Base IRRF", "IRRF", "FGTS", "Salário Final", "VR", "iFOOD", "KR", "Rescisão"];
  const linhas = folha.itens.map((it) => {
    const d = calcDerivados(it);
    return [it.empresa || "", it.tipoContrato, it.centroCusto || "", it.nome, it.cpf || "", r2(it.salarioBase),
      r2(it.heHoras50), r2(it.heHoras60), r2(it.heHoras80), r2(it.heHoras100), r2(it.heHoras150), r2(it.adNoturnoHoras), r2(it.faltasHoras), r2(it.atrasosHoras),
      r2(d.valorHora), r2(d.heValorTotal), r2(d.adNoturnoValor), r2(it.adicionais), r2(d.faltasValor), r2(d.atrasosValor), r2(it.descontos),
      r2(d.baseInss), r2(it.inss), r2(d.inssPatronal), r2(d.baseIrrf), r2(it.irrf), r2(d.fgts), r2(d.salarioFinal), r2(it.vr), r2(it.ifood), r2(it.kr), r2(it.rescisao)];
  });
  // Aba Resumo — agrupado por empresa/centro de custo/tipo
  const { total, grupos } = resumo(folha.itens);
  const hr = ["Empresa", "Centro de Custo", "Tipo", "Qtd", "Salário", "Valor HE", "Adicionais", "Faltas", "Atrasos", "Descontos", "Salário Final", "FGTS", "INSS Patronal"];
  const rLinhas = grupos.map((g) => [g.empresa, g.centroCusto, g.tipoContrato, g.qtd,
    r2(g.salarioBase), r2(g.heValorTotal), r2(g.adicionais), r2(g.faltasValor), r2(g.atrasosValor), r2(g.descontos), r2(g.salarioFinal), r2(g.fgts), r2(g.inssPatronal)]);
  const totalLinha = ["TOTAL", "", "", "", r2(total.salarioBase), r2(total.heValorTotal), r2(total.adicionais),
    r2(total.faltasValor), r2(total.atrasosValor), r2(total.descontos), r2(total.salarioFinal), r2(total.fgts), r2(total.inssPatronal)];
  const wb=await criarExcelTabular({titulo:`Folha de pagamento — ${folha.competencia}`,codigoDoc:"REL-RH-001",abas:[
    {nome:"Folha",headers:head,linhas,formatos:Object.fromEntries(Array.from({length:27},(_,i)=>[i+6,"#,##0.00"]))},
    {nome:"Resumo",headers:hr,linhas:rLinhas,totais:totalLinha,formatos:Object.fromEntries(Array.from({length:9},(_,i)=>[i+5,"#,##0.00"]))}
  ]});
  const buf=Buffer.from(await bufferWorkbookTorg(wb));
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": dispArquivo(`folha-${folha.competencia}.xlsx`, "attachment"),
    },
  });
}
