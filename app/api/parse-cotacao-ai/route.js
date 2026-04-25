import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Roda em Node — SDK Anthropic precisa
export const runtime = "nodejs";
// Permite até 60s pra processar (PDFs grandes podem demorar)
export const maxDuration = 60;

const SYSTEM_PROMPT = `Você é um assistente de compras de uma siderúrgica (Torg Metal). Seu trabalho é extrair os itens cotados em propostas de fornecedores brasileiros (aço, perfis, chapas, cantoneiras, tubos) e casá-los com os itens de uma RM (Requisição de Materiais).

REGRAS DE EXTRAÇÃO:
- Reconhece notação brasileira: vírgula é decimal, ponto é separador de milhar (ex: "11.737,95" = 11737.95)
- Identifica preço unitário em R$/KG, R$/UN, R$/PÇ, R$/M conforme a unidade
- IMPORTANTE: a "qtd" e "unidade" devem ser SEMPRE como o FORNECEDOR cotou no documento
  (tipicamente KG para aço/perfis/chapas). NÃO converta pra unidade da RM. Se o PDF
  diz "1.440 KG", devolva qtd=1440 e unidade="KG", mesmo que a RM diga "8 barra(s)".
- Captura ICMS%, IPI% por item quando disponíveis (geralmente em colunas separadas)
- Captura prazo de pagamento (ex: "28 DDL", "30/60/90", "à vista")
- Ignora cabeçalho, rodapé, dados de transporte, observações genéricas

REGRAS DE MATCHING (rmIndex):
- Para cada item cotado, retorne o índice (0-based) do item RM correspondente, ou null se não houver
- Considere variações comuns no Brasil:
  • "CHAPA 6.40" da RM = "CHP GR 6,30..." do fornecedor (mesmo produto, diferenças de cadastro/notação de espessura)
  • "L3''X1/4''" = "CANT 3X1/4" (cantoneira em polegadas)
  • "W150X13" = "PF I W150X13" = "PERFIL W 150 X 13" (mesmo perfil)
  • "A572-GR.50" = "A572GR50" = "A572" = "CIVIL 300" (sinônimos brasileiros para A572 grau 50)
- Se o produto for da mesma CATEGORIA, MESMA dimensão principal (com ±0,5mm tolerância pra chapas) e GRADE compatível → considere match
- Se houver dúvida razoável, prefira null e deixe o comprador decidir manualmente

REGRA DE CONFIABILIDADE:
- Não invente valores. Se não conseguir identificar com certeza, use null
- Se o documento não for uma cotação, devolva itens=[] com fornecedor=""
- Preço unitário > R$ 10.000 quase certamente é erro de leitura — prefira null

FORMATO DE SAÍDA:
Devolva APENAS um JSON válido envolvido em <json></json>, sem comentários adicionais antes ou depois das tags. Schema:

<json>
{
  "fornecedor": "string (razão social do emissor da proposta, sem CNPJ)",
  "prazoPagamento": "string ou null",
  "validade": "string ou null",
  "tipoFrete": "CIF | FOB | Retira | null",
  "itens": [
    {
      "rmIndex": "number ou null",
      "descricao": "string (descrição original do fornecedor)",
      "qtd": "number",
      "unidade": "KG | UN | PC | PÇ | M | MT",
      "precoUnit": "number",
      "icmsPct": "number ou null",
      "ipiPct": "number ou null",
      "totalBruto": "number ou null",
      "prazoEntrega": "string ou null",
      "observacao": "string ou null"
    }
  ]
}
</json>`;

function extractJsonFromResponse(text) {
  // Tenta achar <json>...</json> primeiro
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagged) return tagged[1].trim();
  // Fallback: tenta achar o primeiro objeto JSON válido
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.substring(start, end + 1);
  return text;
}

