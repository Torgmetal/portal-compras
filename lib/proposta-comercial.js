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

  // ── o que a proposta diz sobre a obra ────────────────────────────────────────────────────
  // Vitor (19/08): "o número da OP deve ser preenchido automático, o cliente também… na descrição
  // da obra você traz apenas os itens da planilha, precisa ter a leitura do PDF para informar tudo
  // que está descrito em ambos".
  const bruto = String(text);
  // Destinatário: vem depois do "À" e antes do endereço. ⚠ O extrator devolve o PDF numa linha
  // só — casar com "\n" não funciona; o corte tem de ser pelo começo do endereço.
  // ⚠ nada de `\b` antes do "À": em regex JS o \b é ASCII e não reconhece limite antes de letra
  // acentuada — a busca simplesmente nunca casava.
  const mCli = bruto.match(/(?:^|\s)À\s+([A-ZÀ-Ú][^\n]{3,80}?)\s+(?:Rua|Av\.?|Avenida|Rod\.?|Rodovia|Estrada|Al\.?|Alameda|CEP|Pra[çc]a)/);
  const razaoSocial = mCli ? mCli[1].replace(/\s+/g, " ").trim() : null;
  // nome curto pro campo Cliente da OP: tira o tipo societário e o resto da razão social
  const cliente = razaoSocial
    ? razaoSocial.replace(/\s+(ltda|s\.?a\.?|eireli|me|epp|s\/a)\b.*$/i, "").split(/\s+(?:caldeiras|equipamentos|industria|ind[uú]stria|comercio|com[eé]rcio|engenharia|construtora|servi[çc]os)\b/i)[0].trim()
    : null;
  // "Ref.: ENC 0333 – Cobertura / Querência – MT"
  const mRef = bruto.match(/Ref\.?:\s*([\s\S]{4,120}?)(?:\n\s*\n|Revis[ãa]o)/i);
  const obra = mRef ? mRef[1].split("\n").map((x) => x.trim()).filter(Boolean).join(" — ").slice(0, 120) : null;
  // "Proposta PTC-261-26-TORG-R00"
  const mNum = bruto.match(/Proposta\s+([A-Z]{2,4}-[\d-]+-[A-Z]+-R\d+)/i);
  // 1.2 Descrição da obra … até 1.3 — é o texto que descreve TUDO que a obra tem
  const mDesc = bruto.match(/1\.2\s*Descri[çc][ãa]o da obra([\s\S]*?)1\.3\s/i);
  const descricao = mDesc ? mDesc[1].replace(/\s{2,}/g, " ").replace(/\s*-\s*/g, " - ").trim().slice(0, 2000) : null;

  return {
    nome, paginas,
    cliente, razaoSocial, obra, descricao,
    numeroProposta: mNum ? mNum[1] : null,
    tecnica: temTecnica,
    comercial: temComercial,
    tipo: temTecnica && temComercial ? "PTC" : temTecnica ? "TÉCNICA" : temComercial ? "COMERCIAL" : "INDEFINIDA",
    prazoDias: nDias(RX.prazo),
    validadeDias: nDias(RX.validade),
    escopo,
  };
}
