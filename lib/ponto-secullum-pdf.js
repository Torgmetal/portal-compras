// Parser do cartão de ponto "Secullum Ponto Offline" (PDF) — 1 funcionário por
// página. Lê por COORDENADA (x,y) dos itens de texto: as colunas do relatório
// têm x fixo, então mapeamos cada valor à sua coluna sem ambiguidade (o split
// por espaço falharia quando faixas ficam em branco). Fonte oficial das horas.
//
// Saída: { periodoInicio, periodoFim, empresa, funcionarios: [{ cpf, nome,
//   folha, funcao, departamento, admissao, totais{...}, dias:[{...}] }] }
//
// Colunas: lidas do CABEÇALHO de cada página (x real de cada rótulo), NÃO de
// posições fixas — o layout varia entre relatórios: TORG "Ponto Offline" tem
// NORMAIS·FALTAS·EX50·EX100 + colunas de banco (BAJUS/BTOTAL/BSALDO/…); VMI
// "Ponto Web" tem EX50/60/80/100/150. Com X fixo, o BTOTAL da TORG (x=528) caía
// na posição do EX100 e virava "HE 100%" falso p/ quem tinha banco de horas.

const CAMPOS_HORA = ["normais", "faltas", "ex50", "ex60", "ex80", "ex100", "ex150", "noturno", "dsr"];
const CAMPOS_BATIDA = ["ent1", "sai1", "ent2", "sai2", "ent3", "sai3"];

// Rótulo do cabeçalho → chave da coluna. Retorna null p/ colunas que não
// interessam (DIA e as de banco: BAJUS, BTOTAL, BSALDO, BCRED, AJUSTE, BDEB).
function chaveHeader(label) {
  const n = String(label || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.\s%]/g, "");
  if (n === "NORMAIS") return "normais";
  if (n === "FALTAS") return "faltas";
  let m;
  if ((m = n.match(/^EX(\d+)$/))) return "ex" + m[1];       // EX50%, EX60%, EX80%, EX100%, EX150%
  if ((m = n.match(/^ENT([123])$/))) return "ent" + m[1];
  if ((m = n.match(/^SAI([123])$/))) return "sai" + m[1];
  if (n === "NOTTOT" || n === "NOTURNO" || n === "ADNOT") return "noturno";
  if (n === "DSRDEB" || n === "DSR") return "dsr";
  return null;
}

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

    // Período (uma vez). Cobre os dois modelos: TORG "DE X ATÉ Y" e VMI Ponto Web
    // "Período: X até Y" — ambos têm "até/ATÉ" entre as duas datas.
    if (!periodoInicio) {
      const p = textoPagina.match(/(\d{2}\/\d{2}\/\d{4})\s+at[ée]\s+(\d{2}\/\d{2}\/\d{4})/i);
      if (p) { periodoInicio = p[1]; periodoFim = p[2]; }
    }
    if (!empresa) {
      // Pega o item de texto que termina em LTDA (nome social) — evita colar o
      // header "DIA"/"Departamento" que fica na mesma linha do texto corrido.
      const it = itens.find((i) => /LTDA\.?$/i.test(i.s) && i.s.length > 6);
      if (it) empresa = it.s.trim();
      else {
        // Modelo Montagem Externa: razão social na linha abaixo de "EMPRESA:"
        // (pode vir quebrada em 2 itens). x < 470 evita a mini-tabela da direita.
        const lab = itens.find((i) => /^EMPRESA:?$/i.test(i.s));
        const abaixo = lab ? itens.filter((i) => i.y < lab.y && i.y >= lab.y - 16 && i.x < 470) : [];
        if (abaixo.length) {
          const vy = Math.max(...abaixo.map((i) => i.y));
          empresa = abaixo.filter((i) => Math.abs(i.y - vy) <= 2).sort((a, b) => a.x - b.x).map((i) => i.s).join(" ").replace(/\s+/g, " ").trim() || null;
        }
      }
    }

    // Identificadores do cabeçalho. O modelo "Montagem Externa" (Ponto Web /
    // Inforponto) NÃO traz CPF — só NOME, Nº FOLHA e PIS/PASEP. Lê o valor logo
    // ABAIXO de cada rótulo (mesma coluna x); x < 470 evita a mini-tabela da direita.
    const rotulo = (re) => itens.find((i) => re.test(i.s));
    const valorSob = (lab, tolX = 30) => {
      if (!lab) return null;
      const c = itens.filter((i) => i.y < lab.y && i.y >= lab.y - 16 && Math.abs(i.x - lab.x) <= tolX && i.x < 470)
                     .sort((a, b) => b.y - a.y);
      return c[0]?.s?.trim() || null;
    };

    // Nome pode vir quebrado em 2 itens na mesma linha → junta a linha do valor.
    const valorLinhaSob = (lab) => {
      if (!lab) return null;
      const abaixo = itens.filter((i) => i.y < lab.y && i.y >= lab.y - 16 && i.x >= lab.x - 12 && i.x < 470);
      if (!abaixo.length) return null;
      const vy = Math.max(...abaixo.map((i) => i.y));
      return abaixo.filter((i) => Math.abs(i.y - vy) <= 2).sort((a, b) => a.x - b.x).map((i) => i.s).join(" ").replace(/\s+/g, " ").trim() || null;
    };

    const cpf = (textoPagina.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/) || [])[0] || null;
    const nome = valorLinhaSob(rotulo(/^NOME:?$/i));
    const folha = soDigitos(valorSob(rotulo(/^N[º°o]?\s*FOLHA:?$/i)))
      || (textoPagina.match(/(\d{5,7})\s+\d{3}\.\d{3}\.\d{3}-\d{2}/) || [])[1] || null;
    const pis = soDigitos(valorSob(rotulo(/PIS.?\s*PASEP/i))) || null;

    // Página válida se der p/ identificar por CPF, folha OU nome.
    if (!cpf && !folha && !nome) continue;

    // Agrupa itens por linha (y). Linhas de dia começam com "DD/MM/YY".
    const porY = new Map();
    for (const it of itens) {
      const yk = Math.round(it.y);
      if (!porY.has(yk)) porY.set(yk, []);
      porY.get(yk).push(it);
    }

    // Colunas desta página: x real de cada faixa, lido do cabeçalho (linha do "NORMAIS").
    const hy = itens.find((i) => /^NORMAIS$/i.test(i.s))?.y;
    const cols = [];
    if (hy != null) for (const i of itens) {
      if (Math.abs(i.y - hy) > 3) continue;
      const k = chaveHeader(i.s);
      if (k && !cols.some((c) => c.k === k)) cols.push({ k, x: i.x });
    }
    const colDe = (x) => {
      let best = null, bd = 16;
      for (const c of cols) { const d = Math.abs(x - c.x); if (d < bd) { bd = d; best = c.k; } }
      return best;
    };

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
      cpf, cpfDigitos: soDigitos(cpf), nome, folha, pis, pagina: pg,
      totais: totais || Object.fromEntries(CAMPOS_HORA.map((k) => [k, 0])),
      dias,
    });
  }

  return { periodoInicio, periodoFim, empresa, funcionarios };
}
