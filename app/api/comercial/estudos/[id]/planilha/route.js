// Extrai o estudo NO MODELO LQC — o arquivo de verdade, preenchido. Ver lib/lqc-planilha.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarPlanilhaLqc } from "@/lib/lqc-planilha";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return new NextResponse(e.message, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const estudo = await prisma.estudoFabricacao.findUnique({ where: { id } });
  if (!estudo) return new NextResponse("Estudo não encontrado.", { status: 404 });

  try {
    const { buffer, nome, avisos, modelo } = await gerarPlanilhaLqc(estudo);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": dispArquivo(nome, "attachment"),
        // ⚠ o que não coube viaja no cabeçalho: a tela avisa em vez de o arquivo sair mudo.
        ...(avisos.length ? { "X-Avisos": encodeURIComponent(avisos.join(" | ")) } : {}),
        // qual modelo virou este arquivo — rastreável sem precisar abrir o servidor
        ...(modelo?.caminho ? { "X-Modelo": encodeURIComponent(`${modelo.caminho}/${modelo.nome}`) } : {}),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new NextResponse(`Não consegui montar a planilha: ${e.message}`, { status: 502 });
  }
}
