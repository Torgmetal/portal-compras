// Sincronismo automático do avanço das linhas de FABRICAÇÃO do cronograma a partir das
// baixas do Syneco, medido contra o escopo da lista emitida (rota real da peça). Por
// FRENTE (área) × fase. Mapa fase→setor: Preparação=CORTE, Montagem=MONTAGEM, Solda=SOLDA,
// Pintura=PINTURA, Jato=JATO, Acabamento=ACABAMENTO.
//
// Escopo (regra do Vitor 06/08): Corte = peças croqui (P) + avulsas (solo da LPC); nos demais
// setores = os CONJUNTOS. Produzido = kg do Syneco daquela frente (opSka começa com T<op><letra>)
// no setor. % = produzido ÷ escopo; início = 1ª baixa. Também devolve o histórico das baixas.
import { normalizeSetorSyneco } from "@/lib/syneco-dia";

// Nome da tarefa (fase) → setor canônico do Syneco.
export const FASE_SETOR = {
  preparacao: "CORTE", corte: "CORTE", montagem: "MONTAGEM", solda: "SOLDA",
  pintura: "PINTURA", jato: "JATO", acabamento: "ACABAMENTO",
};

// A FASE PELO CONTEÚDO DO NOME, não por igualdade.
//
// Vitor (19/08/2026): "você consegue consertar isso para ficar vinculado já, até mesmo a
// fabricação?".
//
// O casamento era exato (`FASE_SETOR[norm(nome)]`) e o Planejamento escreve o nome à mão, por
// frente: "Preparação - Guarda Corpo", "Solda Guarda Corpo", "Montagem de Guarda Corpo",
// "Pintura Guarda Corpo". Nenhum desses casava — 37 das 90 linhas de Fabricação ficavam SEM
// avanço automático, e ninguém percebia porque 0% é um número plausível.
//
// ⚠ ORDEM = FASE MAIS AVANÇADA PRIMEIRO. Tarefa que cobre duas etapas ("Montagem e Solda") só
// termina quando a última termina, então é a última que manda no percentual.
//
// 🚫 GALVANIZAÇÃO fica de fora de propósito. Não é sinônimo de Jato — é serviço TERCEIRIZADO e não
// existe como setor no Syneco (que só tem Corte, Preparação, Montagem, Solda, Acabamento, Jato e
// Pintura). Mapear pra Jato daria avanço inventado; sem apontamento, a linha continua manual, que
// é a verdade.
//
// 🚫 Linha AGREGADA ("Fabricação de Colunas, Vigas e Escadas", "1ª Carga") também não casa: ela
// não é uma fase, é um pacote. Medir contra um setor só seria chute.
const FASE_RX = [
  [/pintura|primer/i, "PINTURA"],
  [/\bjato\b|granalha/i, "JATO"],
  [/acabamento|esmeril|lixa/i, "ACABAMENTO"],
  [/solda/i, "SOLDA"],
  [/montagem/i, "MONTAGEM"],
  [/prepara|corte/i, "CORTE"],
];
const RX_NAO_E_FASE = /galvaniza/i;

/** Setor do Syneco que mede esta tarefa; null quando o nome não é uma fase. */
export function faseDaTarefa(nome) {
  const n = String(nome || "");
  if (!n.trim() || RX_NAO_E_FASE.test(n)) return null;
  // nome exatamente igual à fase continua valendo (caminho antigo, mais barato)
  const exato = FASE_SETOR[norm(n)];
  if (exato) return exato;
  for (const [rx, setor] of FASE_RX) if (rx.test(n)) return setor;
  return null;
}
const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

// Letra da frente a partir do nome da área ("... (A)" → "A").
export function letraDaArea(area) {
  const m = String(area || "").match(/\(([A-Za-z])\)\s*$/);
  return m ? m[1].toUpperCase() : null;
}
// Letra da frente a partir do opNumero da peça/baixa ("T89A" com prefixo "T89" → "A").
function letraDoCodigo(codigo, prefixo) {
  const c = String(codigo || "").toUpperCase();
  if (!c.startsWith(prefixo)) return null;
  const m = c.slice(prefixo.length).match(/^([A-Z])/);
  return m ? m[1] : null;
}

