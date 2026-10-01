// GET /api/qualidade/data-books/[id]/pdf[?inline=1]
// Gera e transmite o PDF do Data Book (capa + lista mestra + seções + merge dos
// certificados). Só ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { gerarDataBookPDF, DATABOOK_GRANDE_DEMAIS } from "@/lib/databook-pdf";
import { montarRoteiro } from "@/lib/databook-volumes";
import { dispArquivo } from "@/lib/arquivo-http";
import { escapeHtml } from "@/lib/html";

// Acima disto o arquivo único deixa de ser entregável: não fecha dentro da função e
// o leitor de PDF do cliente engasga. O caminho passa a ser gerar em volumes.
const MAX_ANEXOS_ARQUIVO_UNICO = 300;

// ⚠⚠ O LIVRO DA OP-112 (264 anexos, 86 MB) DAVA 504 (Geraldo, 30/09/2026). Os anexos agora descem
// vários ao mesmo tempo (lib/fila-downloads) e a rota dá ao gerador um ORÇAMENTO: passou do
// horário ou do tamanho, o livro é recusado com o aviso de gerar em volumes ANTES do teto da
// função. O que sobra do teto é para salvar e mandar o arquivo — o envio também conta.
const ORCAMENTO_MS = 150_000;
const ORCAMENTO_BYTES = 120 * 1024 * 1024;

export const runtime = "nodejs";
// 300 s é o padrão da plataforma; os 120 s fixados aqui eram o que o livro estourava.
export const maxDuration = 300;

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const t0 = Date.now();
  const inline = new URL(req.url).searchParams.get("inline") === "1";

  // Data book grande não sai em arquivo único — e é melhor dizer isso agora do que
  // deixar a função rodar até o timeout e devolver erro genérico.
  try {
    const { roteiro } = await montarRoteiro(params.id);
    if (roteiro.length > MAX_ANEXOS_ARQUIVO_UNICO) return await naoCabe(params.id, roteiro.length, inline);
  } catch { /* se o roteiro falhar, segue e deixa a geração dizer o que houve */ }

  let out;
  try {
    out = await gerarDataBookPDF(params.id, { orcamento: { ateMs: t0 + ORCAMENTO_MS, maxBytes: ORCAMENTO_BYTES } });
  } catch (e) {
    if (e?.codigo === DATABOOK_GRANDE_DEMAIS) return await naoCabe(params.id, e.info?.anexos, inline);
    return NextResponse.json({ error: "Falha ao gerar o PDF: " + e.message }, { status: 500 });
  }

  const nome = out.filename.replace(/["\r\n]/g, "");
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", dispArquivo(nome, inline ? "inline" : "attachment"));
  headers.set("Cache-Control", "private, no-store");
  return new Response(emPartes(out.bytes), { status: 200, headers });
}

// ⚠ EM PARTES, NÃO INTEIRO: a Vercel recusa resposta inteira acima de 4,5 MB e só libera o
// tamanho para função que transmite em streaming (docs "Vercel Functions Limits" e "How do I
// bypass the 4.5MB body size limit"). O livro da OP-112 tem 86 MB.
const PARTE = 1024 * 1024;
function emPartes(bytes) {
  let pos = 0;
  return new ReadableStream({
    pull(controller) {
      if (pos >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.subarray(pos, Math.min(pos + PARTE, bytes.length)));
      pos += PARTE;
    },
  });
}

// O aviso de que o livro precisa ir em volumes. Quem abriu foi o botão "Baixar PDF", numa ABA
// NOVA: JSON cru ali parece defeito — a aba recebe uma página que se lê. Código recebe JSON.
async function naoCabe(id, anexos, inline) {
  const volumes = await prisma.dataBookArquivo.count({ where: { dataBookId: id } }).catch(() => 0);
  const error = `Este data book tem ${anexos ? `${Number(anexos).toLocaleString("pt-BR")} anexos` : "anexos demais"} — não cabe em um arquivo só.`;
  const detalhe = volumes ? "Baixe pelos volumes já gerados." : "Use “Gerar volumes” para montar o data book em volumes.";
  if (!inline) return NextResponse.json({ error, detalhe, emVolumes: true }, { status: 409 });
  return new Response(paginaDeAviso(id, error, detalhe), {
    status: 409,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

// ⚠ o id vem do ENDEREÇO: entra codificado no link e escapado no texto, nunca cru
function paginaDeAviso(id, mensagem, detalhe) {
  const voltar = `/qualidade/data-books/${encodeURIComponent(id)}`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data book em volumes</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f6f9;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#002945}
  main{max-width:34rem;margin:16px;padding:28px 30px;background:#fff;border:1px solid #e3e8ee;border-radius:14px}
  p.tag{margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#006EAB}
  h1{margin:0 0 10px;font-size:20px;line-height:1.3}
  p{margin:0 0 20px;font-size:15px;line-height:1.55;color:#576D7E}
  a{display:inline-block;padding:9px 16px;border-radius:8px;background:#006EAB;color:#fff;font-weight:600;font-size:14px;text-decoration:none}
  a:hover{background:#002945}
</style></head>
<body><main>
  <p class="tag">Data book</p>
  <h1>${escapeHtml(mensagem)}</h1>
  <p>${escapeHtml(detalhe)}</p>
  <a href="${escapeHtml(voltar)}">Voltar ao data book</a>
</main></body></html>`;
}
