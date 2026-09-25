import "server-only";
import { classificarMaterial, gruposDaSecao } from "./databook-secoes";
import { enriquecerComFicha, rDoDoc } from "./databook-ficha-r";
import { estaFechado, ESTADOS_FECHADOS } from "./databook-revisao";

// ─── O CERTIFICADO QUE CHEGA DEPOIS ENTRA SOZINHO NO DATA BOOK EM MONTAGEM ──────────────────────
//
// ⚠⚠ O "PUXAR CERTIFICADOS" DA SEÇÃO É UM RETRATO DO CLIQUE. Geraldo (OP-102, 25/09/2026):
// "importamos os certificados faltantes, mas ainda falta puxar". O botão da §04 rodou 5× com
// "0 novos", porque os 11 R ainda não tinham chegado ao portal (o CMR ficou parado de 23 a 25/09).
// Quando chegaram, ninguém clicou de novo — e a §02, que o PDF monta AO VIVO pelo rastreio, passou
// a citar 11 R cujos certificados não estavam no livro. Vitor: "sim pode vincular".
//
// O cron do data book faz o clique que faltou, com a MESMA seleção do botão (`certificadosDaOp` +
// `doGrupo`), e com quatro travas que o botão não precisa, porque o botão é uma decisão de gente:
//
//   1. SÓ SEÇÃO JÁ MONTADA (ANEXADO, com documento). A primeira montagem é de quem monta.
//   2. SÓ O QUE CHEGOU DEPOIS da última montagem da seção. ⚠ Tirar documento do livro só deixa
//      rastro desde 15/09/2026 (357b84c0): o que já existia quando a seção foi montada e não está
//      nela pode ter sido tirado de propósito, e não há como saber. Na OP-085 são 12.
//   3. NUNCA DEVOLVE O QUE ALGUÉM TIROU — pelo documento ou pelo R.
//   4. NUNCA DUPLICA UM R. O anexo manual "R 260527" e a linha do CMR daquele R são o mesmo
//      certificado em dois registros (a §05 da OP-089 tem 59 assim).
//
// ⚠ Arame (§06) e granalha (§15) ficam de fora: são o lote VIGENTE nos dias de solda/jato, e antes
// de a obra passar por lá o botão traz o lote de hoje como previsto. Automático, isso poria no livro
// um lote que a obra talvez nunca use.

export const SECOES_AUTOMATICAS = ["04", "05", "15"];
const ACAO = "VINCULAR_CERTIFICADOS_AUTO_DATABOOK";

const ms = (d) => (d ? new Date(d).getTime() : 0);

/**
 * Os certificados de material que o "Puxar certificados" oferece para a OP: os lançados sob ela no
 * CMR e os R de outra obra DECLARADOS na Conferência de Rastreabilidade — já com a ficha do CMR,
 * que é o que permite classificar pelo material. `declaradoEm` é quando a declaração foi feita.
 */
export async function certificadosDaOp(db, opNumero) {
  const campos = { id: true, nome: true, importRef: true, createdAt: true };
  const daOp = await db.documentoQualidade.findMany({ where: { ativo: true, categoria: "MATERIAL", opNumero }, select: campos });

  // O AÇO QUE ENTROU POR OUTRA OBRA (Vitor, 05/09/2026, fechando a OP-085): quem declara na
  // Conferência de Rastreabilidade que aquele perfil veio do R tal faz a §02 carimbar esse R na peça
  // — então o certificado DESSE R tem de estar no livro, mesmo lançado sob outra OP.
  const declaradoEm = new Map();
  for (const t of await db.trocaRastreabilidade.findMany({ where: { opNumero }, select: { rUsado: true, updatedAt: true } })) {
    if (t.rUsado && ms(t.updatedAt) >= ms(declaradoEm.get(t.rUsado))) declaradoEm.set(t.rUsado, t.updatedAt);
  }
  const declarados = declaradoEm.size
    ? await db.documentoQualidade.findMany({ where: { ativo: true, categoria: "MATERIAL", importRef: { in: [...declaradoEm.keys()] } }, select: campos })
    : [];
  const idsDaOp = new Set(daOp.map((d) => d.id));
  const deOutraObra = declarados.filter((d) => !idsDaOp.has(d.id)).map((d) => ({ ...d, declaradoEm: declaradoEm.get(d.importRef) }));
  return enriquecerComFicha([...daOp, ...deOutraObra], opNumero);
}

/** Só os do grupo de material da seção (aço na §04, fixador na §05, tinta e abrasivo na §15). */
export const doGrupo = (docs, grupos) => (grupos.length ? docs.filter((d) => grupos.includes(classificarMaterial(d.nome))) : docs);

/**
 * Quais candidatos entram sozinhos numa seção. Puro: decide, não lê nem grava.
 * @param {{ secao: {estado:string, documentos:{createdAt:Date}[]},
 *           candidatos: {id:string, nome:string, importRef?:string, createdAt:Date, declaradoEm?:Date}[],
 *           livro: {ids:Set<string>, rs:Set<string>, removidos:{ids:Set<string>, rs:Set<string>}} }} x
 */
export function certificadosQueEntram({ secao, candidatos, livro }) {
  if (secao?.estado !== "ANEXADO" || !secao.documentos?.length) return [];
  const montadaEm = Math.max(...secao.documentos.map((d) => ms(d.createdAt)));
  const vistos = new Set();
  const entram = [];
  for (const c of candidatos) {
    if (Math.max(ms(c.createdAt), ms(c.declaradoEm)) <= montadaEm) continue;
    const r = rDoDoc(c);
    if (livroJaTeve(livro, c.id, r) || vistos.has(r)) continue;
    if (r) vistos.add(r);
    entram.push({ ...c, r });
  }
  return entram;
}

