// GET — serve o PDF do desenho de uma marca do relatório, para conferência na tela.
//
// Vitor (21/08/2026): "na tela do gerador do projeto consegue trazer essa imagem do projeto para
// ele conseguir conferir?" — sim. Quem preenche a dimensão encontrada precisa olhar a cota
// enquanto digita; mandar a pessoa abrir o PDF do relatório e rolar até a última página é o tipo
// de atrito que faz ela conferir de memória.
//
// 🚫 Não copia nem armazena: transmite os bytes do arquivo que está no SharePoint. O desenho
// continua sendo um só, e revisão lá aparece aqui na hora.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { baixarDesenho } from "@/lib/relatorio-dimensional";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE", "QUALIDADE_CAMPO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id }, select: { desenhos: true } });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });

  const desenhos = Array.isArray(rel.desenhos) ? rel.desenhos : [];
  const marca = new URL(req.url).searchParams.get("marca");
  // ⚠ só serve desenho QUE ESTÁ NO RELATÓRIO. Aceitar um caminho pela URL transformaria esta rota
  // num leitor de arquivos do servidor.
  const alvo = marca ? desenhos.find((d) => String(d.marca).toUpperCase() === marca.toUpperCase()) : desenhos[0];
  const origem = alvo?.caminho || alvo?.url;
  if (!origem) return NextResponse.json({ error: "Desenho não encontrado neste relatório." }, { status: 404 });

  const bytes = await baixarDesenho(origem);
  if (!bytes) return NextResponse.json({ error: "Não consegui abrir o desenho no servidor." }, { status: 502 });

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(`${alvo.nome || "desenho"}.pdf`, "inline"),
      // o desenho muda pouco, mas revisão nova tem de aparecer — cache curto, do navegador só
      "Cache-Control": "private, max-age=300",
    },
  });
}
