import { MATERIAL_PADRAO } from "@/lib/us-campos";
// ⚠ SEM A NORMA NO FIM. Vitor (22/09/2026): "pode tirar esse AWS a frente do procedimento" — o
// cabeçalho já tem "NORMA DE REFERÊNCIA: AWS D1.1" na coluna ao lado, e repetir num documento que o
// cliente confere linha a linha só faz duvidar de qual é o certo.
const PROCEDIMENTO_US = "PI-QUA-003 - Procedimento de US";
// o nome gravado até 22/09/2026 — relatório antigo é normalizado ao abrir
const PROCEDIMENTO_US_ANTIGO = /^PI-?QUA-?003\s*-\s*Procedimento de US\s+AWS\s*D1[.\s]?1$/i;
const NORMA_US = "AWS D1.1";

const texto = (v) => String(v || "").trim();

function decomporAparelho(valor) {
  const original = texto(valor);
  const m = original.match(/^(Mitech|Krautkramer|Modsonic(?:-Einstein)?|GE|Sonatest)\s+(.+)$/i);
  return m ? { fabricante: m[1], modelo: m[2] } : { fabricante: "", modelo: original };
}

function decomporCabecote(valor) {
  const original = texto(valor);
  const partes = original.split(/\s*·\s*/);
  const principal = partes[0] || "";
  // ⚠ O ÂNGULO VEM SEM O SÍMBOLO DESDE 22/09/2026 ("… · 70 · 2 MHz"); o formato antigo, com "70°",
  // continua sendo lido — há relatório gravado assim. O "°" é reposto adiante, no campo do PDF.
  const anguloCru = partes.slice(1).find((p) => /^\s*\d{1,3}\s*°?\s*$/.test(p)) || "";
  const angulo = anguloCru ? `${anguloCru.replace(/[^\d]/g, "")}°` : "";
  const frequencia = partes.find((p) => /\bmhz\b/i.test(p)) || "";
  // ⚠ A marca saiu do rótulo, mas o valor ANTIGO ainda a traz no começo — daí a regex continuar.
  const m = principal.match(/^(Mitech|Doppler|Krautkramer)\s+(.+)$/i);
  const fabricante = m?.[1] || "";
  const modeloCompleto = m?.[2] || principal;
  const dimensoes = modeloCompleto.match(/\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\b/i)?.[0]?.replace(/\s+/g, "") || "";
  const modelo = texto(modeloCompleto.replace(dimensoes, ""));
  return { fabricante, modelo, dimensoes, angulo, frequencia };
}

const OBRIGATORIOS_US = [
  ["carregamento", "Tipo de estrutura"], ["apModelo", "Aparelho"], ["apSerie", "Série do aparelho"],
  ["cbModelo", "Cabeçote"], ["cbSerie", "Série do cabeçote"], ["cbAngulo", "Ângulo real"],
  ["acoplante", "Acoplante"], ["blocoPadrao", "Bloco padrão"],
  ["ganhoVarredura", "Ganho de varredura"], ["local", "Local do ensaio"],
];

/** O item 18.1 do PI-QUA-003 exige estes — a tela os marca com asterisco. */
export const ehObrigatorioUS = (k) => OBRIGATORIOS_US.some(([c]) => c === k);

export function progressoPreenchimentoUS(valores = {}) {
  const faltando = OBRIGATORIOS_US.filter(([k]) => !texto(valores[k])).map(([, nome]) => nome);
  return { preenchidos: OBRIGATORIOS_US.length - faltando.length, total: OBRIGATORIOS_US.length, faltando };
}

export function detalhesCabecoteUS(valor) { return decomporCabecote(valor); }

// ⚠ O rótulo da lista ("angular 20x22 · 70 · 2 MHz") é sempre decomposto — mesmo com dimensão ou
// frequência ajustadas à mão (25/09/2026), senão o MODELO sairia com o rótulo inteiro. Modelo digitado
// (sem "·") com as medidas ao lado sai como está.
function modeloDoCabecote(res, cabecote) {
  const gravado = texto(res.cbModelo);
  const medidasAMao = texto(res.cbDimensoes) || texto(res.cbFrequencia);
  return /·/.test(gravado) || !medidasAMao ? cabecote.modelo : gravado;
}

/** Normaliza o cabeçalho do RUS sem apagar os valores explícitos do inspetor. */
export function camposCabecalhoUS(rel = {}) {
  const res = rel.resultados || {};
  const aparelho = decomporAparelho(res.apModelo);
  const cabecote = decomporCabecote(res.cbModelo);
  const marcas = Array.isArray(rel.marcas) ? rel.marcas.filter(Boolean) : [];
  const procedimentoSalvo = texto(res.procedimento);

  return {
    ...res,
    tag: texto(res.tag) || marcas.join(", "),
    procedimento: !procedimentoSalvo || /^PO-?06\b/i.test(procedimentoSalvo) || PROCEDIMENTO_US_ANTIGO.test(procedimentoSalvo)
      ? PROCEDIMENTO_US : procedimentoSalvo,
    norma: texto(res.norma) || NORMA_US,
    criterio: texto(res.criterio) || NORMA_US,
    apFabricante: texto(res.apFabricante) || aparelho.fabricante,
    apModelo: aparelho.modelo,
    cbFabricante: texto(res.cbFabricante) || cabecote.fabricante,
    cbModelo: modeloDoCabecote(res, cabecote),
    cbAngulo: texto(res.cbAngulo) ? `${texto(res.cbAngulo).replace(/°$/, "")}°` : cabecote.angulo,
    cbDimensoes: texto(res.cbDimensoes) || cabecote.dimensoes,
    cbFrequencia: texto(res.cbFrequencia) || cabecote.frequencia,
    // ⚠ o relatório antigo pode ter nascido sem material; o documento não sai com o campo vazio
    material: texto(res.material) || MATERIAL_PADRAO,
  };
}

