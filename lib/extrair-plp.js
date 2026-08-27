// ─── LER O PLANO DE PINTURA DE UM DOCUMENTO QUALQUER ──────────────────────────
// Vitor (26/08/2026): "nessa parte do PLP preciso que você leia um documento e preencha com as
// informações os campos que precisam".
//
// ⚠⚠ O DOCUMENTO NÃO TEM UM FORMATO SÓ. A pasta `8. Qualidade/2. PLP` das obras tem, hoje: xlsx no
// modelo do cliente (OP-105, OP-106) e PDF (OP-089, OP-094). O leitor de planilha que existia
// (lib/plp-servidor) só entende o modelo Torg de três folhas — rodado nas planilhas reais das
// OP-105 e OP-106 devolve tudo vazio, sem erro. Por isso a leitura aqui é por IA: o que varia é o
// layout, não a informação.
//
// ⚠ NÃO INVENTA. Campo que o documento não traz volta null e a tela mostra em branco para a
// Qualidade preencher. Num plano de pintura, um valor plausível e errado (uma espessura, um grau
// de limpeza) é pior que um campo vazio: ele é aplicado na obra inteira.
import Anthropic from "@anthropic-ai/sdk";

const MODELO = "claude-sonnet-4-6";

const SYSTEM = `Você lê PLANOS DE PINTURA (PLP) de estruturas metálicas e extrai os campos de controle.
O documento pode estar em qualquer layout: modelo da Torg, modelo do cliente, PDF digitalizado ou planilha.

Campos:
- revisao: a revisão do documento ("0", "1", "R00"...). null se não houver.
- preparoMetodo: como a superfície é preparada. Use EXATAMENTE um destes quando reconhecer: "Jateamento abrasivo", "Produtos químicos", "Ferramentas manuais e/ou mecânicas". null se não houver.
- grauLimpeza: o grau da norma, como "SA1", "SA2", "SA2.5", "SA3" (Sa 2 1/2 = "SA2.5"). null se não houver.
- abrasivo: o abrasivo citado (granalha, óxido de alumínio...). null se não houver.
- rugosidadeMin / rugosidadeMax: a faixa de rugosidade em micrometros, só números. null se não houver.
- metodoAplicacao: como a tinta é aplicada (airless, convencional, pincel/rolo). null se não houver.
- demaos: as demãos do esquema, na ordem, cada uma { ordem (1,2,3...), nome ("Fundo","Intermediária","Acabamento" ou o que o documento chamar), produto (nome comercial da tinta), fabricante, cor, espessuraMin, espessuraMax (espessura SECA por demão, em micrometros, só números) }. Campo ausente = null.
- espessuraTotal: a espessura seca total do sistema em micrometros, só número. null se não houver.
- itens: os itens da estrutura com a cor de cada um, cada um { item (o que é: "Colunas", "Vigas", "Guarda-corpo"...), sistema (a sigla do sistema de pintura, se houver), cor, obs }. Lista vazia se o documento não relacionar itens.
- observacoes: observações relevantes do plano (retoques, faixas, exigências do cliente), em texto corrido. null se não houver.

REGRAS:
- NÃO INVENTE. O que o documento não disser, volta null (ou lista vazia).
- Espessura em micrometros (µm). Se o documento estiver em mils, converta (1 mil = 25,4 µm) e diga na observação.
- Se houver mais de um sistema de pintura, use o principal em "demaos" e descreva os demais em "observacoes".

Responda SOMENTE com JSON válido, sem texto fora dele:
{"revisao":null,"preparoMetodo":null,"grauLimpeza":null,"abrasivo":null,"rugosidadeMin":null,"rugosidadeMax":null,"metodoAplicacao":null,"demaos":[],"espessuraTotal":null,"itens":[],"observacoes":null}`;

function extractJson(txt) {
  if (!txt) return null;
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let s = fence ? fence[1] : txt;
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const txt = (v, max = 160) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

/**
 * @param {{ data: Buffer|string, contentType: string, texto?: string, arquivo?: string }} input
 * @returns {Promise<object|null>} campos do PLP, prontos para normalizarPlp()
 */
export async function extrairPlp({ data, contentType, texto, arquivo }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const content = [];
  if (arquivo) content.push({ type: "text", text: `Arquivo: ${arquivo}` });
  if (texto && texto.trim()) {
    // planilha: vai como TEXTO (a API não lê xlsx), com as células já achatadas
    content.push({ type: "text", text: texto.slice(0, 120000) });
  } else if (contentType === "application/pdf") {
    const b64 = Buffer.isBuffer(data) ? data.toString("base64") : String(data).split(",").pop();
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
  } else if (/^image\//.test(contentType || "")) {
    const b64 = Buffer.isBuffer(data) ? data.toString("base64") : String(data).split(",").pop();
    content.push({ type: "image", source: { type: "base64", media_type: contentType, data: b64 } });
  } else {
    throw new Error(`Não sei ler "${contentType || "arquivo sem tipo"}".`);
  }
  content.push({ type: "text", text: "Extraia os campos do plano de pintura deste documento." });

  const message = await anthropic.messages.create({ model: MODELO, max_tokens: 4000, system: SYSTEM, messages: [{ role: "user", content }] });
  const j = extractJson(message?.content?.[0]?.text || "");
  if (!j) return null;

  return {
    revisao: txt(j.revisao, 30),
    preparoMetodo: txt(j.preparoMetodo, 80),
    grauLimpeza: txt(j.grauLimpeza, 20),
    abrasivo: txt(j.abrasivo, 80),
    rugosidadeMin: num(j.rugosidadeMin),
    rugosidadeMax: num(j.rugosidadeMax),
    metodoAplicacao: txt(j.metodoAplicacao, 60),
    espessuraTotal: num(j.espessuraTotal),
    demaos: (Array.isArray(j.demaos) ? j.demaos : []).slice(0, 6).map((d, i) => ({
      ordem: Number(d?.ordem) || i + 1,
      nome: txt(d?.nome, 60) || `${i + 1}ª demão`,
      produto: txt(d?.produto),
      fabricante: txt(d?.fabricante, 80),
      cor: txt(d?.cor, 60),
      espessuraMin: num(d?.espessuraMin),
      espessuraMax: num(d?.espessuraMax),
    })),
    itens: (Array.isArray(j.itens) ? j.itens : []).slice(0, 60).map((i) => ({
      item: txt(i?.item, 120), sistema: txt(i?.sistema, 20), cor: txt(i?.cor, 60), obs: txt(i?.obs, 200),
    })).filter((i) => i.item),
    observacoes: txt(j.observacoes, 2000),
  };
}
