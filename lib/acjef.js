// Parser do arquivo ACJEF (Portaria 1510) — Controle de Jornada p/ Efeitos Fiscais.
// Largura fixa; posição 10 = tipo de registro (1 header, 2 jornadas, 3 marcação
// diária, 9 trailer). O ACJEF NÃO traz nomes (só PIS) e os totais apurados são
// codificados de forma ambígua — por isso extraímos só as marcações por PIS/dia
// (referência); o RH preenche os totais na tela.

function soData(ddmmaaaa) {
  const s = String(ddmmaaaa || "").trim();
  const m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// HHMM válido? (00:00–23:59)
function ehHora(s) {
  if (!/^\d{4}$/.test(s)) return false;
  const h = +s.slice(0, 2), mi = +s.slice(2);
  return h < 24 && mi < 60;
}

/**
 * @param {string} texto conteúdo do .txt (latin1)
 * @returns {{ empresa, cnpj, competencia, funcionarios: Array<{pis, dias: Array<{data, marcacoes: string[], raw}>}> }}
 */
export function parseAcjef(texto) {
  const linhas = String(texto || "").split(/\r?\n/).filter((l) => l.length >= 10);

  // Header (tipo 1): empresa + CNPJ
  let empresa = null, cnpj = null;
  const h = linhas.find((l) => l[9] === "1");
  if (h) {
    const mCnpj = h.slice(10, 24).match(/(\d{14})/);
    if (mCnpj) cnpj = mCnpj[1];
    const mNome = h.match(/([A-ZÀ-Ú][A-ZÀ-Ú0-9 .&'/-]{4,}?(?:LTDA|S\.?A\.?|EIRELI|ME|EPP)?)\s{2,}/);
    if (mNome) empresa = mNome[1].trim();
  }

  // Marcações (tipo 3): agrupa por PIS
  const porPis = new Map();
  const meses = {};
  for (const l of linhas) {
    if (l[9] !== "3") continue;
    const pis = l.slice(10, 22).trim();
    const data = soData(l.slice(22, 30));
    if (!pis || !data) continue;
    const mes = data.slice(0, 7);
    meses[mes] = (meses[mes] || 0) + 1;

    // Marcações/horas do dia: campos HHMM plausíveis logo após a data. O campo em
    // pos 35-38 (offset 4) é uma contagem (ex: "0001"), não horário — pulamos.
    const resto = l.slice(30);
    const marcacoes = [];
    for (const i of [0, 8, 12]) {
      const campo = resto.slice(i, i + 4);
      if (ehHora(campo) && campo !== "0000") marcacoes.push(`${campo.slice(0, 2)}:${campo.slice(2)}`);
    }

    if (!porPis.has(pis)) porPis.set(pis, { pis, dias: [] });
    porPis.get(pis).dias.push({ data, marcacoes, raw: resto.trim() });
  }

  // Competência = mês mais frequente nas marcações
  const competencia = Object.entries(meses).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const funcionarios = [...porPis.values()].map((f) => ({
    ...f,
    dias: f.dias.sort((a, b) => a.data.localeCompare(b.data)),
    totalDias: f.dias.length,
  }));

  return { empresa, cnpj, competencia, funcionarios };
}
