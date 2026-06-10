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
Seu trabalho e analisar documentos de projetos e extrair ou ESTIMAR todos os parafusos, porcas, arruelas, chumbadores e fixadores necessarios para o projeto.

IMPORTANTE: Em muitos projetos os parafusos nao estao explicitamente listados. Nesse caso voce deve ESTIMAR com base em:
- Tipo de estrutura (galpao, plataforma, mezanino, etc.)
- Perfis utilizados (W, U, L, tubos)
- Tipos de ligacoes tipicas (aparafusada, soldada+aparafusada)
- Normas de projeto (NBR 8800, AISC)

TIPOS DE FIXADORES:
1. PARAFUSO: parafusos estruturais (A325, A490, DIN 933/931), parafusos comuns (SAE 1020)
2. PORCA: porcas sextavadas, porcas autotravantes, porcas de ancoragem
3. ARRUELA: arruelas lisas, arruelas de pressao (Grower), arruelas DTI
4. CHUMBADOR: chumbadores de ancoragem, chumbadores quimicos, chumbadores mecanicos
5. BARRA_ROSCADA: barras roscadas para ancoragem e ligacoes
6. CONECTOR: conectores de cisalhamento (stud bolt), conectores tipo nelson
7. INSERTO: insertos metalicos, placas de apoio
8. OUTRO: qualquer fixador que nao se encaixe acima

REGRAS DE ESTIMATIVA:
- Para ligacoes viga-coluna tipicas: 4-8 parafusos por ligacao
- Para emendas de perfis: 6-12 parafusos por emenda
- Para ligacoes de contraventamento: 4-6 parafusos por no
- Para chapas de base/ancoragem: 4-6 chumbadores por base
- Sempre incluir porca + arruela para cada parafuso (a menos que soldado)
- Indicar claramente quando a quantidade e ESTIMADA (campo estimativa = true)

DIAMETROS TIPICOS:
- M12 / 1/2" — ligacoes leves, terças, longarinas
- M16 / 5/8" — ligacoes intermediarias, vigas secundarias
- M20 / 3/4" — ligacoes principais viga-coluna
- M22 / 7/8" — ligacoes pesadas, emendas
- M24 / 1" — chumbadores de ancoragem

FORMATO DE SAIDA:
Devolva APENAS um JSON valido envolvido em <json></json>:

<json>
{
  "observacoes": "string ou null (notas sobre parafusos do projeto, tipo de ligacoes identificadas)",
  "itens": [
    {
      "tipo": "PARAFUSO | PORCA | ARRUELA | CHUMBADOR | BARRA_ROSCADA | CONECTOR | INSERTO | OUTRO",
      "descricao": "string (descricao completa: Parafuso sextavado M16x50 ASTM A325)",
      "especificacao": "string ou null (norma, acabamento: ASTM A325, galvanizado a fogo)",
      "diametro": "string ou null (M16, 5/8, 3/4)",
      "comprimento": "string ou null (50mm, 2 pol, 300mm)",
      "unidade": "un",
      "quantidade": "number",
      "estimativa": "boolean (true se quantidade foi estimada, false se extraida do documento)",
      "observacao": "string ou null (onde sera usado: ligacao viga-coluna, ancoragem, etc.)"
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
        itensPerso: { select: { descricao: true, tipoMaterial: true, quantidade: true, pesoTotal: true } },
      },
    });

    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo nao encontrado" }, { status: 404 });
    }

    const tiposSuportados = ["pdf", "png", "jpg", "jpeg"];
    const docsSuportados = estudo.documentos.filter((d) => tiposSuportados.includes(d.tipo?.toLowerCase()));

    // Resumo dos materiais para ajudar na estimativa
    const resumoMateriais = estudo.itensPerso.length > 0
      ? estudo.itensPerso.map((i) => `${i.descricao} (${i.tipoMaterial}, qtd:${i.quantidade}, peso:${i.pesoTotal}kg)`).join("\n")
      : "Nenhum material cadastrado ainda";

    const docsParaAnalisar = docsSuportados.slice(0, MAX_DOCS_POR_LOTE);

    const content = [];
    content.push({
      type: "text",
      text: `Projeto: ${estudo.orcamento?.cliente || "N/A"} — ${estudo.orcamento?.obra || "N/A"} (Orc. ${estudo.orcamento?.numero || "N/A"}).
Peso total do projeto: ${estudo.pesoTotal ? estudo.pesoTotal + " kg" : "nao calculado ainda"}.

MATERIAIS JA LEVANTADOS (use como referencia para estimar parafusos):
${resumoMateriais}

Analise os documentos e extraia ou ESTIME todos os parafusos, porcas, arruelas, chumbadores e fixadores necessarios.`,
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
      tipo: item.tipo || "PARAFUSO",
      descricao: item.descricao || "",
      especificacao: item.especificacao || null,
      diametro: item.diametro || null,
      comprimento: item.comprimento || null,
      unidade: item.unidade || "un",
      quantidade: typeof item.quantidade === "number" ? item.quantidade : 0,
      estimativa: item.estimativa === true,
      observacao: item.observacao || null,
    })).filter((item) => item.descricao.length > 0);

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "ANALISAR_PARAFUSOS_IA",
        entity: "PropostaEstudo",
        entityId: id,
        diff: { docsAnalisados: docsParaAnalisar.map((d) => d.nome), itensEncontrados: itens.length },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        itens,
        observacoes: resultado.observacoes || null,
        docsAnalisados: docsParaAnalisar.map((d) => ({ id: d.id, nome: d.nome })),
      },
    });
  } catch (e) {
    console.error("Erro ao analisar parafusos:", e);
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
