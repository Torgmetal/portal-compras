// POST /api/comercial/op/[id]/kickoff/extrair — extrai dados de Kick Off do
// PDF da proposta comercial via Claude (mesmo padrão do parse-cotacao-ai:
// document block base64 + resposta em <json></json> + sanitização).
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const limiter = createRateLimiter({ name: "kickoff-extrair", maxRequests: 6, windowMs: 60_000 });
const MAX_B64_LEN = 16 * 1024 * 1024; // ~12MB

// Sonnet: a proposta é um documento longo e o escopo exige leitura cuidadosa
// (as rotas de análise do comercial já usam este modelo).
const MODELO_FIXO = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Você é um analista comercial da Torg Metal (estruturas metálicas). Vai receber o PDF de uma PROPOSTA COMERCIAL emitida pela Torg para um cliente, e deve extrair as informações para o documento de KICK OFF — a reunião de alinhamento interna que divulga o contrato aos setores (engenharia, PCP, produção, compras, expedição).

EXTRAIA (quando presente no documento — não invente; na dúvida, use null):

- escopo: resumo CURTO do fornecimento (2-4 frases, em português) — o que é a obra e o que a Torg vai entregar. NÃO liste inclusões/exclusões aqui.
- escopoIncluso: array de strings — itens que ESTÃO incluídos no fornecimento (fabricação, montagem, pintura, transporte, projetos, ART...). Frases curtas, um item por string.
- escopoExcluso: array de strings — itens EXPRESSAMENTE excluídos / por conta do cliente (fundações, energia, andaimes, chumbadores...). Frases curtas.
- resumoPesos: array de {descricao, qtd, pesoKg} — quando a proposta tiver tabela/lista de itens com pesos (estrutura, telhas, acessórios), traga o resumo por grupo. Números em kg. SEM valores em R$. [] se não houver.
- dataEntregaAcordada: prazo de entrega acordado, como data "YYYY-MM-DD" se houver data explícita, senão null (se a proposta só diz "60 dias", deixe null e cite o prazo em pontosAtencao).
- padraoPintura: o esquema de pintura definido (primer/intermediário/acabamento, produtos, demãos, espessuras em µm, cor, norma). null se a proposta não definir.
- inspecao: requisitos de inspeção, ensaios, normas de qualidade, ITPs, visitas de inspetor do cliente, liberação de romaneio etc.
- entregaEndereco: endereço ou local de ENTREGA da obra (cidade/UF no mínimo). Atenção: NÃO é o endereço fiscal do cliente.
- frete: "TORG" se o frete é por conta da Torg (CIF/incluso), "CLIENTE" se por conta do cliente (FOB/retirada), null se não especificado.
- pedidoCompraCliente: número do pedido de compra/ordem de compra do CLIENTE, se citado.
- notaRetorno: true se houver menção a nota de retorno / remessa para industrialização / material do cliente que retorna; false se claramente não há; null se não dá para saber.
- faturamentoObs: condições de faturamento relevantes (medições, eventos de faturamento com percentuais, faturamento direto de materiais, impostos destacados, retenções, condição de pagamento).
- pontosAtencao: array de strings — riscos e condições que os setores PRECISAM saber: exclusões importantes, multas, prazos críticos, retenções contratuais, garantias, condições de aceite, fornecimento pelo cliente, limitações de acesso à obra, janelas de montagem, exigências de documentação (ART, DDS, NRs), etc. Um item por string, frases curtas.

