// PORTAL QUALIDADE FÁBRICA — o que o celular do chão de fábrica pode fazer.
//
// Vitor (21/08/2026): "seleciona a OP, tipo de relatório, tira a foto e informa qual peça; isso
// sobe para o portal, e depois por computador começa o fluxo das assinaturas".
//
// O celular é CAPTURA, não formulário. Quanto menos campo antes da primeira foto, maior a chance
// de o inspetor usar em vez de voltar pro papel.

import { pendenciasPintura } from "@/lib/pintura-campos";
import { pendenciasSais } from "@/lib/sais-campos";
import { pendenciasPoeira } from "@/lib/poeira-campos";
import { pendenciasPullOff } from "@/lib/pulloff-campos";
import { pendenciasRecebimento } from "@/lib/recebimento-tinta-campos";
import { pendenciasLP } from "@/lib/lp-campos";
import { pendenciasEVS } from "@/lib/evs-campos";
import { pendenciasUS } from "@/lib/us-relatorio";
import { daVez } from "@/lib/assinatura-fila";

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
  // Vitor (02/10/2026): "preciso incluir na aba inspeções e na aba inspeção de campo os relatórios de
  // salinidade e poeira" — modelos "Relatório de Sais" e "Relatório de Poeira" do SGQ. Os dois são da
  // preparação de superfície, então entram na §14 (tratamento de superfície e pintura) — e
  // vêm ANTES da pintura na lista, que é a ordem em que acontecem: sal e poeira se medem antes da 1ª demão.
  // ⚠ e o RECEBIMENTO DE TINTAS e o PULL-OFF (02/10/2026: "pode criar também"), na ordem do processo: a
  // tinta chega (recebimento) antes de tudo; o pull-off mede a adesão da película já curada, depois da
  // pintura. Os dois entram na §14. ⚠ O recebimento NÃO vai na §15 (certificados/lotes de tintas), apesar do
  // nome: lá o cron vincula certificado sozinho a partir do documento mais novo da seção, e o PDF lista tudo
  // como rastreabilidade (R, corrida). Ver testes/lib/relatorio-secao-databook.teste.js.
  { id: "RECEBIMENTO_TINTA", label: "Recebimento de tintas", secao: "14", sigla: "RRT" },
  { id: "SAIS", label: "Contaminação por sais (salinidade)", secao: "14", sigla: "RCS" },
  { id: "POEIRA", label: "Teste de poeira", secao: "14", sigla: "RTP" },
  { id: "PINTURA", label: "Inspeção de pintura", secao: "14", sigla: "RIP" },
  { id: "PULL_OFF", label: "Ensaio de aderência (pull-off)", secao: "14", sigla: "RPO" },
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

/**
 * Os relatórios que NÃO inspecionam junta: o ensaio é da SUPERFÍCIE ou do revestimento (pintura, sais,
 * poeira). No celular eles não têm "Juntas a inspecionar", nem Ler QR / Digitar, nem as condições do
 * visual de solda — sem esta lista, um tipo novo caía nos controles do EVS (02/10/2026).
 */
export const TIPOS_SEM_JUNTA = ["PINTURA", "SAIS", "POEIRA", "PULL_OFF", "RECEBIMENTO_TINTA"];
export const semJunta = (tipo) => TIPOS_SEM_JUNTA.includes(tipo);

// ⚠ REC é "recomendação de exame complementar" — termo dos ensaios de solda (END). Os ensaios da superfície e
// o recebimento de tintas só têm aprovado/reprovado no modelo, e a trava deles cobra um dos dois: o botão REC
// ali servia só para segurar o relatório (verificação dos modelos, 02/10/2026). Quem já tem REC gravado
// continua vendo o botão, para poder trocar.
export const TIPOS_SEM_REC = ["SAIS", "POEIRA", "PULL_OFF", "RECEBIMENTO_TINTA"];
export const resultadosDaTela = (tipo, atual) => ["APROVADO", "REPROVADO", "REC"].filter((v) => v !== "REC" || !TIPOS_SEM_REC.includes(tipo) || atual === "REC");

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
  SAIS: "RELATÓRIO DE CONTAMINAÇÃO DA SUPERFÍCIE POR SAIS",
  POEIRA: "RELATÓRIO DE TESTE DE POEIRA",
  PULL_OFF: "RELATÓRIO DE ENSAIO DE TRAÇÃO — PULL-OFF",
  RECEBIMENTO_TINTA: "RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE TINTAS",
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
 * ⚠ As regras de cota valem para os tipos que se preenchem marcando cota (ver `usaCotas`). A
 * PINTURA tem as suas desde 29/09/2026 (`pendenciasPintura`): procedimento de preparo e, em cada
 * demão aplicada, data, horários e inspeção visual. Ultrassom e LP seguem sem trava.
 *
 * @returns {string[]} lista de pendências em português; vazia = pode enviar
 */
