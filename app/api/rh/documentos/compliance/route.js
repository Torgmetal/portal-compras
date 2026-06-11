// GET /api/rh/documentos/compliance — verifica conformidade CCT por funcionário e empresa
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  REGRAS_DOCUMENTOS,
  regrasParaFuncionario,
  regrasEmpresa,
  isSetorProducao,
} from "@/lib/regras-documentos";

export const maxDuration = 30;

/**
 * Verifica se um documento cobre uma regra (tipo compatível e válido).
 * Retorna { encontrado, documento, status } onde status pode ser:
 *   "OK"       → doc existe e está dentro da validade (ou regra sem validade)
 *   "VENCIDO"  → doc existe mas venceu
 *   "VENCENDO" → doc existe mas vence em ≤ 30 dias
 *   "AUSENTE"  → nenhum doc desse tipo encontrado
 */
function checarRegra(regra, documentos) {
  // Buscar docs do tipo correspondente (ativo, mais recente primeiro)
  const docs = documentos
    .filter((d) => d.tipo === regra.tipo && d.ativo !== false)
    .sort((a, b) => {
      const dA = a.dataValidade ? new Date(a.dataValidade).getTime() : 0;
      const dB = b.dataValidade ? new Date(b.dataValidade).getTime() : 0;
      return dB - dA; // mais recente primeiro
    });

  if (docs.length === 0) {
    return { encontrado: false, documento: null, status: "AUSENTE" };
  }

  const doc = docs[0]; // doc mais recente/válido

  // Se a regra não exige validade (ex: Integração feita 1x)
  if (!regra.validadeMeses) {
    return { encontrado: true, documento: doc, status: "OK" };
  }

  // Se o doc não tem data de validade mas a regra exige → tratar como vencido
  if (!doc.dataValidade) {
    return { encontrado: true, documento: doc, status: "VENCIDO" };
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(doc.dataValidade);
  validade.setHours(0, 0, 0, 0);
  const dias = Math.ceil((validade - hoje) / 86400000);

  if (dias < 0) return { encontrado: true, documento: doc, status: "VENCIDO" };
  if (dias <= 30) return { encontrado: true, documento: doc, status: "VENCENDO" };
  return { encontrado: true, documento: doc, status: "OK" };
}

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

    // ── Compliance por funcionário ──────────────────
    const porFuncionario = [];
    let totalPendencias = 0;

    for (const func of funcionarios) {
      const setorNome = func.setor?.nome || "";
      // Terceiros (PJ — qualquer contrato não-CLT) e Diretoria não têm
      // exigência de documentos da CCT: ficam conformes por dispensa.
      const ehDiretoria = setorNome.trim().toLowerCase() === "diretoria";
      const dispensado = func.tipoContrato !== "CLT" || ehDiretoria;
      const regras = dispensado ? [] : regrasParaFuncionario(setorNome);
      const producao = !dispensado && isSetorProducao(setorNome);
      const itens = [];

      for (const regra of regras) {
        const resultado = checarRegra(regra, func.documentos);
        itens.push({
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

      const totalRegras = regras.length;
      const ok = itens.filter((i) => i.status === "OK").length;
      const ausentes = itens.filter((i) => i.status === "AUSENTE").length;
      const vencidos = itens.filter((i) => i.status === "VENCIDO").length;
      const vencendo = itens.filter((i) => i.status === "VENCENDO").length;

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
      const resultado = checarRegra(regra, docsEmpresa);
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
