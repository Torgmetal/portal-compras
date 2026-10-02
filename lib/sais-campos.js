// CONTAMINAÇÃO DA SUPERFÍCIE POR SAIS — ISO 8502-6 (extração Bresle) / ISO 8502-9 (condutimetria).
//
// Vitor (02/10/2026): "preciso incluir na aba inspeções e na aba inspeção de campo os relatórios de
// salinidade e poeira (…) garanta que todos os campos de informações tenham como preencher com alguma
// informação, até mesmo ver informações que já possam vir pré-preenchidas". O modelo é o "Relatório de
// Sais.xlsx" (Administrativo/Modelos de Documentos/Relatórios de Inspeção da Qualidade): cinco amostras,
// cada uma com a condutividade da água deionizada, a da amostra, o Δ, a densidade de sais e a hora; o
// requisito de aceitação, a média e o laudo.
//
// ⚠ AS FÓRMULAS SÃO AS DA PLANILHA: Δ = amostra − água; média de 1 casa sobre as amostras preenchidas;
// laudo APROVADO quando média ≤ requisito. A planilha deixa a DENSIDADE para o inspetor digitar — o portal
// a calcula pela ISO 8502-9 quando ela fica vazia, e o que o inspetor digitar (lido no aparelho) vale mais.
export const N_AMOSTRAS = 5;

/**
 * O BRESLE DA NORMA: célula de 1.250 mm² (12,5 cm²) e 3 ml de água deionizada (ISO 8502-6).
 * ⚠ É PADRÃO, NÃO TRAVA: há kit com 2,5 ml e célula de outro tamanho — o campo continua digitável, e a
 * conta da densidade usa o que estiver no relatório.
 */
export const VOLUME_PADRAO_ML = 3;
export const AREA_PADRAO_CM2 = 12.5;
export const NORMA_SAIS = "ISO 8502-6 / ISO 8502-9";

/** O procedimento da Torg para preparação de superfície — o "documento de referência" dos dois modelos. */
export const DOC_REFERENCIA_SUPERFICIE = "PO-05 - Preparação de Superfície e Pintura";

/**
 * COM O QUE O RELATÓRIO NASCE (lib/padroes-inspecao), editável como todo campo.
 * ⚠ O CONDUTIVÍMETRO NÃO ESTÁ NO MAPA DE CALIBRAÇÃO (conferido em 02/10/2026: 30 instrumentos, nenhum)
 * — modelo e tag ficam para o inspetor, e a obra passa a lembrá-los depois do primeiro relatório.
 * ⚠ O termômetro é o TM-01, o único termômetro do mapa; o tag é do EQUIPAMENTO, repetir-se é o certo.
 * ⚠ O REQUISITO NÃO NASCE: é critério do contrato — vem da memória da obra, nunca de um chute.
 */
export const PADRAO_SAIS = Object.freeze({
  documentoReferencia: DOC_REFERENCIA_SUPERFICIE,
  volumeAgua: "3",
  areaCelula: "12,5",
  aparelho: "Condutivímetro",
  termometro: "Termômetro infravermelho digital",
  tmTag: "TM-01",
});

/** Em que momento da pintura o ensaio foi feito — sugestão, não lista fechada. */
export const ETAPAS_PINTURA = ["Após o jateamento", "Antes da 1ª demão", "Entre demãos", "Antes da demão de acabamento"];

const texto = (v) => String(v ?? "").trim();
const br = (n, casas = 1) => (n == null ? "" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: casas }));

/**
 * Número de MEDIÇÃO: ponto e vírgula são, os dois, separador DECIMAL.
 *
 * ⚠⚠ `numeroBR` lê "0.125" como 125 (verificação de 02/10/2026) — certo para preço de fornecedor, que
 * escreve milhar com ponto, e errado para leitura de aparelho: condutividade não tem milhar, e o
 * condutivímetro mostra ponto. Texto que não é um número limpo ("1e3", "12 a 14") é `null`, não um
 * número inventado.
 */
