// GET — os instrumentos calibrados, para o inspetor marcar o que está usando.
//
// Vitor (21/08/2026): "além de informar a peça e a OP, ele seleciona os equipamentos que está
// usando para compor no relatório".
//
// A fonte é a mesma do módulo de Calibração — os certificados de EQUIPAMENTOS do Controle de
// Documentos. Nada de segundo cadastro: instrumento em duas listas é instrumento que some de uma
// delas quando renova o certificado.
//
// ⚠ Vencido NÃO é escondido da lista. Se sumisse, o inspetor procuraria o instrumento, não acharia
// e usaria assim mesmo sem registrar — e o relatório sairia sem dizer com o que foi medido.
// Aparece marcado, e o portal avisa.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const docs = await prisma.documentoQualidade.findMany({
    where: { ativo: true, categoria: "EQUIPAMENTOS" },
    select: { id: true, nome: true, numeroDocumento: true, dataValidade: true, fornecedor: true },
    orderBy: { nome: "asc" },
  });

  const hoje = new Date();
  const equipamentos = docs.map((d) => ({
    id: d.id,
    nome: d.nome,
    certificado: d.numeroDocumento || null,
    validade: d.dataValidade ? d.dataValidade.toISOString().slice(0, 10) : null,
    laboratorio: d.fornecedor || null,
    vencido: !!(d.dataValidade && d.dataValidade < hoje),
  }));

  return NextResponse.json({ equipamentos });
}
