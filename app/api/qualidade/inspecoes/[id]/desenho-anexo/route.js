// POST — anexa um PDF de projeto ao relatório, para marcar as cotas em cima dele.
// DELETE — desfaz o anexo e volta a valer o desenho achado no servidor.
//
// Vitor (22/08/2026), sobre a pré-montagem: "vamos ter que puxar alguns projetos diferentes,
// podendo ser conjuntos ou diagrama de montagem; nesse caso preciso de uma opção para anexar o
// projeto, para você me deixar tirar as informações sobressalentes igual fazemos no conjunto do
// relatório dimensional".
//
// O dimensional acha o desenho varrendo a pasta da OP pela MARCA da peça. Isso funciona para
// conjunto e croqui, que têm marca. Um diagrama de montagem não tem: ele é o desenho do arranjo,
// não de uma peça — e às vezes nem está na pasta de projetos. Sem uma porta manual, o inspetor de
// pré-montagem fica sem desenho e o relatório perde justamente as cotas.
//
// ⚠ TOKEN DE CLIENTE, não upload pela rota. Desenho A1 passa de 4,5 MB com facilidade, e é
// exatamente o tamanho em que a rota serverless trava (ver [[torg_upload_4mb]]). O navegador manda
// direto para o blob e aqui só se grava o vínculo.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id }, select: { id: true, desenhos: true, envioAssinaturaId: true },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  if (rel.envioAssinaturaId) {
    return NextResponse.json({ error: "Relatório já enviado para assinatura." }, { status: 409 });
  }

  const body = await req.json();
  try {
    const resposta = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: 60 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ relatorioId: id, userId: user.id }),
      }),
      // ⚠ o vínculo é gravado AQUI, no retorno do blob, e não numa segunda chamada do navegador:
      // se a aba fechar entre o upload e o vínculo, o arquivo existiria sem ninguém apontando
      // para ele — e o inspetor subiria de novo achando que falhou.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { relatorioId } = JSON.parse(tokenPayload || "{}");
        if (!relatorioId) return;
        const nome = decodeURIComponent(String(blob.pathname).split("/").pop() || "projeto.pdf");
        await prisma.relatorioInspecao.update({
          where: { id: relatorioId },
          data: {
            desenhos: [{
              marca: nome.replace(/\.pdf$/i, "").slice(0, 60),
              // `url` no lugar de `caminho`: quem lê o desenho aceita os dois (lib/relatorio-dimensional.js)
              url: blob.url,
              anexado: true,
            }],
          },
        }).catch(() => {});
      },
    });
    return NextResponse.json(resposta);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(_req, { params }) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  // ⚠ zera para VAZIO, não apaga o campo: com `desenhos: []` o `garantirDesenhos` volta a varrer a
  // pasta da OP na próxima abertura, que é o comportamento padrão.
  await prisma.relatorioInspecao.update({ where: { id }, data: { desenhos: [] } });
  return NextResponse.json({ ok: true });
}
