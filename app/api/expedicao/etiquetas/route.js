// Etiquetas de carregamento — as que hoje saem do BarTender.
//
// GET  ?opId=xxx   → as marcas daquela OP, para a tela montar a seleção
// POST { opId, marcas[] } → o PDF, uma página de 100×50 mm por PEÇA
//
// ⚠ NÃO EXISTE IMPORTAÇÃO DE PLANILHA AQUI, E ISSO É DE PROPÓSITO. O fluxo do BarTender era
// exportar planilha → importar no BarTender → imprimir. Marca, descrição, quantidade e peso já
// vivem em `PecaConjunto`; a planilha só existia porque o BarTender não enxerga o banco. Tirar
// esse pulo tira junto a chance de imprimir com dado velho, que é o defeito que planilha
// intermediária sempre tem.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarEtiquetasCarregamentoPDF } from "@/lib/etiqueta-carregamento-pdf";
import { log } from "@/lib/log";

const registro = log("api/expedicao/etiquetas");
const PERFIS = ["ADMIN", "EXPEDICAO", "PRODUCAO", "PCP", "PLANEJAMENTO"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Um lote grande de etiquetas é muita geração de QR: sai do teto padrão de 10 s da Vercel.
export const maxDuration = 60;

const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });

const ACAO = "IMPRIMIR_ETIQUETA_CARREGAMENTO";

/**
 * Quando cada marca saiu impressa, e quantas vezes.
 *
 * ⚠ O HISTÓRICO MORA NO `AuditLog`, NÃO NUMA COLUNA NOVA DA PEÇA. Duas razões, nessa ordem:
 * "quem imprimiu e quando" é exatamente o que a tabela de auditoria existe para responder — e o
 * CLAUDE.md manda registrar toda mutação nela de qualquer jeito, então a coluna seria a segunda
 * cópia do mesmo fato. E `PecaConjunto` tem 12 mil linhas em produção; guardar a REIMPRESSÃO ali
 * daria só a última, enquanto aqui ficam todas.
 */
async function impressoes(pecaIds) {
  if (!pecaIds.length) return new Map();
  const por = await prisma.auditLog.groupBy({
    by: ["entityId"],
    where: { entity: "PecaConjunto", action: ACAO, entityId: { in: pecaIds } },
    _max: { createdAt: true },
    _count: { _all: true },
  });
  return new Map(por.map((r) => [r.entityId, { em: r._max.createdAt, vezes: r._count._all }]));
}

/** "097" e "97" são a MESMA obra em tabelas diferentes: OP.numero vem com zero, a LE nem sempre. */
const semZero = (n) => String(n ?? "").trim().replace(/^0+/, "");

/**
 * As marcas da LISTA DE EXPEDIÇÃO importada (tabela `ListaExpedicao`, uma linha por frente).
 *
 * ⚠ EXISTEM DOIS IMPORTADORES DA MESMA LE, e nenhum dos dois cobre todas as obras. O da Produção
 * (`/api/producao/pecas/importar-le`) carimba `naLE` na peça; o da Expedição traz a planilha do
 * SharePoint para `ListaExpedicao`. Onde os dois rodaram eles concordam (OP-89: 283 e 279, com 279
 * em comum). Mas a OP-118 só tem `naLE`, e a OP-101 só tem `ListaExpedicao` — olhar um só faria a
 * obra do outro sumir da tela de etiquetas.
 */
async function marcasDaLE(op) {
  const listas = await prisma.listaExpedicao.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: { in: [op.numero, semZero(op.numero)].filter(Boolean) } }] },
    select: { marcasJson: true },
  });
  const set = new Set();
  for (const l of listas)
    for (const m of Array.isArray(l.marcasJson) ? l.marcasJson : [])
      if (m?.marca) set.add(String(m.marca).trim().toUpperCase());
  return set;
}

