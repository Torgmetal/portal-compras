// ─── AS TABELAS DE CST — ICMS, PIS/COFINS E ORIGEM ───────────────────────────
//
// ⚠⚠ ISTO É TABELA OFICIAL, NÃO INTERPRETAÇÃO. Os códigos e o que cada um SIGNIFICA são públicos e
// fixos: CST de ICMS e origem da mercadoria vêm das Tabelas A e B do Convênio s/nº de 15/12/1970
// (redação do Ajuste SINIEF 03/2010); CST de PIS/COFINS, da tabela 4.3.3 do SPED, a mesma que a
// NF-e usa. Guardá-las aqui não é o portal decidindo nada — é ele parando de fingir que não sabe
// o que "41" quer dizer.
//
// ⚠⚠ E SABER O QUE O CÓDIGO SIGNIFICA NÃO É SABER QUAL USAR. Matheus (23/09/2026): *"monte essa
// base legal para você ter o conhecimento dos impostos que faltam preencher o CST"*. A base permite
// ao portal (1) explicar cada código, (2) dizer o que cada um EXIGE que se prove, e (3) acusar
// incompatibilidade entre o CFOP e o CST escolhido. Escolher continua sendo de quem conhece a
// operação — o que muda é que agora ele escolhe vendo o que está afirmando.
//
// ⚠ Cada verbete leva `exige`: o que precisa estar demonstrado para aquele código se sustentar.
// Sem isso a tabela vira um menu, e menu é o que faz alguém marcar "41 — não tributada" porque a
// nota "não tem imposto".

export const FONTE_ICMS = "Convênio s/nº de 15/12/1970, Anexo — Tabelas A e B (redação do Ajuste SINIEF 03/2010)";
export const FONTE_PIS_COFINS = "Tabela 4.3.3 do SPED / layout da NF-e — CST de PIS e COFINS na saída";

/** TABELA A — a ORIGEM da mercadoria, que é o primeiro dígito do CST de ICMS. */
export const ORIGEM = [
  { codigo: "0", rotulo: "Nacional, exceto as dos códigos 3, 4, 5 e 8" },
  { codigo: "1", rotulo: "Estrangeira — importação direta, exceto a do código 6" },
  { codigo: "2", rotulo: "Estrangeira — adquirida no mercado interno, exceto a do código 7" },
  { codigo: "3", rotulo: "Nacional, com Conteúdo de Importação acima de 40% e até 70%" },
  { codigo: "4", rotulo: "Nacional, produzida conforme processos produtivos básicos" },
  { codigo: "5", rotulo: "Nacional, com Conteúdo de Importação de até 40%" },
  { codigo: "6", rotulo: "Estrangeira — importação direta, sem similar nacional (lista CAMEX)" },
  { codigo: "7", rotulo: "Estrangeira — adquirida no mercado interno, sem similar nacional (lista CAMEX)" },
  { codigo: "8", rotulo: "Nacional, com Conteúdo de Importação acima de 70%" },
];

/**
 * TABELA B — a TRIBUTAÇÃO pelo ICMS.
 *
 * ⚠⚠ O CST DE ICMS TEM DOIS DÍGITOS: origem + tributação. Na NF-e eles saem grudados ("0" + "41" =
 * `041`), e tratar só a segunda metade como "o CST" é o engano que faz uma peça nacional e uma
 * importada saírem com o mesmo código.
 */
export const CST_ICMS = [
  { cst: "00", rotulo: "Tributada integralmente", tributa: true,
    exige: ["Alíquota e base de cálculo da operação"] },
  { cst: "10", rotulo: "Tributada e com cobrança do ICMS por substituição tributária", tributa: true,
    exige: ["O produto está no regime de ST para o estado de destino?", "MVA / base de ST"] },
  { cst: "20", rotulo: "Com redução de base de cálculo", tributa: true,
    exige: ["Qual dispositivo concede a redução", "Percentual de redução"] },
  { cst: "30", rotulo: "Isenta ou não tributada e com cobrança do ICMS por substituição tributária", tributa: false,
    exige: ["Fundamento da isenção/não incidência", "Enquadramento na ST"] },
  { cst: "40", rotulo: "Isenta", tributa: false,
    exige: ["Qual dispositivo concede a isenção", "Prazo de vigência do benefício"] },
  { cst: "41", rotulo: "Não tributada", tributa: false,
    exige: ["Por que a operação está fora do campo de incidência do ICMS"] },
  { cst: "50", rotulo: "Suspensão", tributa: false,
    exige: ["Dispositivo que autoriza a suspensão", "Prazo de retorno, quando houver"] },
  { cst: "51", rotulo: "Diferimento", tributa: false,
    exige: ["Dispositivo que institui o diferimento", "Para qual etapa o imposto foi diferido"] },
  { cst: "60", rotulo: "ICMS cobrado anteriormente por substituição tributária", tributa: false,
    exige: ["Comprovação de que o imposto já foi retido na etapa anterior"] },
  { cst: "70", rotulo: "Com redução de base de cálculo e cobrança do ICMS por substituição tributária", tributa: true,
    exige: ["Dispositivo da redução", "Enquadramento na ST"] },
  { cst: "90", rotulo: "Outras", tributa: null,
    exige: ["Qual é a situação de verdade"],
    nota: "⚠⚠ É o último recurso, não o atalho: se coube num código específico, o 90 esconde a operação de quem for auditar." },
];

/**
 * CST DE PIS E COFINS NA SAÍDA.
 *
 * ⚠ Os dois tributos usam a MESMA tabela e, na esmagadora maioria das operações, o MESMO código —
 * mas são declarados em campos separados e podem divergir. O portal trata como dois.
 */
export const CST_PIS_COFINS = [
  { cst: "01", rotulo: "Operação tributável com alíquota básica", tributa: true,
    exige: ["Regime de apuração da empresa"] },
  { cst: "02", rotulo: "Operação tributável com alíquota diferenciada", tributa: true,
    exige: ["Dispositivo que fixa a alíquota diferenciada"] },
  { cst: "03", rotulo: "Operação tributável com alíquota por unidade de medida de produto", tributa: true,
    exige: ["Dispositivo que fixa a alíquota específica", "Quantidade na unidade tributada"] },
  { cst: "04", rotulo: "Operação tributável monofásica — revenda a alíquota zero", tributa: false,
    exige: ["O produto é monofásico?", "A operação é revenda?"] },
  { cst: "05", rotulo: "Operação tributável por substituição tributária", tributa: false,
    exige: ["Enquadramento do produto na ST de PIS/COFINS"] },
  { cst: "06", rotulo: "Operação tributável a alíquota zero", tributa: false,
    exige: ["Dispositivo que reduz a alíquota a zero"] },
  { cst: "07", rotulo: "Operação isenta da contribuição", tributa: false,
    exige: ["Dispositivo que concede a isenção"] },
  { cst: "08", rotulo: "Operação sem incidência da contribuição", tributa: false,
    exige: ["Por que a operação está fora do campo de incidência"],
    nota: "⚠ É o caso típico de remessa e retorno: movimentar mercadoria não é auferir receita." },
  { cst: "09", rotulo: "Operação com suspensão da contribuição", tributa: false,
    exige: ["Dispositivo que autoriza a suspensão"] },
  { cst: "49", rotulo: "Outras operações de saída", tributa: null,
    exige: ["Qual é a situação de verdade"] },
];

export const porCst = (tabela, cst) => tabela.find((x) => x.cst === String(cst ?? "").padStart(2, "0")) ?? null;
