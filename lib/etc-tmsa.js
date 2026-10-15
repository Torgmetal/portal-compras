// ─── AS ETCs DA TMSA: DE QUAL OC É CADA PEÇA ─────────────────────────────────────────────────────
//
// Vitor (15/10/2026), sobre o código do romaneio TMSA: "não consegue verificar se existe uma lista?" e "precisa buscar a
// informação sobre a TPR também". Existe, nos documentos da TMSA na pasta da obra: cada OC tem a sua ETC (Especificação
// Técnica de Compra, FOR-1155) em `2. Engenharia/2.1 Projetos Orçados/OC<nº>_…/ETC-…xls`, com Desenho e TAG por item
// e o "Nº TPR". Puro: só a leitura e a decisão (a busca no SharePoint mora em lib/etc-tmsa-dados.js).
//
// ⚠⚠ A TAG SOZINHA NÃO BASTA. Na OP-105 a TC 4708 está em DUAS OCs — 228631 (quadro do vazador) e 228630 (longarinas e
// apoios). O desempate é o DESENHO, que a marca da lista de equivalência carrega: "72118932-1", "704081271" (desenho
// 70408127 + posição 1). Sem casar, devolve null: OC errada no romaneio é pior que o campo em branco.
// ⚠ A OC é a ORIGINAL (a da pasta): as OCs de revisão (234182, 234172) repetem ETCs que já têm pasta — Vitor, 15/10/2026.
import * as XLSX from "xlsx";

const txt = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const chaveTag = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const digitos = (s) => String(s ?? "").replace(/\D/g, "");
/** "TC4708" / "TC-4702" → "TC 4708" (como a lista de equivalência escreve) */
const tagLegivel = (s) => txt(s).toUpperCase().replace(/^([A-Z]+)[\s-]*(\d)/, "$1 $2");

export const ocDaPasta = (nome) => (String(nome || "").match(/^\s*OC\s*[-_]?\s*(\d{6}(?:-\d+)?)/i)?.[1] ?? null);
export const revisaoDoArquivo = (nome) => Number(String(nome || "").match(/\bR(\d+)\b(?=[^\\/]*$)/i)?.[1] ?? 0);

/** Lê uma ETC: { tpr, itens: [{ desenho, tag, descricao }] }. */
export function lerEtcTmsa(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const nomeAba = wb.SheetNames.find((n) => /FOR-?1155/i.test(n)) || wb.SheetNames.find((n) => !/instru/i.test(n)) || wb.SheetNames[0];
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, defval: "" });
  const tpr = txt(linhas.flat().find((c) => /TPR\s*\d/i.test(String(c)))).match(/TPR\s*\d+/i)?.[0]?.replace(/\s+/g, "").toUpperCase() ?? null;
  const h = linhas.findIndex((r) => r.some((c) => /^TAG$/i.test(txt(c))) && r.some((c) => /desenho/i.test(txt(c))));
  if (h < 0) return { tpr, itens: [] };
  const cab = linhas[h].map(txt);
  const iDes = cab.findIndex((c) => /desenho/i.test(c)), iTag = cab.findIndex((c) => /^TAG$/i.test(c)), iDesc = cab.findIndex((c) => /descri/i.test(c));
  const itens = [];
  for (const r of linhas.slice(h + 1)) {
    const tag = txt(r[iTag]), desenho = digitos(r[iDes]);
    // as linhas de preenchimento do formulário ("DESENHO", "ONDE INDICADO", "VENDOR LIST") não têm TAG de equipamento
    if (!/^[A-Z]{1,4}[\s-]*\d/i.test(tag)) continue;
    itens.push({ desenho: desenho || null, tag: tagLegivel(tag), descricao: txt(r[iDesc]) });
  }
  return { tpr, itens };
}

/**
 * A regra de decisão sobre as ETCs de uma obra: (tag, marca) → OC ou null.
 * @param {{ oc:string, itens:{desenho:string|null, tag:string}[] }[]} etcs
 */
export function ocDaOpPelasEtcs(etcs) {
  const porTag = new Map();
  for (const e of etcs) for (const it of e.itens) {
    const k = chaveTag(it.tag);
    if (!porTag.has(k)) porTag.set(k, []);
    porTag.get(k).push({ oc: e.oc, desenho: it.desenho });
  }
  return (tag, marca) => {
    const cands = porTag.get(chaveTag(tag)) || [];
    const ocs = [...new Set(cands.map((c) => c.oc))];
    if (ocs.length <= 1) return ocs[0] ?? null;
    const m = digitos(marca);
    const casam = [...new Set(cands.filter((c) => c.desenho && c.desenho.length >= 6 && m.startsWith(c.desenho)).map((c) => c.oc))];
    return casam.length === 1 ? casam[0] : null;
  };
}
