// ─── LER A ESPECIFICAÇÃO DE PINTURA DO CLIENTE ────────────────────────────────────────────────
// Vitor (31/08/2026): "tentei importar um plano de pintura na proposta 290 e não reconheceu".
//
// Ele estava certo em esperar leitura: o pedido era "importar o sistema de pintura para que seja
// avaliado qual o tipo de tinta e qual a quantidade". Eu tinha entregado só o anexo, guardando o
// arquivo sem abrir.
//
// Formato de referência: "ESPECIFICAÇÃO DE PINTURA - TPR00846_R1.xlsx" (BIANCHINI/TMSA, fabricante
// WEG). Uma aba, duas seções:
//   §1 SISTEMA DE PINTURA — uma linha por demão: Referência | Tipo/Resina | Cor | Espessura seca
//      (µm) | Sólidos p/ volume | Diluente
//   §2 CORES DE ACABAMENTO POR ÁREA — Cor | Notação | Aplicação | colunas de área marcadas com "X"
//
// ⚠⚠ AS CÉLULAS VAZIAS DESLOCAM A LINHA. Na planilha real, "Referência da Tinta" e "Cor" vêm em
// branco nas duas primeiras demãos, então a linha chega como
// ["1ª", "Epóxi Rico em Zinco (primer)", 120, 0.65, 10] — cinco células para sete colunas. Ler por
// posição fixa pegaria a espessura como se fosse cor. Por isso a leitura é por TIPO: o primeiro
// texto longo é o produto, e os números que sobram são espessura, sólidos e diluente, nesta ordem.
//
// ⚠ SÓLIDOS VÊM COMO FRAÇÃO (0,65) E O MOTOR QUER PORCENTAGEM (65). `rendimentoTinta` calcula
// `(sólidos × 10) / espessura`: com 0,65 o rendimento sairia cem vezes menor e a obra pediria cem
// vezes mais tinta. Qualquer valor ≤ 1 é tratado como fração.

const CAMADAS = ["PRIMER", "INTERMEDIÁRIO", "ACABAMENTO"];

const txt = (v) => String(v ?? "").trim();
const semAcento = (v) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Converte célula em número aceitando "0,65" e "120 µm".
 *
 * ⚠⚠ SÓ CÉLULA QUE É NÚMERO. A versão anterior arrancava os dígitos de qualquer texto, e a célula
 * "Conforme cor de acabamento (ver Seção 2)" virava o número 2 — que entrava como espessura da
 * 3ª demão e empurrava sólidos e diluente uma casa. O acabamento saía com 2 µm e 120% de sólidos,
 * rendendo 330 m²/L em vez de 3 — cem vezes menos tinta na conta, sem nada na tela avisando.
 */
function celulaNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = txt(v);
  // o texto INTEIRO precisa ser o número (com unidade opcional colada)
  if (!/^-?[\d.,]+\s*(µm|um|mm|%|m²\/l)?$/i.test(s)) return null;
  const so = s.replace(/[^\d.,-]/g, "");
  if (!so) return null;
  const n = parseFloat(so.includes(",") ? so.replace(/\./g, "").replace(",", ".") : so);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {any[][]} grade  linhas da planilha (XLSX sheet_to_json header:1)
 * @returns {{camadas: object[], cores: object[], fabricante: string|null, avisos: string[]}}
 */
export function lerEspecificacaoPintura(grade) {
  const linhas = Array.isArray(grade) ? grade : [];
  const avisos = [];

  // fabricante costuma vir no rodapé ("Fabricante das tintas: WEG.")
  let fabricante = null;
  for (const l of linhas) {
    const m = txt(l.join(" ")).match(/fabricante\s+das\s+tintas?\s*:\s*([^.;]+)/i);
    if (m) { fabricante = m[1].trim(); break; }
  }

  // ── §1: as demãos ──
  const iCab = linhas.findIndex((l) => l.some((c) => /^dem[ãa]o$/i.test(txt(c))));
  const camadas = [];
  if (iCab >= 0) {
    for (let r = iCab + 1; r < linhas.length; r++) {
      const l = linhas[r] || [];
      const primeira = txt(l[0]);
      if (!/^\s*\d\s*[ªaº°]/i.test(primeira)) {
        // acabou o bloco de demãos quando a linha deixa de começar com "1ª", "2ª"…
        if (camadas.length) break;
        continue;
      }
      const textos = l.slice(1).filter((c) => txt(c).length > 3 && celulaNum(c) === null).map(txt);
      const nums = l.slice(1).map(celulaNum).filter((n) => n !== null);
      const [espessura, solidosBruto, diluente] = nums;
      // ⚠ fração → porcentagem (ver o comentário do topo)
      const solidos = solidosBruto == null ? null : solidosBruto <= 1 ? solidosBruto * 100 : solidosBruto;
      const idx = camadas.length;
      camadas.push({
        camada: CAMADAS[Math.min(idx, CAMADAS.length - 1)],
        demao: primeira,
        produto: textos[0] || "",
        // a cor do acabamento costuma dizer "conforme cor de acabamento" — não é cor, é remissão
        cor: textos.slice(1).find((t) => !/conforme|ver se[çc][ãa]o/i.test(t)) || "",
        peliculaSeca: espessura ?? null,
        solidos: solidos ?? null,
        diluentePct: diluente ?? null,
      });
    }
  }
  if (!camadas.length) avisos.push("Não encontrei a tabela de demãos (a coluna “Demão” é o que eu procuro).");

  // ── §2: as cores de acabamento ──
  const iCor = linhas.findIndex((l) => /^cor$/i.test(txt(l[0])) && l.some((c) => /aplica[çc][ãa]o/i.test(txt(c))));
  const cores = [];
  if (iCor >= 0) {
    const cab = (linhas[iCor] || []).map(txt);
    const iAplic = cab.findIndex((c) => /aplica[çc][ãa]o/i.test(c));
    for (let r = iCor + 1; r < linhas.length; r++) {
      const l = linhas[r] || [];
      const nome = txt(l[0]);
      if (!nome || /^legenda|^cores links/i.test(semAcento(nome))) break;
      const areas = [];
      for (let ci = iAplic + 1; ci < cab.length; ci++) if (/^x$/i.test(txt(l[ci])) && cab[ci]) areas.push(cab[ci]);
      cores.push({ cor: nome, notacao: txt(l[1]) || null, aplicacao: iAplic > 0 ? txt(l[iAplic]) : "", areas });
    }
  }
  if (!cores.length) avisos.push("Não encontrei a tabela de cores por área.");

  // ⚠ o diluente da planilha NÃO sobrescreve a regra da casa em silêncio: o motor usa 25% (medido
  // na LQC-081-26) e a planilha aqui diz 10%. Quem decide é quem monta — a tela mostra os dois.
  const dils = [...new Set(camadas.map((c) => c.diluentePct).filter((v) => v != null))];
  if (dils.length) avisos.push(`A planilha indica ${dils.join("/")}% de diluente; o estudo calcula com 25%. Confira qual vale.`);

  return { camadas, cores, fabricante, avisos };
}
