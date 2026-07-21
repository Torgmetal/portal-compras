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
Recebe a ATA ou TRANSCRIÇÃO de uma reunião — podendo ser VÁRIOS documentos de uma mesma rodada de planejamento (atas, transcrições, anexos) — e extrai as TAREFAS / itens de ação concretos para distribuir aos setores.

Regras:
- Extraia só o que é ACIONÁVEL (algo a fazer, decidir, providenciar). Ignore conversa, contexto e itens informativos sem ação.
- Pode haver MAIS DE UM documento. Considere todos em conjunto e CONSOLIDE tarefas repetidas — não duplique a mesma ação citada em documentos diferentes.
- Cada tarefa deve ter um título curto e imperativo (ex.: "Comprar chapa A572 para a OP-085").
- Atribua o SETOR responsável escolhendo EXATAMENTE um destes: ${SETORES_TAREFA.join(", ")}.
  Mapeie pelo conteúdo: corte/montagem/solda/fabricação→PRODUCAO; pintura/jato→PINTURA; programação/máquinas/fila→PCP;
  carga/romaneio/entrega→EXPEDICAO; cliente/contrato/orçamento/venda→COMERCIAL; projeto/desenho/detalhamento→ENGENHARIA;
  compra/cotação/fornecedor→COMPRAS; material/estoque/recebimento→ALMOXARIFADO; pagamento/financeiro→FINANCEIRO;
  pessoas/admissão/RH→RH; cronograma/prazo/coordenação→PLANEJAMENTO. Se não tiver certeza, use PLANEJAMENTO.
- prioridade: "ALTA" | "MEDIA" | "BAIXA" (urgência pelo tom/prazo).
- responsavel: nome da pessoa citada como responsável (se houver), senão null.
- prazo: data no formato AAAA-MM-DD se houver prazo claro, senão null. Use a DATA DE HOJE informada para resolver prazos relativos ("sexta", "amanhã", "25/06" sem ano → use o ANO CORRENTE).
- opNumero: a OP a que a tarefa pertence, só os dígitos (ex.: "085"). IMPORTANTE: a OP costuma ser dita UMA vez pra reunião/assunto inteiro (no título, no cabeçalho ou na primeira menção) e NÃO repetida em cada item. Então:
    • se a tarefa cita uma OP, use-a;
    • se NÃO cita, mas a reunião — ou o bloco de itens em volta — é claramente sobre UMA OP/projeto/cliente específico, HERDE essa OP (ex.: reunião da OP-097 / Valmet → as tarefas sobre a Valmet ou esse projeto recebem "097", mesmo sem repetir o número);
    • deixe null só se a tarefa for genérica/administrativa sem vínculo com nenhuma OP, OU se a reunião cobre VÁRIAS OPs e não dá pra saber a qual esta pertence.
  NUNCA invente um número de OP que não apareça nos documentos.
- descricao: 1 frase de contexto, opcional.
- doCliente: true SE a tarefa é responsabilidade do CLIENTE (ele que precisa fornecer, aprovar, liberar ou enviar algo) — ex.: "cliente vai mandar o projeto", "aguardando aprovação do cliente", "cliente deve liberar o desenho". Senão false. Ainda assim escolha o setor interno que depende disso.
- clienteNome: nome do cliente, se citado na reunião; senão null.

Responda SOMENTE com JSON válido, sem texto fora dele:
{"resumo":"1-2 frases do que foi a reunião","tarefas":[{"titulo":"...","setor":"PRODUCAO","prioridade":"MEDIA","responsavel":null,"prazo":null,"opNumero":null,"descricao":null,"doCliente":false,"clienteNome":null}]}`;

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
 * @param {{ documentos: Array<{ nome?: string, texto?: string, pdfBase64?: string }>, hoje?: string }} input
 * @returns {Promise<{ resumo: string, tarefas: Array }>}
 */
export async function extrairTarefas({ documentos, hoje }) {
  const docs = (Array.isArray(documentos) ? documentos : []).filter((d) => d && (d.texto || d.pdfBase64));
  if (!docs.length) return { resumo: "", tarefas: [] };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content = [];
  if (hoje) content.push({ type: "text", text: `Data de hoje: ${hoje}. Use-a para resolver qualquer prazo relativo.` });
  docs.forEach((d, i) => {
    const titulo = `=== Documento ${i + 1}${d.nome ? ` — ${d.nome}` : ""} ===`;
    if (d.pdfBase64) {
      content.push({ type: "text", text: `${titulo} (PDF anexo a seguir):` });
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: d.pdfBase64 } });
    } else {
      content.push({ type: "text", text: `${titulo}\n\n${d.texto}` });
    }
  });
  content.push({ type: "text", text: `Considere os ${docs.length} documento(s) acima EM CONJUNTO e extraia as tarefas conforme as regras, consolidando itens repetidos.` });

  const message = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 8000,
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
    const doCliente = t.doCliente === true || String(t.doCliente).toLowerCase() === "true";
    return {
      titulo: (t.titulo || "").toString().slice(0, 200).trim(),
      descricao: t.descricao ? String(t.descricao).slice(0, 500) : null,
      setor, prioridade,
      responsavel: t.responsavel ? String(t.responsavel).slice(0, 120) : null,
      prazo, opNumero,
      doCliente,
      clienteNome: t.clienteNome ? String(t.clienteNome).slice(0, 120) : null,
    };
  }).filter((t) => t.titulo);

  return { resumo: parsed.resumo ? String(parsed.resumo).slice(0, 400) : "", tarefas };
}
