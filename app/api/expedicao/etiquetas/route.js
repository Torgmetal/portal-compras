// Etiquetas de carregamento — as que hoje saem do BarTender.
//
// GET  ?opId=xxx   → as marcas daquela OP, para a tela montar a seleção
// POST { opId, marcas[] } → o PDF, uma página de 100×50 mm por PEÇA
//
// ⚠ NÃO EXISTE UPLOAD DE PLANILHA AQUI, E ISSO É DE PROPÓSITO. O fluxo do BarTender era exportar
// planilha → importar no BarTender → imprimir. A Lista de Expedição já está no portal (ver
// `lib/itens-expedicao.js`); a planilha intermediária só existia porque o BarTender não enxerga o
// banco. Tirar esse pulo tira junto a chance de imprimir com dado velho.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarEtiquetasCarregamentoPDF } from "@/lib/etiqueta-carregamento-pdf";
import { itensExpediveisDaOP, opsComItensExpediveis } from "@/lib/itens-expedicao";
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
 * A CHAVE DO HISTÓRICO É A MARCA, NÃO O ID DA PEÇA.
 *
 * ⚠⚠ O id da linha de `PecaConjunto` não sobrevive à reimportação da lista — é a mesma lição já
 * gravada no schema, em `LiberacaoProducao.pecaMarcas`: "o id da peça não sobrevive à
 * reimportação/exclusão da lista; a marca sim". E desde que a lista passou a ser definida pela
 * Lista de Expedição, existe item legítimo SEM nenhuma linha no cadastro (a OP-67 tem 1.519), que
 * por id não teria onde ser registrado.
 *
 * ⚠ Registros ANTIGOS foram gravados por id (`entity: "PecaConjunto"`). São lidos também, senão a
 * coluna diria "nunca impressa" para etiqueta que saiu — ver `historicoDaMarca`.
 */
const ENTIDADE = "EtiquetaCarregamento";
const chaveHistorico = (opNumero, marca) => `${opNumero}|${String(marca).trim().toUpperCase()}`;

/**
 * Quando cada marca saiu impressa, e quantas vezes.
 *
 * ⚠ O HISTÓRICO MORA NO `AuditLog`, NÃO NUMA COLUNA NOVA. "Quem imprimiu e quando" é exatamente o
 * que a tabela de auditoria existe para responder — e o CLAUDE.md manda registrar toda mutação nela
 * de qualquer jeito, então a coluna seria a segunda cópia do mesmo fato. Uma coluna também daria só
 * a ÚLTIMA impressão; aqui ficam todas.
 */
async function impressoes(chaves, idsLegados) {
  const onde = [];
  if (chaves.length) onde.push({ entity: ENTIDADE, entityId: { in: chaves } });
  if (idsLegados.length) onde.push({ entity: "PecaConjunto", entityId: { in: idsLegados } });
  if (!onde.length) return new Map();

  const por = await prisma.auditLog.groupBy({
    by: ["entityId"],
    where: { action: ACAO, OR: onde },
    _max: { createdAt: true },
    _count: { _all: true },
  });
  return new Map(por.map((r) => [r.entityId, { em: r._max.createdAt, vezes: r._count._all }]));
}

/** O histórico de uma marca: a chave nova mais todos os ids antigos daquela marca. */
function historicoDaMarca(hist, chave, ids) {
  let em = null, vezes = 0;
  for (const k of [chave, ...ids]) {
    const h = hist.get(k);
    if (!h) continue;
    vezes += h.vezes;
    if (!em || (h.em && h.em > em)) em = h.em;
  }
  return { em, vezes };
}

async function carregar(opId) {
  // ⚠ QUEM DEFINE A LISTA É A LISTA DE EXPEDIÇÃO — a regra e o porquê moram em
  // `lib/itens-expedicao.js`, a mesma fonte usada pela Conferência de Peça.
  const dados = await itensExpediveisDaOP(prisma, opId);
  if (!dados) return null;

  const chaves = dados.pecas.map((p) => chaveHistorico(dados.op.numero, p.marca));
  const hist = await impressoes(chaves, dados.pecas.flatMap((p) => p.ids));
  return {
    op: dados.op,
    pecas: dados.pecas.map(({ ids, id: _id, naPlanilha: _naPlanilha, ...p }, i) => {
      const h = historicoDaMarca(hist, chaves[i], ids);
      return { ...p, id: chaves[i], impressaEm: h.em, impressoes: h.vezes };
    }),
  };
}

export async function GET(req) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const opId = new URL(req.url).searchParams.get("opId");

  // Sem opId, a tela está abrindo: devolve as OPs que TÊM peça cadastrada. OP sem peça não
  // rende etiqueta nenhuma e só faria a lista crescer.
  // Sem opId, a tela está abrindo: devolve as obras que TÊM item expedível.
  if (!opId) return NextResponse.json({ success: true, ops: await opsComItensExpediveis(prisma) });

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
        entity: ENTIDADE,
        entityId: chaveHistorico(op.numero, p.marca),
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
