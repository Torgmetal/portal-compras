import { NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { validarArquivoRelatorio } from "@/lib/auditoria-relatorio-anexo";

export const runtime = "nodejs";
export const maxDuration = 30;
const schema = z.object({ url: z.string().url().max(2000), nome: z.string().trim().min(1).max(255) });

export async function POST(req, { params }) {
  let usuario;
  try { usuario = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let dados;
  try {
    dados = schema.parse(await req.json());
    const url = new URL(dados.url);
    if (url.protocol !== "https:" || !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) || !url.pathname.startsWith(`/qualidade/auditorias/${params.id}/`) || url.search || url.hash || url.username || url.password) {
      throw new Error("Arquivo inválido para esta auditoria.");
    }
  } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || e.message || "Dados inválidos" }, { status: 400 }); }

  const atual = await prisma.auditoriaInterna.findUnique({ where: { id: params.id } });
  if (!atual) return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });

  let relatorioAnexo;
  try {
    const arquivo = await head(dados.url);
    const tipo = validarArquivoRelatorio(dados.nome, arquivo.size);
    if (arquivo.contentType !== tipo) throw new Error("O formato do arquivo não corresponde ao relatório.");
    relatorioAnexo = { url: dados.url, nome: dados.nome, tamanho: arquivo.size, tipo, anexadoEm: new Date().toISOString() };
  } catch { return NextResponse.json({ error: "Não foi possível validar o arquivo. Use PDF, Word, Excel, JPG ou PNG de até 50 MB e tente novamente." }, { status: 400 }); }

  try {
    const salvo = await prisma.$transaction(async (tx) => {
      // Não desfazer uma emissão/finalização que ocorreu durante o upload.
      await tx.auditoriaInterna.updateMany({ where: { id: params.id, status: "AGENDADA" }, data: { status: "REALIZADA" } });
      const anterior = await tx.auditoriaInterna.findUnique({ where: { id: params.id } });
      const auditoria = await tx.auditoriaInterna.update({
        where: { id: params.id },
        data: { relatorioAnexo },
      });
      await tx.auditLog.create({ data: { userId: usuario.id, action: "ANEXAR_RELATORIO_AUDITORIA", entity: "AuditoriaInterna", entityId: params.id, diff: { antes: anterior.relatorioAnexo || null, depois: relatorioAnexo } } });
      return auditoria;
    });
    return NextResponse.json({ success: true, relatorioAnexo: salvo.relatorioAnexo, status: salvo.status });
  } catch { return NextResponse.json({ error: "Não foi possível salvar o anexo. Tente novamente." }, { status: 500 }); }
}
