import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SECOES_AUDITORIA, secaoPorCategoria, REQUISITOS_GQFQ003 } from "./auditoria-secoes";
import { Esquema, pedirJson } from "@/lib/ia-json";

// "Torguinho": lê as solicitações do cliente (texto livre) e casa com os documentos
// disponíveis no Controle de Documentos, sugerindo quais atendem a auditoria e
// separando cada um na seção correta (Sistema de Gestão, Soldagem, Ensaios…).
const MODELO = "claude-sonnet-4-6";

export const ESQUEMA_SUGESTOES = Esquema.objeto({
  sugestoes: Esquema.lista(Esquema.objeto({
    id: Esquema.texto,
    secao: Esquema.umDe(SECOES_AUDITORIA),
    requisito: Esquema.texto,
    motivo: Esquema.texto,
  })),
});

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

Tarefa: selecione os documentos da lista que atendem ao que o cliente pediu. Use somente "id" que existam na lista. Se o cliente pedir algo genérico (ex.: "qualificação dos soldadores"), inclua todos os documentos pertinentes. Não invente documentos. Para cada documento, classifique também a SEÇÃO em que ele deve aparecer no portal do cliente, escolhendo UMA destas: ${SECOES_AUDITORIA.map((s) => `"${s}"`).join(", ")}. E escolha o REQUISITO (linha) que ele atende, pelo "id" da lista de requisitos abaixo (use o requisito da seção escolhida; se nenhum servir, deixe "").

PEDIDO DO CLIENTE:
${solicitacoes.trim().slice(0, 6000)}

DOCUMENTOS DISPONÍVEIS:
${lista}

REQUISITOS (linhas) por seção:
${REQUISITOS_GQFQ003.map((r) => `- ${r.id} (${r.secao}): ${r.label}`).join("\n")}

Para cada documento escolhido, "motivo" diz em poucas palavras por que ele atende.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { dados, parada } = await pedirJson(anthropic, {
    model: MODELO,
    // ⚠ 1500 cortava a lista: um pedido amplo (ISO, RQS, EPS/RQPS, calibração, inspetores) sobre os
    // ~100 documentos do controle passa disso — e o corte virava erro de JSON. Medido em 26/09: 46
    // sugestões em 55 s. Por isso a rota tem 180 s.
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
    formato: ESQUEMA_SUGESTOES,
  });
  // cortada no meio não é "nenhuma sugestão": antes isso estourava no JSON.parse, agora diz o porquê
  if (parada === "max_tokens") throw new Error("A lista de sugestões ficou grande demais para uma resposta. Divida o pedido do cliente em partes.");
  const parsed = dados || { sugestoes: [] };
  const validos = new Set(candidatos.map((d) => d.id));
  const byId = new Map(candidatos.map((d) => [d.id, d]));
  const reqIds = new Set(REQUISITOS_GQFQ003.map((r) => r.id));
  return (parsed.sugestoes || [])
    .filter((s) => validos.has(s.id))
    .map((s) => {
      const d = byId.get(s.id);
      // ⚠ o schema não garante maiúsculas/minúsculas do valor escolhido — compara sem caixa
      const secao = SECOES_AUDITORIA.find((x) => x.toLowerCase() === String(s.secao || "").toLowerCase()) || secaoPorCategoria(d.categoria);
      const requisito = reqIds.has(s.requisito) ? s.requisito : null;
      return { ...d, secao, requisito, motivo: String(s.motivo || "").slice(0, 240) };
    });
}
