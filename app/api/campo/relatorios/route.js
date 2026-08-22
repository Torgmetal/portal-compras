// GET — os relatórios de uma OP que estão esperando medição.
//
// Vitor (21/08/2026): "o inspetor de campo vai selecionar a OP que ele está fazendo a inspeção e
// informar as medidas encontradas" — e depois: "não estou conseguindo acessar os relatórios na tela
// do inspetor de campo".
//
// Não estava mesmo: o portal de campo só fazia captura de foto. Este é o caminho que faltava.
//
// ⚠ SÓ RASCUNHO APARECE. Relatório já enviado para assinatura não se mexe — quem assinou validou um
// conteúdo, e mudar por baixo faz a assinatura valer para um documento que a pessoa não viu.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO, TIPO_LABEL } from "@/lib/qualidade-campo";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String(new URL(req.url).searchParams.get("opNumero") || "").trim();
  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const rs = await prisma.relatorioInspecao.findMany({
    where: { opNumero, envioAssinaturaId: null },
    select: { id: true, codigo: true, tipo: true, titulo: true, marcas: true, linhas: true, inspetor: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const relatorios = rs.map((r) => {
    const linhas = Array.isArray(r.linhas) ? r.linhas : [];
    // ⚠ o que interessa ao inspetor é QUANTO FALTA MEDIR, não quantas linhas existem: é isso que
    // diz se ele já passou por ali.
    const aMedir = linhas.filter((l) => l.letra || l.marca).length;
    const medidas = linhas.filter((l) => l.encontradoMm != null || l.laudo).length;
    return {
      id: r.id, codigo: r.codigo, tipo: r.tipo, tipoLabel: TIPO_LABEL[r.tipo] || r.tipo,
      titulo: r.titulo, marcas: r.marcas || [], inspetor: r.inspetor,
      aMedir, medidas, completo: aMedir > 0 && medidas >= aMedir,
    };
  });

  return NextResponse.json({ relatorios });
}
