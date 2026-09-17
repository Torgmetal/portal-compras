import "server-only";
import { prisma } from "./prisma";

/* APONTAMENTO NA FRENTE → BAIXA NOS SETORES ATRÁS (a planilha de furos do Syneco)
 *
 * Vitor (17/09/2026): "antes tínhamos uma planilha que pegava esses furos de apontamentos, exemplo:
 * se a peça estava apontada na pintura já indicava que tinha que dar baixa nos setores anteriores
 * que não foram dado baixa".
 *
 * ⚠⚠ A FONTE É O PRÓPRIO SYNECO, NÃO A BAIXA DO PORTAL. A outra aba da planilha
 * (`lib/apontamentos-syneco.js`) parte do que alguém baixou no portal. Esta parte do que o Syneco
 * JÁ TEM: a peça pintada foi montada, soldada e jateada, mesmo sem o registro
 * ([[torg_baixa_etapa_anterior]]). Medido em 17/09/2026 nas obras vivas: 954 marcas, 1.178
 * lançamentos, 4.474 peças — a maioria em Preparação (524) e Jato (518).
 *
 * ⚠⚠ SÓ É ALVO O SETOR QUE TEM ORDEM NO SYNECO. Etapa sem ordem não é "zero apontado": é peça que
 * não passa por ali. Sem essa trava, toda chapa que pula a Preparação viraria uma linha pedindo um
 * lançamento que não existe.
 *
 * ⚠ ACABAMENTO É OPCIONAL e nunca vira alvo — a peça pode ir do Jato à Pintura sem passar por ele.
 * Mesma regra que já vale na detecção de furo das telas de setor (`lib/conjuntos-setor.js`).
 *
 * ⚠ TERCEIRO E ENCAMINHAMENTO CORTAM A CADEIA: peça que volta do terceiro no Jato não deve nada à
 * Montagem e à Solda. Sem destino definido, a peça fica FORA — melhor não listar do que mandar
 * lançar uma etapa que talvez não tenha acontecido.
 *
 * ⚠ O TETO É O PLANEJADO da própria ordem: nunca se pede para lançar mais do que o Syneco planejou
 * para aquele setor.
 *
 * ⚠ ESTA LIB NÃO ESCREVE NADA — nem no portal, nem no Syneco. Ela monta a lista; quem lança é a
 * pessoa, lá. O portal não tem caminho de escrita para o Syneco.
 */

