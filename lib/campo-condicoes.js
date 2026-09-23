// As condições do ensaio que o PORTAL DE CAMPO lê do relatório gravado ao abrir — e, portanto, as
// que ele devolve ao gravar (`app/campo/Medir.jsx`).
//
// ⚠⚠ CAMPO QUE NÃO ESTÁ AQUI VOLTA EM BRANCO AO REABRIR (23/09/2026). A lista vivia escrita à mão
// dentro da tela e não acompanhou o ultrassom: processo de soldagem, metal de adição, tipo de
// junta, chanfro e o FABRICANTE do cabeçote eram gravados, mas a tela não os lia de volta. Quem
// reabria o relatório via os campos vazios — e o seletor do cabeçote em "Selecione…", porque a
// opção só se reconhece com a marca junto (`chaveCabecote`). Parecia que a informação tinha sumido.
// O teste `campo-condicoes` varre as telas do campo e cobra que todo `cond.X` lido por elas esteja
// aqui, e que a rota do celular grave cada um.
//
// ⚠ SÓ ENTRA O QUE ALGUMA TELA DO CAMPO EDITA. O que se carrega volta na gravação, e o servidor
// corta texto em 120 caracteres: carregar, por exemplo, a lista de desenhos (`desenho`) de um
// relatório com 50 marcas faria o celular devolvê-la truncada sem ninguém ter tocado nela.

const TEXTO = [
  // visual de solda
  "iluminacao", "tecnica", "condicoes", "metalBase", "tipoPeca",
  // a junta soldada do LP e do visual de solda (23/09/2026) — processo, metal e junta estão abaixo
  "eps", "rqs",
  // ultrassom — aparelhagem, condição do ensaio e a junta ensaiada
  "carregamento", "apModelo", "apSerie", "cbModelo", "cbFabricante", "cbSerie", "cbAngulo",
  "acoplante", "blocoPadrao", "ganhoVarredura", "local",
  "processoSolda", "metalAdicao", "tipoJunta", "chanfro",
  // pintura — o que se mede, e a micragem mínima deste relatório (Vitor, 22/09/2026)
  "abrasivo", "limpeza", "intemperismo", "prepData", "prepIni", "prepFim",
  "prepTAmb", "prepTSup", "prepOrvalho", "prepUmidade", "tempo", "poeira", "salinidade",
  "pullOffEquip", "pullOffValor", "pullOffMin", "pullOffRuptura", "espessuraMinima",
  // líquido penetrante
  "tipoPenetrante", "metodo", "penetranteMarca", "penetranteLote", "removedor", "removedorLote",
  "revelador", "reveladorLote", "tempoPenetracao", "tempoSecagem", "tempoRevelador",
  "temperatura", "uv",
];

/** Os campos de texto que o celular carrega e devolve. */
export const CAMPOS_CONDICAO_CAMPO = Object.freeze([...TEXTO]);

/**
 * O estado inicial da tela do campo a partir de `resultados` gravado.
 *
 * ⚠ `??` e não `||`: "0 °C" é leitura, não campo vazio.
 * ⚠ `__espec` é o ESPECIFICADO (PLP), só para conferência — a tela o descarta ao gravar.
 */
export function condicoesDoRelatorio(resultados) {
  const r0 = resultados || {};
  const cond = Object.fromEntries(TEXTO.map((k) => [k, r0[k] ?? ""]));
  cond.rugLeituras = Array.isArray(r0.rugLeituras) ? r0.rugLeituras : ["", "", "", "", ""];
  cond.espessuras = r0.espessuras || {};
  cond.demaos = r0.demaos || {};
  cond.__espec = {
    prepProcedimento: r0.prepProcedimento || null, abrasivo: r0.abrasivo || null,
    rugEspec: r0.rugEspec || null, espessuraMinima: r0.espessuraMinima || null,
  };
  return cond;
}
