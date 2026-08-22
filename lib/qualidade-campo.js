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
