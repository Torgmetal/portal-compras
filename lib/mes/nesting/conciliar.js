// ─── O ARQUIVO DA MÁQUINA CONTRA O RELATÓRIO ─────────────────────────────────
//
// ⚠⚠ A PEÇA CURTA NÃO TEM NOME NO ARQUIVO DA MÁQUINA. A `T107A-P3` tem **62,30 mm** — não cabe
// gravação, e o TubesT simplesmente não põe texto nela. No plano T107A isso são 10 das 35 peças:
// lidas só do arquivo, elas apareceriam como "(sem nome)" e o operador veria buraco na lista.
//
// O relatório em PDF diz quantas são. Cruzando os dois, cada corte da barra ganha nome — e o que
// NÃO fechar aparece como divergência, em vez de ser resolvido no chute.
//
// ⚠ ISTO NÃO INVENTA MARCA. Quando sobra mais de um candidato para os cortes sem nome, eles ficam
// SEM NOME e a divergência é dita. Um palpite aqui vira baixa na marca errada, e erro de baixa só
// aparece no inventário, meses depois.

import { soMarca } from "./marca";

/**
 * @param {{itens:{marca:string,qtd:number}[]}} doRelatorio a barra, como o PDF a descreve
 * @param {{cortes:{segmento:string,gravado:string|null}[]}} doArquivo a mesma barra, do `.zx`
 */
export function conciliarBarra(doRelatorio, doArquivo) {
  const esperado = esperadoDoRelatorio(doRelatorio);
  const cortes = (doArquivo?.cortes || []).map((c) => ({
    segmento: c.segmento, marca: c.gravado ? soMarca(c.gravado) : null, gravada: Boolean(c.gravado),
  }));
  const semNome = cortes.filter((c) => !c.marca);

  // ⚠⚠ A DEDUÇÃO SÓ VALE SE, DEPOIS DELA, A BARRA FICAR SEM NENHUMA OUTRA DIVERGÊNCIA (achado do
  // Codex, 13/09/2026). Ela é aplicada por tentativa e DESFEITA se sobrar qualquer desacerto —
  // contagem, marca a mais, marca a menos. Nomear a peça no meio de um plano que já não bate é
  // carimbar palpite em cima de dado suspeito.
  //
  // ⚠⚠ E ELA CONTINUA SUPONDO QUE O PDF E O ARQUIVO SÃO DA MESMA VERSÃO DO PLANO — coisa que NENHUM
  // dos dois arquivos prova sozinho. No replano (PDF velho A×2+B×1, arquivo novo com a peça sem
  // gravação já trocada), a conta fecha e a marca sai errada, calada. Quem tem de garantir isso é a
  // IMPORTAÇÃO, gravando o hash dos dois arquivos JUNTOS como um par — está anotado no §12.3 e é o
  // motivo de `deduzida: true` viajar até a tela: peça deduzida é peça para conferir no olho.
  const candidata = unicaCandidata(esperado, cortes, semNome.length);
  if (candidata) for (const c of semNome) { c.marca = candidata; c.deduzida = true; }

  const divergencias = divergenciasDe({ esperado, cortes, semNome, resolvida: candidata, doRelatorio });
  if (candidata && divergencias.length) {
    for (const c of semNome) { c.marca = null; delete c.deduzida; }
    return { cortes, divergencias: divergenciasDe({ esperado, cortes, semNome, resolvida: null, doRelatorio }) };
  }
  return { cortes, divergencias };
}

function esperadoDoRelatorio(doRelatorio) {
  const esperado = new Map();
  for (const i of doRelatorio?.itens || []) {
    esperado.set(i.marca, (esperado.get(i.marca) || 0) + i.qtd);
  }
  return esperado;
}

/** A marca que pode ficar com TODOS os cortes sem gravação — ou nada, se houver dúvida. */
function unicaCandidata(esperado, cortes, quantosSemNome) {
  const faltando = new Map(esperado);
  for (const c of cortes) {
    if (c.marca) faltando.set(c.marca, (faltando.get(c.marca) ?? 0) - 1);
  }
  const candidatas = [...faltando].filter(([, n]) => n > 0);
  const unica = candidatas.length === 1 && candidatas[0][1] === quantosSemNome;
  return unica ? candidatas[0][0] : null;
}