async function carregar(opId) {
  const op = await prisma.oP.findUnique({
    where: { id: opId },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  if (!op) return null;
  const [todas, daLE] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where: { opId },
      select: { id: true, marca: true, descricao: true, qte: true, pesoUnitKg: true, status: true, naLE: true },
      orderBy: [{ marca: "asc" }],
    }),
    marcasDaLE(op),
  ]);

  // ⚠⚠ SÓ O QUE ESTÁ NA LE. Matheus (08/09/2026): "na listagem das marcas não pode aparecer as
  // posições, somente os produtos finais igual sai na Lista de Expedição".
  //
  // `PecaConjunto` guarda a obra inteira: o conjunto que sai no caminhão E as posições que o
  // compõem. Na OP-97 são 1.236 linhas, das quais 537 se expedem — as outras 699 são croquis
  // ("T97A-P30", W150X24), peça de fábrica que nunca leva etiqueta de carregamento. Etiquetar
  // posição é colar adesivo em peça que vai ser soldada dentro de outra.
  //
  // ⚠ O filtro é o PERTENCIMENTO À LE, não `tipoPeca !== "CROQUI"`. A LE da OP-97 tem os
  // parafusos ("T97-AC8", tipoPeca nulo) e eles se expedem; filtrar por tipo os deixaria de fora.
  const pecas = todas.filter((p) => p.naLE || daLE.has(String(p.marca).trim().toUpperCase()));
  const hist = await impressoes(pecas.map((p) => p.id));
  return {
    op,
    pecas: pecas.map(({ naLE: _naLE, ...p }) => ({
      ...p,
      impressaEm: hist.get(p.id)?.em ?? null,
      impressoes: hist.get(p.id)?.vezes ?? 0,
    })),
  };
}

export async function GET(req) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const opId = new URL(req.url).searchParams.get("opId");

  // Sem opId, a tela está abrindo: devolve as OPs que TÊM peça cadastrada. OP sem peça não
  // rende etiqueta nenhuma e só faria a lista crescer.
  if (!opId) {
    // Só as obras que têm o que expedir. OP sem LE não rende etiqueta e escolhê-la só levaria a
    // uma tela vazia — o mesmo motivo de antes excluir OP sem peça nenhuma.
    const [comLE, listas] = await Promise.all([
      prisma.pecaConjunto.groupBy({ by: ["opId"], where: { naLE: true }, _count: { _all: true } }),
      prisma.listaExpedicao.findMany({ select: { opId: true, opNumero: true, marcas: true } }),
    ]);
    const ops = await prisma.oP.findMany({
      select: { id: true, numero: true, cliente: true, obra: true },
      orderBy: { numero: "desc" },
    });
    const porId = new Map(comLE.map((c) => [c.opId, c._count._all]));
    const porNumero = new Map();
    for (const l of listas) {
      if (l.opId) porId.set(l.opId, Math.max(porId.get(l.opId) || 0, l.marcas));
      const n = semZero(l.opNumero);
      if (n) porNumero.set(n, (porNumero.get(n) || 0) + l.marcas);
    }
    // ⚠ MÁXIMO, NÃO SOMA: as duas fontes são a MESMA lista importada por caminhos diferentes, então
    // somar contaria a obra duas vezes. O número aqui é só uma noção do tamanho — a contagem exata
    // aparece quando a OP abre, que é quando ela importa.
    return NextResponse.json({
      success: true,
      ops: ops
        .map((o) => ({ ...o, marcas: Math.max(porId.get(o.id) || 0, porNumero.get(semZero(o.numero)) || 0) }))
        .filter((o) => o.marcas > 0),
    });
  }

  const dados = await carregar(opId);
  if (!dados) return NextResponse.json({ success: false, error: "OP não encontrada" }, { status: 404 });
  return NextResponse.json({ success: true, ...dados });
}

const erro400 = (msg) => NextResponse.json({ success: false, error: msg }, { status: 400 });

