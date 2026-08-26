import "server-only";
import { prisma } from "@/lib/prisma";
import { casarPerfilComOmie } from "@/lib/casar-omie";

// A TRAVA DE MATERIAL — o passo que o PCP roda antes de imprimir.
//
// Vitor (25/08/2026), a sequência: "o planejamento solta a lista, pcp recebe a solicitação, manda
// separar o material, analisa se está tudo em estoque, caso seja usado um material de estoque
// informa o R usado, e caso não tenha o material não libera aquele projeto para preparar. Avaliou
// isso, imprime os desenhos para o setor já marcando o R e imprime marcando na GRD".
//
// ⚠⚠ TRÊS ESTADOS, NÃO DOIS. "Tem ou não tem" é o que faria a trava parar a fábrica: medido em
// 25/08/2026, dos perfis que não casam com o CMR da própria obra, 180 EXISTEM no CMR de outra e
// só 97 não existem em lugar nenhum. Os 180 são material de estoque — comprado sob outra OP e
// usado aqui, que é rotina da casa. Bloqueá-los seria travar 2 de cada 3 casos por engano.
//
//   NA_OP      casa no CMR da própria obra   → segue, R por FIFO
//   ESTOQUE    casa no CMR de OUTRA obra     → segue, mas o PCP tem de informar QUAL R usou
//   SEM_MATERIAL  não casa em CMR nenhum     → NÃO LIBERA
//
// ⚠ A CHEGADA DO MATERIAL É O CMR. Vitor confirmou, e o código concorda: o cron
// /api/cron/cmr-reconciliar sincroniza a planilha do SharePoint com o portal todos os dias, nos
// dois sentidos, e é dali que nasce o índice R. Não se usa `EstoqueFisico` aqui — Vitor
// (25/08/2026): "sobre o estoque físico, ignorar isso via portal, como não temos o estoque real".

export const ESTADOS = ["NA_OP", "ESTOQUE", "SEM_MATERIAL"];

/**
 * Classifica os perfis de um conjunto de peças contra o CMR.
 * @param {string} opNumero
 * @param {Array} pecas  [{ id, marca, perfil, qte, pesoTotalKg }]
 * @returns {Promise<{porPerfil:Map, porPeca:Map, resumo:object}>}
 */
export async function analisarMaterial(opNumero, pecas) {
  const perfis = [...new Set(pecas.map((p) => String(p.perfil || "").trim()).filter(Boolean))];
  if (!perfis.length) return { porPerfil: new Map(), porPeca: new Map(), resumo: vazio() };

  const [cmrDaOp, cmrGeral, trocas] = await Promise.all([
    prisma.documentoQualidade.findMany({
      where: { categoria: "MATERIAL", opNumero: String(opNumero) },
      select: { importRef: true, nome: true, numeroCorrida: true, pesoKg: true, dataRecebimento: true },
      orderBy: { dataRecebimento: "asc" },
    }),
    prisma.documentoQualidade.findMany({
      where: { categoria: "MATERIAL" },
      select: { importRef: true, nome: true, numeroCorrida: true, opNumero: true, pesoKg: true },
      distinct: ["nome"],
    }),
    // R já informado pelo PCP para um perfil desta obra — a resposta de "qual R você usou"
    prisma.trocaRastreabilidade.findMany({ where: { opNumero: String(opNumero) } }),
  ]);

  const jaInformado = new Map(trocas.map((t) => [String(t.perfil).trim().toUpperCase(), t]));
  const itensOp = cmrDaOp.map((c) => ({ codigo: null, descricao: c.nome, _c: c }));
  const itensGeral = cmrGeral.map((c) => ({ codigo: null, descricao: c.nome, _c: c }));

  const porPerfil = new Map();
  for (const pf of perfis) {
    const k = pf.toUpperCase();
    const informado = jaInformado.get(k);
    const naOp = itensOp.length ? casarPerfilComOmie(pf, itensOp) : null;
    if (naOp) {
      const ents = cmrDaOp.filter((c) => c.nome === naOp.descricao);
      porPerfil.set(k, {
        perfil: pf, estado: "NA_OP", descricaoCmr: naOp.descricao,
        rs: ents.map((c) => c.importRef).filter(Boolean),
        rInformado: informado?.rUsado || null,
      });
      continue;
    }
    const geral = itensGeral.length ? casarPerfilComOmie(pf, itensGeral) : null;
    if (geral) {
      const ents = cmrGeral.filter((c) => c.nome === geral.descricao);
      porPerfil.set(k, {
        perfil: pf, estado: "ESTOQUE", descricaoCmr: geral.descricao,
        rs: ents.map((c) => c.importRef).filter(Boolean),
        opsDoMaterial: [...new Set(ents.map((c) => c.opNumero).filter(Boolean))],
        rInformado: informado?.rUsado || null,
      });
      continue;
    }
    porPerfil.set(k, { perfil: pf, estado: "SEM_MATERIAL", descricaoCmr: null, rs: [], rInformado: null });
  }

  const porPeca = new Map();
  for (const p of pecas) {
    const v = porPerfil.get(String(p.perfil || "").trim().toUpperCase());
    porPeca.set(p.id, v || { perfil: p.perfil, estado: "SEM_MATERIAL", rs: [], rInformado: null });
  }

  return { porPerfil, porPeca, resumo: resumir(pecas, porPeca) };
}

function vazio() {
  return { pecas: 0, kg: 0, naOp: 0, estoque: 0, semMaterial: 0, kgSemMaterial: 0,
           estoqueSemR: 0, liberaveis: 0, kgLiberavel: 0, pronto: true };
}

function resumir(pecas, porPeca) {
  const r = vazio();
  for (const p of pecas) {
    const v = porPeca.get(p.id);
    const kg = Number(p.pesoTotalKg) || 0;
    r.pecas++; r.kg += kg;
    if (v.estado === "NA_OP") { r.naOp++; r.liberaveis++; r.kgLiberavel += kg; }
    else if (v.estado === "ESTOQUE") {
      r.estoque++;
      // ⚠ estoque SEM o R informado não passa: é a pergunta que o Vitor pediu para ser feita.
      // Deixar passar sem resposta perderia a rastreabilidade justo no caso em que ela é manual.
      if (v.rInformado) { r.liberaveis++; r.kgLiberavel += kg; } else r.estoqueSemR++;
    } else { r.semMaterial++; r.kgSemMaterial += kg; }
  }
  r.kg = Math.round(r.kg); r.kgLiberavel = Math.round(r.kgLiberavel); r.kgSemMaterial = Math.round(r.kgSemMaterial);
  r.pronto = r.semMaterial === 0 && r.estoqueSemR === 0;
  return r;
}

/** as peças que PODEM ir para a impressão */
export function pecasLiberaveis(pecas, porPeca) {
  return pecas.filter((p) => {
    const v = porPeca.get(p.id);
    return v && (v.estado === "NA_OP" || (v.estado === "ESTOQUE" && v.rInformado));
  });
}
