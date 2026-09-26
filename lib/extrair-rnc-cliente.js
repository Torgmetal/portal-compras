import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { Esquema, pedirJson } from "@/lib/ia-json";

// EXTRAI (não analisa) os dados de uma RNC/RTNC que o CLIENTE enviou (PDF/imagem):
// identificação + descrição + as causas que o PRÓPRIO cliente apontou. Só o que está
// escrito no documento — nada inventado, sem opinião da Torg. Preenche os campos da
// RNC pra revisão. Ver [[torg_rnc]] / [[torg_ia_integracao]].

const MODELO = "claude-sonnet-4-6";
const IMAGENS = ["image/png", "image/jpeg", "image/webp"];

export const SYSTEM_EXTRAIR = `Você é analista da Qualidade da TORG METAL. O documento anexo é uma RNC/RTNC que um CLIENTE enviou à Torg. Sua tarefa é transcrever os dados do documento, sem análise, opinião ou dedução: estes campos registram a versão do cliente, e a análise da Torg é feita depois, em outro lugar. Preencha só com o que está escrito; use null quando não houver a informação.

Extraia:
- cliente: nome do cliente que emitiu a RNC.
- numeroCliente: o número da RNC no documento do cliente (ex.: "RTNC-010", "0318-025").
- programa: programa/norma citada (ex.: "ASME"), se houver.
- data: a data do documento no formato AAAA-MM-DD (converta se estiver em outro formato, ex.: 23/03/2026 → 2026-03-23); null se não houver.
- opNumero: obra / OP / job citado.
- desenhoProjetoMarca: desenho / posição / componente / peça citada.
- descricao: a não conformidade que o cliente aponta, de forma clara (o que foi constatado, onde, contra qual medida/desenho).
- causas: as causas que o PRÓPRIO CLIENTE apontou no documento, se houver. Se o cliente não apontou causa, use null (não deduza causas).

Responda em português.`;

export const ESQUEMA_RNC_CLIENTE = Esquema.objeto({
  cliente: Esquema.textoOuNulo,
  numeroCliente: Esquema.textoOuNulo,
  programa: Esquema.textoOuNulo,
  data: Esquema.textoOuNulo,
  opNumero: Esquema.textoOuNulo,
  desenhoProjetoMarca: Esquema.textoOuNulo,
  descricao: Esquema.textoOuNulo,
  causas: Esquema.textoOuNulo,
});
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Extrai os dados da RNC do cliente. @returns objeto ou null se não deu pra ler. */
export async function extrairRncCliente(data, contentType) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");
  const b64 = Buffer.isBuffer(data) ? data.toString("base64") : String(data).includes(",") ? String(data).split(",")[1] : String(data);
  if (!b64) return null;

  let bloco;
  if (contentType === "application/pdf") bloco = { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } };
  else if (IMAGENS.includes(contentType)) bloco = { type: "image", source: { type: "base64", media_type: contentType, data: b64 } };
  else return null;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { dados: d } = await pedirJson(anthropic, {
    model: MODELO, max_tokens: 1500, system: SYSTEM_EXTRAIR,
    messages: [{ role: "user", content: [bloco, { type: "text", text: "Extraia os dados desta RNC do cliente. Só o que está escrito." }] }],
    formato: ESQUEMA_RNC_CLIENTE,
  });
  if (!d) return null;

  let dataIso = null;
  if (typeof d.data === "string") { const m = d.data.trim().match(/^\d{4}-\d{2}-\d{2}/); if (m) dataIso = m[0]; }
  return {
    cliente: str(d.cliente, 200), numeroCliente: str(d.numeroCliente, 80), programa: str(d.programa, 120),
    data: dataIso, opNumero: str(d.opNumero, 80), desenhoProjetoMarca: str(d.desenhoProjetoMarca, 500),
    descricao: str(d.descricao, 4000), causas: str(d.causas, 3000),
  };
}
