import "server-only";

// ─── ESCREVER NUM .XLSX SEM DESMONTAR O ARQUIVO ───────────────────────────────
//
// ⚠ POR QUE NÃO USAR ExcelJS AQUI. Vitor (22/08/2026): "fui tentar baixar a planilha, mas ela
// está quebrada". Era o ExcelJS: ele NÃO reescreve um .xlsx complexo, ele o reconstrói do que
// entendeu. Comparando o modelo LQC com o que ele devolveu, sumiram 16 partes — `customXml/*`,
// `docProps/custom.xml`, `xl/metadata.xml`, os **pivotCache e pivotTables**, os printerSettings —
// e as planilhas foram renumeradas (sheet10 → sheet25). O Excel abre isso como arquivo corrompido.
//
// Como o pedido é justamente "exatamente o mesmo modelo preenchido", a única técnica honesta é
// tratar o .xlsx pelo que ele é: um ZIP de XML. Abrimos, trocamos O VALOR das células de entrada
// dentro do XML da aba, e fechamos o ZIP com todo o resto byte a byte como estava. O que não foi
// tocado continua idêntico — inclusive o que nenhuma biblioteca entende.

import PizZip from "pizzip";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colParaNum = (col) => [...col.toUpperCase()].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0);
const partesDoEndereco = (addr) => { const m = /^([A-Z]+)(\d+)$/i.exec(addr); return m ? { col: m[1].toUpperCase(), colN: colParaNum(m[1]), linha: Number(m[2]) } : null; };

/** Abre o arquivo e resolve nome da aba → caminho do XML dentro do ZIP. */
export function abrirXlsx(buffer) {
  const zip = new PizZip(buffer);
  const wbXml = zip.file("xl/workbook.xml").asText();
  const relsXml = zip.file("xl/_rels/workbook.xml.rels").asText();
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g)) {
    rels[m[1]] = m[2].replace(/^\/?xl\//, "").replace(/^\//, "");
  }
  const abas = {};
  for (const m of wbXml.matchAll(/<sheet[^>]*\/?>/g)) {
    const nome = /name="([^"]*)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]*)"/.exec(m[0])?.[1];
    if (nome && rels[rid]) abas[decodeXml(nome)] = `xl/${rels[rid]}`;
  }
  return { zip, abas };
}

const decodeXml = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/**
 * Escreve valores numa aba. `valores` = { "D5": "TORG", "H4": 12 }.
 *
 * ⚠ SÓ ENTRA ONDE NÃO HÁ FÓRMULA. Se a célula alvo tiver `<f>`, a escrita é RECUSADA e volta na
 * lista de recusas: sobrescrever fórmula mataria a corrente de cálculo da LQC — e o estudo
 * passaria a mentir na primeira vez que alguém mexesse no arquivo.
 */