function sanitizeItens(itens, rmCount) {
  return (itens || []).map((it) => {
    const precoUnit = Number(it.precoUnit) || 0;
    const qtd = Number(it.qtd) || 0;
    let warning = null;
    let safePrec = precoUnit;
    // Reject preços absurdos (> R$ 10.000 por unidade — improvável pra aço)
    if (precoUnit > 10000) {
      warning = `Preço unitário R$ ${precoUnit.toFixed(2)} suspeito — ignorado`;
      safePrec = 0;
    }
    // rmIndex válido?
    let rmIndex = it.rmIndex;
    if (rmIndex != null && (typeof rmIndex !== "number" || rmIndex < 0 || rmIndex >= rmCount)) {
      rmIndex = null;
    }
    return {
      rmIndex,
      descricao: String(it.descricao || ""),
      qtd,
      qtdCotada: qtd,
      unidade: String(it.unidade || "").toUpperCase(),
      precoUnit: safePrec,
      icmsPct: it.icmsPct != null ? Number(it.icmsPct) : null,
      ipiPct: it.ipiPct != null ? Number(it.ipiPct) : null,
      totalBruto: it.totalBruto != null ? Number(it.totalBruto) : safePrec * qtd,
      prazoEntrega: it.prazoEntrega || "",
      observacao: it.observacao || "",
      _warning: warning,
    };
  });
}

export async function POST(request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY não configurada no servidor (variáveis de ambiente)" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { pdfBase64, text, imageBase64, imageType, rmItens, model } = body;

    if (!pdfBase64 && !text && !imageBase64) {
      return NextResponse.json(
        { error: "Forneça pelo menos um campo: pdfBase64, text ou imageBase64" },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Monta o conteúdo da mensagem
    const content = [];

    if (pdfBase64) {
      const cleanB64 = pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64;
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: cleanB64 },
      });
    }

    if (imageBase64) {
      const cleanB64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageType || "image/jpeg",
          data: cleanB64,
        },
      });
    }

    if (text) {
      content.push({ type: "text", text: `Texto da cotação:\n\n${text}` });
    }

    // Contexto da RM (lista de itens com índice). Inclui peso kg pra IA
    // confrontar com a qtd em kg que vem no PDF do fornecedor.
    const rmContext = (rmItens || [])
      .map((it, i) => {
        const qtd = it.qtd ?? "?";
        const un = it.unidade || "";
        const peso = it.pesoKg || it.peso;
        const pesoStr = peso ? `, ~${peso}kg` : "";
        return `${i}: "${it.descricao || it.item || ""}" (material: ${it.material || it.mat || "—"}, qtd RM: ${qtd}${un}${pesoStr})`;
      })
      .join("\n");

    content.push({
      type: "text",
      text: `\nItens da RM (${(rmItens || []).length} no total):\n${rmContext}\n\nExtraia os itens cotados e devolva JSON conforme o schema do system prompt.`,
    });

    // Modelo: Haiku é mais barato e suficiente pra extração estruturada
    const chosenModel = model || "claude-haiku-4-5-20251001";

    const message = await anthropic.messages.create({
      model: chosenModel,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const rawText =
      message.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n") || "";

    let parsed;
    try {
      const jsonStr = extractJsonFromResponse(rawText);
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return NextResponse.json(
        {
          error: "IA devolveu resposta não-JSON. Provável ruído na extração.",
          rawPreview: rawText.slice(0, 500),
          stop_reason: message.stop_reason,
        },
        { status: 502 }
      );
    }

    const itensSan = sanitizeItens(parsed.itens, (rmItens || []).length);

    return NextResponse.json({
      fornecedor: String(parsed.fornecedor || ""),
      prazoPagamento: parsed.prazoPagamento || "",
      validade: parsed.validade || "",
      tipoFrete: parsed.tipoFrete || "",
      itens: itensSan,
      _meta: {
        model: message.model,
        inputTokens: message.usage?.input_tokens,
        outputTokens: message.usage?.output_tokens,
        stopReason: message.stop_reason,
      },
    });
  } catch (err) {
    console.error("parse-cotacao-ai error:", err);
    return NextResponse.json(
      {
        error: err?.message || "Falha ao processar com IA",
        type: err?.name,
      },
      { status: 500 }
    );
  }
}
