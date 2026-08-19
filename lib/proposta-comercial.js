import "server-only";

// LÊ UMA PROPOSTA (PDF) E DIZ O QUE ELA CONTÉM.
//
// Vitor (19/08/2026): "na escolha da proposta você deixa 'usar como técnica' ou 'usar como
// comercial', mas precisa ter PTC. Minha sugestão: não ter escolha, deixar anexar mais de uma
// proposta, assim você avalia e informa o que contém em cada uma".
//
// Ele está certo — obrigar a pessoa a rotular o documento é pedir que ela adivinhe o que só se
// sabe abrindo o arquivo. E o rótulo errado se propaga: a OP passa a apontar pra "comercial" um
// PDF que não tem preço nenhum.
//
// A proposta da Torg é numerada e previsível: `1. PROPOSTA TÉCNICA` (escopo, normas, prazo,
// inclusos/exclusos) e `2. PROPOSTA COMERCIAL` (planilha de quantidade e preço, validade). O PTC
// traz as duas no mesmo documento; quando saem separadas, cada uma traz a sua.
//
// 🚫 Não classifica pelo NOME do arquivo. "PTC-261-26…" sugere as duas seções, mas quem decide é o
// conteúdo — arquivo renomeado é comum e o nome mente.

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

const RX = {
  tecnica: /\b1\s*\.\s*proposta\s+tecnica\b|\bproposta\s+tecnica\b/,
  comercial: /\b2\s*\.\s*proposta\s+comercial\b|planilha\s+de\s+quantidade\s+e\s+preco/,
  preco: /r\$\s?[\d.]+|unit\.?\s*r\$|valor\s*r\$/,
  prazo: /prazo\s+(total\s+)?(de\s+)?execu[çc]\w*\s*[^.]{0,60}?(\d{1,3})\s*\(?[^)]*\)?\s*dias/,
  validade: /validade\s+da\s+proposta[^.]{0,120}?(\d{1,3})\s*\(?[^)]*\)?\s*dias/,
  escopo: /\b1\.1\s*escopo\b([\s\S]{0,400})/,
  revisao: /revis[aã]o\s+data\s+motivo\s*(\d{2})/,
};

/**
 * @param {Buffer|Uint8Array} pdfBytes
 * @param {string} [nome] só pra devolver junto — NÃO entra na classificação
 * @returns {Promise<{tecnica, comercial, prazoDias, validadeDias, escopo, paginas, tipo}>}
 */
export async function lerProposta(pdfBytes, nome = null) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes = new Uint8Array(pdfBytes);
  let paginas = null;
  try { paginas = (await getDocumentProxy(new Uint8Array(bytes))).numPages; } catch {}
  const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
  const t = norm(text);
  if (!t.trim()) return { nome, paginas, erro: "PDF sem texto (provavelmente digitalizado) — não consigo ler o conteúdo." };

  const temTecnica = RX.tecnica.test(t);
  const temComercial = RX.comercial.test(t) || RX.preco.test(t);
  const nDias = (rx) => { const m = t.match(rx); return m ? parseInt(m[m.length - 1], 10) : null; };

  // o escopo vem do 1.1 e é o resumo mais útil pra quem está vinculando
  let escopo = null;
  const mE = String(text).match(/1\.1\s*Escopo([\s\S]{0,400})/i);
  if (mE) {
    escopo = mE[1].replace(/\s+/g, " ").trim().split(/(?=1\.2\b)/)[0].slice(0, 260).trim();
  }

  return {
    nome, paginas,
    tecnica: temTecnica,
    comercial: temComercial,
    tipo: temTecnica && temComercial ? "PTC" : temTecnica ? "TÉCNICA" : temComercial ? "COMERCIAL" : "INDEFINIDA",
    prazoDias: nDias(RX.prazo),
    validadeDias: nDias(RX.validade),
    escopo,
  };
}
