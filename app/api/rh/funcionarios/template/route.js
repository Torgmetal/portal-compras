// GET /api/rh/funcionarios/template — gera planilha modelo para importação
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    // Buscar setores e cargos existentes pra colocar como referência
    const [setores, cargos] = await Promise.all([
      prisma.setor.findMany({ where: { ativo: true }, select: { nome: true }, orderBy: { nome: "asc" } }),
      prisma.cargo.findMany({ where: { ativo: true }, select: { nome: true }, orderBy: { nome: "asc" } }),
    ]);

    const wb = XLSX.utils.book_new();

    // ── Aba principal: Funcionários ──────────────────────
    const header = [
      "Nome", "CPF", "RG", "Data Nascimento", "Email", "Telefone",
      "Endereço", "Cidade/UF", "Matrícula", "Data Admissão",
      "Setor", "Cargo", "Salário", "Tipo Contrato", "Jornada (h/sem)",
      "Turno", "Observação",
      "PIS", "Empresa", "Banco", "Agência", "Conta", "Chave PIX",
    ];

    // Linha de exemplo
    const exemplo = [
      "João da Silva", "123.456.789-00", "12.345.678-9", "15/03/1990",
      "joao@email.com", "(11) 99999-0000", "Rua A, 123", "São Paulo/SP",
      "001", "02/01/2024", "Produção", "Soldador", "3500",
      "CLT", "44", "Produção 1", "",
      "123.45678.90-1", "TORG Metal", "Banco do Brasil", "1234-5", "12345-6", "joao@email.com",
    ];

    const wsFuncs = XLSX.utils.aoa_to_sheet([header, exemplo]);

    // Larguras das colunas
    wsFuncs["!cols"] = [
      { wch: 25 }, // Nome
      { wch: 16 }, // CPF
      { wch: 14 }, // RG
      { wch: 14 }, // Data Nasc
      { wch: 25 }, // Email
      { wch: 16 }, // Telefone
      { wch: 30 }, // Endereço
      { wch: 16 }, // Cidade/UF
      { wch: 10 }, // Matrícula
      { wch: 14 }, // Data Admissão
      { wch: 18 }, // Setor
      { wch: 20 }, // Cargo
      { wch: 12 }, // Salário
      { wch: 14 }, // Tipo Contrato
      { wch: 14 }, // Jornada
      { wch: 16 }, // Turno
      { wch: 25 }, // Observação
      { wch: 16 }, // PIS
      { wch: 16 }, // Empresa
      { wch: 18 }, // Banco
      { wch: 10 }, // Agência
      { wch: 12 }, // Conta
      { wch: 20 }, // Chave PIX
    ];

    XLSX.utils.book_append_sheet(wb, wsFuncs, "Funcionários");

    // ── Aba de referência: Instruções ────────────────────
    const instrucoes = [
      ["INSTRUÇÕES DE PREENCHIMENTO"],
      [],
      ["Campo", "Obrigatório", "Formato", "Observação"],
      ["Nome", "SIM", "Texto", "Nome completo do funcionário"],
      ["CPF", "Não", "000.000.000-00", "Se informado, não pode repetir"],
      ["RG", "Não", "Texto", ""],
      ["Data Nascimento", "Não", "DD/MM/AAAA", ""],
      ["Email", "Não", "email@dominio.com", ""],
      ["Telefone", "Não", "Texto", ""],
      ["Endereço", "Não", "Texto", ""],
      ["Cidade/UF", "Não", "Texto", "Ex: São Paulo/SP"],
      ["Matrícula", "Não", "Texto", "Se informada, não pode repetir"],
      ["Data Admissão", "SIM", "DD/MM/AAAA", "Data de início na empresa"],
      ["Setor", "SIM", "Texto", "Nome do setor. Se não existir, será criado automaticamente"],
      ["Cargo", "SIM", "Texto", "Nome do cargo. Se não existir, será criado automaticamente"],
      ["Salário", "Não", "Número", "Valor mensal bruto (ex: 3500)"],
      ["Tipo Contrato", "Não", "Texto", "CLT (padrão), PJ, Estágio, Jovem Aprendiz, Temporário"],
      ["Jornada", "Não", "Número", "Horas semanais (padrão: 44)"],
      ["Turno", "Não", "Texto", "Administrativo, Produção 1, Produção 2, Noturno"],
      ["Observação", "Não", "Texto", ""],
      ["PIS", "Não", "Número", "PIS/PASEP — necessário p/ o Controle de Ponto (casa as marcações do ACJEF)"],
      ["Empresa", "Não", "Texto", "Empresa empregadora (ex: TORG Metal, VMI)"],
      ["Banco", "Não", "Texto", "Dados bancários (opcional)"],
      ["Agência", "Não", "Texto", ""],
      ["Conta", "Não", "Texto", ""],
      ["Chave PIX", "Não", "Texto", "CPF, e-mail, telefone ou chave aleatória"],
    ];

    const wsInst = XLSX.utils.aoa_to_sheet(instrucoes);
    wsInst["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsInst, "Instruções");

    // ── Aba de referência: Setores e Cargos existentes ──
    const maxLen = Math.max(setores.length, cargos.length, 1);
    const refData = [["Setores cadastrados", "Cargos cadastrados"]];
    for (let i = 0; i < maxLen; i++) {
      refData.push([setores[i]?.nome || "", cargos[i]?.nome || ""]);
    }
    if (setores.length === 0 && cargos.length === 0) {
      refData.push(["(nenhum — serão criados na importação)", "(nenhum — serão criados na importação)"]);
    }

    const wsRef = XLSX.utils.aoa_to_sheet(refData);
    wsRef["!cols"] = [{ wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsRef, "Referência");

    // Gerar buffer
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const buf = Buffer.from(out);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelo-funcionarios-torg.xlsx"',
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
