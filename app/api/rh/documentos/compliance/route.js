// GET /api/rh/documentos/compliance — verifica conformidade CCT por funcionário e empresa
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  regrasParaFuncionario,
  regrasEmpresa,
  isSetorProducao,
  checarRegraDocumento,
  dispensadoDocumentos,
} from "@/lib/regras-documentos";

export const maxDuration = 30;

export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    // Buscar todos funcionários ativos com setor e documentos
    const funcionarios = await prisma.funcionario.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        matricula: true,
        tipoContrato: true,
        setor: { select: { id: true, nome: true } },
        cargo: { select: { nome: true } },
        documentos: {
          where: { ativo: true },
          select: {
            id: true, tipo: true, nome: true, categoria: true,
            dataEmissao: true, dataValidade: true, ativo: true,
            arquivoUrl: true, sharepointItemId: true, sharepointUrl: true,
          },
          orderBy: { nome: "asc" },
        },
      },
      orderBy: { nome: "asc" },
    });

    // Documentos da empresa (sem funcionário)
    const docsEmpresa = await prisma.documento.findMany({
      where: { funcionarioId: null, ativo: true },
      select: {
        id: true, tipo: true, nome: true, categoria: true,
        dataEmissao: true, dataValidade: true, ativo: true,
      },
    });

    // Dispensas por funcionário (NR-10/NR-33 marcados como não obrigatórios).
    const dispensasRows = await prisma.documentoDispensa.findMany({
      select: { funcionarioId: true, tipo: true, motivo: true, criadoNome: true },
    });
    const dispensaMap = new Map(); // funcionarioId -> Map(tipo -> {motivo, criadoNome})
    for (const d of dispensasRows) {
      if (!dispensaMap.has(d.funcionarioId)) dispensaMap.set(d.funcionarioId, new Map());
      dispensaMap.get(d.funcionarioId).set(d.tipo, { motivo: d.motivo, criadoNome: d.criadoNome });
    }

    // ── Compliance por funcionário ──────────────────
    const porFuncionario = [];
    let totalPendencias = 0;

    for (const func of funcionarios) {
      const setorNome = func.setor?.nome || "";
      // Terceiros (PJ — qualquer contrato não-CLT) e Diretoria não têm
      // exigência de documentos da CCT: ficam conformes por dispensa.
      const ehDiretoria = setorNome.trim().toLowerCase() === "diretoria";
      const dispensado = dispensadoDocumentos(func.tipoContrato, setorNome);
      const regras = dispensado ? [] : regrasParaFuncionario(setorNome);
      const producao = !dispensado && isSetorProducao(setorNome);
      const dispensasFunc = dispensaMap.get(func.id) || new Map();
      const itens = [];

      for (const regra of regras) {
        const regraBase = {
          tipo: regra.tipo,
          nome: regra.nome,
          categoria: regra.categoria,
          validadeMeses: regra.validadeMeses,
          referenciaCCT: regra.referenciaCCT,
          dispensavel: !!regra.dispensavel,
        };
        // Documento dispensável marcado como não obrigatório p/ este funcionário.
        if (regra.dispensavel && dispensasFunc.has(regra.tipo)) {
          const info = dispensasFunc.get(regra.tipo);
          itens.push({ regra: regraBase, encontrado: false, documento: null, status: "DISPENSADO", dispensa: info });
          continue; // não conta como pendência nem no denominador
        }
        const resultado = checarRegraDocumento(regra, func.documentos);
        itens.push({ regra: regraBase, ...resultado });
        if (resultado.status !== "OK") totalPendencias++;
      }

      // DISPENSADO fica fora das contas (não é obrigatório).
      const itensObrigatorios = itens.filter((i) => i.status !== "DISPENSADO");
      const totalRegras = itensObrigatorios.length;
      const ok = itens.filter((i) => i.status === "OK").length;
      const ausentes = itens.filter((i) => i.status === "AUSENTE").length;
      const vencidos = itens.filter((i) => i.status === "VENCIDO").length;
      const vencendo = itens.filter((i) => i.status === "VENCENDO").length;
      const dispensados = itens.filter((i) => i.status === "DISPENSADO").length;

      porFuncionario.push({
        funcionario: {
          id: func.id,
          nome: func.nome,
          matricula: func.matricula,
          setor: setorNome,
          cargo: func.cargo?.nome || "",
          producao,
          dispensado,
          motivoDispensa: dispensado ? (ehDiretoria ? "Diretoria" : "Terceiro (PJ)") : null,
        },
        totalRegras,
        ok,
        ausentes,
        vencidos,
        vencendo,
        dispensados,
        percentual: totalRegras > 0 ? Math.round((ok / totalRegras) * 100) : 100,
        itens,
        documentos: func.documentos.map((d) => ({
          id: d.id, nome: d.nome, tipo: d.tipo, categoria: d.categoria,
          dataValidade: d.dataValidade,
          temArquivo: !!(d.arquivoUrl || d.sharepointItemId),
          sharepointUrl: d.sharepointUrl,
        })),
      });
    }

    // ── Compliance da empresa ──────────────────────
    const regrasEmp = regrasEmpresa();
    const itensEmpresa = [];

    for (const regra of regrasEmp) {
      const resultado = checarRegraDocumento(regra, docsEmpresa);
      itensEmpresa.push({
        regra: {
          tipo: regra.tipo,
          nome: regra.nome,
          categoria: regra.categoria,
          validadeMeses: regra.validadeMeses,
          referenciaCCT: regra.referenciaCCT,
        },
        ...resultado,
      });
      if (resultado.status !== "OK") totalPendencias++;
    }

    const empresaOk = itensEmpresa.filter((i) => i.status === "OK").length;
    const empresaTotal = regrasEmp.length;

    // ── Resumo geral ───────────────────────────────
    const funcionariosComPendencia = porFuncionario.filter((f) => f.percentual < 100).length;
    const funcionariosConformes = porFuncionario.filter((f) => f.percentual === 100).length;
    const percentualGeral =
      porFuncionario.length > 0
        ? Math.round(
            porFuncionario.reduce((s, f) => s + f.percentual, 0) / porFuncionario.length
          )
        : 100;

    return NextResponse.json({
      success: true,
      resumo: {
        totalFuncionarios: funcionarios.length,
        funcionariosConformes,
        funcionariosComPendencia,
        percentualGeral,
        totalPendencias,
        empresa: {
          total: empresaTotal,
          ok: empresaOk,
          pendentes: empresaTotal - empresaOk,
          percentual: empresaTotal > 0 ? Math.round((empresaOk / empresaTotal) * 100) : 100,
        },
      },
      empresa: itensEmpresa,
      funcionarios: porFuncionario,
    });
  } catch (e) {
    console.error("Erro compliance:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
