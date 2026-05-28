// GET /api/rh/setores/template — gera planilha modelo para importação de setores
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    const wb = XLSX.utils.book_new();

    // ── Aba principal: Setores ──────────────────────
    const header = ["Nome", "Sigla", "Cor (hex)"];
    const exemplo = ["Produção", "PROD", "#006EAB"];

    const ws = XLSX.utils.aoa_to_sheet([header, exemplo]);
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "Setores");

    // ── Aba de instruções ───────────────────────────
    const instrucoes = [
      ["INSTRUÇÕES DE PREENCHIMENTO"],
      [],
      ["Campo", "Obrigatório", "Formato", "Observação"],
      ["Nome", "SIM", "Texto", "Nome do setor. Não pode repetir."],
      ["Sigla", "Não", "Texto (máx 6)", "Abreviação curta. Ex: PROD, ADM, ENG"],
      ["Cor (hex)", "Não", "#RRGGBB", "Cor de identificação. Ex: #006EAB. Padrão: azul Torg"],
    ];

    const wsInst = XLSX.utils.aoa_to_sheet(instrucoes);
    wsInst["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsInst, "Instruções");

    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const buf = Buffer.from(out);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelo-setores-torg.xlsx"',
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
