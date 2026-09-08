import { NextResponse } from "next/server";
import {criarExcelTabular} from "@/lib/excel-tabular";
import {bufferWorkbookTorg} from "@/lib/excel-relatorio";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { dispArquivo } from "@/lib/arquivo-http";

// Exporta o Fluxo de Caixa em Excel por período + filtros (banco, categoria,
// fornecedor, tipo, situação). Consulta o banco direto — qualquer período.
export const maxDuration = 60;

const fmtDataBR = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "FINANCEIRO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const hoje = new Date();
  const padrao90 = new Date(hoje.getTime() - 90 * 86400000);
  const de  = searchParams.get("de")  ? new Date(searchParams.get("de") + "T00:00:00.000-03:00") : padrao90;
  const ate = searchParams.get("ate") ? new Date(searchParams.get("ate") + "T23:59:59.999-03:00") : hoje;
  const banco      = searchParams.get("banco")      || null;
  const categoria  = searchParams.get("categoria")  || null;
  const fornecedor = searchParams.get("fornecedor") || null;
  const tipo       = searchParams.get("tipo")       || null;   // ENTRADA | SAIDA
  const situacao   = searchParams.get("situacao")   || null;   // real | prev

  if(Number.isNaN(de.getTime())||Number.isNaN(ate.getTime())||de>ate)return NextResponse.json({error:"Informe um período válido para exportar."},{status:400});

  const where = { data: { gte: de, lte: ate } };
  if (banco)      where.contaCorrente = banco;
  if (categoria)  where.categoria = categoria;
  if (fornecedor) where.contraparte = fornecedor;
  if (tipo)       where.tipo = tipo;
  if (situacao === "real") where.realizado = true;
  if (situacao === "prev") where.realizado = false;

  const linhas = await prisma.fluxoCaixa.findMany({
    where,
    orderBy: { data: "asc" },
    include: { op: { select: { numero: true, cliente: true } } },
  });

  const entradas=linhas.filter(f=>f.tipo==="ENTRADA").reduce((n,f)=>n+(f.valor||0),0);
  const saidas=linhas.filter(f=>f.tipo!=="ENTRADA").reduce((n,f)=>n+(f.valor||0),0);
  const wb=await criarExcelTabular({titulo:"Fluxo de caixa",subtitulo:[`${fmtDataBR(de)} a ${fmtDataBR(ate)}`,banco,categoria,fornecedor,tipo,situacao].filter(Boolean).join(" · "),codigoDoc:"REL-FIN-001",abas:[
    {nome:"Fluxo de Caixa",headers:["Data","Tipo","Situação","Banco","Categoria","Fornecedor/Cliente","Descrição","OP","Valor (R$)"],
      linhas:linhas.map(f=>[f.data?new Date(f.data):null,f.tipo==="ENTRADA"?"Entrada":"Saída",f.realizado?"Realizado":"Previsto",f.contaCorrente||"",(f.transferencia?"[Transf.] ":"")+(f.categoria||""),f.contraparte||"",f.descricao||"",f.op?.numero||"",(f.tipo==="ENTRADA"?1:-1)*(f.valor||0)]),
      totais:["TOTAL","","","","","","","",entradas-saidas],larguras:[16,14,16,24,30,36,48,12,20],formatos:{1:"dd/mm/yyyy",9:'"R$" #,##0.00'}},
    {nome:"Resumo",headers:["Movimento","Valor (R$)"],linhas:[["Entradas",entradas],["Saídas",-saidas],["Saldo do período",entradas-saidas]],larguras:[38,28],formatos:{2:'"R$" #,##0.00'}}
  ]});
  const buf=await bufferWorkbookTorg(wb);
  const nome = `fluxo-caixa_${searchParams.get("de") || ""}_${searchParams.get("ate") || ""}.xlsx`.replace(/__+/g, "_");
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": dispArquivo(nome, "attachment"),
    },
  });
}
