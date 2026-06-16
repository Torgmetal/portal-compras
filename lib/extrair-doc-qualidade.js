import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Extração de campos de controle de um certificado/documento de qualidade
// (PDF ou imagem) com o Claude. Usada pela rota /extrair (upload) e pelo
// import do servidor (lê a pasta do SharePoint). Não inventa — null se não achar.

const MODELO = "claude-sonnet-4-6";
const IMAGENS = ["image/png", "image/jpeg", "image/webp"];

export const SYSTEM_PROMPT_DOC = `Você lê um CERTIFICADO ou DOCUMENTO de qualidade da indústria metalúrgica (certificado de material/MTC, certificado de parafusaria, consumível de solda, laudo, ASO, qualificação de soldador/inspetor, EPS/RQPS, certificado de calibração, etc.) e extrai os campos de controle.

EXTRAIA (só o que está escrito; na dúvida use null):
- numeroDocumento: o número do certificado/documento/laudo (ex.: "8186948336", "ASO-2024-014", "EVS-2025-01"). Se houver "nº do certificado", "certificate no", "documento nº", use esse. null se não houver.
- dataEmissao: data de emissão do documento, no formato "YYYY-MM-DD". null se não houver.
- dataValidade: data de validade/vencimento, no formato "YYYY-MM-DD". Muitos documentos NÃO têm validade — nesse caso null.
- norma: norma/especificação técnica principal citada (ex.: "ASTM A572", "AWS D1.1", "NR-35", "ISO 2808", "SNQC"). null se não houver.

REGRAS:
- Datas SEMPRE no formato YYYY-MM-DD. Converta de DD/MM/AAAA se necessário.
- Não invente. Se o campo não aparece, use null.
- Responda APENAS com JSON entre <json></json>:
<json>{"numeroDocumento": null, "dataEmissao": null, "dataValidade": null, "norma": null}</json>`;

export function extractJson(text) {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagged) return tagged[1].trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  return s !== -1 && e > s ? text.slice(s, e + 1) : null;
}

const dataISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Extrai {numeroDocumento, dataEmissao, dataValidade, norma} de um documento.
 * @param {Buffer|string} data - Buffer do arquivo OU base64 (com ou sem data: prefix).
 * @param {string} contentType - mime type (application/pdf, image/png, ...).
 * @returns {Promise<object>} campos (todos podem ser null); {} se tipo não suportado.
 */
export async function extrairDadosDocumento(data, contentType) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");
  const b64 = Buffer.isBuffer(data)
    ? data.toString("base64")
    : String(data).includes(",") ? String(data).split(",")[1] : String(data);
  if (!b64) return {};

  let bloco;
  if (contentType === "application/pdf") {
    bloco = { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } };
  } else if (IMAGENS.includes(contentType)) {
    bloco = { type: "image", source: { type: "base64", media_type: contentType, data: b64 } };
  } else {
    return {}; // tipo não suportado para leitura automática
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 600,
    system: SYSTEM_PROMPT_DOC,
    messages: [{ role: "user", content: [bloco, { type: "text", text: "Extraia os campos de controle conforme o schema." }] }],
  });
  const rawText = (message.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const jsonStr = extractJson(rawText);
  if (!jsonStr) return {};
  let d;
  try { d = JSON.parse(jsonStr); } catch { return {}; }
  return {
    numeroDocumento: str(d.numeroDocumento, 100),
    dataEmissao: dataISO(d.dataEmissao),
    dataValidade: dataISO(d.dataValidade),
    norma: str(d.norma, 200),
  };
}
