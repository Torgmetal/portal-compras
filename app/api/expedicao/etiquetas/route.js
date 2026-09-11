// Etiquetas de carregamento — as que hoje saem do BarTender.
//
// GET  ?opId=xxx   → as marcas daquela OP, para a tela montar a seleção
// POST { opId, marcas[], modelo? } → o PDF, uma página de 100×50 mm por PEÇA
//   `modelo` é "padrao" (o desenho de sempre) ou "qws" (o do cliente da OP-102, que pede TAG
//   Petrobras e referência de desenho — ver `lib/etiqueta-qws-pdf.js`).
//
// ⚠ NÃO EXISTE UPLOAD DE PLANILHA AQUI, E ISSO É DE PROPÓSITO. O fluxo do BarTender era exportar
// planilha → importar no BarTender → imprimir. A Lista de Expedição já está no portal (ver
// `lib/itens-expedicao.js`); a planilha intermediária só existia porque o BarTender não enxerga o
// banco. Tirar esse pulo tira junto a chance de imprimir com dado velho.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MODELOS, gerarEtiquetasCarregamentoPDF } from "@/lib/etiqueta-carregamento-pdf";
import { camposExtrasDaOP, juntarCamposExtras } from "@/lib/etiqueta-campos-extras";
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

/**
 * A TAG usada na ÚLTIMA impressão desta obra, para a tela já vir preenchida.
 *
 * ⚠⚠ SAI DO `AuditLog`, SEM TABELA NOVA. O carimbo de cada impressão já guarda a TAG no `diff` —
 * perguntar a ele "qual foi a última" é de graça, e evita uma segunda cópia do mesmo fato.
 *
 * ⚠⚠ E EXISTE PARA EVITAR UM ERRO CARO, NÃO POR CONFORTO. A obra é impressa em lotes, ao longo de
 * dias. Se a TAG for digitada do zero a cada lote, mais cedo ou mais tarde um lote sai sem ela — ou
 * com ela errada — e vai para o caminhão misturado com os que saíram certos. Ninguém confere 442
 * adesivos um a um. Vir preenchida com o que foi usado da última vez transforma "lembrar" em
 * "conferir", que é o que dá para fazer com a peça na mão.
 *
 * ⚠ É SUGESTÃO, NÃO TRAVA: quem imprime pode apagar ou trocar. A TAG muda de embarque para
 * embarque, e travar no valor antigo seria pior que não sugerir.
 */
async function ultimaTagDaObra(opNumero) {
  const ultimo = await prisma.auditLog.findFirst({
    where: { action: ACAO, entity: ENTIDADE, entityId: { startsWith: `${opNumero}|` } },
    orderBy: { createdAt: "desc" },
    select: { diff: true },
  }).catch(() => null);
  const tag = ultimo?.diff?.tagObra;
  return typeof tag === "string" && tag.trim() ? tag.trim() : null;
}