// Ordem física da fábrica, com os nomes EXATOS do MesOrdem
export const CADEIA = ["Corte", "Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];
// os mesmos setores nos códigos do portal, para ler `destinoTerceirizado`/`encaminhadoSetor`
const CADEIA_PORTAL = ["CORTE", "PREPARACAO", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
const OPCIONAIS = new Set(["Acabamento"]);

/**
 * Onde a cadeia começa para esta peça: retorno do terceiro ou encaminhamento direto.
 * @returns {number} índice em CADEIA, ou -1 quando a peça não deve ser cobrada
 */
export function inicioDaCadeia(peca) {
  if (peca?.terceirizado) {
    const destino = String(peca.destinoTerceirizado || "").toUpperCase();
    if (!destino) return -1;             // rota indefinida — não dá para afirmar nada
    if (destino === "EXPEDICAO") return -1; // não passa pela fábrica
    const ix = CADEIA_PORTAL.indexOf(destino);
    return ix < 0 ? -1 : ix;
  }
  const enc = CADEIA_PORTAL.indexOf(String(peca?.encaminhadoSetor || "").toUpperCase());
  return enc < 0 ? 0 : enc;
}

/**
 * Os lançamentos que faltam atrás, para UMA marca (puro — testável sem banco).
 * @param {{setores: Record<string,{produzido:number, planejado:number}>}} peca
 * @returns {Array<{setor:string, apontado:number, aLancar:number, provaSetor:string, provaQtd:number}>}
 */
export function lancamentosAtrasados(peca) {
  const inicio = inicioDaCadeia(peca);
  if (inicio < 0) return [];
  const setores = peca?.setores || {};
  const saida = [];
  for (let i = inicio; i < CADEIA.length; i++) {
    const nome = CADEIA[i];
    if (OPCIONAIS.has(nome)) continue;
    const atual = setores[nome];
    if (!atual) continue; // sem ordem no Syneco: a peça não passa por aqui
    // a prova é o setor MAIS ADIANTADO com apontamento — é ele que garante que a peça passou aqui
    let provaSetor = null, provaQtd = 0;
    for (let j = i + 1; j < CADEIA.length; j++) {
      const depois = setores[CADEIA[j]];
      // empate vai para o setor MAIS ADIANTADO: "chegou na Pintura" prova mais que "chegou no Jato"
      if (depois && depois.produzido > 0 && depois.produzido >= provaQtd) { provaQtd = depois.produzido; provaSetor = CADEIA[j]; }
    }
    if (!provaSetor) continue;
    const teto = atual.planejado > 0 ? atual.planejado : provaQtd;
    const aLancar = Math.min(provaQtd, teto) - atual.produzido;
    if (aLancar > 0) saida.push({ setor: nome, apontado: atual.produzido, aLancar, provaSetor, provaQtd });
  }
  return saida;
}

/** Agrupa as ordens do Syneco por (OP, obra, marca) → { setor: {produzido, planejado} }. */
export function agruparOrdens(ordens, inativos = []) {
  const foraDaFabrica = new Set(inativos.map((r) => `${r.op}|${r.item}|${r.operacao}`));
  const grupos = new Map();
  for (const r of ordens) {
    if (!r.opId || !r.obra || !CADEIA.includes(r.setor)) continue;
    // etapa inativada e sem produção = feita FORA; o zero dela é legítimo, não furo
    if (!r.produzidoUn && foraDaFabrica.has(`${r.op}|${r.item}|${r.operacao}`)) continue;
    const chave = `${r.opId}|${r.obra}|${r.item}`;
    if (!grupos.has(chave)) grupos.set(chave, { opId: r.opId, obra: r.obra, marca: r.item, setores: {} });
    const s = (grupos.get(chave).setores[r.setor] ||= { produzido: 0, planejado: 0 });
    s.produzido += Math.max(0, Number(r.produzidoUn) || 0);
    s.planejado += Math.max(0, Number(r.planejadoUn) || 0);
  }
  return grupos;
}

/**
 * Linhas para lançar atrás, nas obras vivas.
 * @param {{ opId?: string|null, setorSyneco?: string|null }} filtro
 */
export async function baixasDeEtapaAnterior({ opId = null, setorSyneco = null } = {}) {
  const ops = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] }, ...(opId ? { id: opId } : {}) },
    select: { id: true, numero: true, obra: true },
  });
  const porOpId = new Map(ops.map((o) => [o.id, o]));
  if (!porOpId.size) return vazio();

  const [ordens, inativos] = await Promise.all([
    prisma.mesOrdem.findMany({
      where: { opId: { in: [...porOpId.keys()] }, setor: { in: CADEIA } },
      select: { opId: true, obra: true, item: true, setor: true, produzidoUn: true, planejadoUn: true, op: true, operacao: true },
    }),
    prisma.mesInativo.findMany({ select: { op: true, item: true, operacao: true } }).catch(() => []),
  ]);
  const grupos = agruparOrdens(ordens, inativos);
  if (!grupos.size) return vazio();

  // peso, descrição e a rota de terceiro/encaminhamento vêm da peça
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId: { in: [...porOpId.keys()] }, marca: { in: [...new Set([...grupos.values()].map((g) => g.marca))] } },
    select: { opId: true, marca: true, descricao: true, qte: true, pesoUnitKg: true, naLPC: true, terceirizado: true, destinoTerceirizado: true, encaminhadoSetor: true },
  });
  // ⚠ A MESMA MARCA PODE TER DUAS LINHAS (lista reimportada sob outra chave — ver
  // [[torg_lpc_chave_duplicada]]). Vale a da LPC VIGENTE: na OP-113 a T113A9 existe sob "113"
  // (antiga) e "T113A" (vigente), com pesos diferentes, e pegar a primeira dava o peso errado.
  const pecaPorChave = new Map();
  for (const p of pecas) {
    const k = `${p.opId}|${p.marca}`;
    const atual = pecaPorChave.get(k);
    if (!atual || (p.naLPC && !atual.naLPC)) pecaPorChave.set(k, p);
  }

  const linhas = [];
  for (const g of grupos.values()) {
    const peca = pecaPorChave.get(`${g.opId}|${g.marca}`) || null;
    for (const l of lancamentosAtrasados({ ...g, ...(peca || {}) })) {
      if (setorSyneco && l.setor !== setorSyneco) continue;
      linhas.push({
        opNumero: porOpId.get(g.opId)?.numero || null,
        obra: porOpId.get(g.opId)?.obra || null,
        obraSyneco: g.obra,
        marca: g.marca,
        descricao: peca?.descricao || null,
        setorSyneco: l.setor,
        apontado: l.apontado,
        aLancar: l.aLancar,
        pesoALancarKg: Math.round((Number(peca?.pesoUnitKg) || 0) * l.aLancar * 100) / 100,
        prova: `${l.provaSetor} tem ${l.provaQtd} apontada(s)`,
      });
    }
  }
  const ordemSetor = new Map(CADEIA.map((s, i) => [s, i]));
  linhas.sort((a, b) => ordemSetor.get(a.setorSyneco) - ordemSetor.get(b.setorSyneco)
    || String(a.opNumero).localeCompare(String(b.opNumero))
    || a.marca.localeCompare(b.marca, "pt", { numeric: true }));
  return {
    linhas,
    total: {
      linhas: linhas.length,
      pecas: linhas.reduce((t, l) => t + l.aLancar, 0),
      kg: Math.round(linhas.reduce((t, l) => t + l.pesoALancarKg, 0)),
      marcas: new Set(linhas.map((l) => `${l.opNumero}|${l.marca}`)).size,
    },
  };
}

const vazio = () => ({ linhas: [], total: { linhas: 0, pecas: 0, kg: 0, marcas: 0 } });
