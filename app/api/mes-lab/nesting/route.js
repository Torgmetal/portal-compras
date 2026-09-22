// O NESTING DA PREPARAÇÃO — importar o plano do programador e listar o que já entrou.
//
// GET  /api/mes-lab/nesting            → os planos importados
// POST /api/mes-lab/nesting            → multipart com os arquivos; `?gravar=1` grava
//
// ⚠⚠ ANALISAR E GRAVAR SÃO DUAS CHAMADAS, E A PRIMEIRA NÃO ESCREVE NADA. O import de lista do
// portal já ensinou o preço de misturar os dois: a aba "Revisão" dizia "18 incluídas" e nenhuma
// entrou, porque o número era uma PREVISÃO apresentada como recibo (CLAUDE.md). Aqui a tela mostra
// a prévia, a pessoa olha as divergências e só então manda gravar — e o que se grava é o que foi
// mostrado, com o hash dos arquivos junto.
//
// ⚠⚠ ÁREA DE LABORATÓRIO. `/mes-lab` é ADMIN-only no `middleware.js`, mas o gate do middleware
// cobre PÁGINA, não API — por isso `requireRole` aqui também (§7.4, pedido do Codex).

import { NextResponse } from "next/server";
import { ambientePedido } from "@/lib/mes/ambiente";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { lerPlano } from "@/lib/mes/nesting/ler-arquivos";
import { casarComOPortal, linhasDoPlano, marcasDoPlano } from "@/lib/mes/nesting/importar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const erro = (msg, status = 400) => NextResponse.json({ success: false, error: msg }, { status });
const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });

export async function GET(req) {
  try { await requireRole(["ADMIN"]); } catch (e) { return erroDeAcesso(e); }

  // ⚠ A listagem também é por mundo (achado do Codex, 21/09/2026): sem filtro, o laboratório via
  // os planos reais na mesma lista e podia abrir um deles num posto de teste.
  const ambiente = ambientePedido(new URL(req.url).searchParams.get("ambiente"));
  if (!ambiente) return erro("Ambiente inválido — use PROD ou DEMO.");

  const planos = await prisma.mesNesting.findMany({
    where: { ambiente },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { unidades: { select: { id: true, indice: true, pecas: true }, orderBy: { indice: "asc" } } },
  });
  return NextResponse.json({ success: true, planos });
}

export async function POST(req) {
  let sessao;
  try { sessao = await requireRole(["ADMIN"]); } catch (e) { return erroDeAcesso(e); }

  const form = await req.formData().catch(() => null);
  if (!form) return erro("Mande os arquivos do plano.");

  const arquivos = [];
  for (const valor of form.getAll("arquivos")) {
    if (typeof valor === "string" || !valor?.name) continue;
    arquivos.push({ nome: valor.name, bytes: Buffer.from(await valor.arrayBuffer()) });
  }
  if (!arquivos.length) return erro("Mande os arquivos do plano.");

  // ⚠⚠ O NESTING É IMPORTADO POR TELA, SEM PASSAR POR RECURSO NENHUM (achado do Codex,
  // 21/09/2026) — é a porta pela qual um plano de um mundo entraria no outro. Por isso ele
  // carrega ambiente explícito, e o totem confere antes de abrir a barra.
  const ambiente = ambientePedido(new URL(req.url).searchParams.get("ambiente"));
  if (!ambiente) return erro("Ambiente inválido — use PROD ou DEMO.");

  const lido = await lerPlano(arquivos);
  if (lido.erro) return erro(lido.erro);

  const marcas = marcasDoPlano(lido.plano);
  const { casamento, pendentes } = await casarNoBanco(marcas, lido.opNumero);
  const unidades = linhasDoPlano(lido.plano, { casamento, tipo: lido.tipoUnidade });
  const previa = { ...lido, plano: undefined, unidades, pendentes, marcas: marcas.length };

  if (new URL(req.url).searchParams.get("gravar") !== "1") {
    return NextResponse.json({ success: true, previa });
  }
  return gravar(lido, unidades, pendentes, sessao, ambiente);
}

/**
 * ⚠ Procura as marcas do plano de uma vez só. Uma consulta por marca seriam 15 idas ao banco num
 * plano pequeno — e o Neon já mostrou o que acha de carga desnecessária.
 */
async function casarNoBanco(marcas, opNumero) {
  if (!marcas.length) return { casamento: new Map(), pendentes: [] };
  const pecas = await prisma.pecaConjunto.findMany({
    where: { marca: { in: marcas } },
    select: { id: true, marca: true, opNumero: true, opId: true },
  });
  return casarComOPortal(marcas, pecas, opNumero);
}

async function gravar(lido, unidades, pendentes, sessao, ambiente) {
  // ⚠⚠ REPLANO É PLANO NOVO, E O HASH É QUEM DIZ (§12.3). O mesmo nome com conteúdo diferente não
  // pode sobrescrever o anterior em silêncio; o mesmo conteúdo não pode entrar duas vezes.
  const jaExiste = await prisma.mesNesting.findFirst({
    // ⚠ A deduplicação é DENTRO do mundo: o mesmo plano pode ser importado no laboratório sem
    // bloquear a importação real, e vice-versa (`@@unique([hashRelatorio, ambiente])`).
    where: { hashRelatorio: lido.hashRelatorio, ambiente },
    select: { id: true, nome: true, createdAt: true },
  });
  if (jaExiste) {
    return erro(`Este plano já foi importado em ${jaExiste.createdAt.toLocaleDateString("pt-BR")}.`, 409);
  }

  const salvo = await prisma.mesNesting.create({
    data: {
      nome: lido.nome, origem: lido.origem, programa: lido.programa ?? null,
      descricao: lido.descricao ?? null, material: lido.material ?? null,
      espessuraMm: lido.espessuraMm ?? null, opNumero: lido.opNumero ?? null,
      arquivoRelatorio: lido.arquivoRelatorio, arquivoMaquina: lido.arquivoMaquina,
      hashRelatorio: lido.hashRelatorio, hashMaquina: lido.hashMaquina, ambiente,
      // O recibo do que foi mostrado na prévia — congelado, não recalculado depois.
      divergencias: { avisos: lido.divergencias || [], pendentes },
      criadoPor: sessao?.user?.email ?? null,
      unidades: {
        create: unidades.map((u) => ({
          indice: u.indice, tipo: u.tipo, pecas: u.pecas,
          comprimentoMm: u.comprimentoMm, sobraMm: u.sobraMm, aproveitamento: u.aproveitamento,
          itens: { create: u.itens.map((i) => ({
            marca: i.marca, qtd: i.qtd, ordem: i.ordem, deduzida: i.deduzida,
            pecaConjuntoId: i.pecaConjuntoId, opNumero: i.opNumero,
          })) },
        })),
      },
    },
    select: { id: true, nome: true },
  });
  return NextResponse.json({ success: true, nesting: salvo });
}