export function pendenciasParaAssinatura(rel) {
  if (rel?.tipo === "PINTURA") return pendenciasPintura(rel.resultados);
  // ⚠ sais e poeira travam como a pintura: peça, etapa e ao menos um ensaio completo (ver os módulos)
  if (rel?.tipo === "SAIS") return pendenciasSais(rel);
  if (rel?.tipo === "POEIRA") return pendenciasPoeira(rel);
  if (rel?.tipo === "PULL_OFF") return pendenciasPullOff(rel);
  if (rel?.tipo === "RECEBIMENTO_TINTA") return pendenciasRecebimento(rel);
  // ⚠ o LP não tinha trava nenhuma até 02/10/2026 (ver lib/lp-campos)
  if (rel?.tipo === "LP") return pendenciasLP(rel);
  if (rel?.tipo === "VISUAL_SOLDA") return pendenciasEVS(rel);
  if (rel?.tipo === "ULTRASSOM") return pendenciasUS(rel);
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
  // Na pré-montagem é opcional (Vitor, 16/09/2026): a conferência é do projeto,
  // e a falta de quantitativo não impede a assinatura. As cotas seguem obrigatórias.
  const qtd = rel.resultados?.qtdPeca || {};
  const temQtdNoMapa = Object.values(qtd).some((v) => v != null && v !== "" && Number(v) > 0);
  const temQtdNaLinha = linhas.some((l) => l?.qtd != null && Number(l.qtd) > 0);
  if (rel.tipo !== "PRE_MONTAGEM" && !temQtdNoMapa && !temQtdNaLinha) {
    faltam.push("Quantitativo (QUANT.) não informado.");
  }

  // ⚠ AS TRÊS VERIFICAÇÕES DO MODELO (verificação de 02/10/2026): o relatório chegava assinado com
  // DIMENSIONAL, ALINHAMENTO e ACABAMENTO em branco — o celular nem as tinha. E aprovado com uma delas
  // reprovada é o documento dizendo duas coisas.
  const VERIF = [["dimensional", "dimensional"], ["alinhamento", "alinhamento"], ["acabamento", "acabamento"]];
  const r = rel.resultados || {};
  const semVerif = VERIF.filter(([k]) => !["APROVADO", "REPROVADO"].includes(String(r[k] || "").toUpperCase())).map(([, n]) => n);
  if (semVerif.length) faltam.push(`Marque aprovado ou reprovado em: ${semVerif.join(", ")}.`);
  const reprovadas = VERIF.filter(([k]) => String(r[k] || "").toUpperCase() === "REPROVADO").map(([, n]) => n);
  if (String(rel.resultadoInspecao || "").toUpperCase() === "APROVADO" && reprovadas.length) {
    faltam.push(`Resultado APROVADO com ${reprovadas.join(", ")} reprovado — confira o resultado.`);
  }
  return faltam;
}

/**
 * Quem ainda não assinou o relatório enviado.
 *
 * ⚠⚠ COM O E-MAIL PARA ONDE O CONVITE FOI — é ele que destrava. Medido em 23/09/2026: 12
 * relatórios emitidos esperando assinatura, 4 com o inspetor convidado em
 * alexandre_stival@yahoo.com.br, que não é o login dele no portal (stival2112@gmail.com). A tela
 * dizia só "Alexandre Stival · Inspetor", igual para os dois endereços: ninguém tinha como ver
 * que o convite tinha ido para outra caixa.
 */
export const faltamAssinar = (assinaturas) =>
  (Array.isArray(assinaturas) ? assinaturas : []).filter((a) => a && !a.assinadoEm);
export const rotuloAssinante = (a) =>
  a?.nome && a?.email ? `${a.nome} (${a.email})` : a?.nome || a?.email || "—";

/**
 * Quem falta assinar, numa linha — a mesma na lista e no detalhe.
 *
 * ⚠ Em fila (inspetor → Torg Metal → cliente, 29/09/2026) diz QUEM ESTÁ COM A VEZ, com o e-mail do
 * convite, e quem espera: "Falta assinar: Geraldo · Davi" parecia que o cliente já tinha o convite.
 * Envio antigo, em paralelo, segue listando todos os que faltam.
 */
export function linhaFaltamAssinar(assinaturas) {
  const faltam = faltamAssinar(assinaturas);
  if (!faltam.length) return "";
  const vez = daVez(assinaturas);
  if (!vez) return `Falta assinar: ${faltam.map(rotuloAssinante).join(" · ")}`;
  const fila = faltam.filter((a) => a !== vez).sort((x, y) => (x.ordem ?? 0) - (y.ordem ?? 0));
  return `Com a vez: ${rotuloAssinante(vez)}${fila.length ? ` · na fila: ${fila.map((a) => a.nome || a.email).join(" → ")}` : ""}`;
}

/**
 * A tarja do relatório já enviado: quem assinou E quem falta.
 *
 * ⚠ "assinado por Geraldo Tank", com cadeado, lido sozinho, é documento assinado — e o
 * RIP-089-002 está assim desde 17/09 esperando o cliente. A tarja diz quem falta.
 */
export function tarjaDoEnvio(assinaturas, revisao) {
  const lista = Array.isArray(assinaturas) ? assinaturas : [];
  const assinaram = lista.filter((a) => a?.assinadoEm).map((a) => a.nome || a.email);
  const faltam = faltamAssinar(lista).map((a) => a.nome || a.email);
  const partes = [assinaram.length ? `assinado por ${assinaram.join(", ")}` : "enviado para assinatura"];
  if (faltam.length) partes.push(`falta ${faltam.join(", ")}`);
  return `${partes.join(" · ")} · R${String(revisao ?? 0).padStart(2, "0")} — alterações ficam registradas`;
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
