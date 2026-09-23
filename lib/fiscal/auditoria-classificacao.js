import { CLASSIFICACAO, verbetesDoCodigo, procurarClassificacao, compararNcm } from "@/lib/fiscal/classificacao-produto";
import { GRAVIDADE, achado } from "@/lib/fiscal/achado";

/**
 * A CONFERÊNCIA CONTRA O REGISTRO DE DECISÃO HUMANA.
 *
 * ⚠⚠ O QUE ELA **NÃO** FAZ: dizer qual é o NCM certo. Correspondência textual localiza a decisão,
 * não prova que a decisão fala desta peça — `contains("FLANGE")` casa "SUPORTE PARA FLANGE". Por
 * isso a divergência sai como pergunta ("qual dos dois"), com o trecho que casou à vista.
 *
 * ⚠⚠ E A COMPARAÇÃO É COM O CADASTRO DE HOJE. Uma aprovação de hoje não diz qual decisão existia
 * quando a nota saiu; `aprovadoEm` é data de registro no portal, não vigência fiscal.
 */
export function conferirClassificacao({ it, onde, registro, achados, semRegistro }) {
  if (registro === undefined) return;

  const r = procurarClassificacao(it, registro === null ? null : verbetesDoCodigo(registro, it.codigo));

  if (r.status === CLASSIFICACAO.INDISPONIVEL) {
    achados.push(achado({
      tipo: "NAO_AVALIAVEL", gravidade: GRAVIDADE.INFO, ...onde,
      titulo: "O registro de classificação não pôde ser lido",
      detalhe: r.motivo + " A conferência de classificação não foi feita para este item — o que não quer dizer que ela passaria.",
    }));
    return;
  }
  if (r.status === CLASSIFICACAO.NAO_AVALIAVEL) return;

  if (r.status === CLASSIFICACAO.AMBIGUA) {
    achados.push(achado({
      tipo: "CLASSIFICACAO_AMBIGUA", gravidade: GRAVIDADE.MEDIA, ...onde,
      titulo: "Mais de uma classificação aprovada casa com esta descrição",
      detalhe: `${r.motivo} Padrões: ${r.candidatos.map((c) => `“${c.padrao}” → ${c.ncm}`).join("; ")}. `
        + "Enquanto dois verbetes se sobrepõem, o registro não consegue responder por esta peça.",
      exigeDecisao: true,
    }));
    return;
  }
  if (r.status === CLASSIFICACAO.SEM_REGISTRO) {
    semRegistro.push(it.item);
    return;
  }

  const c = compararNcm(r, it.ncm);
  if (!c.comparavel || c.confere) return;
  achados.push(achado({
    tipo: "NCM_DIVERGE_DA_CLASSIFICACAO", gravidade: GRAVIDADE.ALTA, ...onde,
    titulo: `A nota declara NCM ${c.declarado}; o registro classifica esta peça como ${c.registrado}`,
    detalhe: `A descrição contém “${r.verbete.padrao}”, que tem classificação aprovada por `
      + `${r.verbete.aprovadoPor ?? "—"}${r.verbete.aprovadoEm ? ` em ${new Date(r.verbete.aprovadoEm).toLocaleDateString("pt-BR")}` : ""}`
      + `: ${r.verbete.fundamento ?? "sem fundamento escrito"}. `
      + "⚠ A correspondência é textual — confira se o verbete fala mesmo desta peça antes de concluir. "
      + "A comparação é com o cadastro de hoje, não com o que valia na data de emissão.",
    exigeDecisao: true,
  }));
}


/**
 * ⚠⚠ AUSÊNCIA DE CLASSIFICAÇÃO VIRA **UM** ACHADO, NÃO UM POR ITEM. Hoje o cadastro está vazio: um
 * achado por item devolveria 24 linhas idênticas na NF-e 973 e afogaria os apontamentos que têm o
 * que dizer. Divergência e ambiguidade continuam item a item — essas são específicas da peça.
 */
export function achadosDeAusencia(semRegistro) {
  if (!semRegistro?.length) return [];
  return [achado({
    tipo: "SEM_CLASSIFICACAO_APROVADA", gravidade: GRAVIDADE.INFO,
    titulo: `${semRegistro.length} item(ns) sem classificação aprovada no registro`,
    detalhe: "Nenhuma decisão registrada descreve estas peças, então não há com o que comparar o NCM declarado. "
      + "O registro é o que transforma “o cliente pediu este NCM” em “a TORG classificou assim, por este fundamento, nesta data”.",
    itens: semRegistro,
  })];
}
