import "server-only";

// LEITURA DA PLANILHA DE ESTUDO DO COMERCIAL (EPC-nnn-aa-Rx-CLIENTE-OBRA.xlsx/.xlsm).
//
// Vitor (19/08/2026): "na proposta temos as descrições dos trabalhos, verbas etc; porém no estudo,
// lá sim terá a memória de cálculo de tudo — verbas estimadas, área de pintura estimada, área de
// telha etc. Preciso que leia essa planilha e preencha as informações pelas famílias que ele
// definiu nas planilhas, para podermos ter o andamento das coisas".
//
// Onde mora: `Comercial/1. Orçamento/ORÇAMENTOS_<ano>/2. Concluidos/<nnn-aa-CLIENTE-OBRA>/5.Estudos`.
// A pasta do orçamento tem sempre 1.Emails, 2.Projetos, 3.Documentos, 4.Cotações, 5.Estudos,
// 6.Propostas, 7.Confidencialidade — a proposta técnica/comercial sai de 6.Propostas.
//
// ESTABILIDADE DO LAYOUT (medido em 14 estudos de 2026):
//   BDM 100% · CUSTOS 100% · BDI 93% · PESO PROJETO 93% · PINTURA 93% · INSUMOS 79% ·
//   PLANILHA COMERCIAL 79% · RESUMO 79% · COTAÇÕES 43% · CALHAS E RUFOS 36% (só obra com cobertura)
//
// ⚠️ O nome da aba varia ("PESO PROJETO (2)"), então o casamento é por PREFIXO normalizado, nunca
// por igualdade. E as colunas são localizadas pelo CABEÇALHO, não por posição fixa: a linha de
// cabeçalho muda de altura entre estudos.
//
// 🚫 Nada é inventado: quando a aba não existe ou o cabeçalho não é reconhecido, o campo volta
// `null` e o import mostra o que não conseguiu ler. Estudo é base de compra — chute aqui vira
// material errado comprado.

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

/** Acha a aba cujo nome começa com o prefixo (normalizado). */
function acharAba(wb, prefixo) {
  const p = norm(prefixo);
  const nome = wb.SheetNames.find((n) => norm(n) === p) || wb.SheetNames.find((n) => norm(n).startsWith(p));
  return nome ? { nome, ws: wb.Sheets[nome] } : null;
}

/** Linha de cabeçalho = a primeira que contém TODOS os rótulos pedidos. */
function acharCabecalho(linhas, rotulos, ate = 15) {
  for (let i = 0; i < Math.min(linhas.length, ate); i++) {
    const cel = (linhas[i] || []).map(norm);
    if (rotulos.every((r) => cel.some((c) => c.includes(norm(r))))) {
      const idx = {};
      for (const r of rotulos) idx[r] = cel.findIndex((c) => c.includes(norm(r)));
      return { i, idx, cel };
    }
  }
  return null;
}

/**
 * PESO PROJETO — a memória de cálculo do aço. É a aba mais importante: dela saem o peso da obra,
 * a área de pintura e o número de barras.
 */
function lerPesoProjeto(XLSX, wb) {
  const aba = acharAba(wb, "PESO PROJETO");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const cab = acharCabecalho(linhas, ["material", "peso total"]);
  if (!cab) return { aba: aba.nome, erro: "cabeçalho de PESO PROJETO não reconhecido" };

  const col = (r) => cab.cel.findIndex((c) => c.includes(norm(r)));
  const cMat = cab.idx["material"], cPeso = cab.idx["peso total"];
  const cArea = col("area de pintura"), cBarras = col("barras"), cQtd = col("qtd"), cDez = col("10%");

  const perfis = [];
  for (let i = cab.i + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const mat = String(l[cMat] ?? "").trim();
    if (!mat) continue;
    // a aba termina em "NOTAS:" e vira tabela dinâmica ("Rótulos de Linha" / "Total Geral")
    if (/^(notas|rotulos|total geral|soma de)/i.test(norm(mat))) break;
    const peso = num(l[cPeso]);
    if (!(peso > 0)) continue;
    perfis.push({
      material: mat,
      qtd: cQtd >= 0 ? num(l[cQtd]) : null,
      pesoKg: peso,
      pesoComPerdaKg: cDez >= 0 ? num(l[cDez]) : null,
      areaPinturaM2: cArea >= 0 ? num(l[cArea]) : null,
      barras6m: cBarras >= 0 ? num(l[cBarras]) : null,
    });
  }
  const soma = (k) => perfis.reduce((a, p) => a + (p[k] || 0), 0) || null;
  return {
    aba: aba.nome,
    perfis,
    pesoKg: soma("pesoKg"),
    pesoComPerdaKg: soma("pesoComPerdaKg"),
    areaPinturaM2: soma("areaPinturaM2"),
    barras6m: soma("barras6m"),
  };
}

