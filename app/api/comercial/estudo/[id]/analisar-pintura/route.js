import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";
import { assertBlobUrlSegura } from "@/lib/blob-url";

export const runtime = "nodejs";
export const maxDuration = 120;

function getAnthropicKey() {
  const envKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  return envKey || null;
}

const MAX_DOCS_POR_LOTE = 5;

const SYSTEM_PROMPT = `Voce e um engenheiro orcamentista de uma metalurgica (Torg Metal) especializada em estruturas metalicas.
Seu trabalho e analisar documentos de projetos e extrair ou ESTIMAR o esquema de pintura, areas de pintura e tipos de tinta para o orcamento.

IMPORTANTE: A area de pintura de perfis de aco e significativamente maior que a area de projecao. Use fatores de conversao:
- Perfis W/HP: area de pintura ≈ perimetro x comprimento. Perimetro tipico: W150~0.8m, W200~1.0m, W310~1.4m, W360~1.6m
- Perfis U: area ≈ perimetro x comprimento
- Tubos: area = π x diametro x comprimento
- Chapas: area = 2 faces (se pintar ambos lados)
- Cantoneiras: area ≈ 4 x aba x comprimento

TIPOS DE PINTURA:
1. PRIMER: primeira demao de protecao (epoxi, zarcao, rico em zinco)
2. ESMALTE: acabamento sintetico
3. EPOXI: tinta epoxi de alta resistencia (ambientes agressivos)
4. POLIURETANO: acabamento poliuretano (exterior, UV)
5. GALVANIZACAO_FRIO: zinco organico (galvanizacao a frio)
6. INTUMESCENTE: tinta intumescente para protecao contra incendio
7. ZARCAO: primer anticorrosivo a base de zarcao
8. ALQUIDICA: tinta alquidica (esmalte sintetico)
9. OUTRO: outro tipo

ESQUEMAS TIPICOS DE PINTURA:
- Ambiente interno leve: 1 demao primer zarcao (75µm) + 1 demao esmalte (35µm)
- Ambiente interno moderado: 1 demao primer epoxi (75µm) + 1 demao epoxi (125µm)
- Ambiente externo: 1 demao primer epoxi (75µm) + 1 demao epoxi intermediaria (125µm) + 1 demao PU acabamento (50µm)
- Ambiente agressivo (Petrobras N-1550): 1 demao primer rico em zinco (75µm) + 1 demao epoxi (150µm) + 1 demao PU (50µm)
- Protecao contra incendio: primer + intumescente (conforme TRRF)

DEMAOS:
- Cada camada/demao deve ser um item separado quando o tipo de tinta for diferente
- Se o mesmo tipo de tinta tiver multiplas demaos (ex: 2 demaos de epoxi), pode ser um unico item com demaos=2
- Sempre identificar quantas demaos sao necessarias

REGRAS:
- Se o documento especifica o esquema de pintura, use-o
- Se nao especifica, ESTIME com base no tipo de ambiente/obra
- Calcular a area total de pintura em m² com base nos materiais do projeto
- Separar cada etapa do esquema (primer, intermediaria, acabamento) como item separado
- Indicar espessura por demao em micras (µm) quando possivel
- Indicar cor quando especificada

FORMATO DE SAIDA:
Devolva APENAS um JSON valido envolvido em <json></json>:

<json>
{
  "observacoes": "string ou null (notas sobre esquema de pintura, ambiente, normas)",
  "areaTotalEstimada": "number ou null (m² total de superficie a pintar)",
  "itens": [
    {
      "tipoPintura": "PRIMER | ESMALTE | EPOXI | POLIURETANO | GALVANIZACAO_FRIO | INTUMESCENTE | ZARCAO | ALQUIDICA | OUTRO",
      "descricao": "string (ex: Primer epoxi rico em zinco - 1a demao)",
      "especificacao": "string ou null (norma, produto: Conforme N-1550, WEG primer epoxi)",
      "areaM2": "number (area de pintura em m²)",
      "demaos": "number (1, 2 ou 3 — quantas demaos desta tinta)",
      "espessuraMicra": "number ou null (espessura seca por demao em µm)",
      "cor": "string ou null (RAL 7035, Cinza N6.5, Branco)",
      "norma": "string ou null (Petrobras N-1550, SSPC-SP6)",
      "observacao": "string ou null"
    }
  ]
}
</json>`;

function extractJsonFromResponse(text) {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagged) return tagged[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.substring(start, end + 1);
  return text;
}

