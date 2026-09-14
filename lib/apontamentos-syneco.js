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
 * ⚠ O QUE SE LANÇA É O SALDO: baixa do portal (limitada à quantidade da marca) menos o produzido no
 * Syneco naquele setor. Baixa sem `qtd` é a marca inteira (mesma leitura de /api/pcp/despacho).
 */

export const SETORES_SYNECO = ["CORTE", "PREPARACAO", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
export const NOME_SYNECO = { CORTE: "Corte", PREPARACAO: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura" };

/** Quantidade baixada no portal para a peça naquele setor (0 se não houve baixa). */
export function baixaDoPortal(peca, setor) {
  const bx = peca.baixaSetores && typeof peca.baixaSetores === "object" ? peca.baixaSetores[setor] : null;
  if (!bx) return { qtd: 0, por: null, em: null };
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
        opNumero: p.op?.numero || null, obra: p.op?.obra || null, obraSyneco: p.opNumero || null,
        setor: s, setorSyneco: NOME_SYNECO[s], marca: p.marca, descricao: p.descricao || null, perfil: p.perfil || null,
        qte: Math.max(1, Number(p.qte) || 1), noPortal: bx.qtd, noSyneco: feito, aLancar,
        pesoALancarKg: Math.round((Number(p.pesoUnitKg) || 0) * aLancar * 100) / 100,
        baixadoPor: bx.por, baixadoEm: bx.em,
      });
    }
  }
  const ordemSetor = new Map(SETORES_SYNECO.map((s, i) => [s, i]));
  linhas.sort((a, b) => String(a.opNumero).localeCompare(String(b.opNumero)) || ordemSetor.get(a.setor) - ordemSetor.get(b.setor) || a.marca.localeCompare(b.marca, "pt", { numeric: true }));
  return {
    linhas,
    total: { linhas: linhas.length, pecas: linhas.reduce((t, l) => t + l.aLancar, 0), kg: Math.round(linhas.reduce((t, l) => t + l.pesoALancarKg, 0)),
      ops: new Set(linhas.map((l) => l.opNumero)).size, setores: new Set(linhas.map((l) => l.setor)).size },
    geradoEm: new Date().toISOString(),
  };
}
