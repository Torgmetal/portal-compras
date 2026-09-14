import "server-only";
import { chaveMarca } from "@/lib/itens-expedicao";

// ─── A TAG DO CLIENTE NA ETIQUETA PADRÃO ─────────────────────────────────────
//
// Guarda a "Lista de Equivalência de TAG" do TMSA em `EtiquetaCampoExtra.tagCliente`, uma linha por
// UNIDADE, e responde quanto da obra está coberto.
//
// ⚠⚠ SÓ O CAMPO `tagCliente` É TOCADO. A mesma tabela guarda os campos do QWS (`descricao`,
// `referencia`, `tagPetrobras`), que vêm de outra planilha e alimentam outro modelo de etiqueta.
// Um `deleteMany` por OP aqui apagaria os dois de uma vez (pedido do Codex).

/**
 * O que a planilha cobre da Lista de Expedição — e o que ela deixa de fora.
 *
 * ⚠⚠ É A CONFERÊNCIA QUE PRECISA EXISTIR ANTES DE IMPRIMIR. Marca com mais peças na L.E. do que na
 * planilha tem etiqueta que sai SEM TAG; e sair sem TAG é o certo — herdar a TAG de outra unidade
 * poria a peça no transportador errado, que é pior que não dizer nada (pedido do Codex).
 *
 * @param {{marca:string, unidade:number, tag:string}[]} unidades
 * @param {{marca:string, qte:number}[]} pecas  da Lista de Expedição
 */
export function conferirCobertura(unidades, pecas) {
  // ⚠⚠ CONTAR AS UNIDADES, NÃO PEGAR A MAIOR. Com as unidades {1, 3} e 3 peças na L.E., a maior
  // é 3 e a cobertura diria "3 de 3" — enquanto a unidade 2 sai sem TAG e a tela nem pergunta.
  // O buraco não aparece no import inteiro (que numera 1..n), aparece quando a planilha é
  // reimportada em partes (Codex, 14/09/2026).
  const porMarca = new Map();
  for (const u of unidades) {
    const k = chaveMarca(u.marca);
    if (!porMarca.has(k)) porMarca.set(k, new Set());
    porMarca.get(k).add(Number(u.unidade) || 0);
  }
  const naLista = new Set(pecas.map((p) => chaveMarca(p.marca)));

  const semTag = [];      // a L.E. tem mais peças que a planilha — etiquetas sem prefixo
  const sobrando = [];    // a planilha tem mais peças que a L.E. — unidades que nunca imprimem
  let cobertas = 0, total = 0;
  for (const p of pecas) {
    const qte = Math.max(1, Number(p.qte) || 1);
    const unidadesDaMarca = porMarca.get(chaveMarca(p.marca)) || new Set();
    // Só conta a unidade que a etiqueta vai de fato procurar: 1..qte.
    let comTag = 0;
    for (let u = 1; u <= qte; u++) if (unidadesDaMarca.has(u)) comTag++;
    total += qte;
    cobertas += comTag;
    if (comTag < qte) semTag.push({ marca: p.marca, qte, comTag });
    // "Sobrando" é unidade que NUNCA vai imprimir por estar fora de 1..qte — e é por número, não
    // por contagem: com {1,3} e 2 peças o conjunto tem 2 unidades e mesmo assim a 3 nunca sai.
    if ([...unidadesDaMarca].some((u) => u > qte)) sobrando.push({ marca: p.marca, qte, comTag: unidadesDaMarca.size });
  }
  // ⚠ Marca que está na planilha e não na L.E. não é detalhe: ou a lista foi revisada, ou a
  // planilha é de outra obra. Descartar em silêncio esconderia as duas.
  const foraDaLista = [...porMarca.keys()].filter((k) => !naLista.has(k));

  return { total, cobertas, semTag, sobrando, foraDaLista, completa: semTag.length === 0 && foraDaLista.length === 0 };
}

/**
 * Grava o mapa da OP — SUBSTITUIÇÃO COMPLETA das TAGs TMSA daquela obra.
 *
 * ⚠⚠ SUBSTITUI, NÃO SOMA (pedido do Codex). O `upsert` sozinho deixaria órfã a unidade que a
 * planilha nova não traz mais: ela seguiria imprimindo a TAG velha, e ninguém veria. Então a
 * transação primeiro ZERA `tagCliente` da OP inteira e só depois aplica o mapa novo.
 *
 * ⚠ Zera o CAMPO, não a linha: `deleteMany` levaria junto os campos do QWS da mesma OP.
 *
 * ⚠ Planilha vazia ou inválida nunca chega aqui — quem lê recusa antes. Uma limpeza disparada por
 * arquivo torto apagaria o mapa inteiro sem nada para pôr no lugar.
 */
export async function salvarTagsCliente(prisma, opNumero, unidades) {
  if (!unidades?.length) return { erro: "Nada para gravar." };
  const op = String(opNumero);

  return prisma.$transaction(async (tx) => {
    const zerados = await tx.etiquetaCampoExtra.updateMany({
      where: { opNumero: op, tagCliente: { not: null } }, data: { tagCliente: null },
    });
    let gravadas = 0;
    for (const u of unidades) {
      await tx.etiquetaCampoExtra.upsert({
        where: { opNumero_marca_unidade: { opNumero: op, marca: u.marca, unidade: u.unidade } },
        update: { tagCliente: u.tag },
        create: { opNumero: op, marca: u.marca, unidade: u.unidade, tagCliente: u.tag },
      });
      gravadas++;
    }
    return { gravadas, zeradas: zerados.count };
  }, { timeout: 120_000, maxWait: 30_000 });
}

/** O mapa gravado da OP: "MARCA|unidade" → TAG. */
export async function tagsDaOP(prisma, opNumero) {
  const linhas = await prisma.etiquetaCampoExtra.findMany({
    where: { opNumero: String(opNumero), tagCliente: { not: null } },
    select: { marca: true, unidade: true, tagCliente: true },
  });
  return linhas.map((l) => ({ marca: l.marca, unidade: l.unidade, tag: l.tagCliente }));
}
