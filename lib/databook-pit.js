import "server-only";
import { PIT_PADRAO, pctAvaliado } from "@/lib/pit-padroes";

/**
 * Traduz o PIT oficial da OP para o formato histórico usado pela seção 10 do Data Book.
 * A OP continua sendo a fonte; a tradução não grava uma segunda cópia no banco.
 */
export function pitDaOpParaDataBook(padraoId, revisao) {
  const padrao = PIT_PADRAO[padraoId];
  if (!padrao) return null;

  const itens = padrao.linhas.map((linha) => {
    const [item, etapa, inspecao, col3, col4, col5, col6, notas] = linha;
    if (padrao.snqc) {
      return {
        etapa: [item, etapa].filter(Boolean).join(" · "),
        caracteristica: inspecao || "",
        metodo: col3 || "",
        frequencia: pctAvaliado(col4),
        registro: col5 || "",
        criterio: col6 || "",
        responsavel: notas || "",
      };
    }
    return {
      etapa: [item, etapa].filter(Boolean).join(" · "),
      caracteristica: inspecao || "",
      metodo: [col3 && `Torg: ${col3}`, col4 && `Cliente: ${col4}`].filter(Boolean).join(" · "),
      frequencia: pctAvaliado(col5),
      registro: notas || "",
      criterio: col6 || "",
      responsavel: "",
    };
  });

  return {
    origem: "OP",
    padrao: padraoId,
    nome: padrao.nome,
    revisao: String(revisao ?? "0"),
    itens,
  };
}

/** Conteúdo manual tem prioridade; na ausência dele, usa o PIT vivo da OP. */
export function resolverPitDataBook(conteudoJson, padraoId, revisao) {
  if (Array.isArray(conteudoJson?.itens) && conteudoJson.itens.length > 0) return conteudoJson;
  return pitDaOpParaDataBook(padraoId, revisao);
}
