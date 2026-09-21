// POST — token para o navegador subir um PDF de projeto direto ao blob (e o webhook de conclusão).
// PUT  — o navegador vincula ao relatório o arquivo que acabou de subir.
// DELETE — desfaz um anexo (ou todos) e volta a valer o desenho achado no servidor.
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
//
// ⚠⚠ O WEBHOOK CHEGA SEM SESSÃO. `handleUpload` atende DOIS eventos no mesmo POST: o pedido de
// token, que vem do navegador logado, e o `blob.upload-completed`, que o Vercel Blob dispara de
// fora — sem cookie. A versão anterior exigia `requireRole` antes de olhar o evento: o webhook
// tomava 401 e o vínculo, que só era gravado ali, nunca chegou ao banco (0 anexos em produção,
// medido em 21/09/2026). A sessão passou para dentro de `onBeforeGenerateToken`, como as outras
// rotas de upload-token do portal, e o navegador ainda vincula por conta própria no `PUT`.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { head } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import { vincularAnexo, urlDeAnexoValida } from "@/lib/inspecao-anexo";
import { log } from "@/lib/log";

const registro = log("api/qualidade/inspecoes/desenho-anexo");

export const runtime = "nodejs";
export const maxDuration = 30;

async function relatorioAberto(id) {
  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id }, select: { id: true, tipo: true, desenhos: true, envioAssinaturaId: true },
  });
  if (!rel) return { erro: "Relatório não encontrado.", status: 404 };
  if (rel.envioAssinaturaId) return { erro: "Relatório já enviado para assinatura.", status: 409 };
  return { rel };
}

export async function POST(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  try {
    const resposta = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // ⚠ a sessão é exigida AQUI — só quem pede o token está no navegador
        const user = await requireRole(PERFIS_CAMPO);
        const ctx = await relatorioAberto(id);
        if (ctx.erro) throw new Error(ctx.erro);
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 60 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ relatorioId: id, userId: user.id }),
        };
      },
      // Reserva: o navegador já vincula pelo PUT assim que o upload termina; se a aba fechar entre
      // o upload e o vínculo, este webhook ainda grava — e repetir a mesma URL não duplica.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { relatorioId } = JSON.parse(tokenPayload || "{}");
        if (!relatorioId) return;
        try {
          await vincularAnexo(prisma, relatorioId, { url: blob.url, pathname: blob.pathname });
        } catch (e) {
          // ⚠ nunca mais engolir: era o silêncio que escondeu os 401 por um mês
          registro.erro("[desenho-anexo] webhook não gravou o vínculo:", relatorioId, e?.message);
        }
      },
    });
    return NextResponse.json(resposta);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
}

export async function PUT(req, { params }) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const ctx = await relatorioAberto(id);
  if (ctx.erro) return NextResponse.json({ error: ctx.erro }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const url = String(body?.url || "").trim();
  // ⚠ a URL vem do navegador: só do nosso blob, só PDF, e só se o arquivo existir lá de fato.
  if (!urlDeAnexoValida(url)) return NextResponse.json({ error: "Endereço do anexo inválido." }, { status: 400 });
  let meta;
  try { meta = await head(url); }
  catch (e) { return NextResponse.json({ error: `O arquivo não está no blob: ${e?.message || "não encontrado"}` }, { status: 400 }); }

  const desenhos = await vincularAnexo(prisma, id, { url, pathname: meta?.pathname, nome: body?.nome });
  return NextResponse.json({ ok: true, total: desenhos.length, desenhos });
}

export async function DELETE(req, { params }) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const ctx = await relatorioAberto(id);
  if (ctx.erro) return NextResponse.json({ error: ctx.erro }, { status: ctx.status });

  const marca = String(new URL(req.url).searchParams.get("marca") || "").trim().toUpperCase();
  const atuais = Array.isArray(ctx.rel.desenhos) ? ctx.rel.desenhos : [];
  // ⚠ com marca, tira SÓ aquele anexo (a pré-montagem tem vários desenhos); sem marca, zera para
  // VAZIO — não apaga o campo: com `desenhos: []` o `garantirDesenhos` volta a varrer a pasta da
  // OP na próxima abertura, que é o comportamento padrão.
  const desenhos = marca ? atuais.filter((d) => String(d.marca).toUpperCase() !== marca) : [];
  await prisma.relatorioInspecao.update({ where: { id }, data: { desenhos } });
  return NextResponse.json({ ok: true, total: desenhos.length });
}
