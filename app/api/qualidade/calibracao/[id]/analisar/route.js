// POST /api/qualidade/calibracao/[id]/analisar — lê o certificado com IA, converte
// os erros em % (base = valor nominal), checa os padrões usados (rastreabilidade) e
// pré-preenche os critérios do PO-20. ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { assertBlobUrlSegura } from "@/lib/blob-url";
import { fetchRhItemResponse } from "@/lib/sharepoint";
import { extrairCalibracao } from "@/lib/extrair-calibracao";
import { avaliarPontos, avaliarPadroes, criteriosPadrao } from "@/lib/calibracao";

export const runtime = "nodejs";
export const maxDuration = 90;

const normCT = (ct) => {
  const c = String(ct || "").split(";")[0].trim().toLowerCase();
  if (c.startsWith("application/pdf")) return "application/pdf";
  if (["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(c)) return c === "image/jpg" ? "image/jpeg" : c;
  return "application/pdf"; // assume PDF quando o servidor não informa
};

async function baixarCertificado(doc) {
  if (doc.arquivoUrl) {
    assertBlobUrlSegura(doc.arquivoUrl);
    const r = await fetch(doc.arquivoUrl);
    if (!r.ok) throw new Error("Falha ao buscar o arquivo do certificado");
    return { buf: Buffer.from(await r.arrayBuffer()), contentType: normCT(doc.arquivoTipo || r.headers.get("content-type")) };
  }
  if (doc.sharepointItemId) {
    const r = await fetchRhItemResponse(doc.sharepointItemId);
    if (!r.ok) throw new Error("Falha ao buscar o certificado no SharePoint");
    return { buf: Buffer.from(await r.arrayBuffer()), contentType: normCT(doc.arquivoTipo || r.headers.get("content-type")) };
  }
  throw new Error("Este certificado não tem arquivo para analisar.");
}

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const doc = await prisma.documentoQualidade.findUnique({ where: { id: params.id } });
  if (!doc || doc.categoria !== "EQUIPAMENTOS") return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 });
  const av = await prisma.avaliacaoCalibracao.findUnique({ where: { documentoId: doc.id } });
  if (!av) return NextResponse.json({ error: "Avaliação não iniciada" }, { status: 404 });

  let dados;
  try {
    const { buf, contentType } = await baixarCertificado(doc);
    dados = await extrairCalibracao(buf, contentType);
  } catch (e) {
    return NextResponse.json({ error: e.message || "Falha ao analisar o certificado" }, { status: 502 });
  }
  if (!dados || (!dados.pontos?.length && !dados.padroes?.length && !dados.laboratorio)) {
    return NextResponse.json({ error: "Não consegui ler os dados do certificado (arquivo ilegível ou sem tabela de pontos)." }, { status: 422 });
  }

  const resPontos = avaliarPontos(dados.pontos || [], { limitePercent: av.erroMaxPercent, empGlobalAbs: dados.empDeclarado, faixaMin: dados.faixaMin, faixaMax: dados.faixaMax });
  const resPadroes = avaliarPadroes(dados.padroes || [], dados.dataCalibracao);

  const analise = {
    laboratorio: dados.laboratorio, acreditacao: dados.acreditacao, numeroCertificado: dados.numeroCertificado,
    dataCalibracao: dados.dataCalibracao, equipamento: dados.equipamento, identificacao: dados.identificacao,
    unidade: dados.unidade, faixaMin: dados.faixaMin, faixaMax: dados.faixaMax, empDeclarado: dados.empDeclarado,
    pontos: resPontos.pontos, resumoPontos: { total: resPontos.totalPontos, avaliados: resPontos.avaliados, naoConformes: resPontos.naoConformes, piorErroPercent: resPontos.piorErroPercent, resultado: resPontos.resultado },
    padroes: resPadroes.padroes, resumoPadroes: { total: resPadroes.padroes.length, vencidos: resPadroes.vencidos, semData: resPadroes.semData },
    extraidoEm: new Date().toISOString(),
  };

  // Pré-preenche critérios do PO-20 pelo que a IA achou (o avaliador confirma).
  const base = Array.isArray(av.criterios) && av.criterios.length ? av.criterios : criteriosPadrao();
  const criterios = base.map((c) => {
    const t = (c.criterio || "").toLowerCase();
    if (/acredit/.test(t) && dados.acreditacao) return { ...c, situacao: "CONFORME", observacao: dados.acreditacao };
    if (/(erro|desvio|toler|admiss)/.test(t) && resPontos.avaliados > 0) {
      const s = resPontos.resultado === "REPROVADO" ? "NAO_CONFORME" : "CONFORME";
      return { ...c, situacao: s, observacao: `Pior erro ${resPontos.piorErroPercent.toFixed(3)}%${resPontos.naoConformes ? ` · ${resPontos.naoConformes} ponto(s) acima do limite` : " · dentro do limite"}` };
    }
    if (/(padr|rastreab)/.test(t) && resPadroes.padroes.length) {
      if (resPadroes.vencidos > 0) return { ...c, situacao: "NAO_CONFORME", observacao: `${resPadroes.vencidos} padrão(ões) vencido(s) na data da calibração` };
      if (resPadroes.semData === 0) return { ...c, situacao: "CONFORME", observacao: `${resPadroes.padroes.length} padrão(ões) na validade` };
      return { ...c, observacao: `${resPadroes.padroes.length} padrão(ões); ${resPadroes.semData} sem data de validade` };
    }
    return c;
  });

  // Completa metadados vazios (não sobrescreve o que já existe).
  const docData = {};
  if (!doc.numeroDocumento && dados.numeroCertificado) docData.numeroDocumento = dados.numeroCertificado;
  if (!doc.dataEmissao && dados.dataCalibracao) docData.dataEmissao = new Date(dados.dataCalibracao + "T12:00:00Z");
  if (Object.keys(docData).length) await prisma.documentoQualidade.update({ where: { id: doc.id }, data: docData }).catch(() => {});

  const avData = { analise, analisadoEm: new Date(), criterios };
  if (!av.laboratorio && dados.laboratorio) avData.laboratorio = dados.laboratorio;
  if (!av.identificacao && dados.identificacao) avData.identificacao = dados.identificacao;
  if (!av.faixaUso && (dados.faixaMin != null || dados.faixaMax != null)) avData.faixaUso = `${dados.faixaMin ?? "?"} a ${dados.faixaMax ?? "?"}${dados.unidade ? " " + dados.unidade : ""}`;
  await prisma.avaliacaoCalibracao.update({ where: { id: av.id }, data: avData });

  await prisma.auditLog.create({ data: { userId: user.id, action: "ANALISAR_CALIBRACAO", entity: "AvaliacaoCalibracao", entityId: doc.id, diff: { pontos: resPontos.totalPontos, naoConformes: resPontos.naoConformes, padroesVencidos: resPadroes.vencidos } } }).catch(() => {});
  return NextResponse.json({ success: true, analise, resultado: resPontos.resultado, padroesVencidos: resPadroes.vencidos });
}