function divergenciasDe({ esperado, cortes, semNome, resolvida, doRelatorio }) {
  const avisos = [];
  const pecasNoRelatorio = [...esperado.values()].reduce((a, b) => a + b, 0);
  const dizNoPdf = doRelatorio?.pecas || pecasNoRelatorio;
  if (dizNoPdf !== cortes.length) {
    avisos.push(`O relatório diz ${dizNoPdf} peças nesta barra e o arquivo tem ${cortes.length}.`);
  }
  if (semNome.length && !resolvida) {
    avisos.push(`${semNome.length} peça(s) sem gravação e mais de uma marca possível — ficaram sem nome de propósito.`);
  }
  return [...avisos, ...porMarca(esperado, cortes)];
}

function porMarca(esperado, cortes) {
  const avisos = [];
  const contado = new Map();
  for (const c of cortes) if (c.marca) contado.set(c.marca, (contado.get(c.marca) || 0) + 1);
  for (const [marca, n] of esperado) {
    const tem = contado.get(marca) || 0;
    if (tem !== n) avisos.push(`${marca}: o relatório diz ${n} e o arquivo mostra ${tem}.`);
  }
  for (const [marca] of contado) {
    if (!esperado.has(marca)) avisos.push(`${marca} está gravada no arquivo e não aparece no relatório.`);
  }
  return avisos;
}

/**
 * O plano inteiro, pronto para virar `MesNesting`/`MesNestingItem`.
 *
 * ⚠ A quantidade do item é **POR BARRA**, não o total do plano (§12.3): total = por barra ×
 * barras cortadas, sempre derivado. Guardar o total obrigaria a dividir de volta a cada
 * apontamento, e divisão que não fecha em inteiro é onde nascem as meias-peças.
 */
export function planoConciliado(relatorio, arquivos = []) {
  const todas = arquivos.flatMap((a) => (a.barras || []).map((b) => ({ ...b, origem: a.origem || "barra" })));
  const { porIndice, repetidas } = indexarBarras(todas);

  const barras = (relatorio?.barras || []).map((b) => {
    const casada = repetidas.has(b.indice) ? null : porIndice.get(b.indice);
    const junto = casada ? conciliarBarra(b, casada) : { cortes: [], divergencias: [] };
    return {
      ...b,
      temArquivo: Boolean(casada),
      cortes: junto.cortes,
      divergencias: casada ? junto.divergencias : [semArquivo(b, repetidas)],
    };
  });

  const noRelatorio = new Set(barras.map((b) => b.indice));
  const sobrando = todas.filter((b) => !noRelatorio.has(b.indice))
    .map((b) => `O arquivo traz a Nest ${b.indice}, que não existe no relatório.`);

  return {
    ...relatorio,
    barras,
    divergencias: [...(relatorio?.falhas || []), ...barras.flatMap((b) => b.divergencias), ...sobrando],
  };
}

/**
 * ⚠⚠ ÍNDICE REPETIDO NÃO PODE SE SOBREGRAVAR (achado do Codex). Dois arquivos `_Nest 1` — o do
 * plano refeito e o do antigo, na mesma pasta — entravam no mesmo `Map` e prevalecia o ÚLTIMO
 * lido, que depende da ordem do sistema de arquivos. A barra passa a não casar com nenhum, e a
 * ambiguidade é dita.
 *
 * ⚠⚠ MAS O `.yxy` NÃO CONCORRE COM O `.zx` — e a minha primeira versão acusou ambiguidade nas
 * QUATRO barras do plano real (13/09/2026, rodando nos arquivos de verdade). O `.yxy` é o plano
 * INTEIRO e naturalmente contém as mesmas barras que os `.zx`, que são os recortes dele. Vale o
 * arquivo DA BARRA, que é o que vai para a máquina; o plano só preenche a barra que não tiver
 * recorte. Ambiguidade de verdade é dois arquivos DA MESMA ESPÉCIE para a mesma barra.
 */
function indexarBarras(todas) {
  const porIndice = new Map();
  const repetidas = new Set();
  for (const b of todas) {
    const antiga = porIndice.get(b.indice);
    if (!antiga) { porIndice.set(b.indice, b); continue; }
    if (antiga.origem === b.origem) { repetidas.add(b.indice); continue; }
    if (b.origem === "barra") porIndice.set(b.indice, b);
  }
  return { porIndice, repetidas };
}

const semArquivo = (b, repetidas) =>
  repetidas.has(b.indice)
    ? `Achei mais de um arquivo para a Nest ${b.indice} — não dá para saber qual é o bom.`
    : "Sem o arquivo da máquina desta barra.";
