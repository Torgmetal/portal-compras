// ─── ROTEIRO DA OBRA (6 etapas) — regras puras de transição ─────────────────────────────────────
//
// Sem banco, sem Prisma: a rota lê os registros e pergunta aqui se a mudança é permitida.
// Etapa sem registro é PENDENTE. Etapas 4–6 andam POR FASE da obra; 1–3 valem para a obra inteira (fase nula).
export const ETAPAS = [
  { n: 1, nome: "Modelo" },
  { n: 2, nome: "Interferência com o IFC do cliente", opcional: true },
  { n: 3, nome: "Revisão ou numeração" },
  { n: 4, nome: "Detalhamento", porFase: true },
  { n: 5, nome: "Listas LE/LPC e GRD", porFase: true },
  { n: 6, nome: "Diagrama de montagem", opcional: true, porFase: true },
];
export const STATUS = ["PENDENTE", "EM_ANDAMENTO", "AGUARDANDO_ACEITE", "CONCLUIDA", "NAO_SE_APLICA"];

const FEITA = ["CONCLUIDA", "NAO_SE_APLICA"];
const recusa = (motivo, extra = {}) => ({ ok: false, motivo, ...extra });
const nome = (n) => ETAPAS.find((e) => e.n === n)?.nome ?? `etapa ${n}`;

function statusDe(registros, etapa, fase) {
  const reg = registros.find((x) => x.etapa === etapa && (x.fase ?? null) === (fase ?? null));
  return reg?.status ?? "PENDENTE";
}

/** @returns {{ok:true}|{ok:false, motivo:string, pendentes?:object[]}} */
export function podeMudar(registros, { etapa, fase = null, para, divergencias = [] }) {
  const def = ETAPAS.find((e) => e.n === etapa);
  if (!def) return recusa("Etapa inexistente.");
  if (!STATUS.includes(para)) return recusa("Situação inexistente.");
  const faseN = fase ?? null;

  // Regra 5 (parte 1): "não se aplica" da etapa 6 é da OBRA, não de uma fase.
  const dispensaDaObra = etapa === 6 && para === "NAO_SE_APLICA";
  if (def.porFase && faseN === null && !dispensaDaObra) return recusa(`A etapa ${etapa} (${def.nome}) é por fase: informe a fase.`);
  if (!def.porFase && faseN !== null) return recusa(`A etapa ${etapa} (${def.nome}) vale para a obra inteira, sem fase.`);
  if (dispensaDaObra && faseN !== null) return recusa("“Não se aplica” na etapa 6 vale para a obra inteira, não para uma fase.");

  // Regra 1
  if (para === "NAO_SE_APLICA" && !def.opcional) return recusa(`A etapa ${etapa} (${def.nome}) não pode ser marcada como “não se aplica”.`);

  // Regra 5 (parte 2): roteiro encerrado pela dispensa da etapa 6.
  if (etapa === 6 && faseN !== null && statusDe(registros, 6, null) === "NAO_SE_APLICA") {
    return recusa("O roteiro já foi encerrado: a etapa 6 foi marcada como “não se aplica” para a obra.");
  }

  const atual = statusDe(registros, etapa, faseN);

  // Regra 2: sair de PENDENTE exige a etapa anterior pronta.
  if (atual === "PENDENTE" && para !== "PENDENTE") {
    if ((etapa === 5 || etapa === 6) && !dispensaDaObra) {
      const ant = etapa - 1;
      if (statusDe(registros, ant, faseN) !== "CONCLUIDA") return recusa(`A etapa ${etapa} da fase ${faseN} só começa com a etapa ${ant} (${nome(ant)}) concluída nessa fase.`);
    }
    {
      for (const e of ETAPAS.filter((x) => x.n < Math.min(etapa, 4))) {
        if (!FEITA.includes(statusDe(registros, e.n, null))) return recusa(`A etapa ${etapa} só começa com a etapa ${e.n} (${e.nome}) concluída.`);
      }
    }
  }

  // Regra 3: CONCLUIDA só vem do aceite e sem divergência em aberto.
  if (para === "CONCLUIDA") {
    if (atual !== "AGUARDANDO_ACEITE") return recusa("A etapa só é concluída depois de enviada para aceite (aguardando aceite).");
    const pendentes = divergencias.filter((d) => d.situacao === "aberta" || d.situacao === "nao_verificada");
    if (pendentes.length) return recusa(`Há ${pendentes.length} divergência(s) em aberto ou não verificada(s).`, { pendentes });
  }
  return { ok: true };
}
