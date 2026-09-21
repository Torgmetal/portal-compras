import "server-only";
import { prisma } from "./prisma";
import { OP_VIVA } from "./op-viva";
import { SO_FABRICACAO } from "./lista-pecas";
import { whereSetorSyneco } from "./syneco-dia";

/* APONTAMENTOS FEITOS NO PORTAL E AINDA NÃO LANÇADOS NO SYNECO — a planilha de correção.
 *
 * Vitor (14/09/2026): "na tela de produção precisamos ter uma forma de conseguirmos exportar a
 * planilha de Apontamentos para ser corrigido no Syneco".
 *
 * ⚠⚠ O SYNECO É A VERDADE; O PORTAL SÓ ADIANTA. A "baixa portal" (`PecaConjunto.baixaSetores[setor]`)
 * existe para o encarregado não ficar preso ao atraso do lançamento — mas enquanto o Syneco não tem o
 * mesmo número, o cronograma do cliente, o PDF e o portal do cliente (que leem o Syneco direto)
 * continuam discordando do quadro. Esta lista é a diferença: o que o portal diz que foi feito MENOS o
 * que o Syneco já registrou, por marca e setor. Quem lança é a pessoa, no Syneco; quando o sync
 * trouxer o número, a linha some sozinha.
 *
 * ⚠ A OBRA VAI NO CÓDIGO SKA (`opNumero` da LPC, "T94A"), que é como o Syneco conhece a obra — não o
 * número da OP do portal ("094"). Ver [[torg_pecaconjunto_opnumero]].
 *
 * ⚠⚠ SÓ ENTRA BAIXA FEITA PELO SETOR — romaneio, terceiro e fechamento administrativo FICAM DE FORA.
 * Vitor (17/09/2026): "vc esta trazendo algumas informações sem sentido, informações de romaneio, enfim
 * está bem ruim (…) somente dos setores para podermos baixar as peças". Medido no mesmo dia: das 3.527
 * baixas gravadas, 3.504 NÃO eram produção de ninguém no chão de fábrica —
 *   · 1.723 "Romaneio importado"   → a peça já embarcou; o romaneio (FORM-22) criou a baixa
 *   · 1.280 motivo "preparação encerrada — nada mais a cortar nesta obra" → fechamento em massa do corte
 *   ·   456 "Guarda-corpo — fabricação no terceiro" → fabricada FORA; não existe operação para lançar
 *   ·    45 "Fora do escopo — já fabricada (Vitor)" → baixa administrativa da OP-067, em agosto
 * Nenhuma delas vira apontamento no Syneco: quem for lançar não tem o que lançar, e a planilha ficava
 * com 3.503 linhas de ruído escondendo as 23 de verdade. Elas continuam no banco e nas telas que
 * medem prontidão — o que muda é só quem entra NESTA planilha.
 *
 * ⚠ O QUE SE LANÇA É O SALDO: baixa do portal (limitada à quantidade da marca) menos o produzido no
 * Syneco naquele setor. Baixa sem `qtd` é a marca inteira (mesma leitura de /api/pcp/despacho).
 */

