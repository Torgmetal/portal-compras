// Organiza um RASCUNHO em texto livre nas ATIVIDADES de uma ata de reunião,
// agrupando por OP e já atribuindo setor/responsável quando dá pra deduzir
// (usando a lista de envolvidos como referência). Quando não dá, deixa em branco
// para o usuário preencher depois. Espelha o padrão de lib/extrair-tarefas.js.
import Anthropic from "@anthropic-ai/sdk";

const MODELO = "claude-sonnet-4-6";

export const SETORES_ATA = [
  "COMERCIAL", "ENGENHARIA", "COMPRAS", "PRODUCAO", "PCP", "PLANEJAMENTO",
  "EXPEDICAO", "QUALIDADE", "ALMOXARIFADO", "FINANCEIRO", "RH", "DIRETORIA",
];

const SYSTEM = `Você é o assistente de Planejamento da Torg Metal (fabricante de estruturas metálicas).
Recebe um RASCUNHO em texto livre com as atividades discutidas numa reunião e organiza isso numa lista estruturada de atividades para a ATA, agrupáveis por OP.

Regras:
- Extraia cada atividade acionável do rascunho. Normalmente cada linha/ideia vira uma atividade. Não invente atividades que não estão no rascunho.
- descricao: frase curta e imperativa do que precisa ser feito (ex.: "Detalhar as marcas da OP 085").
- op: se a atividade citar uma OP (ex.: "OP-085", "085", "OP 067", "obra 112"), traga SÓ os dígitos (ex.: "085"). Mantenha a mesma OP para atividades do mesmo trecho/bloco. Se não houver OP, use null.
- setor: o setor responsável, escolhendo EXATAMENTE um destes quando tiver certeza razoável: ${SETORES_ATA.join(", ")}.
  Mapeamento por conteúdo: corte/montagem/solda/fabricação→PRODUCAO; pintura/jato→PRODUCAO; programação/máquinas/fila/aproveitamento→PCP; carga/romaneio/expedição/entrega→EXPEDICAO; cliente/contrato/orçamento/proposta/venda→COMERCIAL; projeto/desenho/detalhamento/marcas/revisão→ENGENHARIA; compra/cotação/fornecedor/pedido→COMPRAS; material/estoque/recebimento→ALMOXARIFADO; pagamento/nota/financeiro→FINANCEIRO; pessoas/admissão/RH→RH; certificado/data book/inspeção/qualidade→QUALIDADE; cronograma/prazo/coordenação→PLANEJAMENTO.
  IMPORTANTE: se NÃO der pra determinar o setor com segurança, use null (deixe em branco pra ser preenchido depois). NÃO chute um setor.
- responsavel: nome da PESSOA responsável. Use a LISTA DE ENVOLVIDOS fornecida: se o rascunho citar alguém dessa lista (ou indicar claramente a pessoa), traga o nome exatamente como está na lista e, se o setor ainda não estiver claro, use o setor dessa pessoa. Se não souber quem é, use null.
- prazo: data AAAA-MM-DD se houver prazo claro; resolva prazos relativos ("sexta", "amanhã", "dia 25") pela DATA DE HOJE informada; senão null.

Responda SOMENTE com JSON válido, sem nenhum texto fora dele:
{"atividades":[{"op":null,"descricao":"...","setor":null,"responsavel":null,"prazo":null}]}`;

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
 * @param {{ rascunho: string, envolvidos?: Array<{nome?:string,email?:string,setor?:string}>, hoje?: string }} input
 * @returns {Promise<{ atividades: Array<{op:string|null,descricao:string,setor:string|null,responsavel:string|null,prazo:string|null}> }>}
 */
export async function extrairAtividadesAta({ rascunho, envolvidos = [], hoje }) {
  const texto = (rascunho || "").toString().trim();
  if (!texto) return { atividades: [] };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const roster = (Array.isArray(envolvidos) ? envolvidos : [])
    .filter((e) => e && (e.nome || e.email))
    .map((e) => `- ${e.nome || e.email}${e.setor ? ` (setor ${e.setor})` : ""}`)
    .join("\n");

  const userText = [
    hoje ? `Data de hoje: ${hoje}. Use-a para resolver prazos relativos.` : "",
    roster ? `Pessoas envolvidas na reunião (referência para atribuir responsável e setor quando o rascunho citar alguém):\n${roster}` : "",
    `Rascunho das atividades da reunião:\n\n${texto}`,
  ].filter(Boolean).join("\n\n");

  const message = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  });

  const raw = message?.content?.[0]?.text || "";
  const parsed = extractJson(raw) || {};
  const lista = Array.isArray(parsed.atividades) ? parsed.atividades : [];

  const atividades = lista.map((a) => {
    const setor = SETORES_ATA.includes(norm(a.setor)) ? norm(a.setor) : null;
    const prazo = /^\d{4}-\d{2}-\d{2}$/.test(a.prazo || "") ? a.prazo : null;
    const op = a.op ? String(a.op).replace(/\D/g, "").slice(0, 6) || null : null;
    return {
      op,
      descricao: (a.descricao || "").toString().slice(0, 300).trim(),
      setor,
      responsavel: a.responsavel ? String(a.responsavel).slice(0, 120).trim() : null,
      prazo,
    };
  }).filter((a) => a.descricao);

  return { atividades };
}
