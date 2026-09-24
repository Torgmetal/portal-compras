const PROCEDIMENTO_US = "PI-QUA-003 - Procedimento de US AWS D1.1";
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
  const angulo = partes.find((p) => /°/.test(p)) || "";
  const frequencia = partes.find((p) => /\bmhz\b/i.test(p)) || "";
  const m = principal.match(/^(Mitech|Doppler|Krautkramer)\s+(.+)$/i);
  const fabricante = m?.[1] || "";
  const modeloCompleto = m?.[2] || principal;
  const dimensoes = modeloCompleto.match(/\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\b/i)?.[0]?.replace(/\s+/g, "") || "";
  const modelo = texto(modeloCompleto.replace(dimensoes, ""));
  return { fabricante, modelo, dimensoes, angulo, frequencia };
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
    procedimento: !procedimentoSalvo || /^PO-?06\b/i.test(procedimentoSalvo) ? PROCEDIMENTO_US : procedimentoSalvo,
    norma: texto(res.norma) || NORMA_US,
    criterio: texto(res.criterio) || NORMA_US,
    apFabricante: texto(res.apFabricante) || aparelho.fabricante,
    apModelo: aparelho.modelo,
    cbFabricante: texto(res.cbFabricante) || cabecote.fabricante,
    cbModelo: texto(res.cbDimensoes) || texto(res.cbFrequencia) ? texto(res.cbModelo) : cabecote.modelo,
    cbAngulo: texto(res.cbAngulo) ? `${texto(res.cbAngulo).replace(/°$/, "")}°` : cabecote.angulo,
    cbDimensoes: texto(res.cbDimensoes) || cabecote.dimensoes,
    cbFrequencia: texto(res.cbFrequencia) || cabecote.frequencia,
  };
}

export { PROCEDIMENTO_US, NORMA_US };
