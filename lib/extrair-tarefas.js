// Extrai TAREFAS acionáveis de uma ata/transcrição/arquivo de reunião usando o
// Claude, já atribuindo o setor responsável (entre os setores do Planejamento).
// Espelha o padrão de lib/extrair-doc-qualidade.js e lib/auditoria-sugestao.js.
import Anthropic from "@anthropic-ai/sdk";

const MODELO = "claude-sonnet-4-6";

export const SETORES_TAREFA = [
  "PRODUCAO", "PINTURA", "PCP", "EXPEDICAO", "COMERCIAL",
  "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "RH", "PLANEJAMENTO",
];

const SYSTEM = `Você é o assistente de Planejamento da Torg Metal (fabricante de estruturas metálicas).
Recebe a ATA ou TRANSCRIÇÃO de uma reunião e extrai as TAREFAS / itens de ação concretos para distribuir aos setores.

Regras:
- Extraia só o que é ACIONÁVEL (algo a fazer, decidir, providenciar). Ignore conversa, contexto e itens informativos sem ação.
- Cada tarefa deve ter um título curto e imperativo (ex.: "Comprar chapa A572 para a OP-085").
- Atribua o SETOR responsável escolhendo EXATAMENTE um destes: ${SETORES_TAREFA.join(", ")}.
  Mapeie pelo conteúdo: corte/montagem/solda/fabricação→PRODUCAO; pintura/jato→PINTURA; programação/máquinas/fila→PCP;
  carga/romaneio/entrega→EXPEDICAO; cliente/contrato/orçamento/venda→COMERCIAL; projeto/desenho/detalhamento→ENGENHARIA;
  compra/cotação/fornecedor→COMPRAS; material/estoque/recebimento→ALMOXARIFADO; pagamento/financeiro→FINANCEIRO;
  pessoas/admissão/RH→RH; cronograma/prazo/coordenação→PLANEJAMENTO. Se não tiver certeza, use PLANEJAMENTO.
- prioridade: "ALTA" | "MEDIA" | "BAIXA" (urgência pelo tom/prazo).
- responsavel: nome da pessoa citada como responsável (se houver), senão null.
- prazo: data no formato AAAA-MM-DD se houver prazo claro, senão null.
- opNumero: se a tarefa citar uma OP (ex.: "OP-085", "067"), traga só os dígitos (ex.: "085"); senão null.
- descricao: 1 frase de contexto, opcional.

Responda SOMENTE com JSON válido, sem texto fora dele:
{"resumo":"1-2 frases do que foi a reunião","tarefas":[{"titulo":"...","setor":"PRODUCAO","prioridade":"MEDIA","responsavel":null,"prazo":null,"opNumero":null,"descricao":null}]}`;

function extractJson(txt) {
  if (!txt) return null;
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let s = fence ? fence[1] : txt;
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

const norm = (s) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/**
 * @param {{ texto?: string, pdfBase64?: string }} input
 * @returns {Promise<{ resumo: string, tarefas: Array }>}
 */
export async function extrairTarefas({ texto, pdfBase64 }) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content = [];
  if (pdfBase64) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } });
  content.push({ type: "text", text: texto ? `Ata/transcrição:\n\n${texto}` : "Extraia as tarefas do documento anexo." });

  const message = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  const raw = message?.content?.[0]?.text || "";
  const parsed = extractJson(raw) || {};
  const lista = Array.isArray(parsed.tarefas) ? parsed.tarefas : [];
  const tarefas = lista.map((t) => {
    const setor = SETORES_TAREFA.includes(norm(t.setor)) ? norm(t.setor) : "PLANEJAMENTO";
    const prioridade = ["ALTA", "MEDIA", "BAIXA"].includes(norm(t.prioridade)) ? norm(t.prioridade) : "MEDIA";
    const prazo = /^\d{4}-\d{2}-\d{2}$/.test(t.prazo || "") ? t.prazo : null;
    const opNumero = t.opNumero ? String(t.opNumero).replace(/\D/g, "").slice(0, 4) || null : null;
    return {
      titulo: (t.titulo || "").toString().slice(0, 200).trim(),
      descricao: t.descricao ? String(t.descricao).slice(0, 500) : null,
      setor, prioridade,
      responsavel: t.responsavel ? String(t.responsavel).slice(0, 120) : null,
      prazo, opNumero,
    };
  }).filter((t) => t.titulo);

  return { resumo: parsed.resumo ? String(parsed.resumo).slice(0, 400) : "", tarefas };
}
