// PORTAL QUALIDADE FÁBRICA — o que o celular do chão de fábrica pode fazer.
//
// Vitor (21/08/2026): "seleciona a OP, tipo de relatório, tira a foto e informa qual peça; isso
// sobe para o portal, e depois por computador começa o fluxo das assinaturas".
//
// O celular é CAPTURA, não formulário. Quanto menos campo antes da primeira foto, maior a chance
// de o inspetor usar em vez de voltar pro papel.

/** Módulo de acesso próprio. Os 5 inspetores (3 internos, 2 externos) têm SÓ este. */
export const MODULO_CAMPO = "QUALIDADE_CAMPO";

/** Quem entra no portal de campo. QUALIDADE entra também — é o mesmo trabalho. */
export const PERFIS_CAMPO = ["ADMIN", MODULO_CAMPO, "QUALIDADE"];

/**
 * Quem pode FECHAR o documento: emitir, enviar para assinatura, excluir.
 *
 * ⚠ Preencher e fechar são coisas diferentes. Vitor (04/09/2026): "ela precisa ter a tela do
 * computador também para preencher" — o inspetor entra na tela de inspeção para lançar a medição,
 * mas quem manda o relatório para assinatura responde pelo documento perante o cliente. Sem esta
 * separação, dar a tela ao inspetor daria junto o botão de despachar o documento.
 */
export function podeFecharRelatorio(user) {
  if (!user) return false;
  if (user.tipo === "ADMIN") return true;
  return (user.modulos || []).includes("QUALIDADE");
}

// Tipos provisórios até o Vitor fechar os modelos ("estou finalizando os modelos dos relatórios").
// Os nomes seguem as seções do data book que já existem, pra a foto cair no lugar certo depois:
// §11 dimensional, §12 END (visual de solda e líquido penetrante), §14 pintura.
// `secao` = onde o relatório entra no data book. É isso que faz o documento aparecer na
// ESTRUTURAÇÃO (a lista de seções no portal), e não só no PDF.
// `sigla` = prefixo do número. Vitor: "você deve numerar eles de acordo com cada obra, e ser
// sequencial" → RID-067-001, uma série por tipo dentro de cada obra.
// ⚠ "RM" não entra como sigla: no portal RM já é Requisição de Material.
// Os quatro primeiros são os modelos que o Vitor mandou (21/08/2026), com os nomes e as siglas do
// próprio formulário — o de solda já se chama "EVS Nº" na planilha dele.
// LP fica porque a §12 do data book e a pasta do servidor têm líquido penetrante, mas ainda NÃO há
// modelo: a captura funciona e o formulário entra quando o modelo vier.
export const TIPOS_RELATORIO = [
  { id: "DIMENSIONAL", label: "Inspeção dimensional e visual", secao: "11", sigla: "RID" },
  { id: "VISUAL_SOLDA", label: "Inspeção visual de solda", secao: "12", sigla: "EVS" },
  { id: "ULTRASSOM", label: "Ensaio por ultrassom", secao: "12", sigla: "RUS" },
  { id: "PINTURA", label: "Inspeção de pintura", secao: "14", sigla: "RIP" },
  { id: "LP", label: "Líquido penetrante", secao: "12", sigla: "RLP" },
  // ⚠ ERA "Registro geral". Vitor (22/08/2026): "os relatórios que você chama de registro geral na
  // verdade é relatório de Pré-montagem". E ele não é um registro solto: pede as MESMAS informações
  // do dimensional — cotas marcadas no desenho, dimensional/alinhamento/acabamento —, mudando só de
  // onde vem o projeto (conjunto ou diagrama de montagem).
  { id: "PRE_MONTAGEM", label: "Inspeção de pré-montagem", secao: "11", sigla: "RPM" },
];

export const TIPO = Object.fromEntries(TIPOS_RELATORIO.map((t) => [t.id, t]));