// o livro já tem (em qualquer seção) ou já teve e alguém tirou — pelo documento ou pelo R
function livroJaTeve(livro, id, r) {
  if (livro.ids.has(id) || livro.removidos.ids.has(id)) return true;
  return Boolean(r) && (livro.rs.has(r) || livro.removidos.rs.has(r));
}

// o que o livro já tem (em QUALQUER seção) e o que já tiraram dele
async function contextoDoLivro(db, livro) {
  const campos = { id: true, nome: true, importRef: true };
  const ids = new Set(livro.secoes.flatMap((s) => s.documentos.map((d) => d.documentoId)));
  const vinculados = ids.size ? await db.documentoQualidade.findMany({ where: { id: { in: [...ids] } }, select: campos }) : [];
  const remocoes = await db.auditLog.findMany({
    where: { action: "REMOVER_DOC_SECAO_DATABOOK", entity: "DataBookSecao", entityId: { in: livro.secoes.map((s) => s.id) } },
    select: { diff: true },
  });
  const removidosIds = new Set(remocoes.map((a) => a.diff?.documentoId).filter(Boolean));
  const removidos = removidosIds.size ? await db.documentoQualidade.findMany({ where: { id: { in: [...removidosIds] } }, select: campos }) : [];
  return {
    ids,
    rs: new Set(vinculados.map(rDoDoc).filter(Boolean)),
    removidos: { ids: removidosIds, rs: new Set(removidos.map(rDoDoc).filter(Boolean)) },
  };
}

// grava com o livro TRAVADO; devolve quantos vínculos entraram, ou null se ele fechou no meio
function gravarNoLivro(db, livro, secoes) {
  return db.$transaction(async (tx) => {
    // ⚠ Emitir e iniciar assinaturas gravam nesta mesma linha: com ela travada, esperam esta
    // transação terminar. Sem a trava, o certificado podia entrar num livro que acabou de virar
    // documento — "os data books emitidos não mexa em nada" (Vitor, 19/08/2026).
    const [atual] = (await tx.$queryRaw`SELECT status, "emitidoEm" FROM "DataBookQualidade" WHERE id = ${livro.id} FOR UPDATE`) || [];
    if (!atual || estaFechado(atual)) return null;
    const res = await tx.dataBookSecaoDoc.createMany({
      data: secoes.flatMap((s) => s.entram.map((c) => ({ secaoId: s.id, documentoId: c.id }))),
      skipDuplicates: true,
    });
    await tx.auditLog.createMany({
      data: secoes.map((s) => ({
        userId: null, action: ACAO, entity: "DataBookSecao", entityId: s.id,
        diff: {
          opNumero: livro.opNumero, secao: s.numero, regra: "chegou depois da última montagem da seção",
          rs: s.entram.map((c) => c.r).filter(Boolean), documentoIds: s.entram.map((c) => c.id),
        },
      })),
    });
    return res.count;
  }, { timeout: 20000 });
}

async function livrosEmMontagem(db) {
  const livros = await db.dataBookQualidade.findMany({
    where: { emitidoEm: null, status: { notIn: [...ESTADOS_FECHADOS] } },
    select: {
      id: true, opNumero: true, status: true, emitidoEm: true,
      secoes: { select: { id: true, numero: true, estado: true, documentos: { select: { documentoId: true, createdAt: true } } } },
    },
  });
  return livros.filter((b) => b.opNumero && !estaFechado(b));
}

// as seções do livro que recebem algo, cada uma com o que entra
async function decidirLivro(db, livro) {
  const alvo = livro.secoes.filter((s) => SECOES_AUTOMATICAS.includes(s.numero) && s.estado === "ANEXADO" && s.documentos.length);
  if (!alvo.length) return [];
  const contexto = await contextoDoLivro(db, livro);
  const candidatos = await certificadosDaOp(db, livro.opNumero);
  const secoes = [];
  for (const s of alvo) {
    const entram = certificadosQueEntram({ secao: s, candidatos: doGrupo(candidatos, gruposDaSecao(s.numero)), livro: contexto });
    if (!entram.length) continue;
    for (const c of entram) { contexto.ids.add(c.id); if (c.r) contexto.rs.add(c.r); }
    secoes.push({ id: s.id, numero: s.numero, entram });
  }
  return secoes;
}

/**
 * Uma rodada: para cada data book em montagem, vincula nas §04/§05/§15 já montadas os certificados
 * que chegaram depois. `gravar: false` só diz o que entraria.
 * @returns {Promise<{vinculados:number, livros:{id:string, opNumero:string, fechouNoMeio?:boolean, secoes:{numero:string, rs:string[]}[]}[]}>}
 */
export async function vincularCertificadosNovos(db, { gravar = true } = {}) {
  const resumo = { vinculados: 0, livros: [] };
  for (const livro of await livrosEmMontagem(db)) {
    const secoes = await decidirLivro(db, livro);
    if (!secoes.length) continue;
    const item = { id: livro.id, opNumero: livro.opNumero, secoes: secoes.map((s) => ({ numero: s.numero, rs: s.entram.map((c) => c.r || c.id) })) };
    if (gravar) {
      const n = await gravarNoLivro(db, livro, secoes);
      if (n === null) item.fechouNoMeio = true;
      else resumo.vinculados += n;
    }
    resumo.livros.push(item);
  }
  return resumo;
}