export function numeroMedida(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
}
const num = numeroMedida;

/**
 * Arredonda como o ROUND do Excel: metade para longe do zero, e sem o ruído do ponto flutuante —
 * (12,1 + 12,4) / 2 dá 12,249999… em JavaScript, e o `Math.round` cru devolvia 12,2 onde a planilha
 * mostra 12,3.
 */
export function arredondar(x, casas = 1) {
  const f = 10 ** casas;
  const v = Number((Math.abs(x) * f).toPrecision(12));
  return (Math.sign(x) * Math.round(v)) / f;
}

/** Δ condutividade (µS/cm) = amostra − água deionizada. `null` se faltar uma das duas, como na planilha. */
export function deltaCondutividade(a = {}) {
  const agua = num(a.condAgua), amostra = num(a.condAmostra);
  return agua == null || amostra == null ? null : amostra - agua;
}

/**
 * Densidade de sais (mg/m²) pela ISO 8502-9: ρA = c · V · Δγ / A, com c = 5 (kg·m⁻¹·S⁻¹).
 * Com V em ml, Δγ em µS/cm e A em cm², a constante fica 5 — e o Bresle padrão (3 ml, 12,5 cm²) dá o
 * conhecido fator de 1,2 sobre o Δ.
 */
export function densidadeSais(delta, volumeMl, areaCm2) {
  const d = typeof delta === "number" ? delta : num(delta);
  const v = num(volumeMl), a = num(areaCm2);
  if (d == null || v == null || a == null || a <= 0) return null;
  return (5 * v * d) / a;
}

/** As amostras com o que se calcula delas, sempre com N_AMOSTRAS posições (a folha tem cinco colunas). */
export function amostrasCalculadas(res = {}) {
  const gravadas = Array.isArray(res.amostras) ? res.amostras : [];
  const volume = texto(res.volumeAgua) || String(VOLUME_PADRAO_ML);
  const area = texto(res.areaCelula) || String(AREA_PADRAO_CM2);
  return Array.from({ length: N_AMOSTRAS }, (_, i) => {
    const a = gravadas[i] || {};
    const delta = deltaCondutividade(a);
    const digitada = num(a.densidade);
    const calculada = densidadeSais(delta, volume, area);
    return {
      ...a,
      delta,
      densidade: digitada ?? calculada,
      densidadeConta: calculada,
      // ⚠ o documento diz quando o número saiu da conta, para ninguém confundir com leitura do aparelho
      densidadeCalculada: digitada == null && calculada != null,
    };
  });
}

/** Média das densidades preenchidas, 1 casa (ROUND(AVERAGE(...),1) da planilha). */
export function mediaDensidade(res = {}) {
  const vals = amostrasCalculadas(res).map((a) => a.densidade).filter((v) => v != null);
  if (!vals.length) return null;
  return arredondar(vals.reduce((s, v) => s + v, 0) / vals.length, 1);
}

/**
 * APROVADO quando a média ≤ requisito, como a planilha. Sem requisito ou sem amostra, "" — o portal não
 * afirma um laudo que não tem como dar.
 */
export function laudoSais(res = {}) {
  const media = mediaDensidade(res);
  const req = num(res.requisito);
  if (media == null || req == null) return "";
  return media <= req ? "APROVADO" : "REPROVADO";
}

