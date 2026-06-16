import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SECOES_AUDITORIA, secaoPorCategoria } from "./auditoria-secoes";

// "Torguinho": lê as solicitações do cliente (texto livre) e casa com os documentos
// disponíveis no Controle de Documentos, sugerindo quais atendem a auditoria e
// separando cada um na seção correta (Sistema de Gestão, Soldagem, Ensaios…).
const MODELO = "claude-sonnet-4-6";

export async function sugerirDocumentos(solicitacoes, candidatos) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");
  if (!solicitacoes || !solicitacoes.trim()) return [];
  if (!candidatos.length) return [];

  // Lista enxuta pro modelo (id + nome + categoria/tipo/norma)
  const lista = candidatos
    .map((d) => `- id:${d.id} | ${d.nome}${d.categoria ? ` [${d.categoria}]` : ""}${d.tipo ? ` (${d.tipo})` : ""}${d.norma ? ` · ${d.norma}` : ""}`)
    .join("\n");

  const prompt = `Você é o assistente de qualidade da Torg Metal (fabricante de estruturas metálicas).
Um cliente solicitou documentos para uma AUDITORIA EXTERNA. Abaixo está o pedido do cliente e a lista de documentos disponíveis no nosso Controle de Documentos.

Tarefa: selecione APENAS os documentos da lista que atendem ao que o cliente pediu. Use somente "id" que existam na lista. Se o cliente pedir algo genérico (ex.: "qualificação dos soldadores"), inclua todos os documentos pertinentes. Não invente documentos. Para cada documento, classifique também a SEÇÃO em que ele deve aparecer no portal do cliente, escolhendo UMA destas: ${SECOES_AUDITORIA.map((s) => `"${s}"`).join(", ")}.

PEDIDO DO CLIENTE:
${solicitacoes.trim().slice(0, 6000)}

DOCUMENTOS DISPONÍVEIS:
${lista}

Responda SOMENTE com JSON válido, sem texto extra, no formato:
{"sugestoes":[{"id":"<id>","secao":"<uma das seções>","motivo":"<por que atende, curto>"}]}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const txt = message?.content?.[0]?.text || "";
  let parsed;
  try {
    parsed = JSON.parse(txt);
  } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { sugestoes: [] };
  }
  const validos = new Set(candidatos.map((d) => d.id));
  const byId = new Map(candidatos.map((d) => [d.id, d]));
  return (parsed.sugestoes || [])
    .filter((s) => validos.has(s.id))
    .map((s) => {
      const d = byId.get(s.id);
      const secao = SECOES_AUDITORIA.includes(s.secao) ? s.secao : secaoPorCategoria(d.categoria);
      return { ...d, secao, motivo: String(s.motivo || "").slice(0, 240) };
    });
}
