// GET — os soldadores com certificação registrada, para a coluna "Soldador" do EVS.
//
// ⚠ A fonte é o Controle de Documentos (categoria FUNCIONARIOS), onde o nome do soldador está no
// VÍNCULO do certificado. Nada de segundo cadastro: quem tem certificação é quem pode soldar, e a
// lista tem de ser a mesma que o auditor consulta.
//
// ⚠ Sem certificado válido o nome NÃO some da lista — aparece marcado. Se sumisse, o inspetor
// escreveria o nome à mão e o relatório sairia sem o alerta, que é justamente o que se quer ver.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const docs = await prisma.documentoQualidade.findMany({
    where: { ativo: true, categoria: "FUNCIONARIOS", nome: { contains: "SOLDADOR", mode: "insensitive" } },
    select: { nome: true, vinculo: true, dataValidade: true },
  });

  const hoje = new Date();
  const porNome = new Map();
  for (const d of docs) {
    const nome = (d.vinculo || "").trim();
    if (!nome) continue;
    const atual = porNome.get(nome) || { nome, certificacoes: [], vencido: false };
    atual.certificacoes.push(d.nome);
    // ⚠ vencido = TODAS vencidas. Ter a de arame sólido vencida não impede de soldar tubular.
    if (d.dataValidade && d.dataValidade < hoje) atual.vencidas = (atual.vencidas || 0) + 1;
    porNome.set(nome, atual);
  }
  const soldadores = [...porNome.values()]
    .map((s) => ({ ...s, vencido: s.vencidas === s.certificacoes.length }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return NextResponse.json({ soldadores });
}