/**
 * O que vai ser impresso, ou a mensagem de por que não vai.
 *
 * ⚠ A QUANTIDADE VEM DO BANCO, NÃO DO NAVEGADOR. A tela manda quais marcas; quantas etiquetas cada
 * uma rende é decisão do dado. Aceitar um número vindo da tela seria deixar a etiqueta dizer
 * "003/5" para uma marca que tem 2 peças.
 */
async function selecionar(corpo) {
  const opId = corpo?.opId;
  const marcas = Array.isArray(corpo?.marcas) ? corpo.marcas : [];
  if (!opId || !marcas.length) return { recusa: erro400("Escolha a OP e ao menos uma marca.") };

  const dados = await carregar(opId);
  if (!dados) return { recusa: NextResponse.json({ success: false, error: "OP não encontrada" }, { status: 404 }) };

  const escolhidas = new Set(marcas.map(String));
  const pecas = dados.pecas.filter((p) => escolhidas.has(p.marca));
  if (!pecas.length) return { recusa: erro400("Nenhuma das marcas enviadas existe nesta OP.") };
  return { op: dados.op, pecas };
}

/**
 * Uma linha de auditoria por MARCA — é a granularidade da pergunta que a tela faz ("esta marca já
 * saiu?"). Um registro só da OP inteira não responderia nada depois da primeira impressão parcial.
 *
 * ⚠ Não-fatal de propósito: uma falha ao registrar não pode segurar o PDF que já foi gerado. O
 * pior caso é a coluna dizer "—" para uma etiqueta impressa; imprimir de novo custa um adesivo.
 */
async function registrarImpressao(user, op, pecas) {
  try {
    await prisma.auditLog.createMany({
      data: pecas.map((p) => ({
        userId: user?.id || null,
        action: ACAO,
        entity: "PecaConjunto",
        entityId: p.id,
        diff: { op: op.numero, marca: p.marca, etiquetas: Math.max(1, p.qte || 1), por: user?.name || null },
      })),
    });
  } catch (e) {
    registro.erro("falha ao registrar a impressão:", e?.message);
  }
}

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const { recusa, op, pecas } = await selecionar(corpo);
  if (recusa) return recusa;

  const dados = { op };
  const total = pecas.reduce((s, p) => s + Math.max(1, p.qte || 1), 0);
  try {
    const pdf = await gerarEtiquetasCarregamentoPDF({
      cliente: dados.op.cliente,
      obra: dados.op.obra,
      // ⚠⚠ O NÚMERO VAI CRU, e isso é decisão, não descuido.
      //
      // Cheguei a usar o `fmtOP` da casa aqui. Está errado para ESTA tela por dois motivos que só
      // apareceram olhando o dado: (1) o `fmtOP` REMOVE um "T" inicial — decisão do Vitor em
      // `58bc140e5c`, certa para a exibição no portal, mas aqui apagaria justamente o "T89" que a
      // etiqueta em uso mostra; (2) ele completa com zeros ("89" -> "089"), e a etiqueta impressa
      // hoje diz "T89", sem zero à esquerda.
      //
      // Hoje nenhuma das 35 OPs tem prefixo — são todas "121", "120". Então o "T89" da etiqueta
      // antiga foi DIGITADO na planilha do BarTender, não veio do cadastro. Mandar cru faz a
      // etiqueta mostrar exatamente o que está na OP, seja lá qual for a convenção que ela use.
      opNumero: dados.op.numero,
      pecas,
    });
    // ⚠ SÓ DEPOIS DE O PDF EXISTIR. Carimbar antes marcaria como impressa uma marca cuja geração
    // falhou — e a tela ficaria dizendo "já saiu" para uma etiqueta que ninguém viu.
    await registrarImpressao(user, dados.op, pecas);
    registro.info(`OP ${dados.op.numero}: ${pecas.length} marca(s), ${total} etiqueta(s)`);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="etiquetas-OP-${dados.op.numero}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    registro.erro("falha ao gerar:", e?.message);
    return NextResponse.json({ success: false, error: "Não consegui gerar as etiquetas: " + e.message }, { status: 500 });
  }
}
