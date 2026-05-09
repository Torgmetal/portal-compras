import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Roda em Node — SDK Anthropic precisa
export const runtime = "nodejs";
// Permite até 60s pra processar (PDFs grandes podem demorar)
export const maxDuration = 60;

const SYSTEM_PROMPT = `Você é um assistente de compras de uma siderúrgica (Torg Metal). Seu trabalho é extrair os itens cotados em propostas de fornecedores brasileiros (aço, perfis, chapas, cantoneiras, tubos) e casá-los com os itens de uma RM (Requisição de Materiais).

═══ REGRAS DE EXTRAÇÃO DE PREÇO (LEIA COM ATENÇÃO) ═══

NOTAÇÃO BRASILEIRA — vírgula é decimal, ponto é milhar:
  • "7,50" → 7.50      (sete reais e cinquenta centavos)
  • "1.234,56" → 1234.56
  • "11.737,95" → 11737.95
  • "750" sem vírgula → 750.00 (verifique se faz sentido pra unidade!)

PREÇO UNITÁRIO ≠ TOTAL DA LINHA — extraia SEMPRE o UNITÁRIO:
  Em planilhas de cotação tem geralmente colunas como:
    QTD | UNIT | PREÇO UNITÁRIO (R$) | DESCONTO | TOTAL (R$) | ICMS% | IPI%
    100 | KG   | 7,50                |          | 750,00     | 18    | 5
  → precoUnit = 7.50, qtd = 100, totalBruto = 750.00
  NUNCA confunda PREÇO UNITÁRIO com TOTAL — mesmo que sejam parecidos.

VALIDE ARITMETICAMENTE quando possível:
  • Se você tem qtd, precoUnit e totalBruto, confira que precoUnit × qtd ≈ totalBruto
    (com pequena tolerância de arredondamento). Se NÃO bater, há erro de leitura — use null.
  • Ex: qtd=100, total=750 → unit não pode ser 750. Tem que ser 7,50.

OUTROS:
- "qtd" e "unidade" devem ser SEMPRE como o FORNECEDOR cotou (tipicamente KG pra aço/perfis).
  Se PDF diz "1.440 KG", devolva qtd=1440, unidade="KG", mesmo que RM diga "8 barras".
- Captura ICMS%, IPI% por item (em colunas separadas, geralmente em %).
- Captura prazo de pagamento ("28 DDL", "30/60/90", "à vista").
- Ignora cabeçalho, rodapé, transporte, observações genéricas.

REGRAS DE MATCHING (rmIndex):
- Pra cada item cotado, retorne o índice (0-based) do item RM correspondente, OU null.
- Variações brasileiras comuns:
  • "CHAPA 6.40" da RM ↔ "CHP GR 6,30..." (mesma chapa, notação diferente de espessura)
  • "L3''X1/4''" ↔ "CANT 3X1/4" (cantoneira em polegadas)
  • "W150X13" ↔ "PF I W150X13" ↔ "PERFIL W 150 X 13" (mesmo perfil)
  • "A572-GR.50" ↔ "A572GR50" ↔ "CIVIL 300" (mesmo grau de aço)
- Mesma CATEGORIA + mesma dimensão principal (tolerância ±0,5mm pra chapas) + grade compatível → match
- Em dúvida, prefira null (deixar o comprador decidir).

REGRAS DE CONFIABILIDADE:
- Não invente valores. Em dúvida, use null em vez de chutar.
- Se o documento não for cotação, devolva itens=[].
- Preço unitário > R$ 10.000/kg quase certamente é erro de leitura — use null.
- Se 2 itens da RM podem casar com o mesmo item do fornecedor, escolha o que tem dimensões mais próximas.

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
    let precoUnit = Number(it.precoUnit) || 0;
    const qtd = Number(it.qtd) || 0;
    const totalDeclarado = it.totalBruto != null ? Number(it.totalBruto) : null;
    const warnings = [];
    let safePrec = precoUnit;

    // 1. Reject precos absurdos (> R$ 10.000 por unidade — improvavel pra aco)
    if (precoUnit > 10000) {
      warnings.push(`Preco unitario R$ ${precoUnit.toFixed(2)} suspeito (>10k/un)`);
      safePrec = 0;
    }

    // 2. VALIDA ARITMETICA: se tem qtd, preco e total, todos > 0,
    //    o preco x qtd deve bater com o total (tolerancia 1%).
    if (qtd > 0 && safePrec > 0 && totalDeclarado != null && totalDeclarado > 0) {
      const calculado = safePrec * qtd;
      const diff = Math.abs(calculado - totalDeclarado);
      const tolerancia = Math.max(totalDeclarado * 0.01, 0.5); // 1% ou 50 centavos
      if (diff > tolerancia) {
        // O preco nao bate. Tenta corrigir: o "preco unit" extraido provavelmente e
        // o TOTAL da linha. Recalcula como total/qtd.
        const sugerido = totalDeclarado / qtd;
        if (sugerido > 0 && sugerido < 10000) {
          warnings.push(
            `Preco corrigido: ${precoUnit.toFixed(2)} -> ${sugerido.toFixed(4)} ` +
            `(${precoUnit} parecia ser o total; total/qtd = ${sugerido.toFixed(4)})`
          );
          safePrec = sugerido;
        } else {
          warnings.push(
            `Preco e total nao batem: ${precoUnit} x ${qtd} = ${calculado.toFixed(2)} ` +
            `mas total declarado e ${totalDeclarado.toFixed(2)}`
          );
        }
      }
    }

    // rmIndex valido?
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
      totalBruto: totalDeclarado != null ? totalDeclarado : safePrec * qtd,
      prazoEntrega: it.prazoEntrega || "",
      observacao: it.observacao || "",
      _warning: warnings.length > 0 ? warnings.join(" | ") : null,
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