async function fetchBlobAsBase64(url) {
  assertBlobUrlSegura(url); // SSRF: só aceita URLs do Vercel Blob
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

function getMediaType(tipo) {
  const map = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
  return map[tipo?.toLowerCase()] || "application/octet-stream";
}

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const apiKey = getAnthropicKey();
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "ANTHROPIC_API_KEY nao configurada" }, { status: 500 });
    }

    const estudo = await prisma.propostaEstudo.findUnique({
      where: { id },
      include: {
        orcamento: { select: { numero: true, cliente: true, obra: true } },
        documentos: { orderBy: { criadoEm: "desc" } },
        itensPerso: { select: { descricao: true, tipoMaterial: true, quantidade: true, comprimento: true, pesoTotal: true, areaPintura: true } },
      },
    });

    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo nao encontrado" }, { status: 404 });
    }

    const tiposSuportados = ["pdf", "png", "jpg", "jpeg"];
    const docsSuportados = estudo.documentos.filter((d) => tiposSuportados.includes(d.tipo?.toLowerCase()));

    // Resumo dos materiais para calcular area de pintura
    const resumoMateriais = estudo.itensPerso.length > 0
      ? estudo.itensPerso.map((i) => {
          const parts = [`${i.descricao} (${i.tipoMaterial}, qtd:${i.quantidade}`];
          if (i.comprimento) parts.push(`comp:${i.comprimento}m`);
          parts.push(`peso:${i.pesoTotal}kg`);
          if (i.areaPintura) parts.push(`area:${i.areaPintura}m²`);
          return parts.join(", ") + ")";
        }).join("\n")
      : "Nenhum material cadastrado ainda";

    const pesoTotal = estudo.pesoTotal || estudo.itensPerso.reduce((s, i) => s + (i.pesoTotal || 0), 0);

    const docsParaAnalisar = docsSuportados.slice(0, MAX_DOCS_POR_LOTE);

    const content = [];
    content.push({
      type: "text",
      text: `Projeto: ${estudo.orcamento?.cliente || "N/A"} — ${estudo.orcamento?.obra || "N/A"} (Orc. ${estudo.orcamento?.numero || "N/A"}).
Peso total da estrutura: ${pesoTotal ? pesoTotal + " kg" : "nao calculado"}.

MATERIAIS DO PROJETO (use para calcular area de pintura):
${resumoMateriais}

Analise os documentos e extraia o esquema de pintura. Se o projeto nao especificar, ESTIME com base no tipo de obra. Calcule a area de pintura com base nos perfis listados. Separe cada etapa do esquema (primer, intermediaria, acabamento) como item individual com o numero de demaos.`,
    });

    for (const doc of docsParaAnalisar) {
      if (!doc.blobUrl) continue;
      try {
        const base64 = await fetchBlobAsBase64(doc.blobUrl);
        const mediaType = getMediaType(doc.tipo);
        if (mediaType === "application/pdf") {
          content.push({ type: "document", source: { type: "base64", media_type: mediaType, data: base64 } });
        } else {
          content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
        }
        content.push({ type: "text", text: `Documento: "${doc.nome}" (${doc.tipo})` });
      } catch (err) {
        console.warn(`Erro ao baixar doc ${doc.nome}:`, err.message);
      }
    }

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const respText = message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const jsonStr = extractJsonFromResponse(respText);
    const resultado = JSON.parse(jsonStr);

    const itens = (resultado.itens || []).map((item) => ({
      tipoPintura: item.tipoPintura || "OUTRO",
      descricao: item.descricao || "",
      especificacao: item.especificacao || null,
      areaM2: typeof item.areaM2 === "number" ? item.areaM2 : 0,
      demaos: typeof item.demaos === "number" ? Math.min(Math.max(item.demaos, 1), 5) : 1,
      espessuraMicra: typeof item.espessuraMicra === "number" ? item.espessuraMicra : null,
      unidade: "m2",
      quantidade: typeof item.areaM2 === "number" ? item.areaM2 : 0,
      cor: item.cor || null,
      norma: item.norma || null,
      observacao: item.observacao || null,
    })).filter((item) => item.descricao.length > 0);

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "ANALISAR_PINTURA_IA",
        entity: "PropostaEstudo",
        entityId: id,
        diff: {
          docsAnalisados: docsParaAnalisar.map((d) => d.nome),
          itensEncontrados: itens.length,
          areaTotalEstimada: resultado.areaTotalEstimada,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        itens,
        observacoes: resultado.observacoes || null,
        areaTotalEstimada: resultado.areaTotalEstimada || null,
        docsAnalisados: docsParaAnalisar.map((d) => ({ id: d.id, nome: d.nome })),
      },
    });
  } catch (e) {
    console.error("Erro ao analisar pintura:", e);
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
