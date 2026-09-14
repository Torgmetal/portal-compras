import "server-only";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/log";

// ─── O HISTÓRICO DE IMPRESSÃO DAS ETIQUETAS ──────────────────────────────────
//
// ⚠⚠ MORA NO `AuditLog`, NÃO NUMA COLUNA DE `PecaConjunto`. É a pergunta que a tabela de auditoria
// já existe para responder, o registro é obrigatório de qualquer jeito, e assim ficam TODAS as
// impressões, não só a última.
//
// ⚠⚠ A CHAVE É A MARCA (`<opNumero>|<MARCA>`), não o id da peça: o id não sobrevive à reimportação
// da Lista de Expedição — a mesma lição já gravada em `LiberacaoProducao.pecaMarcas` — e desde que
// a lista passou a ser definida pela L.E. existe item legítimo SEM linha no cadastro.
//
// ⚠ Saiu de `app/api/expedicao/etiquetas/route.js` quando ela passou de 350 linhas. A regra não
// mudou; só deixou de morar dentro do arquivo que traduz HTTP.

const registro = log("lib/etiqueta-historico");

export const ACAO = "IMPRIMIR_ETIQUETA_CARREGAMENTO";
export const ENTIDADE = "EtiquetaCarregamento";

export const chaveHistorico = (opNumero, marca) => `${opNumero}|${String(marca).trim().toUpperCase()}`;

/**
 * Quando cada marca saiu impressa, e quantas vezes.
 *
 * ⚠ O HISTÓRICO MORA NO `AuditLog`, NÃO NUMA COLUNA NOVA. "Quem imprimiu e quando" é exatamente o
 * que a tabela de auditoria existe para responder — e o CLAUDE.md manda registrar toda mutação nela
 * de qualquer jeito, então a coluna seria a segunda cópia do mesmo fato. Uma coluna também daria só
 * a ÚLTIMA impressão; aqui ficam todas.
 */
export async function impressoes(chaves, idsLegados) {
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
export function historicoDaMarca(hist, chave, ids) {
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
export async function ultimaTagDaObra(opNumero) {
  const ultimo = await prisma.auditLog.findFirst({
    where: { action: ACAO, entity: ENTIDADE, entityId: { startsWith: `${opNumero}|` } },
    orderBy: { createdAt: "desc" },
    select: { diff: true },
  }).catch(() => null);
  const tag = ultimo?.diff?.tagObra;
  return typeof tag === "string" && tag.trim() ? tag.trim() : null;
}

/**
 * Uma linha de auditoria por MARCA — é a granularidade da pergunta que a tela faz ("esta marca já
 * saiu?"). Um registro só da OP inteira não responderia nada depois da primeira impressão parcial.
 *
 * ⚠ Não-fatal de propósito: uma falha ao registrar não pode segurar o PDF que já foi gerado. O
 * pior caso é a coluna dizer "—" para uma etiqueta impressa; imprimir de novo custa um adesivo.
 */
export async function registrarImpressao(user, { op, pecas, modelo, tagObra }) {
  try {
    await prisma.auditLog.createMany({
      data: pecas.map((p) => ({
        userId: user?.id || null,
        action: ACAO,
        entity: ENTIDADE,
        entityId: chaveHistorico(op.numero, p.marca),
        diff: { op: op.numero, marca: p.marca, etiquetas: p.emCaixa ? 1 : Math.max(1, p.qte || 1),
                emCaixa: !!p.emCaixa, modelo, tagObra, por: user?.name || null },
      })),
    });
  } catch (e) {
    registro.erro("falha ao registrar a impressão:", e?.message);
  }
}