export function escreverCelulas(xml, valores) {
  const recusadas = [];
  let out = xml;

  for (const [addr, valorBruto] of Object.entries(valores)) {
    if (valorBruto === null || valorBruto === undefined || valorBruto === "") continue;
    const pos = partesDoEndereco(addr);
    if (!pos) continue;
    const ehNumero = typeof valorBruto === "number" && Number.isFinite(valorBruto);
    const conteudo = ehNumero
      ? `<v>${valorBruto}</v>`
      : `<is><t xml:space="preserve">${esc(valorBruto)}</t></is>`;
    const tipo = ehNumero ? "" : ' t="inlineStr"';

    // 1) a célula já existe?
    const reCel = new RegExp(`<c r="${addr}"([^>]*?)(/>|>([\\s\\S]*?)</c>)`);
    const mc = reCel.exec(out);
    if (mc) {
      if (/<f[ >\/]/.test(mc[3] || "")) { recusadas.push(addr); continue; }
      // preserva o estilo (s="…"), troca tipo e conteúdo
      const s = /\ss="(\d+)"/.exec(mc[1])?.[0] || "";
      out = out.slice(0, mc.index) + `<c r="${addr}"${s}${tipo}>${conteudo}</c>` + out.slice(mc.index + mc[0].length);
      continue;
    }

    // 2) a linha existe? insere a célula na ordem das colunas
    const reLinha = new RegExp(`<row([^>]*?\\sr="${pos.linha}"[^>]*?)(/>|>([\\s\\S]*?)</row>)`);
    const ml = reLinha.exec(out);
    const celNova = `<c r="${addr}"${tipo}>${conteudo}</c>`;
    if (ml) {
      const interno = ml[3] || "";
      let inserido = false, novo = "";
      let ultimo = 0;
      for (const mm of interno.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
        const p = partesDoEndereco(mm[1]);
        if (!inserido && p && p.colN > pos.colN) {
          novo += interno.slice(ultimo, mm.index) + celNova;
          ultimo = mm.index;
          inserido = true;
        }
      }
      novo += interno.slice(ultimo);
      if (!inserido) novo += celNova;
      const attrs = ml[1].replace(/\s*spans="[^"]*"/, "");
      out = out.slice(0, ml.index) + `<row${attrs}>${novo}</row>` + out.slice(ml.index + ml[0].length);
      continue;
    }

    // 3) nem a linha existe: cria na posição certa dentro de <sheetData>
    const linhaNova = `<row r="${pos.linha}">${celNova}</row>`;
    if (/<sheetData\s*\/>/.test(out)) {
      out = out.replace(/<sheetData\s*\/>/, `<sheetData>${linhaNova}</sheetData>`);
    } else {
      const sd = /<sheetData>([\s\S]*?)<\/sheetData>/.exec(out);
      if (!sd) { recusadas.push(addr); continue; }
      const interno = sd[1];
      let inserido = false, novo = "", ultimo = 0;
      for (const mr of interno.matchAll(/<row[^>]*?\sr="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)) {
        if (!inserido && Number(mr[1]) > pos.linha) { novo += interno.slice(ultimo, mr.index) + linhaNova; ultimo = mr.index; inserido = true; }
      }
      novo += interno.slice(ultimo);
      if (!inserido) novo += linhaNova;
      out = out.slice(0, sd.index) + `<sheetData>${novo}</sheetData>` + out.slice(sd.index + sd[0].length);
    }
  }
  return { xml: out, recusadas };
}

/**
 * ⚠ Manda o Excel REFAZER as contas ao abrir. Sem isto, as fórmulas mostram o último valor que
 * ficou salvo no modelo — o arquivo pareceria preenchido e estaria exibindo número velho, que é
 * pior do que vir em branco. Também remove o calcChain, que descreve uma ordem de cálculo que os
 * valores novos invalidaram.
 */
export function forcarRecalculo(zip) {
  const p = "xl/workbook.xml";
  let xml = zip.file(p).asText();
  if (/<calcPr[^>]*\/>/.test(xml)) {
    xml = xml.replace(/<calcPr([^>]*)\/>/, (m, a) => `<calcPr${a.replace(/\s*fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`);
  } else {
    xml = xml.replace("</workbook>", '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  }
  zip.file(p, xml);

  // ⚠ tirar o calcChain exige tirar também as REFERÊNCIAS a ele. Parte declarada no
  // [Content_Types].xml ou nos rels e ausente do ZIP = arquivo corrompido para o Excel — seria
  // trocar um problema por outro.
  if (zip.file("xl/calcChain.xml")) {
    zip.remove("xl/calcChain.xml");
    const ct = "[Content_Types].xml";
    zip.file(ct, zip.file(ct).asText().replace(/<Override[^>]*calcChain\.xml[^>]*\/>/g, ""));
    const rels = "xl/_rels/workbook.xml.rels";
    zip.file(rels, zip.file(rels).asText().replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/g, ""));
  }
}

export function fecharXlsx(zip) {
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
