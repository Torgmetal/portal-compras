// Parser do cartão de ponto "Secullum Ponto Offline" (PDF) — 1 funcionário por
// página. Lê por COORDENADA (x,y) dos itens de texto: as colunas do relatório
// têm x fixo, então mapeamos cada valor à sua coluna sem ambiguidade (o split
// por espaço falharia quando faixas ficam em branco). Fonte oficial das horas.
//
// Saída: { periodoInicio, periodoFim, empresa, funcionarios: [{ cpf, nome,
//   folha, funcao, departamento, admissao, totais{...}, dias:[{...}] }] }
//
// Colunas (x aproximado, tolerância ±14):
//   22 DIA · 132 ENT1 · 168 SAI1 · 204 ENT2 · 240 SAI2 · 276 ENT3 · 312 SAI3
//   348 NORMAIS · 384 FALTAS · 420 EX50 · 456 EX60 · 492 EX80 · 528 EX100
//   563 EX150 · 599 NOT · 635 BTOTAL · 671 BCRED · 707 BDEB · 743 BSALDO · 779 DSR

const COLS = [
  { k: "ent1", x: 132 }, { k: "sai1", x: 168 }, { k: "ent2", x: 204 },
  { k: "sai2", x: 240 }, { k: "ent3", x: 276 }, { k: "sai3", x: 312 },
  { k: "normais", x: 348 }, { k: "faltas", x: 384 }, { k: "ex50", x: 420 },
  { k: "ex60", x: 456 }, { k: "ex80", x: 492 }, { k: "ex100", x: 528 },
  { k: "ex150", x: 563 }, { k: "noturno", x: 599 }, { k: "bTotal", x: 635 },
  { k: "bCred", x: 671 }, { k: "bDeb", x: 707 }, { k: "bSaldo", x: 743 },
  { k: "dsr", x: 779 },
];
const CAMPOS_HORA = ["normais", "faltas", "ex50", "ex60", "ex80", "ex100", "ex150", "noturno", "dsr"];
const CAMPOS_BATIDA = ["ent1", "sai1", "ent2", "sai2", "ent3", "sai3"];

const colDe = (x) => {
  let best = null, bd = 15;
  for (const c of COLS) { const d = Math.abs(x - c.x); if (d < bd) { bd = d; best = c.k; } }
  return best;
};

/** "HH:MM" → minutos (int). Vazio/inválido → 0. */
export function hmParaMin(s) {
  const m = /^(\d+):(\d{2})$/.exec(String(s || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
/** minutos → "HH:MM" (para exibir igual o PDF). */
export function minParaHM(min) {
  const v = Math.max(0, Math.round(Number(min) || 0));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

const soDigitos = (s) => String(s || "").replace(/\D/g, "");
// "26/05/26" → "2026-05-26" (ano com 2 dígitos → 20xx)
function dataBrParaIso(dd, mm, yy) {
  const ano = yy.length === 2 ? `20${yy}` : yy;
  return `${ano}-${mm}-${dd}`;
}

/**
 * @param {Buffer|Uint8Array} buffer PDF do cartão de ponto Secullum.
 * @returns {Promise<object>}
 */
export async function parsePontoSecullum(buffer) {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  let periodoInicio = null, periodoFim = null, empresa = null;
  const funcionarios = [];

  for (let pg = 1; pg <= pdf.numPages; pg++) {
    const page = await pdf.getPage(pg);
    const tc = await page.getTextContent();
    const itens = tc.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ s: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }));

    const textoPagina = itens.map((i) => i.s).join(" ");

    // Período (uma vez) — "DE 26/05/2026 ATÉ 25/06/2026"
    if (!periodoInicio) {
      const p = textoPagina.match(/DE\s+(\d{2}\/\d{2}\/\d{4})\s+AT[ÉE]\s+(\d{2}\/\d{2}\/\d{4})/i);
      if (p) { periodoInicio = p[1]; periodoFim = p[2]; }
    }
    if (!empresa) {
      // Pega o item de texto que termina em LTDA (nome social) — evita colar o
      // header "DIA"/"Departamento" que fica na mesma linha do texto corrido.
      const it = itens.find((i) => /LTDA\.?$/i.test(i.s) && i.s.length > 6);
      if (it) empresa = it.s.trim();
    }

    const cpf = (textoPagina.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/) || [])[0] || null;
    if (!cpf) continue; // página sem funcionário identificável

    // Cabeçalho: nº folha (antes do CPF) e labels
    const folha = (textoPagina.match(/(\d{5,7})\s+\d{3}\.\d{3}\.\d{3}-\d{2}/) || [])[1] || null;

    // Agrupa itens por linha (y). Linhas de dia começam com "DD/MM/YY".
    const porY = new Map();
    for (const it of itens) {
      const yk = Math.round(it.y);
      if (!porY.has(yk)) porY.set(yk, []);
      porY.get(yk).push(it);
    }

    const dias = [];
    let totais = null;
    for (const [, linha] of porY) {
      const dia = linha.find((i) => /^\d{2}\/\d{2}\/\d{2}\b/.test(i.s) && i.x < 60);
      const tot = linha.find((i) => /^TOTAIS/.test(i.s));
      if (!dia && !tot) continue;

      // Mapeia cada item da linha à sua coluna
      const vals = {};
      for (const it of linha) {
        const c = colDe(it.x);
        if (c && !vals[c]) vals[c] = it.s;
      }

      if (tot) {
        totais = {};
        for (const k of CAMPOS_HORA) totais[k] = hmParaMin(vals[k]);
      } else {
        const m = dia.s.match(/^(\d{2})\/(\d{2})\/(\d{2})\s*-?\s*(\w+)?/);
        const linhaDia = { data: dataBrParaIso(m[1], m[2], m[3]), diaSemana: (m[4] || "").toLowerCase() };
        for (const k of CAMPOS_BATIDA) linhaDia[k] = vals[k] || null; // "06:50*", "Folga", null
        for (const k of CAMPOS_HORA) linhaDia[k] = hmParaMin(vals[k]);
        dias.push(linhaDia);
      }
    }
    dias.sort((a, b) => a.data.localeCompare(b.data));

    funcionarios.push({
      cpf, cpfDigitos: soDigitos(cpf), folha,
      totais: totais || Object.fromEntries(CAMPOS_HORA.map((k) => [k, 0])),
      dias,
    });
  }

  return { periodoInicio, periodoFim, empresa, funcionarios };
}