/**
 * Os dois relatórios que se preenchem MARCANDO COTAS NO DESENHO.
 *
 * Vitor (22/08/2026): a pré-montagem "precisa das mesmas informações do dimensional; a única
 * diferença é que vamos ter que puxar alguns projetos diferentes, podendo ser conjuntos ou
 * diagrama de montagem".
 *
 * ⚠ Existe para não espalhar `tipo === "DIMENSIONAL" || tipo === "PRE_MONTAGEM"` por dez arquivos:
 * quando o terceiro aparecer, é uma linha aqui — e não uma caçada por condições esquecidas, que é
 * justamente como um tipo novo acaba com metade do comportamento.
 */
export const TIPOS_COM_COTAS = ["DIMENSIONAL", "PRE_MONTAGEM"];
export const usaCotas = (tipo) => TIPOS_COM_COTAS.includes(tipo);

/** RID-067-003 — sigla do tipo, OP com 3 dígitos, sequencial da obra com 3. */
export function codigoRelatorio(tipo, opNumero, numero) {
  const sigla = TIPO[tipo]?.sigla || "RIG";
  const op = String(opNumero || "").replace(/\D/g, "").padStart(3, "0") || String(opNumero || "");
  return `${sigla}-${op}-${String(numero || 0).padStart(3, "0")}`;
}

export const TIPO_LABEL = Object.fromEntries(TIPOS_RELATORIO.map((t) => [t.id, t.label]));
export const tipoValido = (id) => TIPOS_RELATORIO.some((t) => t.id === id);

/**
 * O TÍTULO IMPRESSO NO CABEÇALHO DO DOCUMENTO.
 *
 * Vitor (03/09/2026): "para o relatório de pré-montagem o nome está saindo como de dimensional".
 * Estava mesmo: o gerador tinha o título do dimensional escrito à mão, e a pré-montagem — que usa o
 * MESMO formulário — saía com o nome do outro relatório. Num documento do SGQ isso não é detalhe:
 * o título é o que identifica qual inspeção foi feita.
 *
 * ⚠ Separado do `label` (que é o texto de tela, "Inspeção de pré-montagem"): no papel o título é em
 * caixa alta e começa por "RELATÓRIO DE", e misturar os dois deixaria a tela gritando ou o
 * documento em minúsculas.
 */
export const TITULO_DOCUMENTO = {
  DIMENSIONAL: "RELATÓRIO DE INSPEÇÃO DIMENSIONAL E VISUAL",
  PRE_MONTAGEM: "RELATÓRIO DE INSPEÇÃO DE PRÉ-MONTAGEM",
  VISUAL_SOLDA: "RELATÓRIO DE INSPEÇÃO VISUAL DE SOLDA",
  ULTRASSOM: "RELATÓRIO DE ENSAIO POR ULTRASSOM",
  PINTURA: "RELATÓRIO DE INSPEÇÃO DE PINTURA",
  LP: "RELATÓRIO DE ENSAIO POR LÍQUIDO PENETRANTE",
};
export const tituloDocumento = (tipo) =>
  TITULO_DOCUMENTO[tipo] || `RELATÓRIO DE ${String(TIPO_LABEL[tipo] || "INSPEÇÃO").toUpperCase()}`;

/**
 * O QUE AINDA FALTA PARA O RELATÓRIO PODER IR PARA ASSINATURA.
 *
 * Vitor (03/09/2026): "para os relatórios que não estiverem definidas todas as medidas mencionadas
 * para conferência e o quantitativo você precisa bloquear para envio de assinatura".
 *
 * ⚠⚠ ASSINAR É FECHAR O DOCUMENTO. Depois do envio o relatório vira somente leitura e vai para o
 * data book — mandar assinar um documento com a coluna "Dimensão Encontrada" em branco pede que
 * alguém assine uma conferência que não foi feita. Melhor barrar antes.
 *
 * ⚠ Só vale para os tipos que se preenchem marcando cota (ver `usaCotas`): nos outros (pintura,
 * ultrassom, LP) o que se preenche é outro formulário, com outras regras.
 *
 * @returns {string[]} lista de pendências em português; vazia = pode enviar
 */
