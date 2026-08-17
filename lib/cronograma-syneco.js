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

  // ── Escopo por frente: CORTE (croqui + avulsa) e CONJUNTO (montagem/solda/pintura) ──
  const pc = await prisma.pecaConjunto.findMany({ where: { opId }, select: { opNumero: true, tipoPeca: true, pesoTotalKg: true } });
  const escopo = {}; // letra -> { corte, conjunto }
  for (const p of pc) {
    const letra = letraDoCodigo(p.opNumero, prefixo);
    if (!letra) continue; // só as frentes LPC (T89A/T89C…), não a LE do OP inteiro
    const e = (escopo[letra] = escopo[letra] || { corte: 0, conjunto: 0 });
    const kg = p.pesoTotalKg || 0;
    if (p.tipoPeca === "CONJUNTO") e.conjunto += kg;
    else e.corte += kg; // croqui + avulsa
  }

  // ── Produzido por frente × setor (baixas do Syneco) + histórico ──
  const ap = await prisma.mesApontamento.findMany({ where: { opId }, select: { opSka: true, setor: true, produzidoKg: true, dataInicio: true } });
  const prod = {}; // "letra|SETOR" -> { kg, ini, baixas:[{data,kg}] }
  for (const a of ap) {
    const letra = letraDoCodigo(a.opSka, prefixo);
    if (!letra) continue;
    const setor = normalizeSetorSyneco(a.setor) || "?";
    const k = `${letra}|${setor}`;
    const e = (prod[k] = prod[k] || { kg: 0, ini: null, baixas: [] });
    e.kg += a.produzidoKg || 0;
    if (a.dataInicio && (!e.ini || a.dataInicio < e.ini)) e.ini = a.dataInicio;
    if (a.produzidoKg) e.baixas.push({ data: a.dataInicio, kg: a.produzidoKg });
  }

  // ── Monta o resultado por frente × setor ──
  const porFrenteFase = new Map();
  const frentes = [...new Set([...Object.keys(escopo), ...Object.keys(prod).map((k) => k.split("|")[0])])].sort();
  for (const letra of frentes) {
    const e = escopo[letra] || { corte: 0, conjunto: 0 };
    for (const setor of ["CORTE", "MONTAGEM", "SOLDA", "PINTURA", "JATO", "ACABAMENTO"]) {
      const p = prod[`${letra}|${setor}`];
      const escopoKg = setor === "CORTE" ? e.corte : e.conjunto;
      if (!p && escopoKg <= 0) continue; // nada de escopo nem produção nessa fase da frente
      const baixas = (p?.baixas || []).slice().sort((a, b) => (a.data > b.data ? 1 : -1));
      porFrenteFase.set(`${letra}|${setor}`, {
        escopoKg: Math.round(escopoKg),
        produzidoKg: Math.round(p?.kg || 0),
        realizado: pct(p?.kg || 0, escopoKg), // null se não há escopo
        dataInicioReal: p?.ini || null,
        baixas,
      });
    }
  }
  return { porFrenteFase, frentes };
}

/**
 * Casa uma tarefa do cronograma (nome=fase, area com "(letra)") com o avanço calculado.
 * @returns o registro do sincronismo, ou null se a tarefa não é de fabricação/não casa.
 */
export function avancoDaTarefa(tarefa, sync) {
  const setor = FASE_SETOR[norm(tarefa.nome)];
  if (!setor) return null;
  const letra = letraDaArea(tarefa.area);
  if (!letra) return null;
  return sync.porFrenteFase.get(`${letra}|${setor}`) || { escopoKg: 0, produzidoKg: 0, realizado: null, dataInicioReal: null, baixas: [] };
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
    return tarefas.map((t) => {
      const av = avancoDaTarefa(t, sync);
      if (!av || av.realizado == null) return t; // não é fabricação / sem escopo → mantém manual
      return { ...t, percentualRealizado: av.realizado, dataInicioReal: av.dataInicioReal || t.dataInicioReal };
    });
  } catch {
    return tarefas;
  }
}
