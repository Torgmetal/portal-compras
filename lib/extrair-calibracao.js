import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { Esquema, pedirJson } from "@/lib/ia-json";

// Leitura COMPLETA de um certificado de calibração (PDF/imagem) com o Claude:
// pontos de medição (nominal/erro/incerteza), EMP declarado, faixa, laboratório,
// acreditação e os PADRÕES usados na calibração (rastreabilidade). Não inventa.

const MODELO = "claude-sonnet-4-6";
const IMAGENS = ["image/png", "image/jpeg", "image/webp"];

export const SYSTEM_PROMPT_CALIBRACAO = `Você lê um CERTIFICADO DE CALIBRAÇÃO de um instrumento de medição (paquímetro, trena, micrômetro, manômetro, torquímetro, termômetro, balança, etc.) da indústria metalúrgica e extrai os dados para avaliação metrológica.

EXTRAIA somente o que está escrito. Texto que o certificado não traz fica vazio (""); número que ele não traz é null.
- laboratorio: nome do laboratório que emitiu o certificado.
- acreditacao: acreditação do laboratório (ex.: "RBC/CGCRE nº 0123", "acreditado ISO/IEC 17025"). Vazio se não declarada.
- numeroCertificado: número do certificado.
- dataCalibracao: data da calibração/emissão no formato "YYYY-MM-DD".
- equipamento: descrição do instrumento calibrado (ex.: "Paquímetro digital 0-300mm").
- identificacao: tag/código/nº de série do instrumento.
- unidade: unidade de medida principal dos pontos (ex.: "mm", "°C", "kgf", "bar", "%").
- errosEmPercent: true se as colunas de ERRO e INCERTEZA do certificado JÁ estão em porcentagem (cabeçalhos como "Erro %", "Erro (%)", "Err %", "U %", ou valores marcados com %). false se o erro/incerteza estão em unidade absoluta (mm, °C, A, Ω, V, mV...). Não converta: traga os números exatamente como aparecem; este campo só diz em que unidade eles estão.
- faixaMin, faixaMax: início e fim da faixa de medição/calibração (números). null se não houver.
- empDeclarado: erro máximo permissível / tolerância do instrumento, se o certificado declara (número; na mesma base do erro — % se errosEmPercent). null se não houver.
- pontos: lista dos pontos de calibração. Para CADA ponto: { "nominal": número (valor de referência/padrão, V.R), "erro": número (erro/desvio/tendência — o valor da coluna Erro, com sinal, COMO ESTÁ), "incerteza": número ou null (incerteza expandida U, COMO ESTÁ), "emp": número ou null (erro máximo permissível daquele ponto, se listado) }. Se não houver tabela de pontos, use [].
- padroes: lista dos PADRÕES / instrumentos de referência usados na calibração (seção "padrões utilizados", "rastreabilidade", "instrumentos de referência"). Para CADA um: { "nome": texto, "certificado": nº do certificado do padrão (vazio se não houver), "validade": "YYYY-MM-DD" (validade/próxima calibração do padrão; vazio se não houver) }. Se não houver, use [].

REGRAS:
- Datas "YYYY-MM-DD" (converta de DD/MM/AAAA).
- Não invente. Texto ausente fica vazio, número ausente é null, lista ausente é [].`;

// ⚠ Texto ausente vem VAZIO, não null: com os 16 campos "ou null" do certificado o schema
// encostaria no teto da API. `str()` e `dataISO()` já tratam "" como ausente. Os números seguem
// "ou null" porque zero é leitura legítima (faixa que começa em 0, erro zero).
export const ESQUEMA_CALIBRACAO = Esquema.objeto({
  laboratorio: Esquema.texto,
  acreditacao: Esquema.texto,
  numeroCertificado: Esquema.texto,
  dataCalibracao: Esquema.texto,
  equipamento: Esquema.texto,
  identificacao: Esquema.texto,
  unidade: Esquema.texto,
  errosEmPercent: Esquema.logico,
  faixaMin: Esquema.numeroOuNulo,
  faixaMax: Esquema.numeroOuNulo,
  empDeclarado: Esquema.numeroOuNulo,
  pontos: Esquema.lista(Esquema.objeto({
    nominal: Esquema.numeroOuNulo, erro: Esquema.numeroOuNulo, incerteza: Esquema.numeroOuNulo, emp: Esquema.numeroOuNulo,
  })),
  padroes: Esquema.lista(Esquema.objeto({ nome: Esquema.texto, certificado: Esquema.texto, validade: Esquema.texto })),
});

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
  const { dados: d } = await pedirJson(anthropic, {
    model: MODELO,
    max_tokens: 4000,
    system: SYSTEM_PROMPT_CALIBRACAO,
    messages: [{ role: "user", content: [bloco, { type: "text", text: "Extraia os dados de calibração (pontos e padrões inclusive)." }] }],
    formato: ESQUEMA_CALIBRACAO,
  });
  if (!d) return {};

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
    errosEmPercent: d.errosEmPercent === true || String(d.unidade || "").trim() === "%",
    faixaMin: numOuNull(d.faixaMin),
    faixaMax: numOuNull(d.faixaMax),
    empDeclarado: numOuNull(d.empDeclarado),
    pontos,
    padroes,
  };
}
