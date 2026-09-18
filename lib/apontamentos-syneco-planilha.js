// As ABAS da planilha "Apontamentos para lançar no Syneco" — puro, testável sem navegador.
//
// Vitor (18/09/2026): "o que eu preciso é que vc gere na planilha as peças que estão faltando
// apontamentos das ops que estamos fazendo". Uma aba corrida com 1.084 linhas não se lança: quem
// lança trabalha SETOR a setor. Então a planilha abre num RESUMO (OP × setor, para escolher por onde
// começar) e traz UMA ABA POR SETOR, mais a aba da baixa do portal quando houver.
//
// ⚠ Só entra setor que TEM linha — aba vazia de Montagem só faz procurar o que não existe.
// ⚠ O Syneco não importa planilha (confirmado pelo Vitor em 18/09/2026): isto é lista de trabalho
//   para digitação, e por isso a ordem das colunas segue a ordem em que se digita lá.

/** Ordem física da fábrica — as abas saem nesta ordem, não na ordem alfabética. */
export const ORDEM_SETORES = ["Corte", "Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];

const semAcento = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const nBR = (v) => Number(v || 0).toLocaleString("pt-BR");

/**
 * @param {{ portal?: object[], atras?: object[], total?: object, nome?: string, geradoEm?: string }} p
 * @returns {{ titulo: string, subtitulo: string, abas: object[] }}
 */
export function planilhaApontamentos({ portal = [], atras = [], nome = "", geradoEm = "" } = {}) {
  const abas = [];
  const setores = ORDEM_SETORES.filter((s) => atras.some((l) => l.setorSyneco === s));
  const pecas = atras.reduce((t, l) => t + (Number(l.aLancar) || 0), 0);
  const kg = Math.round(atras.reduce((t, l) => t + (Number(l.pesoALancarKg) || 0), 0));

  // ── Resumo: por onde começar ────────────────────────────────────────────────
  if (atras.length) {
    const ops = [...new Set(atras.map((l) => l.opNumero))].sort();
    abas.push({
      nome: "Resumo",
      subtitulo: `${nBR(atras.length)} lançamento(s) · ${nBR(pecas)} peça(s) · ${nBR(kg)} kg — obras em produção${geradoEm ? `, gerado em ${geradoEm}` : ""}`,
      headers: ["OP", "Obra", ...setores, "Lançamentos", "Peças", "Peso (kg)"],
      larguras: [8, 30, ...setores.map(() => 13), 13, 10, 12],
      linhas: ops.map((op) => {
        const daOp = atras.filter((l) => l.opNumero === op);
        return [op, daOp[0]?.obra || "",
          ...setores.map((s) => daOp.filter((l) => l.setorSyneco === s).length || ""),
          daOp.length, daOp.reduce((t, l) => t + l.aLancar, 0),
          Math.round(daOp.reduce((t, l) => t + l.pesoALancarKg, 0))];
      }),
    });
  }

  // ── Uma aba por setor ───────────────────────────────────────────────────────
  for (const s of setores) {
    const daq = atras.filter((l) => l.setorSyneco === s);
    abas.push({
      // ⚠ nome de aba do Excel não aceita acento em toda versão, e tem teto de 31 caracteres
      nome: semAcento(s).slice(0, 31),
      subtitulo: `${nBR(daq.length)} lançamento(s) · ${nBR(daq.reduce((t, l) => t + l.aLancar, 0))} peça(s). A peça está apontada à frente, então passou por aqui.`,
      headers: ["OP", "Obra (Syneco)", "Marca", "Descrição", "Apontado hoje", "A lançar", "Peso (kg)", "Prova (apontamento à frente)"],
      larguras: [8, 14, 20, 30, 14, 10, 12, 30],
      linhas: daq.map((l) => [l.opNumero || "", l.obraSyneco || "—", l.marca, l.descricao || "", l.apontado, l.aLancar, l.pesoALancarKg, l.prova]),
    });
  }

  // ── A baixa do portal, quando houver ────────────────────────────────────────
  if (portal.length) {
    abas.push({
      nome: "Baixa do portal",
      subtitulo: "O setor baixou no portal e o Syneco ainda não tem. Romaneio, terceiro e fechamento administrativo não entram.",
      headers: ["Setor", "Obra (Syneco)", "OP", "Marca", "Descrição", "Perfil", "Qtd da marca", "No portal", "No Syneco", "A lançar", "Peso (kg)", "Baixado por"],
      larguras: [14, 14, 8, 18, 30, 16, 12, 10, 10, 10, 12, 20],
      linhas: portal.map((l) => [l.setorSyneco, l.obraSyneco || "—", l.opNumero || "", l.marca, l.descricao || "", l.perfil || "", l.qte, l.noPortal, l.noSyneco, l.aLancar, l.pesoALancarKg, l.baixadoPor || ""]),
    });
  }

  if (!abas.length) {
    abas.push({ nome: "Nada a lançar", subtitulo: "O Syneco está em dia com o que o portal sabe.", headers: ["Situação"], linhas: [], larguras: [60] });
  }

  return {
    titulo: "Apontamentos faltando no Syneco",
    subtitulo: `${nome ? nome + " · " : ""}${nBR(atras.length + portal.length)} lançamento(s)${geradoEm ? ` · gerado em ${geradoEm}` : ""}`,
    abas,
  };
}
