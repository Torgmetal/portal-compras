import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Analisa a RNC que o CLIENTE enviou (PDF ou imagem) com o Claude. O objetivo NÃO é
// transcrever o documento — é PRODUZIR UMA ANÁLISE da Qualidade da Torg: levantar os
// pontos, avaliar se procede, apontar possíveis causas, fazer os 5 porquês e — só se
// couber — montar o plano de ação 5W2H. Ver [[torg_rnc]] / [[torg_ia_integracao]].

const MODELO = "claude-sonnet-4-6";
const IMAGENS = ["image/png", "image/jpeg", "image/webp"];

export const SYSTEM_RNC = `Você é analista da Qualidade da TORG METAL, fabricante de estruturas metálicas. O documento anexo é um Relatório de Não Conformidade (RNC/RTNC) que um CLIENTE enviou apontando um problema em produto/serviço que a Torg forneceu. Sua tarefa NÃO é transcrever nem resumir o documento — é PRODUZIR UMA ANÁLISE da Qualidade para a Torg AVALIAR, decidir se cabe ação e responder ao cliente.

Produza:
1) IDENTIFICAÇÃO — só o que ESTÁ ESCRITO no documento (null se não houver): cliente, numeroCliente (o nº da RNC do cliente, ex.: "RTNC-010"), programa (ex.: "ASME"), opNumero (obra/OP/job), desenhoProjetoMarca (desenho/referência/posição/componente citados).
2) descricao — a não conformidade em 1 ou 2 frases OBJETIVAS: o quê, onde, contra qual desenho/medida. Direto ao ponto, sem recontar o documento inteiro.
3) analise — a ANÁLISE da Qualidade da Torg (é o VALOR deste trabalho), texto corrido curto e com juízo próprio:
   • os PONTOS que o cliente levanta (liste objetivamente, com suas palavras);
   • a AVALIAÇÃO TÉCNICA da Torg: o apontamento procede? faz sentido no processo da Torg? há atenuante, ressalva ou informação faltando?
   Escreva como quem leva isso à diretoria decidir — NÃO copie frases do cliente.
4) pertinente — true se o apontamento procede (é uma NC real atribuível à Torg); false se improcedente/sem fundamento ou responsabilidade de terceiro.
5) causas — 2 a 4 linhas com as POSSÍVEIS causas no contexto de fabricação de estruturas metálicas (projeto, corte, furação, montagem, soldagem, inspeção, expedição…). SEMPRE preencha.
6) cincoPorques — 5 porquês encadeados, cada um aprofundando o anterior. Cada item deve conter APENAS A RESPOSTA (a causa daquele nível), em UMA frase afirmativa. NÃO escreva o número, NÃO escreva "Por quê", NÃO escreva "Porque". Ex. de item: "A peça foi fabricada com dimensão maior que a do projeto."
7) necessitaAcao — sua RECOMENDAÇÃO: "CORRETIVA" (corrigir e evitar reincidência), "PREVENTIVA" (não houve falha, mas há risco a prevenir) ou "NAO_NECESSARIO" (não cabe ação — ex.: improcedente, ou ocorrência pontual sem risco de repetição). Escolha exatamente UM.
8) planoAcao (5W2H) da TORG para EVITAR A REINCIDÊNCIA — só se necessitaAcao ≠ NAO_NECESSARIO. Se não couber ação, devolva todos os campos null. Campos: oque (o que fazer), porque, onde (setor/processo da Torg), quem (setor responsável), como (como fazer), quanto (recursos/custo — "—" se não estimável), prazo (texto, ex.: "15 dias").

REGRAS:
- NÃO transcreva o documento: interprete e avalie.
- Identificação: NÃO invente; null se não está escrito.
- Análise, causas, 5 porquês e plano: base técnica, específica e prática — é isso que a Torg vai avaliar.
- Responda em português. APENAS JSON entre <json></json>:
<json>{"cliente":null,"numeroCliente":null,"programa":null,"opNumero":null,"desenhoProjetoMarca":null,"descricao":null,"analise":null,"pertinente":true,"causas":null,"cincoPorques":[],"necessitaAcao":"CORRETIVA","planoAcao":{"oque":null,"porque":null,"onde":null,"quem":null,"como":null,"quanto":null,"prazo":null}}</json>`;

function extractJson(text) {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagged) return tagged[1].trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  return s !== -1 && e > s ? text.slice(s, e + 1) : null;
}
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const ACOES = new Set(["CORRETIVA", "PREVENTIVA", "NAO_NECESSARIO"]);

// O modelo às vezes devolve o porquê com o número e/ou a pergunta ("1. Por quê X? Porque
// Y") apesar da instrução. Deixa só a resposta afirmativa.
function limpaPorque(s) {
  let t = String(s || "").trim();
  t = t.replace(/^\s*\d+\s*[.)ºo°:\-–]+\s*/i, "");        // "1." "1)" "1º" "1 -"
  t = t.replace(/^por\s*qu[eê][^?]{0,120}\?\s*/i, "");     // a pergunta "Por quê …?"
  t = t.replace(/^(porqu[eê]|por\s+qu[eê])\s+/i, "");      // o conector "Porque "
  t = t.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

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
    model: MODELO, max_tokens: 2600, system: SYSTEM_RNC,
    messages: [{ role: "user", content: [bloco, { type: "text", text: "Analise esta RNC do cliente conforme o schema. Produza uma ANÁLISE, não uma transcrição." }] }],
  });
  const rawText = (message.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const jsonStr = extractJson(rawText);
  if (!jsonStr) return null;
  let d;
  try { d = JSON.parse(jsonStr); } catch { return null; }

  const pq = Array.isArray(d.cincoPorques) ? d.cincoPorques.slice(0, 5).map((x) => limpaPorque(x)).filter(Boolean) : [];
  const pa = d.planoAcao || {};
  const necessitaAcao = ACOES.has(d.necessitaAcao) ? d.necessitaAcao : "CORRETIVA";
  return {
    cliente: str(d.cliente, 200), numeroCliente: str(d.numeroCliente, 80), programa: str(d.programa, 120),
    opNumero: str(d.opNumero, 80), desenhoProjetoMarca: str(d.desenhoProjetoMarca, 500),
    descricao: str(d.descricao, 4000), analise: str(d.analise, 5000),
    pertinente: typeof d.pertinente === "boolean" ? d.pertinente : true,
    causas: str(d.causas, 3000), cincoPorques: pq, necessitaAcao,
    planoAcao: necessitaAcao === "NAO_NECESSARIO" ? null : {
      oque: str(pa.oque, 1200), porque: str(pa.porque, 1000), onde: str(pa.onde, 300),
      quem: str(pa.quem, 400), como: str(pa.como, 1600), quanto: str(pa.quanto, 200), prazo: str(pa.prazo, 200),
    },
  };
}
