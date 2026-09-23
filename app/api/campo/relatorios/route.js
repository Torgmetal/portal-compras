// GET — os relatórios de uma OP que estão esperando medição.
//
// Vitor (21/08/2026): "o inspetor de campo vai selecionar a OP que ele está fazendo a inspeção e
// informar as medidas encontradas" — e depois: "não estou conseguindo acessar os relatórios na tela
// do inspetor de campo".
//
// Não estava mesmo: o portal de campo só fazia captura de foto. Este é o caminho que faltava.
//
// Relatório emitido continua aparecendo. Quem o criou no Campo precisa poder reencontrar o próprio
// trabalho.
//
// ⚠⚠ ENVIADO PARA ASSINATURA ABRE PARA EDITAR, enquanto a assinatura está em andamento (23/09/2026).
// Desde 22/09 o relatório enviado continua editável, com registro — Vitor: "não precisa gerar
// revisão, pode apenas alterar as informações" — e a rota de gravação já aceitava. Só esta lista
// ficou na regra velha e mandava o toque para o PDF: quem inspecionou não tinha como completar os
// EVS/LP da OP-102, que foram para assinatura com campos em branco. ⚠ CONCLUÍDO (todos assinaram)
// continua só consulta aqui: mexer depois disso é caso de revisão, que se abre no computador.
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

  // ⚠ RELATÓRIO REPROVADO CONTINUA NA LISTA. Vitor: "no caso de reprova o relatório deve ficar
  // aberto". Os emitidos também aparecem, mas sinalizados como somente leitura.
  const rs = await prisma.relatorioInspecao.findMany({
    where: { opNumero },
    select: {
      id: true, codigo: true, tipo: true, titulo: true, marcas: true, linhas: true,
      inspetor: true, createdAt: true, revisao: true, resultadoInspecao: true,
      envioAssinaturaId: true, status: true,
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const envios = rs.some((r) => r.envioAssinaturaId)
    ? await prisma.envioAssinatura.findMany({
        where: { id: { in: rs.map((r) => r.envioAssinaturaId).filter(Boolean) } },
        select: { id: true, status: true },
      })
    : [];
  const concluido = new Set(envios.filter((e) => e.status === "CONCLUIDO").map((e) => e.id));

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
      revisao: r.revisao ?? 0,
      rotuloRevisao: `R${String(r.revisao ?? 0).padStart(2, "0")}`,
      resultadoInspecao: r.resultadoInspecao || null,
      status: r.status,
      assinado: !!r.envioAssinaturaId,
      somenteLeitura: !!r.envioAssinaturaId && concluido.has(r.envioAssinaturaId),
    };
  });

  return NextResponse.json({ relatorios });
}
