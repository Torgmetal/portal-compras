// GET ?numero=1892 — itens de um pedido de compra (p/ o estoque selecionar o que chegou e
// lançar no CMR já com a descrição EXATA da RM — concilia sozinho).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CMR_CAT } from "@/lib/cmr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Desfaz as entidades HTML que vêm na descrição do Omie.
 *
 * ⚠⚠ O OMIE DEVOLVE `PORCA A563 - 3/8&quot; - GF`, com a aspa escapada. A tela mostrava assim e,
 * pior, era esse texto que ia para o lançamento do CMR e daí para a planilha do SharePoint —
 * virando registro permanente com lixo de HTML no meio. Medido em 17/09/2026: **369 dos 1.477
 * itens de pedido** (25%) têm entidade na descrição; nenhum lançamento do CMR estava contaminado
 * ainda, porque ninguém tinha lançado um desses — era questão de tempo.
 *
 * ⚠ Desfeito na LEITURA, não com um update em massa no banco: o `itensOmie` é a fotografia do que
 * o Omie respondeu, e reescrevê-la faria o portal discordar da origem sem deixar rastro.
 */
const semEntidades = (t) => String(t || "")
  .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&"); // por último: senão "&amp;quot;" viraria aspas
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const numero = (new URL(req.url).searchParams.get("numero") || "").trim();
  if (!numero) return NextResponse.json({ error: "Informe o número do pedido." }, { status: 400 });

  const ped = await prisma.pedidoOmie.findFirst({
    where: { numeroPedido: numero },
    orderBy: { createdAt: "desc" },
    select: { numeroPedido: true, fornecedorNome: true, opId: true, nfNumero: true, itensOmie: true },
  });
  if (!ped) return NextResponse.json({ error: `Pedido ${numero} não encontrado no portal.` }, { status: 404 });

  const op = ped.opId ? await prisma.oP.findUnique({ where: { id: ped.opId }, select: { numero: true } }).catch(() => null) : null;

  // ⚠⚠ O SALDO TAMBÉM CONTA O QUE O CMR JÁ LANÇOU. Matheus (17/09/2026): "quando ele seleciona 1
  // item e ajusta a quantidade recebida não está abatendo o saldo que sobra no pedido mostrado".
  // `itensOmie[].qtdRecebida` é uma FOTOGRAFIA do Omie, atualizada pelo cron `sync-entregas` — ela
  // responde "quanto o Omie sabe que chegou". Um lançamento feito no CMR agora só apareceria ali
  // depois que a nota entrasse no Omie e o cron rodasse. Até lá o saldo continuava cheio.
  const lancamentosCmr = await prisma.documentoQualidade.findMany({
    where: { categoria: CMR_CAT, pedidoCompra: numero },
    select: { nome: true, quantidade: true, pesoKg: true },
  }).catch(() => []);

  // ⚠ O CASAMENTO É POR DESCRIÇÃO porque o lançamento não guarda QUAL linha do pedido foi — a
  // descrição vem da própria linha (a tela preenche o campo a partir dela), então bate exato. O
  // problema é o pedido com a MESMA peça em várias linhas: aí a soma é ALOCADA em ordem, enchendo
  // uma linha antes de passar para a próxima, que é como o material chega de verdade.
  const chave = (t) => String(t || "").trim().toUpperCase().replace(/\s+/g, " ");
  const recebidoPorDescricao = new Map();
  for (const l of lancamentosCmr) {
    const k = chave(semEntidades(l.nome));
    if (!k) continue;
    // ⚠ R lança PESO e RC lança PEÇAS; a linha traz um dos dois. Somar os dois misturaria kg com
    // unidade no mesmo número.
    const v = Number(l.quantidade) || Number(l.pesoKg) || 0;
    if (v > 0) recebidoPorDescricao.set(k, (recebidoPorDescricao.get(k) || 0) + v);
  }

  const saldoCmr = new Map(recebidoPorDescricao);
  const itens = (Array.isArray(ped.itensOmie) ? ped.itensOmie : []).map((it, i) => {
    const qtd = Number(it.qtd) || 0;
    const doOmie = Number(it.qtdRecebida) || 0;
    const k = chave(semEntidades(it.descricao));
    const disponivel = saldoCmr.get(k) || 0;
    const doCmr = Math.min(disponivel, qtd);
    if (doCmr > 0) saldoCmr.set(k, disponivel - doCmr);
    return {
      idx: i,
      descricao: semEntidades(it.descricao),
      qtd,
      unidade: it.unidade || null,
      valorUnit: Number(it.valorUnit) || 0,
      // ⚠⚠ O MAIOR DOS DOIS, NUNCA A SOMA. Quando a nota finalmente entra no Omie, as duas origens
      // descrevem a MESMA mercadoria — somar diria que chegou o dobro e zeraria um saldo que ainda
      // existe. O maior é o retrato mais completo e nunca infla.
      qtdRecebida: Math.max(doOmie, doCmr),
      recebidoOmie: doOmie,
      recebidoCmr: doCmr,
    };
  }).filter((it) => it.descricao);

  return NextResponse.json({
    success: true,
    pedido: numero,
    fornecedor: ped.fornecedorNome || null,
    obra: op?.numero ? `OP ${op.numero}` : null,
    nf: ped.nfNumero || null,
    itens,
  });
}