// ─── A TABELA: as indicações reprovadas E as peças ensaiadas ───────────────────────────────────
//
// ⚠⚠ A PEÇA NÃO CHEGAVA À TABELA. Vitor (25/09/2026), no RUS-113-001: "as informações não estão
// sendo colocadas na tabela abaixo no relatório de ultrassom; exemplo: nem a peça foi enviada para
// lá". Duas causas somadas:
//   1. a tela e o Campo gravam a peça em `marca`, e o PDF lia `peca` — a coluna "Identificação da
//      Peça" saía vazia mesmo com indicação lançada;
//   2. só a descontinuidade REPROVADA vira linha (PI-QUA-003, item 15.1), então o relatório
//      aprovado imprimia a tabela em branco, sem dizer que peça foi ensaiada.
// O 15.1 continua valendo: indicação, só a reprovada. Mas toda peça ensaiada aparece — a que não
// tem indicação reprovada sai numa linha própria, com o ângulo do cabeçote e o laudo A.
//
// ⚠ O "A" só sai com o relatório CONCLUÍDO (resultado lançado). Em rascunho a peça aparece sem
// laudo: o portal não afirma uma aceitação que o inspetor ainda não deu.
//
// ⚠ "Compr. reprovado (mm)" é o que a tela pede, e ela grava em `comprimento`; o PDF imprimia esse
// número na coluna "Compr. Inspec." e deixava a "Compr. Reprovado" vazia.
//
// ⚠ O COMPRIMENTO INSPECIONADO é pedido na indicação, no computador, desde 02/10/2026 (verificação do
// ultrassom: a coluna do modelo saía sempre em branco) — e vai na própria linha, em `inspecionado`. A
// peça SEM indicação não tem onde informá-lo: a linha dela nasce aqui, e sai com a célula em branco
// ("campos sem fonte ficam em branco", Vitor, 22/08/2026).
export const SEM_INDICACAO = "Sem indicação reprovável";

export function linhasTabelaUS(rel = {}) {
  const res = rel.resultados || {};
  const concluido = Boolean(rel.resultadoInspecao);
  const indicacoes = (Array.isArray(rel.linhas) ? rel.linhas : []).map((l) => ({
    ...l,
    peca: texto(l.peca) || texto(l.marca),
    reprovado: texto(l.reprovado) || texto(l.comprimento),
  }));
  const comIndicacao = new Set(indicacoes.map((l) => l.peca.toUpperCase()).filter(Boolean));
  const angulo = (texto(res.cbAngulo) || decomporCabecote(res.cbModelo).angulo).replace(/°$/, "");
  const aprovadas = (Array.isArray(rel.marcas) ? rel.marcas : [])
    .map(texto).filter((m) => m && !comIndicacao.has(m.toUpperCase()))
    .map((peca) => ({ peca, indicacao: "—", angulo, laudo: concluido ? "A" : "", obs: concluido ? SEM_INDICACAO : "" }));
  return [...indicacoes, ...aprovadas];
}

export { PROCEDIMENTO_US, NORMA_US };

/**
 * O que falta para o ultrassom ir para assinatura (vazio = pode).
 *
 * ⚠ ATÉ 02/10/2026 O US NÃO TINHA TRAVA (verificação dos modelos): a indicação lançada no celular — que
 * nem tinha onde dar laudo — ia para assinatura sem avaliação. A peça SEM indicação não entra aqui: ela
 * sai "A" sozinha no documento concluído (ver `linhasTabelaUS`).
 */
export function pendenciasUS(rel = {}) {
  const linhas = Array.isArray(rel.linhas) ? rel.linhas : [];
  const faltam = [];
  const nome = (l, i) => l?.peca || l?.marca || `indicação ${i + 1}`;
  const semLaudo = linhas.map((l, i) => (["A", "R", "REC"].includes(String(l?.laudo || "").toUpperCase()) ? null : nome(l, i))).filter(Boolean);
  if (semLaudo.length) faltam.push(`Laudo em branco na indicação de: ${semLaudo.join(", ")}.`);
  const reprovadas = linhas.filter((l) => String(l?.laudo || "").toUpperCase() === "R").map(nome);
  if (String(rel.resultadoInspecao || "").toUpperCase() === "APROVADO" && reprovadas.length) {
    faltam.push(`Resultado APROVADO com indicação reprovada (${reprovadas.join(", ")}) — confira o resultado.`);
  }
  return faltam;
}
