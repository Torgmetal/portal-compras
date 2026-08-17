// Motor da "TV de Prioridades por setor" (Planejamento) — progresso em KG por setor.
//
// Regras de negócio (Vitor, 08/2026):
// - O caminho de cada peça pelos setores vem da ESTRUTURA da LPC, não do nome:
//   * Conjunto COMPOSTO (tipoPeca=CONJUNTO com sub-peças/croquis na LPC) passa por
//     Montagem → Solda → Acabamento → Jato → Pintura → Expedição (o CORTE dele é medido
//     nos croquis, abaixo).
//   * Peça SOLO (avulsa, ou "conjunto" sem croquis) PULA Montagem e Solda:
//     Corte → Acabamento → Jato → Pintura → Expedição.
// - "Preparação" é o CORTE. O corte é apontado nas SUB-PEÇAS (croquis) e avulsas —
//   por isso o progresso do corte mede croquis+avulsas via qteProduzida/corteConcluidoEm,
//   e NÃO os conjuntos (o conjunto só é cortado quando seus croquis são cortados).
// - Montagem→Pintura: modelo de POSIÇÃO — o peso INTEIRO do conjunto (pesoTotalKg) é
//   atribuído ao seu setor mais avançado (mesmo critério da Expedição Semanal e do Status
//   da Obra, via Syneco), evitando dupla contagem e casando com o peso canônico.
// - Expedição: setor real EXPEDIDO (status/Syneco).

export const FLUXO_SETORES = [
  { key: "CORTE", label: "Preparação" },
  { key: "MONTAGEM", label: "Montagem" },
  { key: "SOLDA", label: "Solda" },
  { key: "ACABAMENTO", label: "Acabamento" },
  { key: "JATO", label: "Jato" },
  { key: "PINTURA", label: "Pintura" },
  { key: "EXPEDICAO", label: "Expedição" },
];

