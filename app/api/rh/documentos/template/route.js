// GET /api/rh/documentos/template — gera planilha modelo para importação de documentos
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    // Buscar funcionários ativos pra aba de referência
    const funcionarios = await prisma.funcionario.findMany({
      where: { ativo: true },
      select: { nome: true, matricula: true, setor: { select: { nome: true } } },
      orderBy: { nome: "asc" },
    });

    const wb = XLSX.utils.book_new();

    // ── Aba principal: Documentos ───────────────────
    const header = [
      "Nome do Documento", "Categoria", "Tipo", "Funcionário (nome ou matrícula)",
      "Data Emissão", "Data Validade", "Órgão Emissor", "Nº Documento", "Observação",
    ];
    const exemplo1 = [
      "ASO Periódico 2025", "Saúde / Segurança", "ASO", "João da Silva",
      "15/01/2025", "15/01/2026", "Clínica Saúde Total", "ASO-2025-001", "",
    ];
    const exemplo2 = [
      "Alvará de Funcionamento 2025", "Empresa / Licenças", "Alvará", "",
      "01/03/2025", "01/03/2026", "Prefeitura Municipal", "ALV-12345", "Renovado anualmente",
    ];
    const exemplo3 = [
      "NR-35 Reciclagem", "Saúde / Segurança", "NR-35", "Maria Oliveira",
      "10/06/2025", "10/06/2027", "SENAI", "CERT-NR35-789", "",
    ];

    const ws = XLSX.utils.aoa_to_sheet([header, exemplo1, exemplo2, exemplo3]);
    ws["!cols"] = [
      { wch: 30 }, { wch: 20 }, { wch: 16 }, { wch: 30 },
      { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 18 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Documentos");

    // ── Aba de instruções ───────────────────────────
    const instrucoes = [
      ["INSTRUÇÕES DE PREENCHIMENTO"],
      [],
      ["Campo", "Obrigatório", "Formato", "Observação"],
      ["Nome do Documento", "SIM", "Texto", "Nome descritivo. Ex: ASO Periódico 2025, Alvará 2025"],
      ["Categoria", "SIM", "Texto", "Saúde / Segurança, Pessoal, Treinamento, ou Empresa / Licenças"],
      ["Tipo", "Não", "Texto", "ASO, NR-10, NR-12, NR-33, NR-35, PPRA, PCMSO, CNH, Passaporte, Certificado, Alvará, AVCB, ISO, Licença Ambiental, Outro"],
      ["Funcionário", "Não", "Nome ou Matrícula", "Se vazio = documento da empresa. Busca por nome (parcial) ou matrícula exata"],
      ["Data Emissão", "Não", "DD/MM/AAAA", "Data em que o documento foi emitido"],
      ["Data Validade", "Não", "DD/MM/AAAA", "Data de vencimento. Essencial para controle de renovação"],
      ["Órgão Emissor", "Não", "Texto", "Quem emitiu: clínica, órgão, certificadora"],
      ["Nº Documento", "Não", "Texto", "Número ou protocolo do documento"],
      ["Observação", "Não", "Texto", "Anotações livres"],
    ];

    const wsInst = XLSX.utils.aoa_to_sheet(instrucoes);
    wsInst["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsInst, "Instruções");

    // ── Aba de referência: Funcionários + Tipos ─────
    const refHeader = ["Funcionários ativos", "Matrícula", "Setor"];
    const refRows = [refHeader];
    for (const f of funcionarios) {
      refRows.push([f.nome, f.matricula || "", f.setor?.nome || ""]);
    }
    if (funcionarios.length === 0) {
      refRows.push(["(nenhum funcionário cadastrado)", "", ""]);
    }

    const wsRef = XLSX.utils.aoa_to_sheet(refRows);
    wsRef["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsRef, "Referência");

    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const buf = Buffer.from(out);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelo-documentos-torg.xlsx"',
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
