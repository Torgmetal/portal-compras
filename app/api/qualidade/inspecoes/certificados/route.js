// GET /api/qualidade/inspecoes/certificados?tipo=RECEBIMENTO_ARAME&opNumero=102&q=k-71
// Os certificados do CMR que um recebimento pode conferir (Vitor, 07/10/2026: "selecionar apenas os
// certificados", sem peças).
//
// ⚠ SEM TEXTO, SÓ A CLASSE; COM TEXTO, O CMR INTEIRO. A classe (tinta, penetrante, arame) só ordena e
// estreita a primeira lista: do penetrante, só o revelador foi lançado no CMR até hoje — um filtro rígido
// esconderia justamente o lançamento com nome fora do padrão. Quem digita procura em tudo.
// ⚠ O CMR SÃO AS TRÊS ORIGENS (`DO_CMR`): a tela de lançamento do portal grava `registro_manual`, e
// esquecê-la tirou da janela do R o UDC da OP-120 (06/10/2026).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import { DO_CMR } from "@/lib/cmr-origens";
import { ehRecebimento, certificadoDaClasse, linhaDoCertificado, ordenarCertificados, ROTULO_CLASSE } from "@/lib/recebimento-certificados";

export const runtime = "nodejs";

const MAX_LISTA = 60;
const SELECT = {
  id: true, nome: true, importRef: true, indiceR: true, fornecedor: true, nfNumero: true, pedidoCompra: true,
  numeroDocumento: true, numeroCorrida: true, quantidade: true, pesoKg: true, dataValidade: true,
  dataRecebimento: true, opNumero: true, arquivoUrl: true, sharepointUrl: true, norma: true,
};

export async function GET(req) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo") || "";
  if (!ehRecebimento(tipo)) return NextResponse.json({ error: "Tipo de recebimento inválido." }, { status: 400 });
  const opNumero = (searchParams.get("opNumero") || "").trim().slice(0, 20);
  const q = (searchParams.get("q") || "").trim().slice(0, 60);

  const contem = (campo) => ({ [campo]: { contains: q, mode: "insensitive" } });
  const docs = await prisma.documentoQualidade.findMany({
    where: {
      ...DO_CMR, ativo: true,
      ...(q ? { OR: ["nome", "importRef", "numeroDocumento", "numeroCorrida", "nfNumero", "pedidoCompra", "fornecedor"].map(contem) } : {}),
    },
    select: SELECT,
    // ⚠ sem texto a classe é filtrada aqui, depois da consulta (o nome decide); os mais recentes bastam
    orderBy: [{ dataRecebimento: { sort: "desc", nulls: "last" } }],
    take: q ? 300 : 2000,
  });

  const linhas = docs.map(linhaDoCertificado).filter((l) => q || certificadoDaClasse(tipo, l.descricao));
  const certificados = ordenarCertificados(linhas, { tipo, opNumero }).slice(0, MAX_LISTA);
  return NextResponse.json({ certificados, total: linhas.length, classe: ROTULO_CLASSE[tipo] });
}
