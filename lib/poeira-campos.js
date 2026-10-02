// TESTE DE POEIRA — ISO 8502-3 (fita adesiva sobre a superfície preparada).
//
// Vitor (02/10/2026): "preciso incluir na aba inspeções e na aba inspeção de campo os relatórios de
// salinidade e poeira". O modelo é o "Relatório de Poeira.xlsx" (Administrativo/Modelos de Documentos/
// Relatórios de Inspeção da Qualidade): cinco testes (A a E), cada um com local, quantidade de poeira e
// tamanho das partículas em classes de 0 a 5, a média da quantidade, a classificação das partículas, o
// laudo marcado à mão e a tabela de referência da norma.
//
// ⚠ A MÉDIA É A DA PLANILHA: ROUND(AVERAGE(...), 0) sobre os testes preenchidos. A planilha deixa a
// classificação das partículas sem fórmula — o portal sugere a MAIOR classe encontrada (o pior caso, que
// é o que o critério costuma limitar) e o que o inspetor registrar vale mais.
// ⚠ O LAUDO É DO INSPETOR: o modelo não traz requisito de aceitação, então o portal não decide sozinho.
// E ele é o MESMO "Resultado da inspeção" que todo relatório já tem (rel.resultadoInspecao) — pedir o
// laudo em dois lugares abriria espaço para o documento dizer uma coisa e a aprovação outra.
import { ETAPAS_PINTURA, DOC_REFERENCIA_SUPERFICIE, arredondar } from "@/lib/sais-campos";

export const TESTES_POEIRA = ["A", "B", "C", "D", "E"];
export const NORMA_POEIRA = "ISO 8502-3";
export const AMPLIACAO_PADRAO = "Lupa 10×";

/** A tabela de referência da norma, como o modelo a imprime. */
export const CLASSES_POEIRA = Object.freeze([
  { classe: 0, quantidade: "Nenhuma poeira visível", tamanho: "Partículas não visíveis sob ampliação de 10×" },
  { classe: 1, quantidade: "Poeira em quantidade muito pequena", tamanho: "Visíveis sob ampliação de 10×, não a olho nu (< 50 µm)" },
  { classe: 2, quantidade: "Poeira em pequena quantidade", tamanho: "Visíveis a olho nu (50–100 µm)" },
  { classe: 3, quantidade: "Poeira em quantidade moderada", tamanho: "Claramente visíveis a olho nu (até 0,5 mm)" },
  { classe: 4, quantidade: "Poeira em grande quantidade", tamanho: "Partículas entre 0,5 e 2,5 mm" },
  { classe: 5, quantidade: "Poeira em quantidade muito grande", tamanho: "Partículas maiores que 2,5 mm" },
]);

export const LAUDOS_POEIRA = ["APROVADO", "REPROVADO"];

/** Com o que o relatório nasce (lib/padroes-inspecao), editável como todo campo. */
export const PADRAO_POEIRA = Object.freeze({
  documentoReferencia: DOC_REFERENCIA_SUPERFICIE,
  fitaAdesiva: "Fita adesiva conforme ISO 8502-3 (25 mm)",
  ampliacao: AMPLIACAO_PADRAO,
});

const texto = (v) => String(v ?? "").trim();
// classe é um dígito de 0 a 5 — a MESMA regra da gravação (lib/superficie-gravacao): "3.0" ou "classe 2"
// contariam na tela e sumiriam ao salvar, e a média mudaria entre a tela e o documento
const classe = (v) => {
  const s = String(v ?? "").trim();
  return /^[0-5]$/.test(s) ? Number(s) : null;
};

/** Os testes sempre com cinco posições (a folha tem cinco linhas, de A a E). */
export function testesPoeira(res = {}) {
  const gravados = Array.isArray(res.testes) ? res.testes : [];
  return TESTES_POEIRA.map((letra, i) => ({ letra, ...(gravados[i] || {}) }));
}

/** Média da quantidade de poeira, inteira, sobre os testes preenchidos. `null` sem nenhum. */
export function mediaQuantidade(res = {}) {
  const vals = (Array.isArray(res.testes) ? res.testes : []).map((t) => classe(t?.quantidade)).filter((v) => v != null);
  if (!vals.length) return null;
  return arredondar(vals.reduce((s, v) => s + v, 0) / vals.length, 0);
}