export function pendenciasParaAssinatura(rel) {
  if (!rel || !usaCotas(rel.tipo)) return [];
  const linhas = Array.isArray(rel.linhas) ? rel.linhas : [];
  const cotas = linhas.filter((l) => l?.letra);
  const faltam = [];

  if (!cotas.length) {
    faltam.push("Nenhuma cota marcada — o relatório não diz o que foi conferido.");
  } else {
    const semMedida = cotas.filter((l) => l.encontradoMm == null);
    if (semMedida.length) {
      faltam.push(
        `Dimensão encontrada em branco na${semMedida.length > 1 ? "s" : ""} cota${semMedida.length > 1 ? "s" : ""} ` +
        semMedida.map((l) => l.letra).join(", ") + ".",
      );
    }
    const semProjeto = cotas.filter((l) => l.projetoMm == null);
    if (semProjeto.length) {
      faltam.push(`Dimensão de projeto em branco na(s) cota(s) ${semProjeto.map((l) => l.letra).join(", ")}.`);
    }
  }

  // ⚠ O QUANTITATIVO é o campo QUANT. do cabeçalho: quantas peças daquela marca a OP tem. Vem da
  // lista da Engenharia na criação (`resultados.qtdPeca`) e, em relatório antigo, da linha.
  const qtd = rel.resultados?.qtdPeca || {};
  const temQtdNoMapa = Object.values(qtd).some((v) => v != null && v !== "" && Number(v) > 0);
  const temQtdNaLinha = linhas.some((l) => l?.qtd != null && Number(l.qtd) > 0);
  if (!temQtdNoMapa && !temQtdNaLinha) {
    faltam.push("Quantitativo (QUANT.) não informado.");
  }
  return faltam;
}

/**
 * Como a peça foi identificada. Não é detalhe de implementação:
 *
 *   QR    — o desenho disse qual é. É o próprio Tekla que imprime a marca no código.
 *   BUSCA — a pessoa escolheu numa lista da OP. Peça sem QR, ou desenho fora de alcance.
 *   LIVRE — não é uma peça da lista (região, eixo, vista geral).
 *
 * Numa auditoria as três não valem a mesma coisa, então o portal guarda qual foi.
 */
export const ORIGENS_MARCA = ["QR", "BUSCA", "LIVRE"];
export const ORIGEM_LABEL = { QR: "lido no QR", BUSCA: "escolhida na lista", LIVRE: "digitada" };

/**
 * O QR do desenho traz a MARCA em texto puro — nada de URL.
 * Conferido nos desenhos da OP-083: `T83A13.pdf` → "T83A13"; `T83A-P1 - CROQUI.pdf` → "T83A-P1".
 */
export function marcaDoQR(texto) {
  const t = String(texto || "").trim();
  if (!t || t.length > 40) return null;
  // aceita só o que parece marca do Tekla: T + número da OP + resto (letras, números, hífen)
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(t) ? t.toUpperCase() : null;
}

/**
 * A marca casa com a OP escolhida?
 *
 * A marca do Tekla nasce com o número da OP embutido ("T83A13" → OP-083), então dá pra conferir.
 * ⚠ Isso é AVISO, não trava: sub-obra usa prefixo próprio (T67B, T67CT) e obra antiga foge do
 * padrão. Bloquear faria o inspetor não conseguir registrar uma foto legítima no meio do galpão —
 * o que ele faria em seguida é voltar pro papel.
 */
export function marcaCasaOP(marca, opNumero) {
  const num = parseInt(String(opNumero || "").match(/\d+/)?.[0] || "", 10);
  const daMarca = parseInt(String(marca || "").match(/^T0*(\d+)/i)?.[1] || "", 10);
  if (!num || !daMarca) return true; // sem como saber → não acusa
  return num === daMarca;
}