/**
 * Calcula o avanço das linhas de fabricação de uma OP a partir do Syneco.
 * @returns {
 *   porFrenteFase: Map "<LETRA>|<SETOR>" -> { escopoKg, produzidoKg, realizado, dataInicioReal, baixas:[{data,kg}] },
 *   frentes: [LETRA],
 * }
 */
export async function sincronizarCronogramaSyneco(prisma, opId, opNumero) {
  const nOp = parseInt(String(opNumero || "").match(/\d+/)?.[0] || "0", 10);
  const prefixo = `T${nOp}`; // ex.: T89

  // ── Escopo: por frente (CORTE=croqui+avulsa · CONJUNTO=montagem/solda/pintura) E total da OP ──
  const pc = await prisma.pecaConjunto.findMany({ where: { opId }, select: { opNumero: true, tipoPeca: true, pesoTotalKg: true } });
  const escopo = {}; // letra -> { corte, conjunto }
  const escopoTotal = { corte: 0, conjunto: 0 }; // OP inteira (frente única / peças sem letra)
  for (const p of pc) {
    const kg = p.pesoTotalKg || 0;
    const campo = p.tipoPeca === "CONJUNTO" ? "conjunto" : "corte"; // croqui + avulsa = corte
    escopoTotal[campo] += kg;
    const letra = letraDoCodigo(p.opNumero, prefixo);
    if (!letra) continue; // sem letra → entra só no TOTAL (OP de frente única, ex.: opNumero "106")
    (escopo[letra] = escopo[letra] || { corte: 0, conjunto: 0 })[campo] += kg;
  }

  // ── Produzido (baixas do Syneco): por frente × setor E total da OP × setor + histórico ──
  const ap = await prisma.mesApontamento.findMany({ where: { opId }, select: { opSka: true, setor: true, produzidoKg: true, dataInicio: true } });
  const prod = {};      // "letra|SETOR"
  const prodTotal = {}; // "SETOR" (OP inteira — quando o opSka é nº de peça, não código de frente)
  const acumular = (bucket, key, kg, data) => {
    const e = (bucket[key] = bucket[key] || { kg: 0, ini: null, baixas: [] });
    e.kg += kg;
    if (data && (!e.ini || data < e.ini)) e.ini = data;
    if (kg) e.baixas.push({ data, kg });
  };
  for (const a of ap) {
    const setor = normalizeSetorSyneco(a.setor) || "?";
    const kg = a.produzidoKg || 0;
    acumular(prodTotal, setor, kg, a.dataInicio); // sempre soma no total da OP
    const letra = letraDoCodigo(a.opSka, prefixo);
    if (letra) acumular(prod, `${letra}|${setor}`, kg, a.dataInicio);
  }

  // ── Monta o resultado: por frente + bucket "*" (OP inteira, p/ tarefas sem letra de frente) ──
  const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "PINTURA", "JATO", "ACABAMENTO"];
  const montar = (escopoKg, p) => ({
    escopoKg: Math.round(escopoKg),
    produzidoKg: Math.round(p?.kg || 0),
    realizado: pct(p?.kg || 0, escopoKg), // null se não há escopo
    dataInicioReal: p?.ini || null,
    baixas: (p?.baixas || []).slice().sort((a, b) => (a.data > b.data ? 1 : -1)),
  });
  const porFrenteFase = new Map();
  const frentes = [...new Set([...Object.keys(escopo), ...Object.keys(prod).map((k) => k.split("|")[0])])].sort();
  for (const letra of frentes) {
    const e = escopo[letra] || { corte: 0, conjunto: 0 };
    for (const setor of SETORES) {
      const escopoKg = setor === "CORTE" ? e.corte : e.conjunto;
      const p = prod[`${letra}|${setor}`];
      if (p || escopoKg > 0) porFrenteFase.set(`${letra}|${setor}`, montar(escopoKg, p));
    }
  }
  // Bucket "OP inteira" (frente única): usado pelas tarefas SEM letra de frente (area null) — ex.: OP 106.
  for (const setor of SETORES) {
    const escopoKg = setor === "CORTE" ? escopoTotal.corte : escopoTotal.conjunto;
    const p = prodTotal[setor];
    if (p || escopoKg > 0) porFrenteFase.set(`*|${setor}`, montar(escopoKg, p));
  }
  return { porFrenteFase, frentes };
}

