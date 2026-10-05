// ─── O LOTE DO CMR: TUDO OU NADA, E O REENVIO NÃO CRIA R DE NOVO ────────────
//
// ⚠⚠ O CASO REAL (pedido 2054, 05/10/2026): 43 itens marcados, "Gravar 43". Os 43 R foram gravados um
// por um e a função continuou avisando a Engenharia, ~1 s por aviso, até a Vercel derrubá-la nos 60 s.
// A tela recebeu a página de erro ("Unexpected token 'A'… is not valid JSON") e manteve o botão
// "Gravar 43" — outro clique teria criado mais 43 R para o mesmo material.
//
// Desenho aprovado pelo Codex (consulta `database`, 05/10/2026):
// 1. O cliente gera um `loteId` e o reenvia igual a cada tentativa. `CmrLote` guarda o resultado
//    EXATO (R e ids), não um intervalo — `de..ate` pode conter R de outro lote ou pular números.
// 2. O `hash` do conteúdo vai junto: mesma chave com conteúdo diferente é CONFLITO, nunca sucesso.
// 3. Documentos, lote e auditoria entram numa transação só. Falha na auditoria desfaz tudo.
// 4. Duas travas, sempre na mesma ordem: o lote (dois cliques do mesmo lote) e o ano (dois lotes
//    diferentes disputando o próximo R). O R é recalculado DENTRO da trava, pelo cliente da transação.
//
// ⚠ A planilha do SharePoint é lida ANTES, fora da transação: chamada de rede segurando trava de
// banco seria convite a fila. Risco residual aceito: alguém digitar na planilha entre a leitura e a
// gravação — nenhuma transação do Postgres tranca um editor de Excel.
import { createHash } from "node:crypto";
import { prefixoAno, proximoIndiceR, mapearLancamento } from "@/lib/cmr";

export class LoteConflito extends Error {
  constructor(msg) { super(msg); this.name = "LoteConflito"; }
}

/** Impressão digital do conteúdo do lote: ordem das chaves e campo vazio não mudam o resultado. */
export function hashDoLote(lancamentos) {
  const normal = (lancamentos || []).map((l) =>
    Object.keys(l || {}).sort()
      .filter((k) => l[k] !== null && l[k] !== undefined && String(l[k]).trim() !== "")
      .map((k) => [k, String(l[k]).trim()]));
  return createHash("sha256").update(JSON.stringify(normal)).digest("hex");
}

function conferirDono(lote, { hash, userId }) {
  if (lote.userId !== userId) throw new LoteConflito("Este lote foi gravado por outra pessoa.");
  if (lote.hash !== hash) {
    throw new LoteConflito("Este lote já foi gravado com outro conteúdo. Recarregue a lista e confira os R antes de lançar de novo.");
  }
}

async function docsDoLote(db, lote, select) {
  const docs = await db.documentoQualidade.findMany({ where: { id: { in: lote.docIds } }, select });
  const porId = new Map(docs.map((d) => [d.id, d]));
  return lote.docIds.map((id) => porId.get(id)).filter(Boolean);
}

/** Lote já gravado com esta chave? Devolve o resultado guardado (ou lança conflito), sem trava. */
export async function loteJaGravado(db, { loteId, hash, userId, select }) {
  const lote = await db.cmrLote.findUnique({ where: { id: loteId } });
  if (!lote) return null;
  conferirDono(lote, { hash, userId });
  return { replay: true, indices: lote.indices, docs: await docsDoLote(db, lote, select) };
}

const travar = (tx, chave) => tx.$queryRaw`SELECT 1 AS travado FROM pg_advisory_xact_lock(hashtext(${chave}))`;

/**
 * Grava o lote inteiro (documentos + resultado + auditoria) ou nada.
 * @returns {{replay:boolean, indices:string[], docs:object[]}}
 */
export async function gravarLoteCmr(db, { loteId, hash, userId, ano, lancamentos, ocupados, select }) {
  return db.$transaction(async (tx) => {
    await travar(tx, `cmr-lote:${loteId}`);
    const ja = await loteJaGravado(tx, { loteId, hash, userId, select });
    if (ja) return ja;

    await travar(tx, `cmr-r:${ano}`);
    const pre = prefixoAno(ano);
    const usados = new Set((ocupados || []).map((v) => String(v).trim()));
    let seq = Number(String(await proximoIndiceR(ano, ocupados, tx)).slice(2));
    const indices = lancamentos.map(() => {
      while (usados.has(`${pre}${String(seq).padStart(4, "0")}`)) seq++;
      const r = `${pre}${String(seq++).padStart(4, "0")}`;
      usados.add(r);
      return r;
    });

    const criados = await tx.documentoQualidade.createManyAndReturn({
      data: lancamentos.map((l, i) => mapearLancamento(l, indices[i], userId)),
      select: { ...select, id: true, importRef: true },
    });
    // ⚠ A ordem vem do R atribuído, nunca da posição no retorno: o banco não promete devolver na
    // ordem de entrada, e trocar duas linhas aqui trocaria a identidade de dois materiais na tela.
    const porR = new Map(criados.map((d) => [String(d.importRef), d]));
    const docs = indices.map((r) => porR.get(r));
    if (docs.some((d) => !d)) throw new Error("O banco não devolveu todos os R do lote.");

    await tx.cmrLote.create({ data: { id: loteId, userId, hash, ano, indices, docIds: docs.map((d) => d.id) } });
    await tx.auditLog.create({ data: {
      userId, action: "CMR_LANCAR", entity: "CmrLote", entityId: loteId,
      diff: { loteId, ano, qtd: indices.length, indices },
    } });
    return { replay: false, indices, docs };
  }, { maxWait: 15000, timeout: 30000 });
}