/** A classificação das partículas: a registrada pelo inspetor, senão a maior classe encontrada. */
export function classificacaoParticulas(res = {}) {
  const registrada = classe(res.classificacao);
  if (registrada != null) return registrada;
  const vals = (Array.isArray(res.testes) ? res.testes : []).map((t) => classe(t?.tamanho)).filter((v) => v != null);
  return vals.length ? Math.max(...vals) : null;
}

/**
 * Aviso (não trava): a classificação registrada à mão MENOR que a maior classe de tamanho encontrada nos
 * testes. Pode ter motivo — mas o documento passaria a dizer "classe 4" com uma partícula classe 5 na
 * fita, sem ninguém notar. O PDF imprime a maior encontrada ao lado.
 */
export function maiorTamanhoAcima(res = {}) {
  const registrada = classe(res.classificacao);
  const vals = (Array.isArray(res.testes) ? res.testes : []).map((t) => classe(t?.tamanho)).filter((v) => v != null);
  const maior = vals.length ? Math.max(...vals) : null;
  return registrada != null && maior != null && maior > registrada ? maior : null;
}

/** O que falta para o relatório poder ir para assinatura (vazio = pode). */
export function pendenciasPoeira(rel = {}) {
  const res = rel.resultados || {};
  const faltam = [];
  const marcas = Array.isArray(rel.marcas) ? rel.marcas.filter(Boolean) : [];
  if (!marcas.length && !texto(res.peca)) faltam.push("Peça inspecionada em branco.");
  if (!texto(res.etapaPintura)) faltam.push("Etapa da pintura em branco.");
  if (!texto(res.fitaAdesiva)) faltam.push("Fita adesiva em branco.");
  const testes = Array.isArray(res.testes) ? res.testes : [];
  // ⚠ o LOCAL é complemento, não condição: no modelo a linha já se chama "Teste A…E", e a média da planilha
  // conta quantidade e tamanho. Exigir o local travava a assinatura de um teste que a planilha aceita.
  const completo = (t) => classe(t?.quantidade) != null && classe(t?.tamanho) != null;
  const comecado = (t) => t && (texto(t.local) || texto(t.quantidade) || texto(t.tamanho) || texto(t.obs));
  if (!testes.some(completo)) faltam.push("Nenhum teste completo (quantidade e tamanho das partículas).");
  testes.forEach((t, i) => {
    if (comecado(t) && !completo(t)) faltam.push(`Teste ${TESTES_POEIRA[i] || i + 1} incompleto — falta a quantidade ou o tamanho (classe de 0 a 5).`);
  });
  if (!LAUDOS_POEIRA.includes(texto(rel.resultadoInspecao).toUpperCase())) faltam.push("Laudo não marcado — escolha aprovado ou reprovado em Resultado da inspeção.");
  return faltam;
}

export const CAMPOS_CABECALHO_POEIRA = Object.freeze([
  { k: "documentoReferencia", rotulo: "Documentos de referência", grupo: "identificacao", max: 500 },
  { k: "ordemCompra", rotulo: "Ordem de compra", grupo: "identificacao" },
  // ⚠ o ensaio de poeira vale para o momento em que foi feito (logo antes da demão) — ver sais-campos
  { k: "dataInspecao", rotulo: "Data do ensaio", grupo: "identificacao", data: true },
  { k: "peca", rotulo: "Peça inspecionada", grupo: "ensaio", max: 500 },
  { k: "etapaPintura", rotulo: "Etapa da pintura", grupo: "ensaio", sugestoes: ETAPAS_PINTURA, obrigatorio: true },
  { k: "fitaAdesiva", rotulo: "Fita adesiva", grupo: "ensaio", sugestoes: ["Fita adesiva conforme ISO 8502-3 (25 mm)"], obrigatorio: true },
  { k: "ampliacao", rotulo: "Ampliação", grupo: "ensaio", sugestoes: [AMPLIACAO_PADRAO] },
]);

export const GRUPOS_CABECALHO_POEIRA = Object.freeze([
  { id: "identificacao", titulo: "Identificação" },
  { id: "ensaio", titulo: "Informações do ensaio" },
]);

/** O que o PDF imprime: o valor gravado, ou o padrão quando o campo ficou vazio. */
export function camposCabecalhoPoeira(rel = {}) {
  const res = rel.resultados || {};
  const marcas = Array.isArray(rel.marcas) ? rel.marcas.filter(Boolean) : [];
  return {
    ...res,
    peca: texto(res.peca) || marcas.join(", "),
    ampliacao: texto(res.ampliacao) || AMPLIACAO_PADRAO,
    norma: texto(res.norma) || NORMA_POEIRA,
  };
}