REGRAS
- Não invente nada: só o que está escrito no documento.
- Valores e percentuais: transcreva como estão.
- Responda APENAS com um JSON válido envolvido em <json></json>, no formato:
<json>{"escopo": "...", "escopoIncluso": ["..."], "escopoExcluso": ["..."], "resumoPesos": [{"descricao": "...", "qtd": 0, "pesoKg": 0}], "dataEntregaAcordada": null, "padraoPintura": null, "inspecao": null, "entregaEndereco": null, "frete": null, "pedidoCompraCliente": null, "notaRetorno": null, "faturamentoObs": null, "pontosAtencao": ["..."]}</json>`;

function extractJsonFromResponse(text) {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagged) return tagged[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return null;
}

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const rl = limiter(req, `user:${user.id}`);
  if (!rl.success) {
    return NextResponse.json({ error: "Muitas extrações em sequência — aguarde um minuto." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada." }, { status: 500 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }
  const pdfBase64 = String(body.pdfBase64 || "");
  if (!pdfBase64) return NextResponse.json({ error: "pdfBase64 obrigatório" }, { status: 400 });
  if (pdfBase64.length > MAX_B64_LEN) return NextResponse.json({ error: "PDF grande demais para processar." }, { status: 413 });

  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const cleanB64 = pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64;

    const message = await anthropic.messages.create({
      model: MODELO_FIXO,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: cleanB64 } },
          { type: "text", text: `Contexto: OP ${op.numero} — cliente ${op.cliente}${op.obra ? `, obra ${op.obra}` : ""}. Extraia os dados de kick off conforme o schema do system prompt.` },
        ],
      }],
    });

    const rawText = (message.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const jsonStr = extractJsonFromResponse(rawText);
    if (!jsonStr) {
      return NextResponse.json({ error: "IA devolveu resposta não-JSON.", rawPreview: rawText.slice(0, 500) }, { status: 502 });
    }
    let dados;
    try { dados = JSON.parse(jsonStr); }
    catch { return NextResponse.json({ error: "JSON inválido na resposta da IA.", rawPreview: rawText.slice(0, 500) }, { status: 502 }); }

    // Sanitização leve
    const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const strArr = (v, maxItens, maxLen) => Array.isArray(v)
      ? v.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim().slice(0, maxLen)).slice(0, maxItens)
      : [];
    const out = {
      escopo:              str(dados.escopo, 20000),
      escopoIncluso:       strArr(dados.escopoIncluso, 40, 300),
      escopoExcluso:       strArr(dados.escopoExcluso, 40, 300),
      resumoPesos:         Array.isArray(dados.resumoPesos)
        ? dados.resumoPesos
            .filter((p) => p && typeof p.descricao === "string" && p.descricao.trim())
            .map((p) => ({ descricao: p.descricao.trim().slice(0, 200), qtd: Number(p.qtd) || null, pesoKg: Number(p.pesoKg) || null }))
            .slice(0, 60)
        : [],
      dataEntregaAcordada: /^\d{4}-\d{2}-\d{2}$/.test(String(dados.dataEntregaAcordada || "")) ? dados.dataEntregaAcordada : null,
      padraoPintura:       str(dados.padraoPintura, 5000),
      inspecao:            str(dados.inspecao, 5000),
      entregaEndereco:     str(dados.entregaEndereco, 2000),
      frete:               ["TORG", "CLIENTE"].includes(dados.frete) ? dados.frete : null,
      pedidoCompraCliente: str(dados.pedidoCompraCliente, 200),
      notaRetorno:         typeof dados.notaRetorno === "boolean" ? dados.notaRetorno : null,
      faturamentoObs:      str(dados.faturamentoObs, 5000),
      pontosAtencao:       Array.isArray(dados.pontosAtencao)
        ? dados.pontosAtencao.filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim().slice(0, 500)).slice(0, 40)
        : [],
    };

    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "KICKOFF_EXTRAIR_IA", entity: "OP", entityId: op.id,
        diff: { opNumero: op.numero, model: MODELO_FIXO, inputTokens: message.usage?.input_tokens, outputTokens: message.usage?.output_tokens },
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, dados: out, _meta: { model: MODELO_FIXO, inputTokens: message.usage?.input_tokens, outputTokens: message.usage?.output_tokens } });
  } catch (e) {
    return NextResponse.json({ error: "Falha na extração: " + (e?.message || "erro desconhecido") }, { status: 500 });
  }
}