/** PINTURA — litros de tinta e diluente pra área estimada. */
function lerPintura(XLSX, wb) {
  const aba = acharAba(wb, "PINTURA");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const itens = [];
  for (const l of linhas) {
    const cels = (l || []).map((v) => String(v ?? "").trim());
    // ⚠ "tinta" e "qtd (l)" sozinhos são CABEÇALHO da tabela, não produto — entravam como item
    const ehCabecalho = (c) => /^(tinta|produto|qtd|item|descricao)\s*(\(l\))?$/i.test(norm(c));
    const iNome = cels.findIndex((c) => /^(fundo|tinta|diluente|esmalte|primer|acabamento)\b/i.test(norm(c)) && !ehCabecalho(c));
    if (iNome < 0) continue;
    // o litro é o primeiro número à direita do nome
    const litros = (l || []).slice(iNome + 1).map(num).find((n) => n && n > 0) || null;
    if (!litros) continue;
    itens.push({ produto: cels[iNome], litros: Math.round(litros * 100) / 100 });
  }
  return { aba: aba.nome, itens: itens.slice(0, 12) };
}

/** RESUMO — áreas por prédio/elemento; é onde aparece a telha (m²). */
function lerCobertura(XLSX, wb) {
  const aba = acharAba(wb, "RESUMO");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const cab = acharCabecalho(linhas, ["cobertura", "area"]);
  if (!cab) return { aba: aba.nome, erro: "cabeçalho de RESUMO não reconhecido" };
  const cCob = cab.idx["cobertura"], cArea = cab.idx["area"];
  const porTipo = new Map();
  for (let i = cab.i + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const tipo = String(l[cCob] ?? "").trim();
    const area = num(l[cArea]);
    if (!tipo || !(area > 0)) continue;
    if (/^total/i.test(norm(tipo))) continue;
    porTipo.set(tipo, (porTipo.get(tipo) || 0) + area);
  }
  const itens = [...porTipo.entries()].map(([tipo, m2]) => ({ tipo, areaM2: Math.round(m2 * 100) / 100 }));
  return { aba: aba.nome, itens, areaTotalM2: itens.reduce((a, x) => a + x.areaM2, 0) || null };
}

/** CALHAS E RUFOS — quantidades da cobertura complementar. */
function lerCalhasRufos(XLSX, wb) {
  const aba = acharAba(wb, "CALHAS E RUFOS");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const iTotal = linhas.findIndex((l) => (l || []).some((c) => /^total/i.test(norm(String(c ?? "")))));
  if (iTotal < 0) return { aba: aba.nome, itens: [] };
  // o cabeçalho dos tipos é a linha com "CALHAS"/"RUFOS" e a seguinte com os nomes
  const iTipos = linhas.findIndex((l) => (l || []).some((c) => /pingadeira|chapeu|cumeeira|lateral/i.test(norm(String(c ?? "")))));
  const tipos = iTipos >= 0 ? (linhas[iTipos] || []).map((c) => String(c ?? "").trim()) : [];
  const total = linhas[iTotal] || [];
  const itens = [];
  for (let c = 0; c < total.length; c++) {
    const v = num(total[c]);
    if (v && v > 0 && tipos[c]) itens.push({ tipo: tipos[c], qtd: Math.round(v * 100) / 100 });
  }
  return { aba: aba.nome, itens };
}

/**
 * Lê o estudo inteiro.
 * @param {Buffer|Uint8Array} buffer  xlsx/xlsm baixado do SharePoint
 * @returns {Promise<object>} { abas, aco, pintura, cobertura, calhasRufos, faltando[] }
 */
export async function lerEstudoComercial(buffer) {
  const XLSX = await import("xlsx");
  // ⚠ SheetJS, não ExcelJS: o estudo passa de 9 MB em alguns casos e o ExcelJS estoura memória
  // (foi o mesmo problema do import do CMR).
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const aco = lerPesoProjeto(XLSX, wb);
  const pintura = lerPintura(XLSX, wb);
  const cobertura = lerCobertura(XLSX, wb);
  const calhasRufos = lerCalhasRufos(XLSX, wb);

  const faltando = [];
  if (!aco) faltando.push("PESO PROJETO (peso e área de pintura do aço)");
  else if (aco.erro) faltando.push(`PESO PROJETO: ${aco.erro}`);
  if (!pintura) faltando.push("PINTURA (litros de tinta)");
  if (!cobertura) faltando.push("RESUMO (área de telha)");

  return { abas: wb.SheetNames, aco, pintura, cobertura, calhasRufos, faltando };
}

/** Nome do arquivo → { numero, ano, revisao, cliente, obra }. Ex: EPC-084-26-R2-JHSF-PORT-COCHERE */
export function lerNomeEstudo(nome) {
  const m = String(nome || "").match(/^EPC-(\d+)-(\d+)-R(\d+)-(.+?)\.(xlsx|xlsm)$/i);
  if (!m) return null;
  return { numero: m[1], ano: m[2], revisao: Number(m[3]), resto: m[4] };
}
