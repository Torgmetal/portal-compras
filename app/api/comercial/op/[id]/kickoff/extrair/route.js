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

- escopo: resumo MUITO CURTO do fornecimento (2-3 frases, máx. 400 caracteres) — só o que é a obra e o que a Torg entrega. PROIBIDO listar inclusões/exclusões aqui (elas têm campos próprios) e PROIBIDO usar bullets/tópicos.
- escopoIncluso: array de strings — itens que ESTÃO incluídos no fornecimento (fabricação, montagem, pintura, transporte, projetos, ART...). Frases curtas, um item por string.
- escopoExcluso: array de strings — itens EXPRESSAMENTE excluídos / por conta do cliente (fundações, energia, andaimes, chumbadores...). Frases curtas.
- resumoPesos: array de {descricao, qtd, pesoKg} — quando a proposta tiver tabela/lista de itens com pesos (estrutura, telhas, acessórios), traga o resumo por grupo. NUNCA inclua linha de "TOTAL" (o total é calculado). Números em kg. SEM valores em R$. [] se não houver.
- dataEntregaAcordada: prazo de entrega acordado, como data "YYYY-MM-DD" se houver data explícita, senão null.
- tipoFaturamento: como a proposta define o faturamento (ex.: "por medições mensais", "por eventos", "30/60/90"...). null se não disser.
- faturamentoEventos: array de {descricao, percentual, valor, prazoPagamento, medicao, obsNF} — os eventos/parcelas de faturamento da proposta (ex.: {descricao: "Entrada", percentual: 10, valor: 150000, prazoPagamento: "28 dias após NF", medicao: null, obsNF: null}). Valores em número (sem R$ no texto). [] se não houver.
- retencaoContratual: retenção contratual se houver (ex.: "5% — liberação após entrega/CND"). null se não houver menção.
- segurosObrigatorios: seguros exigidos (garantia, RC, riscos de engenharia...). null se não houver menção.
- padraoPintura: o esquema de pintura definido (primer/intermediário/acabamento, produtos, demãos, espessuras em µm, cor, norma). null se a proposta não definir.
- inspecao: requisitos de inspeção, ensaios, normas de qualidade, ITPs, visitas de inspetor do cliente, liberação de romaneio etc.
- entregaEndereco: endereço ou local de ENTREGA da obra (cidade/UF no mínimo). Atenção: NÃO é o endereço fiscal do cliente.
- frete: "TORG" se o frete é por conta da Torg (CIF/incluso), "CLIENTE" se por conta do cliente (FOB/retirada), null se não especificado.
- pedidoCompraCliente: número do pedido de compra/ordem de compra do CLIENTE, se citado.
- notaRetorno: true se houver menção a nota de retorno / remessa para industrialização / material do cliente que retorna; false se claramente não há; null se não dá para saber.
- faturamentoObs: observações complementares de faturamento que não couberam nos eventos (impostos destacados, condições especiais). Curto.

REGRAS
- Não invente nada: só o que está escrito no documento.
- Valores e percentuais: transcreva como estão.
- Responda APENAS com um JSON válido envolvido em <json></json>, no formato:
<json>{"escopo": "...", "escopoIncluso": ["..."], "escopoExcluso": ["..."], "resumoPesos": [{"descricao": "...", "qtd": 0, "pesoKg": 0}], "dataEntregaAcordada": null, "tipoFaturamento": null, "faturamentoEventos": [{"descricao": "Entrada", "percentual": 10, "valor": null, "prazoPagamento": null, "medicao": null, "obsNF": null}], "retencaoContratual": null, "segurosObrigatorios": null, "padraoPintura": null, "inspecao": null, "entregaEndereco": null, "frete": null, "pedidoCompraCliente": null, "notaRetorno": null, "faturamentoObs": null}</json>`;

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
      escopo:              str(dados.escopo, 600),
      escopoIncluso:       strArr(dados.escopoIncluso, 40, 300),
      escopoExcluso:       strArr(dados.escopoExcluso, 40, 300),
      // Linhas "TOTAL/SUBTOTAL" ficam fora — o total é calculado na tela
      resumoPesos:         Array.isArray(dados.resumoPesos)
        ? dados.resumoPesos
            .filter((p) => p && typeof p.descricao === "string" && p.descricao.trim() && !/^(sub)?\s*total/i.test(p.descricao.trim()))
            .map((p) => ({ descricao: p.descricao.trim().slice(0, 200), qtd: Number(p.qtd) || null, pesoKg: Number(p.pesoKg) || null }))
            .slice(0, 60)
        : [],
      dataEntregaAcordada: /^\d{4}-\d{2}-\d{2}$/.test(String(dados.dataEntregaAcordada || "")) ? dados.dataEntregaAcordada : null,
      tipoFaturamento:     str(dados.tipoFaturamento, 500),
      faturamentoEventos:  Array.isArray(dados.faturamentoEventos)
        ? dados.faturamentoEventos
            .filter((e2) => e2 && typeof e2.descricao === "string" && e2.descricao.trim())
            .map((e2) => ({
              descricao: e2.descricao.trim().slice(0, 200),
              percentual: Number(e2.percentual) || null,
              valor: Number(e2.valor) || null,
              prazoPagamento: typeof e2.prazoPagamento === "string" ? e2.prazoPagamento.trim().slice(0, 120) || null : null,
              medicao: typeof e2.medicao === "string" ? e2.medicao.trim().slice(0, 80) || null : null,
              obsNF: typeof e2.obsNF === "string" ? e2.obsNF.trim().slice(0, 500) || null : null,
            }))
            .slice(0, 40)
        : [],
      retencaoContratual:  str(dados.retencaoContratual, 500),
      segurosObrigatorios: str(dados.segurosObrigatorios, 1000),
      padraoPintura:       str(dados.padraoPintura, 5000),
      inspecao:            str(dados.inspecao, 5000),
      entregaEndereco:     str(dados.entregaEndereco, 2000),
      frete:               ["TORG", "CLIENTE"].includes(dados.frete) ? dados.frete : null,
      pedidoCompraCliente: str(dados.pedidoCompraCliente, 200),
      notaRetorno:         typeof dados.notaRetorno === "boolean" ? dados.notaRetorno : null,
      faturamentoObs:      str(dados.faturamentoObs, 5000),
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
