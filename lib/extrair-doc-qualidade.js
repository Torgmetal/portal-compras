import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { Esquema, pedirJson } from "@/lib/ia-json";

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
- Datas no formato YYYY-MM-DD (converta de DD/MM/AAAA).
- Não invente. Se o campo não aparece, use null.`;

export const ESQUEMA_DOC = Esquema.objeto({
  numeroDocumento: Esquema.textoOuNulo,
  dataEmissao: Esquema.textoOuNulo,
  dataValidade: Esquema.textoOuNulo,
  norma: Esquema.textoOuNulo,
});

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
  const { dados: d } = await pedirJson(anthropic, {
    model: MODELO,
    max_tokens: 600,
    system: SYSTEM_PROMPT_DOC,
    messages: [{ role: "user", content: [bloco, { type: "text", text: "Extraia os campos de controle deste documento." }] }],
    formato: ESQUEMA_DOC,
  });
  if (!d) return {};
  return {
    numeroDocumento: str(d.numeroDocumento, 100),
    dataEmissao: dataISO(d.dataEmissao),
    dataValidade: dataISO(d.dataValidade),
    norma: str(d.norma, 200),
  };
}
