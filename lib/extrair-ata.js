// Organiza o texto/transcrição de uma reunião de OBRA numa ATA padronizada, pronta
// pra enviar ao cliente. Espelha lib/extrair-tarefas.js. Não inventa decisões.
import Anthropic from "@anthropic-ai/sdk";

const MODELO = "claude-sonnet-4-6";

const SYSTEM = `Você é o assistente de atas de reunião da Torg Metal (fabricante de estruturas metálicas).
Recebe o TEXTO ou transcrição de uma reunião de uma OBRA/OP e organiza numa ATA clara e padronizada para enviar ao CLIENTE.

Regras:
- titulo: título curto da reunião (ex.: "Alinhamento de cronograma — Revamp").
- participantes: nomes citados como presentes, numa string separada por vírgula; senão null.
- resumo: 1-2 frases do que foi a reunião.
- topicos: assuntos tratados — cada um { titulo, discussao } (discussao = 1-3 frases objetivas).
- acoes: itens de ação / pendências — cada um { descricao, responsavel (nome citado, ou "Torg"/"Cliente"; senão null), prazo (AAAA-MM-DD se houver prazo claro; senão null) }. Use a DATA DE HOJE pra resolver prazos relativos ("sexta", "em 10 dias").
Escreva em português claro e formal (é pra cliente ler e aceitar). NÃO invente decisões, responsáveis ou prazos que não estão no texto.

Responda SOMENTE com JSON válido, sem texto fora dele:
{"titulo":"...","participantes":null,"resumo":"...","topicos":[{"titulo":"...","discussao":"..."}],"acoes":[{"descricao":"...","responsavel":null,"prazo":null}]}`;

function extractJson(txt) {
  if (!txt) return null;
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let s = fence ? fence[1] : txt;
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

/** @param {{ texto: string, hoje?: string }} input */
export async function extrairAta({ texto, hoje }) {
  if (!texto || !texto.trim()) return null;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content = [];
  if (hoje) content.push({ type: "text", text: `Data de hoje: ${hoje}. Use-a para resolver prazos relativos.` });
  content.push({ type: "text", text: texto.slice(0, 60000) });

  const message = await anthropic.messages.create({ model: MODELO, max_tokens: 4000, system: SYSTEM, messages: [{ role: "user", content }] });
  const j = extractJson(message?.content?.[0]?.text || "") || {};

  return {
    titulo: j.titulo ? String(j.titulo).slice(0, 200) : null,
    participantes: j.participantes ? String(j.participantes).slice(0, 500) : null,
    resumo: j.resumo ? String(j.resumo).slice(0, 1200) : "",
    topicos: Array.isArray(j.topicos)
      ? j.topicos.slice(0, 30).map((t) => ({ titulo: String(t.titulo || "").slice(0, 200), discussao: String(t.discussao || "").slice(0, 1200) })).filter((t) => t.titulo)
      : [],
    acoes: Array.isArray(j.acoes)
      ? j.acoes.slice(0, 40).map((a) => ({
          descricao: String(a.descricao || "").slice(0, 600),
          responsavel: a.responsavel ? String(a.responsavel).slice(0, 120) : null,
          prazo: /^\d{4}-\d{2}-\d{2}$/.test(a.prazo || "") ? a.prazo : null,
        })).filter((a) => a.descricao)
      : [],
  };
}
