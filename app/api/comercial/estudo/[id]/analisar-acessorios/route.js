import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

// Fallback: se ANTHROPIC_API_KEY estiver vazia (processo pai override),
// ler diretamente do .env.local
function getAnthropicKey() {
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.startsWith("sk-ant-")) return envKey;
  try {
    const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    const match = envFile.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch { /* noop */ }
  return null;
}

const MAX_DOCS_POR_LOTE = 5;

const SYSTEM_PROMPT = `Voce e um engenheiro orcamentista de uma metalurgica (Torg Metal) especializada em estruturas metalicas.
Seu trabalho e analisar documentos de projetos (PDFs, planilhas, memoriais descritivos, especificacoes tecnicas, desenhos) e extrair todos os ACESSORIOS necessarios para o projeto.

ACESSORIOS sao itens que a metalurgica precisa COMPRAR para revender junto com a estrutura metalica. NAO sao perfis, chapas ou barras de aco (esses sao materiais estruturais tratados em outro levantamento).

TIPOS DE ACESSORIOS A IDENTIFICAR:

1. TELHAS: telha trapezoidal, telha zipada, telha termoacustica (sanduiche), telha ondulada, telha de aco galvanizado/galvalume/prepintada
   - Extrair: modelo/perfil (TP40, TP25, ZIP65...), espessura, material (galvalume, prepintada), comprimento, area total

2. CALHAS: calha de escoamento de agua pluvial
   - Extrair: dimensoes (largura, desenvolvimento), material, comprimento total

3. RUFOS: rufo de vedacao, rufo de cumeeira, rufo de calha
   - Extrair: tipo, desenvolvimento, material, comprimento total

4. GRADE DE PISO: grades metalicas para piso (grating), degraus dentados
   - Extrair: modelo (GS-A4-304, etc.), dimensoes, quantidade

5. GALVANIZACAO: servico de galvanizacao a fogo de pecas
   - Extrair: peso estimado a galvanizar, tipo de galvanizacao

6. STEEL DECK: formas de aco colaborante para laje
   - Extrair: modelo (MF50, MF75...), espessura, area total

7. POLICARBONATO: telhas ou chapas de policarbonato translucido
   - Extrair: tipo, espessura, dimensoes, area total

8. ISOLAMENTO: isolamento termico/acustico (la de vidro, la de rocha, EPS, PIR)
   - Extrair: tipo, espessura, densidade, area total

9. OUTRO: qualquer acessorio que nao se encaixe nas categorias acima

REGRAS:
- Extrair APENAS acessorios, NAO extrair perfis de aco, chapas, barras, tubos ou parafusos
- Se o documento nao contiver informacoes sobre acessorios, retorne itens vazio
- Use a categoria mais especifica possivel
- Quantidades: usar a unidade mais adequada (m2 para areas, m para comprimentos, un para unidades, kg para peso)
- Se um dado nao esta no documento, use null
- NAO inventar dados

FORMATO DE SAIDA:
Devolva APENAS um JSON valido envolvido em <json></json>:

<json>
{
  "observacoes": "string ou null (notas relevantes sobre acessorios do projeto)",
  "itens": [
    {
      "categoria": "TELHA | CALHA | RUFO | GRADE_PISO | GALVANIZACAO | STEEL_DECK | POLICARBONATO | ISOLAMENTO | OUTRO",
      "descricao": "string (descricao completa do item)",
      "especificacao": "string ou null (detalhes tecnicos: espessura, material, modelo)",
      "unidade": "string (un, m, m2, kg...)",
      "quantidade": "number",
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

function getMediaType(tipo) {
  const map = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  return map[tipo?.toLowerCase()] || "application/octet-stream";
}

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const apiKey = getAnthropicKey();
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "ANTHROPIC_API_KEY nao configurada no servidor" },
        { status: 500 }
      );
    }

    // Buscar estudo com documentos
    const estudo = await prisma.propostaEstudo.findUnique({
      where: { id },
      include: {
        orcamento: { select: { numero: true, cliente: true, obra: true } },
        documentos: { orderBy: { criadoEm: "desc" } },
      },
    });

    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo nao encontrado" }, { status: 404 });
    }

    // Filtrar documentos suportados
    const tiposSuportados = ["pdf", "png", "jpg", "jpeg"];
    const docsSuportados = estudo.documentos.filter((d) =>
      tiposSuportados.includes(d.tipo?.toLowerCase())
    );

    if (docsSuportados.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nenhum documento suportado encontrado. Envie PDFs ou imagens para analise." },
        { status: 400 }
      );
    }

    // Usar todos os docs (acessorios podem estar em qualquer doc, inclusive memoriais)
    // Limitar ao MAX_DOCS_POR_LOTE para caber no contexto
    const docsParaAnalisar = docsSuportados.slice(0, MAX_DOCS_POR_LOTE);

    // Montar conteudo para a IA
    const content = [];

    // Contexto do projeto
    content.push({
      type: "text",
      text: `Projeto: ${estudo.orcamento?.cliente || "N/A"} — ${estudo.orcamento?.obra || "N/A"} (Orc. ${estudo.orcamento?.numero || "N/A"}).\n\nAnalise os documentos abaixo e extraia TODOS os acessorios (telhas, calhas, rufos, grades de piso, galvanizacao, steel deck, policarbonato, isolamento e outros itens de revenda). NAO extraia perfis de aco, chapas, tubos ou parafusos.`,
    });

    // Anexar documentos
    for (const doc of docsParaAnalisar) {
      if (!doc.blobUrl) continue;
      try {
        const base64 = await fetchBlobAsBase64(doc.blobUrl);
        const mediaType = getMediaType(doc.tipo);

        if (mediaType === "application/pdf") {
          content.push({
            type: "document",
            source: { type: "base64", media_type: mediaType, data: base64 },
          });
        } else {
          content.push({
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          });
        }
        content.push({ type: "text", text: `Documento: "${doc.nome}" (${doc.tipo})` });
      } catch (err) {
        console.warn(`Erro ao baixar doc ${doc.nome}:`, err.message);
      }
    }

    // Chamar Claude
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const respText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const jsonStr = extractJsonFromResponse(respText);
    const resultado = JSON.parse(jsonStr);

    // Validar e sanitizar
    const itens = (resultado.itens || []).map((item) => ({
      categoria: item.categoria || "OUTRO",
      descricao: item.descricao || "",
      especificacao: item.especificacao || null,
      unidade: item.unidade || "un",
      quantidade: typeof item.quantidade === "number" ? item.quantidade : 0,
      observacao: item.observacao || null,
    })).filter((item) => item.descricao.length > 0);

    // Audit log
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "ANALISAR_ACESSORIOS_IA",
        entity: "PropostaEstudo",
        entityId: id,
        diff: {
          docsAnalisados: docsParaAnalisar.map((d) => d.nome),
          itensEncontrados: itens.length,
        },
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
    console.error("Erro ao analisar acessorios:", e);
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
