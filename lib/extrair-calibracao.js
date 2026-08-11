import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Leitura COMPLETA de um certificado de calibração (PDF/imagem) com o Claude:
// pontos de medição (nominal/erro/incerteza), EMP declarado, faixa, laboratório,
// acreditação e os PADRÕES usados na calibração (rastreabilidade). Não inventa.

const MODELO = "claude-sonnet-4-6";
const IMAGENS = ["image/png", "image/jpeg", "image/webp"];

export const SYSTEM_PROMPT_CALIBRACAO = `Você lê um CERTIFICADO DE CALIBRAÇÃO de um instrumento de medição (paquímetro, trena, micrômetro, manômetro, torquímetro, termômetro, balança, etc.) da indústria metalúrgica e extrai os dados para avaliação metrológica.

EXTRAIA (somente o que está escrito; na dúvida use null). Números SEMPRE com ponto decimal (converta "0,02" -> 0.02):
- laboratorio: nome do laboratório que emitiu o certificado. null se não houver.
- acreditacao: acreditação do laboratório (ex.: "RBC/CGCRE nº 0123", "acreditado ISO/IEC 17025"). null se não declarada.
- numeroCertificado: número do certificado. null se não houver.
- dataCalibracao: data da calibração/emissão no formato "YYYY-MM-DD". null se não houver.
- equipamento: descrição do instrumento calibrado (ex.: "Paquímetro digital 0-300mm"). null se não houver.
- identificacao: tag/código/nº de série do instrumento. null se não houver.
- unidade: unidade de medida principal dos pontos (ex.: "mm", "°C", "kgf", "bar"). null se não houver.
- faixaMin, faixaMax: início e fim da faixa de medição/calibração (números). null se não houver.
- empDeclarado: erro máximo permissível / tolerância do instrumento, se o certificado declara (número absoluto, na mesma unidade). null se não houver.
- pontos: lista dos pontos de calibração. Para CADA ponto: { "nominal": número (valor de referência/padrão), "erro": número (erro/desvio/tendência do instrumento, com sinal), "incerteza": número ou null (incerteza expandida U), "emp": número ou null (erro máximo permissível daquele ponto, se listado) }. Se não houver tabela de pontos, use [].
- padroes: lista dos PADRÕES / instrumentos de referência usados na calibração (seção "padrões utilizados", "rastreabilidade", "instrumentos de referência"). Para CADA um: { "nome": texto, "certificado": nº do certificado do padrão ou null, "validade": "YYYY-MM-DD" (validade/próxima calibração do padrão) ou null }. Se não houver, use [].

REGRAS:
- Datas SEMPRE "YYYY-MM-DD" (converta de DD/MM/AAAA).
- Não invente. Campo ausente = null (ou [] para listas).
- Responda APENAS com JSON entre <json></json>.
<json>{"laboratorio":null,"acreditacao":null,"numeroCertificado":null,"dataCalibracao":null,"equipamento":null,"identificacao":null,"unidade":null,"faixaMin":null,"faixaMax":null,"empDeclarado":null,"pontos":[],"padroes":[]}</json>`;

function extractJson(text) {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagged) return tagged[1].trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  return s !== -1 && e > s ? text.slice(s, e + 1) : null;
}

const dataISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
// aceita número ou string "0,02"/"0.02"
const numOuNull = (v) => {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") { const n = Number(v.replace(/\./g, v.includes(",") ? "" : ".").replace(",", ".")); return isFinite(n) ? n : null; }
  return null;
};

/**
 * Extrai os dados de avaliação de um certificado de calibração.
 * @param {Buffer|string} data - Buffer do arquivo OU base64.
 * @param {string} contentType - mime (application/pdf, image/png, ...).
 * @returns {Promise<object>} dados extraídos; {} se tipo não suportado.
 */
export async function extrairCalibracao(data, contentType) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");
  const b64 = Buffer.isBuffer(data) ? data.toString("base64") : String(data).includes(",") ? String(data).split(",")[1] : String(data);
  if (!b64) return {};

  let bloco;
  if (contentType === "application/pdf") bloco = { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } };
  else if (IMAGENS.includes(contentType)) bloco = { type: "image", source: { type: "base64", media_type: contentType, data: b64 } };
  else return {};

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 4000,
    system: SYSTEM_PROMPT_CALIBRACAO,
    messages: [{ role: "user", content: [bloco, { type: "text", text: "Extraia os dados de calibração conforme o schema (pontos e padrões inclusive)." }] }],
  });
  const rawText = (message.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const jsonStr = extractJson(rawText);
  if (!jsonStr) return {};
  let d;
  try { d = JSON.parse(jsonStr); } catch { return {}; }

  const pontos = Array.isArray(d.pontos) ? d.pontos.slice(0, 120).map((p) => ({
    nominal: numOuNull(p?.nominal), erro: numOuNull(p?.erro), incerteza: numOuNull(p?.incerteza), emp: numOuNull(p?.emp),
  })).filter((p) => p.nominal != null || p.erro != null) : [];
  const padroes = Array.isArray(d.padroes) ? d.padroes.slice(0, 40).map((p) => ({
    nome: str(p?.nome, 200), certificado: str(p?.certificado, 100), validade: dataISO(p?.validade),
  })).filter((p) => p.nome) : [];

  return {
    laboratorio: str(d.laboratorio, 300),
    acreditacao: str(d.acreditacao, 300),
    numeroCertificado: str(d.numeroCertificado, 100),
    dataCalibracao: dataISO(d.dataCalibracao),
    equipamento: str(d.equipamento, 300),
    identificacao: str(d.identificacao, 300),
    unidade: str(d.unidade, 20),
    faixaMin: numOuNull(d.faixaMin),
    faixaMax: numOuNull(d.faixaMax),
    empDeclarado: numOuNull(d.empDeclarado),
    pontos,
    padroes,
  };
}