const IDX = Object.fromEntries(FLUXO_SETORES.map((s, i) => [s.key, i]));
const idxOf = (k) => (k == null ? -1 : IDX[k] ?? -1);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
// Setores pós-corte de um conjunto composto.
const POS_CORTE_COMPOSTO = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
// Setores pós-corte de uma peça solo (pula Montagem e Solda).
const POS_CORTE_SOLO = ["ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];

export function pecaEhCroqui(p) { return p?.tipoPeca === "CROQUI"; }
// Conjunto composto = conjunto da LPC que realmente tem sub-peças (croquis) listadas.
export function pecaEhComposta(p) { return p?.tipoPeca === "CONJUNTO" && Number(p?.croquiCount || 0) > 0; }
// Solo/avulsa = tem peso, não é croqui e não é conjunto composto.
export function pecaEhSolo(p) { return !pecaEhCroqui(p) && !pecaEhComposta(p); }

// Fração cortada de uma peça de corte (croqui/avulsa).
// corteForcado = o conjunto-pai já avançou (Montagem+) no Syneco: fisicamente o croqui
// foi cortado, mesmo que o apontamento de corte não tenha sido escrito no banco.
function fracaoCortada(p) {
  if (p.corteConcluidoEm || p.corteForcado) return 1;
  const qte = Number(p.qte) || 0;
  if (qte <= 0) return 0;
  return clamp((Number(p.qteProduzida) || 0) / qte, 0, 1);
}

// Croqui "cortado" (= "dado baixa como cortado") — CRITÉRIO ÚNICO do "pronto para montar",
// usado na TV (conjuntosMontaveis) E no painel de Liberar/Baixa, pra baterem sempre:
//   corte concluído, OU qtd produzida completa (reflete o Syneco do corte), OU baixa no portal
//   em CORTE (PecaConjunto.baixaSetores.CORTE). NÃO usa `corteForcado` (inferência reversa a
//   partir do conjunto montado — isso só vale pro % do Corte, não pra saber se dá pra montar).
export function croquiCortado(cr) {
  if (!cr) return false;
  const q = Number(cr.qte) || 1;
  if (cr.corteConcluidoEm || (Number(cr.qteProduzida) || 0) >= q) return true;
  const bxC = cr.baixaSetores && typeof cr.baixaSetores === "object" ? cr.baixaSetores.CORTE : null;
  const baixaCorte = bxC ? (bxC.qtd != null ? Number(bxC.qtd) : q) : 0;
  return baixaCorte >= q;
}

// setor real (índice) de um conjunto/avulsa: o mais avançado entre Syneco (map), status e EXPEDIDO.
function realIdxDe(p, map) {
  let r = idxOf(map.get(p.marca));
  const s = idxOf(p.status);
  if (s > r) r = s;
  if (p.status === "EXPEDIDO") r = idxOf("EXPEDICAO");
  return r;
}

// Progresso em kg por setor para UMA obra.
// - pecas: LPC completa (conjuntos + croquis + avulsas) OU LE tratada como solo.
//   Campos usados: { marca, tipoPeca, pesoTotalKg, status, croquiCount, qte, qteProduzida, corteConcluidoEm }
// - realSetorByMarca: Map<marca, setorKey> do Syneco (setor mais avançado), via mapaSetorReal.
export function progressoPorSetor(pecas, realSetorByMarca) {
  const map = realSetorByMarca || new Map();
  const acc = FLUXO_SETORES.map((s) => ({ ...s, totalKg: 0, feitoKg: 0 }));
  const byKey = Object.fromEntries(acc.map((s) => [s.key, s]));

  for (const p of pecas || []) {
    const kg = Number(p.pesoTotalKg) || 0;
    if (kg <= 0) continue;

    if (pecaEhCroqui(p)) {
      // Sub-peça: só existe no Corte (Preparação).
      const c = byKey.CORTE;
      c.totalKg += kg;
      c.feitoKg += kg * fracaoCortada(p);
      continue;
    }

    if (pecaEhComposta(p)) {
      // Conjunto composto: Montagem→Expedição (o corte é dos croquis).
      const rIdx = realIdxDe(p, map);
      for (const key of POS_CORTE_COMPOSTO) {
        const s = byKey[key];
        s.totalKg += kg;
        if (rIdx >= idxOf(key)) s.feitoKg += kg;
      }
      continue;
    }

    // Solo/avulsa: cortada no Corte e depois Acabamento→Expedição (pula Montagem/Solda).
    const rIdx = realIdxDe(p, map);
    const c = byKey.CORTE;
    c.totalKg += kg;
    // se já passou do corte, cortada 100%; senão fração apontada.
    c.feitoKg += kg * (rIdx > idxOf("CORTE") ? 1 : fracaoCortada(p));
    for (const key of POS_CORTE_SOLO) {
      const s = byKey[key];
      s.totalKg += kg;
      if (rIdx >= idxOf(key)) s.feitoKg += kg;
    }
  }

  return acc.map((s) => {
    const totalKg = Math.round(s.totalKg);
    const feitoKg = Math.round(Math.min(s.feitoKg, s.totalKg));
    return {
      setor: s.key, label: s.label, totalKg, feitoKg,
      pendenteKg: totalKg - feitoKg,
      pct: totalKg > 0 ? Math.round((feitoKg / totalKg) * 100) : null,
    };
  });
}

// Índice do setor real da peça (o mais avançado entre Syneco, status guardado e EXPEDIDO).
// -1 = ainda não iniciou. Exposto pra reuso/testes.
export function setorRealIndex(p, realSetorByMarca) {
  return realIdxDe(p, realSetorByMarca || new Map());
}

// Devolve o Set de marcas de CROQUI que já foram cortadas PORQUE o conjunto-pai avançou
// além do corte (Montagem+), olhando status E Syneco (via realIdx). Cobre o caso comum em
// que o apontamento de corte não foi escrito no croqui, mas o conjunto obviamente foi montado.
// - pecas: lista completa da OP (precisa conter os conjuntos com status)
// - links: [{ conj: <marcaConjunto>, croqui: <marcaCroqui> }] (tabela ConjuntoCroqui)
export function croquisCortadosPorConjunto(pecas, realSetorByMarca, links) {
  const map = realSetorByMarca || new Map();
  const corteIdx = idxOf("CORTE");
  const avancou = new Set();
  for (const p of pecas || []) {
    if (pecaEhComposta(p) && realIdxDe(p, map) > corteIdx) avancou.add(p.marca);
  }
  const cortados = new Set();
  for (const lk of links || []) if (avancou.has(lk.conj)) cortados.add(lk.croqui);
  return cortados;
}

// A OP tem "lista de corte" de verdade = existe ao menos uma sub-peça (croqui) na LPC.
// OPs sem croqui (só marcas grandes, sem detalhamento) NÃO têm o que cortar/rastrear —
// entram no Corte como ALERTA (regra Vitor 08/2026), não na fila.
export function temDetalheCorte(pecas) {
  return (pecas || []).some(pecaEhCroqui);
}

// Conjuntos "liberados pra montar" (= "pronto para montar"): TODOS os croquis vinculados já foram
// cortados, pelo critério ÚNICO `croquiCortado` (o mesmo do painel de Liberar/Baixa). Conjunto com
// croqui ainda não cortado fica preso no corte. links: [{ conj: <marcaConjunto>, croqui: <marcaCroqui> }].
export function conjuntosMontaveis(pecas, links) {
  const croquiPorMarca = new Map();
  for (const p of pecas || []) if (pecaEhCroqui(p)) croquiPorMarca.set(p.marca, p);
  const agg = new Map(); // marcaConjunto → { tot, cortados }
  for (const lk of links || []) {
    const a = agg.get(lk.conj) || { tot: 0, cortados: 0 };
    a.tot++;
    const cr = croquiPorMarca.get(lk.croqui);
    if (croquiCortado(cr)) a.cortados++;
    agg.set(lk.conj, a);
  }
  const out = new Set();
  for (const [conj, a] of agg) if (a.tot > 0 && a.cortados === a.tot) out.add(conj);
  return out;
}

// Progresso da MONTAGEM. O % conta TODOS os conjuntos compostos (o denominador é a montagem
// INTEIRA) — antes contava só os "montáveis", o que dava um % enganoso (ex.: OP-085 dava 99%
// enquanto 3.314 kg de conjuntos seguiam presos no corte). Ainda devolve o Set `montaveis` (os
// que dá pra montar agora = croquis já cortados) pra fila detalhada mostrar o que fazer primeiro.
export function progressoMontagemMontavel(pecas, realSetorByMarca, links) {
  const map = realSetorByMarca || new Map();
  const montaveis = conjuntosMontaveis(pecas, links);
  const alvo = idxOf("MONTAGEM");
  let totalKg = 0, feitoKg = 0;
  for (const p of pecas || []) {
    if (!pecaEhComposta(p)) continue; // todos os conjuntos (não só os montáveis)
    const kg = Number(p.pesoTotalKg) || 0;
    if (kg <= 0) continue;
    totalKg += kg;
    if (realIdxDe(p, map) >= alvo) feitoKg += kg;
  }
  totalKg = Math.round(totalKg);
  feitoKg = Math.round(Math.min(feitoKg, totalKg));
  return { setor: "MONTAGEM", label: "Montagem", totalKg, feitoKg, pendenteKg: totalKg - feitoKg, pct: totalKg > 0 ? Math.round((feitoKg / totalKg) * 100) : null, montaveis };
}

// Peças que AINDA vão passar por um setor (a fila detalhada daquele setor), coerente
// com progressoPorSetor: croqui/solo pendentes no Corte; conjunto/solo não-alcançados
// nos setores seguintes. Devolve [{ marca, kgPend, prioridade, ordem }], ordenado por
// prioridade (marcadas primeiro) e depois pela ordem/marca.
export function pecasPendentesNoSetor(pecas, realSetorByMarca, setorKey, montaveis = null) {
  const map = realSetorByMarca || new Map();
  const alvo = idxOf(setorKey);
  if (alvo < 0) return [];
  const out = [];

  for (const p of pecas || []) {
    const kg = Number(p.pesoTotalKg) || 0;
    if (kg <= 0) continue;

    let pendente = false;
    let kgPend = kg;

    if (pecaEhCroqui(p)) {
      if (setorKey !== "CORTE") continue;
      const frac = p.corteConcluidoEm || p.corteForcado ? 1 : clamp((Number(p.qteProduzida) || 0) / (Number(p.qte) || 1), 0, 1);
      pendente = frac < 1;
      kgPend = kg * (1 - frac);
    } else if (pecaEhComposta(p)) {
      if (setorKey === "CORTE") continue; // o corte do conjunto é medido nos croquis
      // Montagem: mostra TODOS os conjuntos pendentes (pra bater com o % da montagem inteira),
      // marcando quais são "montáveis" (croquis já cortados = dá pra montar agora) vs os que
      // ainda aguardam corte. A ordenação joga os montáveis pra cima.
      pendente = realIdxDe(p, map) < alvo;
    } else {
      // solo/avulsa
      const rIdx = realIdxDe(p, map);
      if (setorKey === "CORTE") {
        const frac = p.corteConcluidoEm ? 1 : clamp((Number(p.qteProduzida) || 0) / (Number(p.qte) || 1), 0, 1);
        pendente = !(rIdx > alvo || frac >= 1);
        kgPend = kg * (1 - (rIdx > alvo ? 1 : frac));
      } else if (!POS_CORTE_SOLO.includes(setorKey)) {
        continue; // solo não passa por Montagem/Solda
      } else {
        pendente = rIdx < alvo;
      }
    }

    if (!pendente) continue;
    // "montável" só faz sentido na Montagem; nos outros setores a peça está sempre liberada.
    const montavel = setorKey === "MONTAGEM" && montaveis ? montaveis.has(p.marca) : true;
    out.push({ marca: p.marca, kgPend: Math.round(kgPend), prioridade: p.prioridade ?? null, ordem: p.ordemCampo ?? null, montavel });
  }

  out.sort((a, b) => {
    if (a.montavel !== b.montavel) return a.montavel ? -1 : 1;      // montáveis (prontas) primeiro
    const pa = a.prioridade != null, pb = b.prioridade != null;
    if (pa !== pb) return pb - pa;                                  // marcadas primeiro
    if (pa && pb && a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    if (a.ordem != null && b.ordem != null && a.ordem !== b.ordem) return a.ordem - b.ordem;
    if ((a.ordem != null) !== (b.ordem != null)) return a.ordem != null ? -1 : 1;
    return String(a.marca).localeCompare(String(b.marca));
  });
  return out;
}

// A partir do Syneco (MesOrdem groupBy item+setor, produzidoUn>0) devolve
// Map<marca, setorKeyMaisAvancado>. normalizeSetor = normalizeSetorSyneco (lib/syneco-dia.js).
export function mapaSetorReal(linhasSyneco, normalizeSetor) {
  const m = new Map();
  for (const l of linhasSyneco || []) {
    const key = normalizeSetor(l.setor);
    if (idxOf(key) < 0) continue;
    const atual = m.get(l.item);
    if (atual == null || idxOf(key) > idxOf(atual)) m.set(l.item, key);
  }
  return m;
}

// Deriva datas por setor a partir das TAREFAS do cronograma (a data do setor = a tarefa
// daquele setor que termina mais tarde). Fabricação por palavra-chave no nome; Expedição
// pelo departamento. "Galvanização" é setor à parte — NÃO cai no Jato aqui.
const SETOR_KW = [
  ["CORTE", /prepara|corte/i],
  ["MONTAGEM", /montag/i],
  ["SOLDA", /solda/i],
  ["ACABAMENTO", /acabamento|esmeril|lixa/i],
  ["JATO", /jato|granalha/i],
  ["PINTURA", /pintura|primer/i],
];
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

export function datasSetorDoCronograma(tarefas) {
  const max = {};
  const por = (key, fim) => { if (!max[key] || fim > max[key]) max[key] = fim; };
  for (const t of tarefas || []) {
    if (!t.dataFimPrevista) continue;
    const fim = new Date(t.dataFimPrevista);
    if (t.departamento === "EXPEDICAO") { por("EXPEDICAO", fim); continue; }
    if (t.departamento !== "FABRICACAO") continue;
    for (const [key, re] of SETOR_KW) if (re.test(t.nome || "")) { por(key, fim); break; }
  }
  const out = {};
  for (const [k, d] of Object.entries(max)) out[k] = ymd(d);
  return out;
}

// Data de entrega do SETOR para uma OP: usa datasSetor[setorKey] ("YYYY-MM-DD", já
// mesclado cronograma+Solicitação); na falta, cai pra entrega final da OP (entregaFallback).
// Devolve { entrega(ISO|null), atrasoDias, doSetor } — atraso = a data mostrada já venceu.
export function entregaDoSetor(datasSetor, setorKey, entregaFallback, now) {
  const d = datasSetor?.[setorKey];
  const dt = d ? new Date(`${d}T12:00:00Z`) : (entregaFallback ? new Date(entregaFallback) : null);
  const atrasoDias = dt && dt < now ? Math.ceil((now - dt) / 86400000) : 0;
  return { entrega: dt ? dt.toISOString() : null, atrasoDias, doSetor: !!d };
}