async function carregar(opId) {
  // ⚠ QUEM DEFINE A LISTA É A LISTA DE EXPEDIÇÃO — a regra e o porquê moram em
  // `lib/itens-expedicao.js`, a mesma fonte usada pela Conferência de Peça.
  const dados = await itensExpediveisDaOP(prisma, opId);
  if (!dados) return null;

  const chaves = dados.pecas.map((p) => chaveHistorico(dados.op.numero, p.marca));
  const [hist, tagObra] = await Promise.all([
    impressoes(chaves, dados.pecas.flatMap((p) => p.ids)),
    ultimaTagDaObra(dados.op.numero),
  ]);
  return {
    op: dados.op,
    tagObra,
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
 * A TAG que o cliente pede na frente da OBRA, digitada na tela.
 *
 * ⚠⚠ NORMALIZADA NO SERVIDOR, NÃO NA TELA. Ela vai impressa em centenas de adesivos que saem no
 * caminhão: um espaço sobrando ou uma minúscula viram duas "TAGs" diferentes no olho de quem
 * confere no recebimento. Maiúsculas e sem espaço nas pontas é o mínimo — e o servidor é o único
 * lugar por onde TODA impressão passa.
 *
 * ⚠ 24 caracteres é o que a célula da OBRA aguenta sem espremer o nome da obra a ponto de não se
 * ler. Passar disso é quase certamente colar errado, não uma TAG legítima.
 */
const TAG_MAX = 24;
function normalizarTagObra(bruto) {
  const tag = String(bruto ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!tag) return { tag: null };
  if (tag.length > TAG_MAX) return { erro: `A TAG da obra tem no máximo ${TAG_MAX} caracteres.` };
  return { tag };
}

/**
 * Qual desenho usar e com qual TAG.
 *
 * ⚠ Modelo vindo da tela é validado contra a lista, não usado direto: um valor qualquer no corpo
 * não pode escolher um caminho de desenho que não existe.
 *
 * ⚠ A TAG É SÓ DO MODELO PADRÃO. O QWS já usa a célula de cima para "cliente | obra" e identifica a
 * peça pela TAG Petrobras — mais um código ali brigaria por espaço com o que o cliente confere.
 * Mandar a tag com modelo qws é ignorado em silêncio, não é erro: a tela nem mostra o campo, então
 * isso só acontece em chamada feita fora dela.
 */
function resolverDesenho(corpo) {
  const modelo = MODELOS.includes(corpo?.modelo) ? corpo.modelo : "padrao";
  const { tag, erro } = normalizarTagObra(modelo === "padrao" ? corpo?.tagObra : null);
  return { modelo, tagObra: tag ?? null, erro };
}

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
  // ⚠ Modelo vindo da tela é validado contra a lista, não usado direto: um valor qualquer no corpo
  // não pode escolher um caminho de desenho que não existe.
  const { modelo, tagObra, erro: erroDoDesenho } = resolverDesenho(corpo);
  if (erroDoDesenho) return { recusa: erro400(erroDoDesenho) };

  const dados = await carregar(opId);
  if (!dados) return { recusa: NextResponse.json({ success: false, error: "OP não encontrada" }, { status: 404 }) };

  const escolhidas = new Set(marcas.map(String));
  let pecas = dados.pecas.filter((p) => escolhidas.has(p.marca));
  if (!pecas.length) return { recusa: erro400("Nenhuma das marcas enviadas existe nesta OP.") };

  // Só o modelo do cliente lê estes campos — o padrão não faria nada com eles, e a consulta seria
  // um round-trip ao Neon por impressão sem serventia nenhuma.
  if (modelo === "qws") {
    pecas = juntarCamposExtras(pecas, await camposExtrasDaOP(prisma, dados.op.numero));
  }
  return { op: dados.op, pecas, modelo, tagObra };
}

/**
 * Uma linha de auditoria por MARCA — é a granularidade da pergunta que a tela faz ("esta marca já
 * saiu?"). Um registro só da OP inteira não responderia nada depois da primeira impressão parcial.
 *
 * ⚠ Não-fatal de propósito: uma falha ao registrar não pode segurar o PDF que já foi gerado. O
 * pior caso é a coluna dizer "—" para uma etiqueta impressa; imprimir de novo custa um adesivo.
 */
async function registrarImpressao(user, { op, pecas, modelo, tagObra }) {
  try {
    await prisma.auditLog.createMany({
      data: pecas.map((p) => ({
        userId: user?.id || null,
        action: ACAO,
        entity: ENTIDADE,
        entityId: chaveHistorico(op.numero, p.marca),
        diff: { op: op.numero, marca: p.marca, etiquetas: Math.max(1, p.qte || 1), modelo, tagObra, por: user?.name || null },
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
  const { recusa, op, pecas, modelo, tagObra } = await selecionar(corpo);
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
      modelo,
      tagObra,
    });
    // ⚠ SÓ DEPOIS DE O PDF EXISTIR. Carimbar antes marcaria como impressa uma marca cuja geração
    // falhou — e a tela ficaria dizendo "já saiu" para uma etiqueta que ninguém viu.
    await registrarImpressao(user, { op: dados.op, pecas, modelo, tagObra });
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