export const SETORES_SYNECO = ["CORTE", "PREPARACAO", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
export const NOME_SYNECO = { CORTE: "Corte", PREPARACAO: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura" };

// Assinaturas das baixas que NÃO são produção de setor. São dados históricos (importações e scripts
// de fechamento), por isso a regra mora no valor gravado e não numa rota: nenhum código vivo escreve
// esses nomes hoje, e uma importação nova de romaneio volta a cair aqui sem precisar de manutenção.
const PORNOME_NAO_PRODUCAO = /romaneio importado|terceiro|fora do escopo|j[áa] fabricada/i;
const MOTIVO_NAO_PRODUCAO = /preparaç[ãa]o encerrada|nada mais a cortar|fora do escopo/i;

/**
 * A baixa é produção que o setor fez e o Syneco precisa receber?
 * @param {{porNome?:string|null, motivo?:string|null}|null} bx  o valor de `baixaSetores[setor]`
 */
export function ehBaixaDeSetor(bx) {
  if (!bx || typeof bx !== "object") return false;
  if (bx.motivo && MOTIVO_NAO_PRODUCAO.test(bx.motivo)) return false;
  return !(bx.porNome && PORNOME_NAO_PRODUCAO.test(bx.porNome));
}

/** A obra como o SYNECO a conhece ("T67F"). O número do portal ("083") não serve — ninguém acha a
 *  obra por ele lá. Sem código reconhecível, a planilha mostra "—" em vez de mentir. */
const CODIGO_SYNECO = /^T\d+[A-Z]*$/i;
export function obraDoSyneco(opNumero, obrasDaOP) {
  const cru = String(opNumero || "").trim().toUpperCase();
  if (CODIGO_SYNECO.test(cru)) return cru;
  const unica = obrasDaOP && obrasDaOP.size === 1 ? [...obrasDaOP][0] : null;
  return unica || null;
}

/** As obras que o Syneco conhece para cada OP — o resgate de quem tem `opNumero` no formato do portal. */
async function obrasDoSynecoPorOP(opIds) {
  const porOp = new Map();
  if (!opIds.length) return porOp;
  // ⚠ `obra` é NOT NULL no MesOrdem — um `{ not: null }` aqui invalida a consulta inteira, e o
  // `catch` devolvia a lista vazia sem ninguém notar (achado ao rodar contra o banco, 17/09/2026).
  const obras = await prisma.mesOrdem.groupBy({ by: ["opId", "obra"], where: { opId: { in: opIds } } }).catch(() => []);
  for (const o of obras) {
    if (!o.obra || !o.opId) continue;
    if (!porOp.has(o.opId)) porOp.set(o.opId, new Set());
    porOp.get(o.opId).add(o.obra);
  }
  return porOp;
}

/** Quantidade baixada no portal para a peça naquele setor (0 se não houve baixa). */
export function baixaDoPortal(peca, setor) {
  const bx = peca.baixaSetores && typeof peca.baixaSetores === "object" ? peca.baixaSetores[setor] : null;
  if (!ehBaixaDeSetor(bx)) return { qtd: 0, por: null, em: null };
  const total = Math.max(1, Number(peca.qte) || 1);
  const qtd = bx.qtd != null ? Math.max(0, Math.min(total, Number(bx.qtd) || 0)) : total;
  return { qtd, por: bx.porNome || null, em: bx.em || null };
}

/**
 * Linhas para lançar no Syneco.
 * @param {{ opId?: string|null, setor?: string|null }} filtro  sem filtro = todas as OPs vivas, todos os setores
 */
export async function apontamentosParaSyneco({ opId = null, setor = null } = {}) {
  const setores = setor ? [String(setor).toUpperCase()] : SETORES_SYNECO;
  if (setor && !NOME_SYNECO[setores[0]]) throw new Error(`Setor sem correspondente no Syneco: ${setor}`);
  const pecas = await prisma.pecaConjunto.findMany({
    where: { ...SO_FABRICACAO, ...OP_VIVA, ...(opId ? { opId } : {}), NOT: { baixaSetores: { equals: null } } },
    select: { id: true, opId: true, opNumero: true, marca: true, descricao: true, perfil: true, qte: true, pesoUnitKg: true, baixaSetores: true,
      op: { select: { numero: true, obra: true, cliente: true } } },
  });
  // só quem tem baixa em algum setor pedido
  const comBaixa = pecas.filter((p) => setores.some((s) => baixaDoPortal(p, s).qtd > 0));
  const opIds = [...new Set(comBaixa.map((p) => p.opId).filter(Boolean))];
  // as obras que o Syneco conhece para estas OPs — resgatam a linha cujo `opNumero` veio da L.E. no
  // formato do portal ("083"), que não existe do lado de lá
  const obrasPorOp = await obrasDoSynecoPorOP(opIds);
  const linhas = [];
  for (const s of setores) {
    const alvo = comBaixa.filter((p) => baixaDoPortal(p, s).qtd > 0);
    if (!alvo.length) continue;
    // produzido no Syneco naquele setor, por (OP, marca) — a mesma leitura do painel de Despacho
    const syn = await prisma.mesOrdem.groupBy({
      by: ["opId", "item"],
      where: { AND: [{ opId: { in: opIds } }, { item: { in: [...new Set(alvo.map((p) => p.marca))] } }, whereSetorSyneco(s), { produzidoUn: { gt: 0 } }] },
      _sum: { produzidoUn: true },
    });
    const noSyneco = new Map(syn.map((r) => [`${r.opId}|${r.item}`, Math.round(r._sum?.produzidoUn || 0)]));
    for (const p of alvo) {
      const bx = baixaDoPortal(p, s), feito = noSyneco.get(`${p.opId}|${p.marca}`) || 0, aLancar = bx.qtd - feito;
      if (aLancar <= 0) continue;
      linhas.push({
        opNumero: p.op?.numero || null, obra: p.op?.obra || null, obraSyneco: obraDoSyneco(p.opNumero, obrasPorOp.get(p.opId)),
        setor: s, setorSyneco: NOME_SYNECO[s], marca: p.marca, descricao: p.descricao || null, perfil: p.perfil || null,
        qte: Math.max(1, Number(p.qte) || 1), noPortal: bx.qtd, noSyneco: feito, aLancar,
        pesoALancarKg: Math.round((Number(p.pesoUnitKg) || 0) * aLancar * 100) / 100,
        baixadoPor: bx.por, baixadoEm: bx.em,
      });
    }
  }
  const ordemSetor = new Map(SETORES_SYNECO.map((s, i) => [s, i]));
  linhas.sort((a, b) => ordemSetor.get(a.setor) - ordemSetor.get(b.setor) || String(a.opNumero).localeCompare(String(b.opNumero)) || a.marca.localeCompare(b.marca, "pt", { numeric: true }));
  return {
    linhas,
    total: { linhas: linhas.length, pecas: linhas.reduce((t, l) => t + l.aLancar, 0), kg: Math.round(linhas.reduce((t, l) => t + l.pesoALancarKg, 0)),
      ops: new Set(linhas.map((l) => l.opNumero)).size, setores: new Set(linhas.map((l) => l.setor)).size },
    geradoEm: new Date().toISOString(),
  };
}
