// GET — o PDF do relatório, com as fotos e o quadro de assinaturas.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import { pdfDoRelatorio } from "@/lib/relatorio-pdf-fonte";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  // ⚠ O INSPETOR VÊ A PRÉVIA DO QUE ELE MESMO PREENCHEU. Vitor (04/09/2026): "na tela da Lais ela
  // não consegue visualizar o relatório antes, como uma prévia". Ela tem só o módulo
  // QUALIDADE_CAMPO, e a rota exigia ADMIN/QUALIDADE — quem mede no galpão preenchia às cegas e só
  // descobria erro de digitação quando o documento já estava com a Qualidade. É LEITURA: emitir,
  // assinar e enviar continuam fora do portal de campo.
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const pedida = new URL(req.url).searchParams.get("revisao");

  // ⚠⚠ A MONTAGEM MORA EM `lib/relatorio-pdf-fonte.js`, não aqui. O documento de inspeção no data
  // book não guarda binário — guarda a receita —, e o proxy de download e o gerador do livro
  // precisam EXATAMENTE deste PDF. Enquanto isto era só uma rota, os dois tentavam buscá-lo por
  // `fetch` numa URL absoluta: levava o host de quem gravou (localhost em produção), esbarrava na
  // sessão que esta rota exige, e terminava em "Arquivo inválido" (15/09/2026).
  let pdf;
  try {
    pdf = await pdfDoRelatorio(id, { revisao: pedida != null ? Number(pedida) : null });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
  const bytes = pdf.bytes;

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(pdf.nome, "inline"),
    },
  });
}
