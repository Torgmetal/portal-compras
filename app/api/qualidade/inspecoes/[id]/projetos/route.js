// GET  — navega nas pastas de projeto da OP (Montagem, Conjunto, Engenharia inteira).
// POST — escolhe um PDF como o desenho deste relatório.
//
// Vitor (22/08/2026): "você precisa deixar para eu selecionar a peça também; na pasta da
// engenharia temos uma pasta chamada Montagem, lá ficam os diagramas de montagem, e os conjuntos
// também preciso ter a permissão para poder selecionar".
//
// O anexo manual resolve o caso do arquivo que não está no servidor, mas o normal é ele ESTAR — e
// aí subir uma cópia é pior: cria uma segunda versão do projeto, solta do controle da Engenharia,
// que não acompanha revisão. Escolher aponta para o arquivo original.
//
// As raízes são as mesmas da §02 do data book (lib/databook-pastas.js), que já sabe achar as duas
// arrumações de pasta que convivem na Torg: o molde novo (2.5.2.3 Conjunto, 2.5.4 Montagem) e o
// antigo, sob "2.5.5 Cliente (ENC ###)" — onde estavam os 38 diagramas de montagem da OP-067.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import { resolverPastasDaSecao, listarPasta } from "@/lib/databook-pastas";

export const runtime = "nodejs";
export const maxDuration = 60;

async function contexto(id) {
  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id }, select: { id: true, opNumero: true, envioAssinaturaId: true },
  });
  if (!rel) return { erro: "Relatório não encontrado.", status: 404 };
  const { driveId, fontes, erros } = await resolverPastasDaSecao("02", rel.opNumero);
  if (!driveId || !fontes.length) {
    return { erro: erros?.[0] || "Não achei a pasta de projetos desta OP no servidor.", status: 502 };
  }
  return { rel, driveId, fontes };
}

export async function GET(req, { params }) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const ctx = await contexto(id);
  if (ctx.erro) return NextResponse.json({ error: ctx.erro }, { status: ctx.status });

  const pasta = new URL(req.url).searchParams.get("pasta");
  if (!pasta) {
    // a raiz: os atalhos (montagem, conjunto) e a Engenharia inteira
    return NextResponse.json({ raizes: ctx.fontes.map((f) => ({ label: f.label, path: f.path })) });
  }

  // ⚠ SÓ DENTRO DAS RAÍZES DA OP. Sem esta checagem, um caminho vindo do navegador leria qualquer
  // pasta do SERVIDOR — inclusive de outra obra ou do administrativo.
  const dentro = ctx.fontes.some((f) => pasta === f.path || pasta.startsWith(`${f.path}/`));
  if (!dentro) return NextResponse.json({ error: "Pasta fora dos projetos desta OP." }, { status: 403 });

  const conteudo = await listarPasta(ctx.driveId, pasta).catch(() => null);
  if (!conteudo) return NextResponse.json({ error: "Não consegui abrir esta pasta." }, { status: 502 });

  return NextResponse.json({
    pasta,
    pastas: conteudo.pastas,
    // só PDF: é o que o marcador de cotas sabe ler
    arquivos: (conteudo.arquivos || []).filter((a) => /\.pdf$/i.test(a.nome)),
  });
}

export async function POST(req, { params }) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const ctx = await contexto(id);
  if (ctx.erro) return NextResponse.json({ error: ctx.erro }, { status: ctx.status });
  if (ctx.rel.envioAssinaturaId) {
    return NextResponse.json({ error: "Relatório já enviado para assinatura." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const caminho = String(body?.caminho || "").trim();
  if (!caminho || !/\.pdf$/i.test(caminho)) return NextResponse.json({ error: "Escolha um PDF." }, { status: 400 });
  const dentro = ctx.fontes.some((f) => caminho.startsWith(`${f.path}/`));
  if (!dentro) return NextResponse.json({ error: "Arquivo fora dos projetos desta OP." }, { status: 403 });

  const nome = caminho.split("/").pop();
  await prisma.relatorioInspecao.update({
    where: { id },
    data: {
      // ⚠ `caminho` (servidor), não `url`: o relatório aponta para o arquivo ORIGINAL da
      // Engenharia. Se o projeto for revisado, é a revisão que o portal lê — cópia no blob
      // congelaria uma versão sem ninguém saber.
      desenhos: [{
        marca: nome.replace(/\.pdf$/i, "").slice(0, 60),
        nome,
        caminho,
        escolhido: true,
      }],
    },
  });
  return NextResponse.json({ ok: true, nome });
}