/**
 * Casa uma tarefa do cronograma (nome=fase, area com "(letra)") com o avanço calculado.
 * @returns o registro do sincronismo, ou null se a tarefa não é de fabricação/não casa.
 */
export function avancoDaTarefa(tarefa, sync) {
  const setor = faseDaTarefa(tarefa.nome);
  if (!setor) return null;
  const letra = letraDaArea(tarefa.area) || "*"; // sem letra de frente (area null) → bucket "OP inteira"
  return sync.porFrenteFase.get(`${letra}|${setor}`) || { escopoKg: 0, produzidoKg: 0, realizado: null, dataInicioReal: null, baixas: [] };
}

/**
 * AVANÇO DE UM CONJUNTO DE TAREFAS, resolvendo a AMBIGUIDADE.
 *
 * Depois que o casamento passou a ser por conteúdo, apareceu um efeito colateral feio: a T097 tem
 * "Preparação - Guarda Corpo" e "Preparação - Estrutura Plataforma", as duas sem `area`. As duas
 * caem em CORTE da OP inteira e receberiam o MESMO 45,7% — escopos diferentes com número igual.
 *
 * Isso é pior que ficar sem avanço: o número parece medido e não é. Quando duas ou mais tarefas
 * disputam o mesmo (frente|fase), NENHUMA recebe automático — elas voltam a ser manuais, com o
 * motivo dito. Pra desempatar, o Planejamento põe a ÁREA em cada uma ("… (A)", "… (B)"), que é o
 * campo que existe justamente pra isso.
 *
 * @returns {Map<string, object>} id da tarefa → avanço (só as não-ambíguas)
 */
export function avancosDasTarefas(tarefas, sync) {
  const porChave = new Map();
  for (const t of tarefas || []) {
    const setor = faseDaTarefa(t.nome);
    if (!setor) continue;
    const chave = `${letraDaArea(t.area) || "*"}|${setor}`;
    (porChave.get(chave) || porChave.set(chave, []).get(chave)).push(t);
  }

  const out = new Map();
  for (const [chave, lista] of porChave) {
    if (lista.length > 1) {
      // ambíguas: devolve o motivo em vez do número
      for (const t of lista) {
        out.set(t.id, {
          ambigua: true,
          motivo: `${lista.length} tarefas medem o mesmo escopo (${chave.replace("|", " · ")}). Defina a área de cada uma pra separar.`,
          realizado: null, escopoKg: 0, produzidoKg: 0, baixas: [],
        });
      }
      continue;
    }
    const t = lista[0];
    out.set(t.id, avancoDaTarefa(t, sync));
  }
  return out;
}

// Aplica o avanço do Syneco às tarefas de fabricação (MESMA regra da tela — rota GET do
// cronograma): nas linhas Preparação/Montagem/Solda/Pintura/etc o % vem do Syneco (fonte da
// verdade). Use antes de gerar PDF/XML/e-mail — senão o export sai com o `percentualRealizado`
// ARMAZENADO (defasado: 0% onde a tela já mostra o avanço real). Best-effort: se o Syneco
// falhar, devolve as tarefas como estão.
export async function aplicarAvancoSyneco(prisma, opId, opNumero, tarefas) {
  if (!opId || !Array.isArray(tarefas)) return tarefas;
  try {
    const sync = await sincronizarCronogramaSyneco(prisma, opId, opNumero);
    const avancos = avancosDasTarefas(tarefas, sync);
    return tarefas.map((t) => {
      const av = avancos.get(t.id);
      if (!av || av.realizado == null) return t; // não é fabricação / sem escopo / ambígua → manual
      return { ...t, percentualRealizado: av.realizado, dataInicioReal: av.dataInicioReal || t.dataInicioReal };
    });
  } catch {
    return tarefas;
  }
}
