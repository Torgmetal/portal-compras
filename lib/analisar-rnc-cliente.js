import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Analisa a RNC que o CLIENTE enviou (PDF ou imagem) com o Claude: identifica os
// dados, levanta os pontos e as possíveis causas, faz os 5 porquês e já propõe um
// plano de ação 5W2H para não voltar a ocorrer. Ver [[torg_rnc]] / [[torg_ia_integracao]].

const MODELO = "claude-sonnet-4-6";
const IMAGENS = ["image/png", "image/jpeg", "image/webp"];

export const SYSTEM_RNC = `Você é analista da Qualidade da TORG METAL, fabricante de estruturas metálicas. O documento anexo é um Relatório de Não Conformidade (RNC/RTNC) que um CLIENTE enviou à Torg apontando um problema em produtos/serviços que a Torg forneceu. Analise essa RNC para a Torg tratar e responder.

Produza:
1) IDENTIFICAÇÃO — só o que ESTÁ ESCRITO no documento (null se não houver): cliente, numeroCliente (o nº da RNC do cliente, ex.: "RTNC-010"), programa (ex.: "ASME"), opNumero (obra/OP/job), desenhoProjetoMarca (desenho/referência/posição/componente citados).
2) descricao — descreva CLARAMENTE a não conformidade e os PONTOS levantados pelo cliente (o que foi constatado, onde, com base em qual desenho/posição).
3) causas — SEMPRE preencha (2 a 4 linhas) com as POSSÍVEIS causas da não conformidade, no contexto de fabricação de estruturas metálicas (projeto, corte, furação, montagem, soldagem, expedição…). Não deixe null.
4) cincoPorques — análise de causa raiz pelos 5 porquês: 5 respostas encadeadas, cada uma aprofundando a anterior. Cada item deve conter APENAS a resposta (a causa daquele nível), numa frase afirmativa — NÃO inclua o número, NÃO repita a pergunta "por que". Ex. de um item: "Os componentes foram fabricados com dimensões maiores que o projeto." Preencha os 5.
5) planoAcao (5W2H) da TORG para EVITAR A REINCIDÊNCIA: oque (o que fazer), porque, onde (setor/processo da Torg), quem (setor responsável), como (como fazer), quanto (recursos/custo — pode ser "—"), prazo (prazo sugerido em texto, ex.: "15 dias").

REGRAS:
- Identificação: NÃO invente; null se não está no documento.
- Análise (causas, 5 porquês, plano): proponha com base técnica, específica e prática — este é o valor da análise.
- Responda em português. APENAS JSON entre <json></json>:
<json>{"cliente":null,"numeroCliente":null,"programa":null,"opNumero":null,"desenhoProjetoMarca":null,"descricao":null,"causas":null,"cincoPorques":[],"planoAcao":{"oque":null,"porque":null,"onde":null,"quem":null,"como":null,"quanto":null,"prazo":null}}</json>`;

function extractJson(text) {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagged) return tagged[1].trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  return s !== -1 && e > s ? text.slice(s, e + 1) : null;
}
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Analisa a RNC do cliente. @returns objeto estruturado ou null se não deu pra ler. */
export async function analisarRncCliente(data, contentType) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");
  const b64 = Buffer.isBuffer(data) ? data.toString("base64") : String(data).includes(",") ? String(data).split(",")[1] : String(data);
  if (!b64) return null;

  let bloco;
  if (contentType === "application/pdf") bloco = { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } };
  else if (IMAGENS.includes(contentType)) bloco = { type: "image", source: { type: "base64", media_type: contentType, data: b64 } };
  else return null;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: MODELO, max_tokens: 2200, system: SYSTEM_RNC,
    messages: [{ role: "user", content: [bloco, { type: "text", text: "Analise esta RNC do cliente conforme o schema." }] }],
  });
  const rawText = (message.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const jsonStr = extractJson(rawText);
  if (!jsonStr) return null;
  let d;
  try { d = JSON.parse(jsonStr); } catch { return null; }

  const pq = Array.isArray(d.cincoPorques) ? d.cincoPorques.slice(0, 5).map((x) => String(x || "").trim()).filter(Boolean) : [];
  const pa = d.planoAcao || {};
  return {
    cliente: str(d.cliente, 200), numeroCliente: str(d.numeroCliente, 80), programa: str(d.programa, 120),
    opNumero: str(d.opNumero, 80), desenhoProjetoMarca: str(d.desenhoProjetoMarca, 500),
    descricao: str(d.descricao, 4000), causas: str(d.causas, 3000), cincoPorques: pq,
    planoAcao: {
      oque: str(pa.oque, 1200), porque: str(pa.porque, 1000), onde: str(pa.onde, 300),
      quem: str(pa.quem, 400), como: str(pa.como, 1600), quanto: str(pa.quanto, 200), prazo: str(pa.prazo, 200),
    },
  };
}
