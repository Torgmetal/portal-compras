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

import { CAMPOS_CABECALHO_US } from "./us-campos";

/**
 * As três verificações do modelo dimensional (e da pré-montagem): DIMENSIONAL, ALINHAMENTO, ACABAMENTO.
 * ⚠ São A/R, não texto — a rota do celular só as grava nesses dois tipos, como APROVADO/REPROVADO.
 */
export const VERIFICACOES_DIMENSIONAL = Object.freeze(["dimensional", "alinhamento", "acabamento"]);
import { CAMPOS_TEXTO_SUPERFICIE, LONGOS_SUPERFICIE } from "./superficie-gravacao";

const TEXTO_LISTADO = [
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
  // a DESCRIÇÃO e a OBS. do registro fotográfico do modelo, que nenhuma tela tinha (02/10/2026)
  "descricao", "obsFotos",
  // líquido penetrante
  "tipoPenetrante", "metodo", "penetranteMarca", "penetranteLote", "removedor", "removedorLote",
  "revelador", "reveladorLote", "tempoPenetracao", "tempoSecagem", "tempoRevelador",
  "temperatura", "uv",
  // dimensional e pré-montagem: as três verificações do modelo (02/10/2026) — o celular não as tinha, e
  // o relatório ia para assinatura com as três caixas vazias. A rota só as grava nesses dois tipos.
  ...VERIFICACOES_DIMENSIONAL,
];

// ⚠ O ultrassom edita TODO o cabeçalho no celular desde 25/09/2026 (Vitor: "todos os campos precisamos
// deixar para ser possível ajustar") — desenho e procedimento inclusive. O corte de 120 caracteres
// não os morde: as duas rotas aceitam até 500 no desenho, o único que pode ser uma lista.
// ⚠ e sais e poeira (02/10/2026): todo o cabeçalho dos dois modelos — ver lib/superficie-gravacao
const TEXTO = [...new Set([...TEXTO_LISTADO, ...CAMPOS_CABECALHO_US.map((c) => c.k), ...CAMPOS_TEXTO_SUPERFICIE])];

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
  // as cinco amostras do relatório de sais e os cinco testes (A a E) da poeira — listas, como as leituras
  cond.amostras = Array.isArray(r0.amostras) ? r0.amostras : [];
  cond.testes = Array.isArray(r0.testes) ? r0.testes : [];
  cond.__espec = {
    prepProcedimento: r0.prepProcedimento || null, abrasivo: r0.abrasivo || null,
    rugEspec: r0.rugEspec || null, espessuraMinima: r0.espessuraMinima || null,
  };
  return cond;
}

/**
 * Até quantos caracteres as rotas gravam cada campo de texto do cabeçalho. 120 para todos, e 500 no
 * DESENHO: ele pode ser uma lista ("T113A1 R0, T113A2 R0, …") e, cortado, voltaria pela metade na
 * próxima gravação sem ninguém ter mexido nele.
 */
// ⚠ a relação de peças e os documentos de referência de sais e poeira também são listas (02/10/2026)
// ⚠ e a descrição e a OBS. das fotos da pintura, que são texto corrido: 500, como no computador (02/10/2026)
const LONGOS = new Set(["desenho", "descricao", "obsFotos", ...LONGOS_SUPERFICIE]);
export const limiteDoCampo = (k) => (LONGOS.has(k) ? 500 : 120);
