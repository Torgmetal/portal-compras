import {refinarModeloImportacao} from "@/lib/excel-tabular";
import {bufferWorkbookTorg} from "@/lib/excel-relatorio";
// GET /api/rh/cargos/template — gera planilha modelo para importação de cargos
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    const wb = XLSX.utils.book_new();

    // ── Aba principal: Cargos ───────────────────────
    const header = ["Nome", "Nível", "Categoria", "Salário Base", "Salário Médio", "Salário Máximo", "CBO"];
    const exemplo = ["Soldador", "Operacional", "Produção", "3500", "7242-05"];

    const ws = XLSX.utils.aoa_to_sheet([header, exemplo]);
    ws["!cols"] = [{ wch: 25 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Cargos");

    // ── Aba de instruções ───────────────────────────
    const instrucoes = [
      ["INSTRUÇÕES DE PREENCHIMENTO"],
      [],
      ["Campo", "Obrigatório", "Formato", "Observação"],
      ["Nome", "SIM", "Texto", "Nome do cargo. Não pode repetir."],
      ["Nível", "Não", "Texto", "Operacional, Técnico, Supervisão, Gerência ou Diretoria"],
      ["Categoria", "Não", "Texto", "Agrupamento livre. Ex: Produção, Administrativo, Engenharia"],
      ["Salário Base", "Não", "Número", "Piso da faixa, mensal bruto (ex: 3500)"],
      ["Salário Médio", "Não", "Número", "Referência da faixa (ex: 4100)"],
      ["Salário Máximo", "Não", "Número", "Teto da faixa (ex: 4600)"],
      ["CBO", "Não", "Texto", "Código Brasileiro de Ocupações. Ex: 7242-05"],
    ];

    const wsInst = XLSX.utils.aoa_to_sheet(instrucoes);
    wsInst["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 55 }];
    XLSX.utils.book_append_sheet(wb, wsInst, "Instruções");

    const out = await bufferWorkbookTorg(await refinarModeloImportacao(wb,{titulo:"Modelo de cargos — RH"}));
    const buf = Buffer.from(out);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelo-cargos-torg.xlsx"',
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