/** O que falta para o relatório poder ir para assinatura (vazio = pode). */
export function pendenciasSais(rel = {}) {
  const res = rel.resultados || {};
  const faltam = [];
  const marcas = Array.isArray(rel.marcas) ? rel.marcas.filter(Boolean) : [];
  if (!marcas.length && !texto(res.peca)) faltam.push("Peça inspecionada em branco.");
  if (!texto(res.etapaPintura)) faltam.push("Etapa da pintura em branco.");
  // ⚠ vazio vale o PADRÃO, como no PDF e na conta (o Bresle de 3 ml / 12,5 cm²): dizer "em branco" de um
  // campo que o documento imprime preenchido seria a tela e o papel discordando
  const positivo = (v, padrao, nome, unidade) => {
    const n = num(texto(v) || padrao);
    if (n == null) faltam.push(`${nome} ilegível — escreva só o número, em ${unidade}.`);
    else if (n <= 0) faltam.push(`${nome} precisa ser maior que zero.`);
  };
  positivo(res.volumeAgua, VOLUME_PADRAO_ML, "Volume de água injetado", "ml");
  positivo(res.areaCelula, AREA_PADRAO_CM2, "Área da célula", "cm²");
  const req = num(res.requisito);
  if (req == null) faltam.push(texto(res.requisito) ? "Requisito de aceitação ilegível — escreva só o número, em mg/m²." : "Requisito de aceitação (mg/m²) em branco.");
  else if (req < 0) faltam.push("Requisito de aceitação não pode ser negativo.");
  // ⚠ o condutivímetro NÃO está no mapa de calibração: modelo e tag são o único elo entre a leitura e o aparelho
  if (!texto(res.apModelo) || !texto(res.apTag)) faltam.push("Aparelho sem modelo ou tag — é por eles que a leitura se liga ao condutivímetro usado.");
  const amostras = Array.isArray(res.amostras) ? res.amostras : [];
  const completa = (a) => num(a?.condAgua) != null && num(a?.condAmostra) != null && texto(a?.hora);
  const comecada = (a) => a && (texto(a.condAgua) || texto(a.condAmostra) || texto(a.hora) || texto(a.densidade));
  if (!amostras.some(completa)) faltam.push("Nenhuma amostra completa (condutividade da água, da amostra e hora).");
  amostras.forEach((a, i) => {
    if (comecada(a) && !completa(a)) faltam.push(`Amostra ${i + 1} incompleta — falta condutividade da água, da amostra ou a hora.`);
    for (const [k, nome] of [["condAgua", "condutividade da água"], ["condAmostra", "condutividade da amostra"], ["densidade", "densidade"]]) {
      if (texto(a?.[k]) && num(a[k]) == null) faltam.push(`Amostra ${i + 1}: ${nome} ilegível — escreva só o número.`);
      else if (num(a?.[k]) < 0) faltam.push(`Amostra ${i + 1}: ${nome} negativa.`);
    }
    // ⚠ a amostra arrasta sal da superfície: condutividade MENOR que a da água pura é leitura trocada ou errada
    const d = completa(a) ? deltaCondutividade(a) : null;
    if (d != null && d < 0) faltam.push(`Amostra ${i + 1}: a condutividade da amostra é menor que a da água deionizada — confira as leituras.`);
  });
  // ⚠ o documento imprime o laudo da CONTA (média ≤ requisito); o "Resultado da inspeção" marcado à mão
  // não pode dizer o contrário — senão o PDF diz aprovado e a aprovação, reprovado
  const conta = laudoSais(res);
  const marcado = texto(rel.resultadoInspecao).toUpperCase();
  if (conta && marcado && marcado !== conta) faltam.push(`O resultado marcado (${marcado}) não bate com o laudo do ensaio (${conta}: média contra o requisito).`);
  return faltam;
}

/**
 * Avisos (não travas): a densidade DIGITADA que se afasta mais de 20% da que a ISO 8502-9 calcula com o
 * volume e a área do relatório. O valor lido no aparelho vale mais — mas uma diferença dessas costuma
 * ser célula de outro tamanho, volume trocado ou leitura na unidade errada, e quem lança deve olhar.
 */
export function divergenciasDensidade(res = {}) {
  const v = texto(res.volumeAgua) || br(VOLUME_PADRAO_ML), a = texto(res.areaCelula) || br(AREA_PADRAO_CM2);
  return amostrasCalculadas(res).flatMap((am, i) => {
    if (am.densidadeCalculada || am.densidade == null || am.densidadeConta == null) return [];
    const dif = Math.abs(am.densidade - am.densidadeConta);
    if (dif <= Math.max(0.2 * Math.abs(am.densidadeConta), 1)) return [];
    return [`Amostra ${i + 1}: a densidade digitada (${br(am.densidade)}) difere da calculada (${br(arredondar(am.densidadeConta, 1))} mg/m² com ${v} ml e ${a} cm²) — confira o volume, a área e a unidade.`];
  });
}

/**
 * Os campos do cabeçalho, para a tela e o celular — a MESMA lista nos dois.
 * `sugestoes` = lista da casa como sugestão (datalist); o campo sempre aceita outro valor.
 */
// `max` = o que as rotas gravam (lib/superficie-gravacao): a caixa não aceita mais do que vai ser guardado,
// em vez de o servidor cortar em silêncio
export const CAMPOS_CABECALHO_SAIS = Object.freeze([
  { k: "documentoReferencia", rotulo: "Documento de referência", grupo: "identificacao", max: 500 },
  { k: "ordemCompra", rotulo: "Ordem de compra", grupo: "identificacao" },
  // ⚠ a DATA DO ENSAIO, que o modelo pede no campo DATA: a data de emissão é a do envio para assinatura,
  // e o ensaio de superfície vale para o momento em que foi feito (logo antes da demão)
  { k: "dataInspecao", rotulo: "Data do ensaio", grupo: "identificacao", data: true },
  { k: "peca", rotulo: "Peça inspecionada", grupo: "ensaio", max: 500 },
  { k: "etapaPintura", rotulo: "Etapa da pintura", grupo: "ensaio", sugestoes: ETAPAS_PINTURA, obrigatorio: true },
  { k: "volumeAgua", rotulo: "Volume de água injetado (ml)", grupo: "ensaio", numero: true, obrigatorio: true },
  { k: "areaCelula", rotulo: "Área da célula (cm²)", grupo: "ensaio", numero: true, obrigatorio: true },
  { k: "requisito", rotulo: "Requisito de aceitação (mg/m²)", grupo: "ensaio", numero: true, obrigatorio: true },
  { k: "aparelho", rotulo: "Aparelho", grupo: "aparelho", sugestoes: ["Condutivímetro"] },
  { k: "apModelo", rotulo: "Aparelho — modelo", grupo: "aparelho" },
  { k: "apTag", rotulo: "Aparelho — tag", grupo: "aparelho" },
  { k: "termometro", rotulo: "Termômetro", grupo: "termometro" },
  { k: "tmModelo", rotulo: "Termômetro — modelo", grupo: "termometro" },
  { k: "tmTag", rotulo: "Termômetro — tag", grupo: "termometro" },
]);

export const GRUPOS_CABECALHO_SAIS = Object.freeze([
  { id: "identificacao", titulo: "Identificação" },
  { id: "ensaio", titulo: "Informações do ensaio" },
  { id: "aparelho", titulo: "Aparelho (condutivímetro)" },
  { id: "termometro", titulo: "Termômetro" },
]);

/** O que o PDF imprime: o valor gravado, ou o padrão quando o campo ficou vazio. */
export function camposCabecalhoSais(rel = {}) {
  const res = rel.resultados || {};
  const marcas = Array.isArray(rel.marcas) ? rel.marcas.filter(Boolean) : [];
  return {
    ...res,
    peca: texto(res.peca) || marcas.join(", "),
    volumeAgua: texto(res.volumeAgua) || br(VOLUME_PADRAO_ML),
    areaCelula: texto(res.areaCelula) || br(AREA_PADRAO_CM2),
    norma: texto(res.norma) || NORMA_SAIS,
  };
}

export { br as numeroCurtoBR };
